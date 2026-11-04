import { describe, expect, it } from 'vitest';
import { LearningCryptoError } from '../application/learning-crypto';
import { LearningService } from '../application/learning-service';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { ledgerTexts } from '../config/learning-ledger';
import type { LanguageProfile } from '../domain/types';
import { AppStorage } from '../infrastructure/storage';
import { MemoryArea } from './memory-storage';

const NOW = new Date('2026-11-04T12:00:00');
const PASSWORD = 'uma-senha-bem-longa-123';
const OPEN = 'Precisamos de uma informação sua para seguir com o atendimento.';
const text = (who: string, closing = 'Ficamos no aguardo.') =>
  [`Olá, ${who},`, '', OPEN, '', 'Em aberto: item do chamado.', '', 'Envie uma captura de tela do erro, por favor.', '', closing, 'Time de Suporte'].join('\n');
const batch = (n = 3) => Array.from({ length: n }, (_, i) => ({ text: text(`Pessoa${String.fromCharCode(65 + i)}`), type: 'request_information' as const }));

function setup(over: { version?: string; profile?: LanguageProfile } = {}) {
  const local = new MemoryArea();
  const store = new AppStorage(local, new MemoryArea());
  const service = new LearningService(store, () => ({ profile: over.profile ?? DEFAULT_PROFILE, version: over.version ?? '1.0.0.3', now: NOW }));
  return { local, store, service };
}
const codeOf = async (run: () => unknown): Promise<string> => {
  try {
    await run();
    return 'no-error';
  } catch (e) {
    return e instanceof LearningCryptoError ? e.code : `other:${String(e)}`;
  }
};

describe('acumular e treinar', () => {
  it('acumula de forma contínua e persiste só o registro, sem o texto original', async () => {
    const { local, service } = setup();
    const r1 = await service.ingest(batch(3));
    expect(r1.accepted).toBe(3);
    const r2 = await service.ingest(batch(2));
    expect(r2.accepted).toBe(2);
    expect(ledgerTexts(await service.ledger())).toBe(5);
    expect(JSON.stringify(local.data.learningLedger)).not.toMatch(/Pessoa|captura de tela do erro, por favor.*Pessoa/);
    expect(JSON.stringify(local.data)).not.toContain('Pessoa');
  });

  it('recusa texto com dado sensível e não grava nada', async () => {
    const { local, service } = setup();
    const r = await service.ingest([{ text: 'Olá, Ana,\n\nEscreva para ana@empresa.com.br.\n\nObrigado.', type: 'pending' }]);
    expect(r.accepted).toBe(0);
    expect(local.data.learningLedger).toBeUndefined();
  });

  it('treinar sob demanda propõe, marca o ponto de partida e só aprovar grava o estilo', async () => {
    const { local, service, store } = setup();
    await service.ingest(batch(3));
    const proposal = await service.train();
    expect(proposal.items.map((i) => i.id)).toContain('opening:request_information');
    expect(proposal.newSinceLast).toBe(3);
    expect(local.data.trainedStyle).toBeUndefined();
    expect((await service.train()).newSinceLast).toBe(0);
    const trained = await service.approve(proposal, ['opening:request_information']);
    expect(trained?.openings?.request_information).toBe(OPEN);
    expect(await store.loadTrained()).toEqual(trained);
    await service.ingest(batch(1));
    expect((await service.train()).newSinceLast).toBe(1);
  });

  it('o analista pode esquecer um trecho guardado e apagar tudo', async () => {
    const { store, service } = setup();
    await service.ingest(batch(3));
    await service.forget('request_information', 'closing', 'Ficamos no aguardo.');
    expect((await store.loadLedger())?.byType.request_information?.blocks.some((b) => b.role === 'closing')).toBe(false);
    await service.approve(await service.train(), ['opening:request_information']);
    await service.reset();
    expect(await store.loadLedger()).toBeNull();
    expect(await store.loadTrained()).toBeNull();
  });
});

