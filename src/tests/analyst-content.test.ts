import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { effectiveProfile, EMPTY_CONTENT, isStyleLocked, loadAnalystContent, triageContent } from '../application/analyst-content';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { validateLibrary } from '../config/library-schema';
import type { LibraryModel, ModelLibrary } from '../config/library-schema';
import { validateOverlay } from '../config/profile-overlay';
import type { ProfileOverlay } from '../config/profile-overlay';
import { AppStorage } from '../infrastructure/storage';
import { MemoryArea } from './memory-storage';

const parsed = validateLibrary(JSON.parse(readFileSync('examples/biblioteca-exemplo.json', 'utf8')));
if (!parsed.ok) throw new Error('exemplo inválido');
const LIBRARY: ModelLibrary = parsed.library;
const overlay = (forbiddenTerms: string[]): ProfileOverlay => {
  const r = validateOverlay({ schemaVersion: 1, overlayName: 'Equipe', forbiddenTerms });
  if (!r.ok) throw new Error('camada inválida');
  return r.overlay;
};
const taughtModel = (over: Partial<LibraryModel> = {}): LibraryModel => ({
  id: 'ensinado-pedir-captura', title: 'Pedir captura', types: ['request_information'], recipients: [],
  text: 'Para seguirmos com a análise, envie uma captura de tela do erro.', keywords: [], reviewedAt: '2026-10-23', ...over,
});
const sources = (over: Partial<Parameters<typeof triageContent>[1]> = {}) => ({ base: DEFAULT_PROFILE, overlay: null, signingKeys: [] as string[], ...over });
const validKey = (): string => generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const STYLE = { version: 1 as const, greeting: 'Bom dia, {nome},', closing: 'Ficamos no aguardo.', signature: 'Time de Suporte' };

describe('effectiveProfile: uma fórmula só', () => {
  it('base, depois estilo, depois camada de equipe', () => {
    const p = effectiveProfile({ base: DEFAULT_PROFILE, overlay: overlay(['macete']), style: STYLE, signingKeys: [] });
    expect(p.signature).toBe('Time de Suporte');
    expect(p.greetings.cordial.user).toBe('Bom dia, {nome},');
    expect(p.forbiddenTerms).toContain('macete');
  });

  it('com assinatura exigida o estilo não se aplica, mas a camada continua valendo', () => {
    expect(isStyleLocked(['chave'])).toBe(true);
    const p = effectiveProfile({ base: DEFAULT_PROFILE, overlay: overlay(['macete']), style: STYLE, signingKeys: ['chave'] });
    expect(p.signature).toBe(DEFAULT_PROFILE.signature);
    expect(p.forbiddenTerms).toContain('macete');
  });

  it('não altera o perfil recebido', () => {
    effectiveProfile({ base: DEFAULT_PROFILE, overlay: overlay(['macete']), style: STYLE, signingKeys: [] });
    expect(DEFAULT_PROFILE.signature).toBe('Equipe de Service Desk');
    expect(DEFAULT_PROFILE.forbiddenTerms).not.toContain('macete');
  });
});

describe('triageContent', () => {
  it('sem nada guardado, nada em uso e nenhum aviso', () => {
    expect(triageContent({ library: { library: null }, taught: [], style: null }, sources())).toEqual(EMPTY_CONTENT);
  });

  it('modelo ensinado que passa fica em uso; o que deixa de passar sai de uso com o motivo', () => {
    const ok = taughtModel();
    const bad = taughtModel({ id: 'ensinado-macete', title: 'Com macete', text: 'Use este macete para resolver o erro.' });
    const c = triageContent({ library: { library: null }, taught: [ok, bad], style: null }, sources({ overlay: overlay(['macete']) }));
    expect(c.taught.map((m) => m.id)).toEqual([ok.id]);
    expect(c.taughtOut).toHaveLength(1);
    expect(c.taughtOut[0].model.id).toBe(bad.id);
    expect(c.taughtOut[0].reasons.join(' ')).toMatch(/macete/i);
  });

  it('um modelo ensinado fora de uso não derruba os outros (decisão por modelo)', () => {
    const models = [taughtModel({ id: 'ensinado-a' }), taughtModel({ id: 'ensinado-b', text: 'Fale com a-b@empresa.com.br.' }), taughtModel({ id: 'ensinado-c' })];
    const c = triageContent({ library: { library: null }, taught: models, style: null }, sources());
    expect(c.taught.map((m) => m.id)).toEqual(['ensinado-a', 'ensinado-c']);
    expect(c.taughtOut.map((o) => o.model.id)).toEqual(['ensinado-b']);
  });

  it('biblioteca da instituição é tudo ou nada: um modelo fora das regras desativa a biblioteca inteira', () => {
    const c = triageContent({ library: { library: LIBRARY }, taught: [], style: null }, sources({ overlay: overlay(['captura']) }));
    expect(c.library).toBeNull();
    expect(c.libraryNote).toMatch(/A biblioteca guardada não está em uso: \d+ modelo\(s\) não passam mais nas regras atuais/);
    expect(triageContent({ library: { library: LIBRARY }, taught: [], style: null }, sources()).library).toBe(LIBRARY);
  });

  it('motivo da biblioteca fora de uso: assinatura ou arquivo inválido', () => {
    const sig = triageContent({ library: { library: null, problem: 'signature' }, taught: [], style: null }, sources());
    expect(sig.libraryNote).toMatch(/assinatura não confere/);
    const inv = triageContent({ library: { library: null, problem: 'invalid' }, taught: [], style: null }, sources());
    expect(inv.libraryNote).toMatch(/ficou inválido/);
  });

  it('estilo que passa a violar a camada de equipe é desligado com o motivo, mas continua guardado', () => {
    const c = triageContent({ library: { library: null }, taught: [], style: STYLE }, sources({ overlay: overlay(['aguardo']) }));
    expect(c.style).toEqual(STYLE);
    expect(c.styleOff).toMatch(/termo proibido/);
    expect(triageContent({ library: { library: null }, taught: [], style: STYLE }, sources()).styleOff).toBeNull();
  });

  it('a trava de assinatura não é motivo de "desligado": é regra da organização, mostrada à parte', () => {
    const c = triageContent({ library: { library: null }, taught: [], style: STYLE }, sources({ signingKeys: ['chave'] }));
    expect(c.styleOff).toBeNull();
  });

  it('a decisão de carga é a mesma da importação: mesmo perfil efetivo, mesmo resultado por modelo', async () => {
    const { vetModel } = await import('../domain/library-vetting');
    const model = taughtModel({ text: 'Use o macete para resolver.' });
    const src = sources({ overlay: overlay(['macete']) });
    const effective = effectiveProfile({ ...src, style: STYLE });
    const viaTriage = triageContent({ library: { library: null }, taught: [model], style: STYLE }, src);
    expect(viaTriage.taughtOut.length === 1).toBe(vetModel(model, effective).reasons.length > 0);
  });
});

describe('loadAnalystContent (leitura do armazenamento mais triagem, sem DOM)', () => {
  it('lê as três fontes e triou com as regras em vigor, sem apagar nada do que sai de uso', async () => {
    const local = new MemoryArea();
    const store = new AppStorage(local, new MemoryArea());
    await store.saveLibrary(LIBRARY);
    await store.saveTaught([taughtModel(), taughtModel({ id: 'ensinado-macete', title: 'Com macete', text: 'Use este macete.' })]);
    await store.saveTaughtStyle(STYLE);

    const c = await loadAnalystContent(store, sources({ overlay: overlay(['macete']) }));
    expect(c.library).not.toBeNull();
    expect(c.taught.map((m) => m.id)).toEqual(['ensinado-pedir-captura']);
    expect(c.taughtOut.map((o) => o.model.id)).toEqual(['ensinado-macete']);
    expect(c.style).toEqual(STYLE);
    // O modelo que saiu de uso continua guardado: o analista decide remover ou refazer.
    expect((await store.loadTaught()).map((m) => m.id)).toEqual(['ensinado-pedir-captura', 'ensinado-macete']);

    // Se a camada deixar de proibir o termo, ele volta a valer sem precisar ensinar de novo.
    const again = await loadAnalystContent(store, sources());
    expect(again.taught.map((m) => m.id)).toEqual(['ensinado-pedir-captura', 'ensinado-macete']);
    expect(again.taughtOut).toEqual([]);
  });

  it('com chaves de assinatura, biblioteca sem assinatura guardada não vale e diz o motivo', async () => {
    const store = new AppStorage(new MemoryArea(), new MemoryArea());
    await store.saveLibrary(LIBRARY);
    const c = await loadAnalystContent(store, sources({ signingKeys: [validKey()] }));
    expect(c.library).toBeNull();
    expect(c.libraryNote).toMatch(/assinatura não confere/);
  });
});