describe('exportar e importar cifrado entre dois analistas', () => {
  async function teacher() {
    const t = setup();
    await t.service.ingest(batch(3));
    await t.service.approve(await t.service.train(), ['opening:request_information', 'closing:request_information']);
    await t.store.saveTaughtStyle({ version: 1, signature: 'Time de Suporte' });
    return t;
  }

  it('sem senha não exporta; sem nada para exportar avisa', async () => {
    const t = await teacher();
    expect(await codeOf(() => t.service.exportFile(''))).toBe('PASSWORD_REQUIRED');
    expect(await codeOf(() => t.service.exportFile('curta'))).toBe('PASSWORD_TOO_SHORT');
    expect(await codeOf(() => setup().service.exportFile(PASSWORD))).toBe('NOTHING_TO_EXPORT');
  });

  it('o arquivo é cifrado, leva a versão no nome, e a importação mostra o resumo antes de gravar qualquer coisa', async () => {
    const t = await teacher();
    const { filename, text: file } = await t.service.exportFile(PASSWORD);
    expect(filename).toBe('aprendizado-digimais-1.0.0.3-2026-11-04.json');
    expect(file).not.toContain('Ficamos no aguardo');
    expect(file).not.toContain('Time de Suporte');

    const r = setup();
    expect(r.service.inspect(file).extensionVersion).toBe('1.0.0.3');
    const preview = await r.service.previewImport(file, PASSWORD);
    expect(preview.summary).toMatchObject({ fromVersion: '1.0.0.3', texts: 3, trainedItems: 2, styleItems: 1, dropped: 0 });
    expect(r.local.data.learningLedger).toBeUndefined();
    expect(r.local.data.trainedStyle).toBeUndefined();
    expect(r.local.data.taughtStyle).toBeUndefined();

    const report = await r.service.assimilate(preview);
    expect(report).toEqual({ texts: 3, trainedItems: 2, styleItems: 1 });
    expect(ledgerTexts(await r.service.ledger())).toBe(3);
    expect((await r.store.loadTrained())?.openings?.request_information).toBe(OPEN);
    expect((await r.store.loadTaughtStyle())?.signature).toBe('Time de Suporte');
  });

  it('é aditivo: soma as contagens e nunca sobrescreve o que o receptor já aprovou', async () => {
    const t = await teacher();
    const { text: file } = await t.service.exportFile(PASSWORD);
    const r = setup();
    await r.service.ingest(batch(2));
    await r.store.saveTrained({ version: 1, closings: { request_information: 'Obrigado pelo retorno.' } });
    await r.store.saveTaughtStyle({ version: 1, signature: 'Minha equipe' });
    await r.service.assimilate(await r.service.previewImport(file, PASSWORD));
    expect(ledgerTexts(await r.service.ledger())).toBe(5);
    expect((await r.store.loadTrained())?.closings?.request_information).toBe('Obrigado pelo retorno.');
    expect((await r.store.loadTrained())?.openings?.request_information).toBe(OPEN);
    expect((await r.store.loadTaughtStyle())?.signature).toBe('Minha equipe');
  });

  it('versão diferente interrompe, antes e depois da senha, e não grava nada', async () => {
    const t = await teacher();
    const { text: file } = await t.service.exportFile(PASSWORD);
    const r = setup({ version: '1.0.0.4' });
    expect(await codeOf(() => r.service.inspect(file))).toBe('VERSION_MISMATCH');
    expect(await codeOf(() => r.service.previewImport(file, PASSWORD))).toBe('VERSION_MISMATCH');
    expect(Object.keys(r.local.data)).toEqual([]);
  });

  it('senha incorreta e arquivo adulterado são recusados sem gravar nada', async () => {
    const t = await teacher();
    const { text: file } = await t.service.exportFile(PASSWORD);
    const r = setup();
    expect(await codeOf(() => r.service.previewImport(file, 'outra-senha-longa-456'))).toBe('WRONG_PASSWORD');
    const o = JSON.parse(file) as { ciphertext: string };
    const bytes = Uint8Array.from(atob(o.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const forged = JSON.stringify({ ...o, ciphertext: btoa(String.fromCharCode(...bytes)) });
    expect(await codeOf(() => r.service.previewImport(forged, PASSWORD))).toBe('CORRUPTED');
    expect(await codeOf(() => r.service.previewImport('lixo', PASSWORD))).toBe('NOT_AN_EXPORT');
    expect(Object.keys(r.local.data)).toEqual([]);
  });

  it('a triagem do receptor vale: trecho que viola as regras dele fica de fora e é contado', async () => {
    const t = await teacher();
    const { text: file } = await t.service.exportFile(PASSWORD);
    const r = setup({ profile: { ...DEFAULT_PROFILE, forbiddenTerms: ['aguardo'] } });
    const preview = await r.service.previewImport(file, PASSWORD);
    expect(preview.summary.dropped).toBeGreaterThan(0);
    await r.service.assimilate(preview);
    const ledger = await r.service.ledger();
    expect(ledger.byType.request_information?.blocks.some((b) => b.text.includes('aguardo'))).toBe(false);
    expect((await r.store.loadTrained())?.closings).toBeUndefined();
  });
});
