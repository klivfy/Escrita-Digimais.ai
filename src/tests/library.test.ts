import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportLibraryJson, importLibraryText, SIGNED_LIBRARY_FORMAT } from '../application/library-import';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { MAX_LIBRARY_MODELS, MAX_MODEL_TEXT, MODEL_PLACEHOLDERS, placeholdersIn, validateLibrary } from '../config/library-schema';
import type { ModelLibrary } from '../config/library-schema';
import { reviewText } from '../domain/review';
import { vetLibrary, vetModel, withSamples } from '../domain/library-vetting';
import { AppStorage } from '../infrastructure/storage';
import { MemoryArea } from './memory-storage';
import { closeSigningDir, keygen, openSigningDir } from './signing-helpers';
import type { Keys } from './signing-helpers';

const EXAMPLE = JSON.parse(readFileSync('examples/biblioteca-exemplo.json', 'utf8')) as Record<string, unknown>;
const model = (over: Record<string, unknown> = {}) => ({
  id: 'm1', title: 'Modelo', types: ['request_information'], text: 'Para analisarmos o problema, envie uma captura de tela do erro.', ...over,
});
const lib = (models: unknown[] = [model()], over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, libraryName: 'Teste', libraryVersion: '1', models, ...over,
});
const errorsOf = (raw: unknown): string => {
  const r = validateLibrary(raw);
  return r.ok ? '' : r.errors.join(' | ');
};
const text = (raw: unknown) => JSON.stringify(raw);

describe('esquema da biblioteca', () => {
  it('aceita o arquivo de exemplo e normaliza os padrões', () => {
    const r = validateLibrary(EXAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.library.models).toHaveLength(7);
    const vpn = r.library.models.find((m) => m.id === 'reconectar-vpn');
    expect(vpn).toMatchObject({ recipients: [], keywords: [], reviewedAt: '' });
  });

  it('recusa chaves desconhecidas, __proto__ e esquema errado', () => {
    expect(errorsOf(lib([model({ extra: 1 })]))).toMatch(/chave desconhecida/);
    expect(errorsOf(JSON.parse('{"schemaVersion":1,"libraryName":"x","libraryVersion":"1","models":[],"__proto__":{"a":1}}'))).toMatch(/__proto__/);
    expect(errorsOf(lib([model()], { schemaVersion: 2 }))).toMatch(/schemaVersion/);
    expect(errorsOf(lib([model()], { libraryVersion: 'versão com espaço' }))).toMatch(/libraryVersion/);
    expect(errorsOf([])).toMatch(/objeto/);
  });

  it('só texto simples: HTML, links, esquemas e caracteres de controle', () => {
    for (const bad of ['veja <b>isto</b>', 'acesse https://portal.exemplo.com', 'abra www.exemplo.com', 'java' + 'script:alert(1)', 'texto\u0000nulo']) {
      expect(errorsOf(lib([model({ text: bad })])), bad).toMatch(/text/);
    }
    expect(errorsOf(lib([model({ title: 'Título <i>' })]))).toMatch(/title/);
    expect(errorsOf(lib([model({ keywords: ['http://x.com'] })]))).toMatch(/keywords/);
  });

  it('campos entre chaves só da lista fechada; chave solta é recusada', () => {
    expect(errorsOf(lib([model({ text: 'Olá {nome}, sobre {chamado} e {prazo}.' })]))).toBe('');
    expect(errorsOf(lib([model({ text: 'Olá {telefone}.' })]))).toMatch(/campo "\{telefone\}" não existe/);
    expect(errorsOf(lib([model({ text: 'Olá {nome.' })]))).toMatch(/solta/);
    expect(errorsOf(lib([model({ text: 'Olá {{nome}}.' })]))).toMatch(/solta|não existe/);
    expect(placeholdersIn('{nome} e {nome} e {data}')).toEqual(['nome', 'data']);
    expect([...MODEL_PLACEHOLDERS]).toContain('prazo');
  });

  it('limites e unicidade', () => {
    expect(errorsOf(lib([model({ text: 'a'.repeat(MAX_MODEL_TEXT + 1) })]))).toMatch(/passa de/);
    expect(errorsOf(lib([model(), model()]))).toMatch(/já foi usado/);
    expect(errorsOf(lib([model({ id: 'ID Inválido' })]))).toMatch(/\.id/);
    expect(errorsOf(lib([model({ types: [] })]))).toMatch(/pelo menos 1/);
    expect(errorsOf(lib([model({ types: ['inventado'] })]))).toMatch(/não permitido/);
    expect(errorsOf(lib([model({ recipients: ['alguem'] })]))).toMatch(/recipients/);
    expect(errorsOf(lib([model({ reviewedAt: '20/10/2026' })]))).toMatch(/AAAA-MM-DD/);
    expect(errorsOf(lib([model({ keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) })]))).toMatch(/no máximo 10/);
    expect(errorsOf(lib([]))).toMatch(/pelo menos um/);
    expect(errorsOf(lib(Array.from({ length: MAX_LIBRARY_MODELS + 1 }, (_, i) => model({ id: `m${i}` }))))).toMatch(/no máximo 200/);
  });
});

describe('triagem dos modelos (dado sensível e regras de revisão)', () => {
  const vet = (over: Record<string, unknown>) => {
    const v = validateLibrary(lib([model(over)]));
    if (!v.ok) throw new Error(v.errors.join());
    return vetModel(v.library.models[0], DEFAULT_PROFILE);
  };

  it('a biblioteca de exemplo passa sem recusas', () => {
    const v = validateLibrary(EXAMPLE);
    if (!v.ok) throw new Error('exemplo inválido');
    const r = vetLibrary(v.library, DEFAULT_PROFILE);
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    // Saudação e fecho vêm do motor: ausência de cordialidade em trecho de texto não vira aviso.
    expect(JSON.stringify(r.notices)).not.toMatch(/cordialidade/);
  });

  it('recusa dado pessoal, credencial, e-mail e telefone no texto', () => {
    expect(vet({ text: 'Fale com maria.souza@exemplo.test sobre o acesso.' }).reasons.join()).toMatch(/dado sensível/);
    expect(vet({ text: 'Use a senha: Teste@12345 para entrar.' }).reasons.join()).toMatch(/dado sensível/);
    expect(vet({ text: 'Ligue para (11) 91234-5678 e confirme.' }).reasons.join()).toMatch(/dado sensível/);
    expect(vet({ title: 'Contato 11 91234 5678', text: 'Texto neutro para o usuário.' }).reasons.length).toBeGreaterThan(0);
  });

  it('recusa prazo concreto, solução afirmada, ameaça, urgência, pedido de senha, emoji e caixa alta', () => {
    expect(vet({ text: 'Resolveremos o problema em 2 horas.' }).reasons.join()).toMatch(/prazo/i);
    // Afirmar a solução só cabe no encerramento (que o analista faz depois de confirmar); em outro tipo o modelo é recusado.
    expect(vet({ types: ['progress_update'], text: 'O problema foi resolvido e já está tudo funcionando.' }).reasons.length).toBeGreaterThan(0);
    expect(vet({ types: ['closure_resolved'], text: 'O problema foi resolvido e já está tudo funcionando.' }).reasons).toEqual([]);
    expect(vet({ text: 'Envie sua senha para validarmos o acesso.' }).reasons.join()).toMatch(/senha/i);
    expect(vet({ text: 'URGENTE: responda imediatamente este chamado!!!' }).reasons.length).toBeGreaterThan(0);
    expect(vet({ text: 'Tudo certo 😀 com o acesso.' }).reasons.length).toBeGreaterThan(0);
  });

  it('o campo {prazo} é substituído por expressão neutra e não conta como prazo concreto', () => {
    expect(withSamples('Responda até {prazo}, {nome}.')).toBe('Responda até o prazo informado, o usuário.');
    expect(vet({ text: 'Para continuarmos, responda até {prazo}.' }).reasons).toEqual([]);
    expect(withSamples('{desconhecido}')).toBe('{desconhecido}');
  });

  it('termo proibido pelo perfil recusa o modelo; termo preferido vira aviso', () => {
    const profile = { ...DEFAULT_PROFILE, forbiddenTerms: ['gambiarra'], preferredTerms: [{ avoid: 'ticket', prefer: 'chamado' }] };
    const v = validateLibrary(lib([model({ id: 'a', text: 'Aplicamos uma gambiarra para o acesso.' }), model({ id: 'b', text: 'Registramos o ticket para o acesso.' })]));
    if (!v.ok) throw new Error('inválido');
    const r = vetLibrary(v.library, profile);
    expect(r.problems.map((p) => p.id)).toEqual(['a']);
    expect(r.notices.map((p) => p.id)).toContain('b');
  });
});

describe('importação, assinatura e armazenamento', () => {
  let keys: Keys;
  let other: Keys;
  beforeAll(() => {
    openSigningDir();
    keys = keygen('org');
    other = keygen('outra');
  });
  afterAll(() => closeSigningDir());

  const SCRIPT = join(process.cwd(), 'scripts', 'sign-profile.mjs');
  const sign = (k: Keys, library: unknown, name: string) => {
    const dir = join(k.privatePath, '..');
    const input = join(dir, `${name}.json`);
    const output = join(dir, `${name}.assinada.json`);
    writeFileSync(input, JSON.stringify(library));
    execFileSync('node', [SCRIPT, 'sign-library', input, k.privatePath, output]);
    return JSON.parse(readFileSync(output, 'utf8')) as { format: string; library: unknown; signatureValue: string };
  };

  it('sem chaves: aceita arquivo simples, recusa envelope assinado', async () => {
    const ok = await importLibraryText(text(EXAMPLE), [], DEFAULT_PROFILE);
    expect(ok.ok).toBe(true);
    const env = sign(keys, EXAMPLE, 'ex1');
    const refused = await importLibraryText(text(env), [], DEFAULT_PROFILE);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0]).toMatch(/nenhuma chave/);
  });

  it('com chaves: só vale o envelope assinado pela chave certa, e o script normaliza o arquivo', async () => {
    const env = sign(keys, EXAMPLE, 'ex2');
    expect(env.format).toBe(SIGNED_LIBRARY_FORMAT);
    const ok = await importLibraryText(text(env), [keys.publicKey], DEFAULT_PROFILE);
    expect(ok.ok ? 'ok' : ok.errors).toBe('ok');
    const plain = await importLibraryText(text(EXAMPLE), [keys.publicKey], DEFAULT_PROFILE);
    expect(plain.ok === false && plain.errors[0]).toMatch(/exige biblioteca assinada/);
    const wrongKey = await importLibraryText(text(env), [other.publicKey], DEFAULT_PROFILE);
    expect(wrongKey.ok === false && wrongKey.errors[0]).toMatch(/Assinatura inválida/);
  });

  it('adulterar o texto de um modelo depois de assinar invalida a assinatura', async () => {
    const env = sign(keys, EXAMPLE, 'ex3');
    const tampered = JSON.parse(JSON.stringify(env)) as { library: { models: { text: string }[] } };
    tampered.library.models[0].text += ' Envie também seu documento.';
    const r = await importLibraryText(text(tampered), [keys.publicKey], DEFAULT_PROFILE);
    expect(r.ok === false && r.errors[0]).toMatch(/Assinatura inválida/);
  });

  it('uma assinatura de perfil não vale como biblioteca', async () => {
    const profileEnv = { format: 'signed-profile-v1', profile: DEFAULT_PROFILE, signatureValue: 'AAAA' };
    const r = await importLibraryText(text(profileEnv), [keys.publicKey], DEFAULT_PROFILE);
    expect(r.ok).toBe(false);
  });

  it('um modelo recusado impede a importação de todos, com o motivo', async () => {
    const bad = lib([model({ id: 'ok-1' }), model({ id: 'ruim', title: 'Ruim', text: 'Fale com maria.souza@exemplo.test hoje.' })]);
    const r = await importLibraryText(text(bad), [], DEFAULT_PROFILE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/Modelo "ruim".*dado sensível/);
  });

  it('arquivo grande demais, JSON inválido e envelope malformado', async () => {
    expect((await importLibraryText('x'.repeat(401 * 1024), [], DEFAULT_PROFILE)).ok).toBe(false);
    expect((await importLibraryText('{nada', [], DEFAULT_PROFILE)).ok).toBe(false);
    const malformed = { format: SIGNED_LIBRARY_FORMAT, library: EXAMPLE, signatureValue: 'x', extra: 1 };
    expect((await importLibraryText(text(malformed), [keys.publicKey], DEFAULT_PROFILE)).ok).toBe(false);
  });

  it('armazenamento: grava só a biblioteca válida, relê revalidada e exige a assinatura quando há chaves', async () => {
    const local = new MemoryArea();
    const store = new AppStorage(local, new MemoryArea());
    const env = sign(keys, EXAMPLE, 'ex4');
    const imported = await importLibraryText(text(env), [keys.publicKey], DEFAULT_PROFILE);
    if (!imported.ok) throw new Error('importação falhou');
    await store.saveLibrary(imported.library, imported.signature);
    expect((await store.loadLibraryChecked([keys.publicKey])).library?.models).toHaveLength(7);
    // Chave diferente na política: a assinatura guardada não verifica, a biblioteca some (falha fechada).
    expect((await store.loadLibraryChecked([other.publicKey])).library).toBeNull();
    expect(await store.loadLibraryChecked([other.publicKey])).toEqual({ library: null, problem: 'signature' });
    expect((await store.loadLibraryChecked([keys.publicKey])).problem).toBeUndefined();
    // Sem assinatura guardada e com chaves exigidas, também não vale.
    await store.saveLibrary(imported.library);
    expect((await store.loadLibraryChecked([keys.publicKey])).library).toBeNull();
    expect((await store.loadLibraryChecked([])).library).not.toBeNull();
    // Dado adulterado direto no armazenamento é descartado na leitura.
    local.data.modelLibrary = { ...imported.library, models: [{ ...imported.library.models[0], text: '<b>x</b>' }] };
    expect((await store.loadLibraryChecked([])).library).toBeNull();
    await expect(store.saveLibrary({ ...imported.library, models: [] })).rejects.toThrow();
    await store.removeLibrary();
    expect(local.data.modelLibrary).toBeUndefined();
    expect(local.data.modelLibrarySignature).toBeUndefined();
  });

  it('"apagar dados salvos" também remove a biblioteca', async () => {
    const local = new MemoryArea();
    const store = new AppStorage(local, new MemoryArea());
    const ok = await importLibraryText(text(EXAMPLE), [], DEFAULT_PROFILE);
    if (!ok.ok) throw new Error('falhou');
    await store.saveLibrary(ok.library);
    await store.clearAll();
    expect((await store.loadLibraryChecked([])).library).toBeNull();
  });

  it('a exportação devolve a biblioteca guardada e pode ser importada de novo', async () => {
    const ok = await importLibraryText(text(EXAMPLE), [], DEFAULT_PROFILE);
    if (!ok.ok) throw new Error('falhou');
    const again = await importLibraryText(exportLibraryJson(ok.library as ModelLibrary), [], DEFAULT_PROFILE);
    expect(again.ok && again.library).toEqual(ok.library);
  });
});

describe('rótulos comuns não são confundidos com esquemas executáveis', () => {
  const withText = (t: string) => ({ ...EXAMPLE, models: [{ id: 'm1', title: 'Data prevista', types: ['pending'], text: t }] });

  it.each(['Data: {data}. Prazo e data: combinados.', 'Atualização de metadata: concluída.', 'Perfil: ok. File: anexado.'])(
    'aceita "%s"',
    (t) => {
      expect(validateLibrary(withText(t)).ok).toBe(true);
    },
  );

  it.each(['abra data:text/html,<b>x</b>', 'veja file:///etc/passwd', 'use javascript:alert(1)', 'use VBScript:x', 'veja DATA:text/plain;base64,AAAA'])(
    'recusa "%s"',
    (t) => {
      expect(validateLibrary(withText(t)).ok).toBe(false);
    },
  );
});

describe('restaurar o perfil padrão', () => {
  it('remove só o perfil importado e mantém biblioteca, camada e contadores', async () => {
    const lib = validateLibrary(EXAMPLE);
    if (!lib.ok) throw new Error('exemplo inválido');
    const local = new MemoryArea({
      languageProfile: { ...DEFAULT_PROFILE, organizationName: 'Org' },
      profileSignature: 'assinatura',
      modelLibrary: lib.library,
      modelLibrarySignature: 'assinatura-biblioteca',
      profileOverlay: { schemaVersion: 1, overlayName: 'Equipe' },
      usageCounters: { since: '2026-10-01', counts: { generated: 3 } },
    });
    await new AppStorage(local, new MemoryArea()).resetProfile();
    expect(local.data.languageProfile).toBeUndefined();
    expect(local.data.profileSignature).toBeUndefined();
    expect(local.data.modelLibrary).toEqual(lib.library);
    expect(local.data.modelLibrarySignature).toBe('assinatura-biblioteca');
    expect(local.data.profileOverlay).toBeDefined();
    expect(local.data.usageCounters).toBeDefined();
  });
});

describe('normalização do script de assinatura', () => {
  it('é idêntica à do esquema (se divergirem, a assinatura deixa de bater com o que a extensão guarda)', async () => {
    const { normalizeLibrary } = (await import(pathToFileURL(join(process.cwd(), 'scripts', 'sign-profile.mjs')).href)) as {
      normalizeLibrary: (l: unknown) => unknown;
    };
    const cases: unknown[] = [
      EXAMPLE,
      lib([model({ id: ' a ', title: '  Título  ', text: '  linha 1\r\nlinha 2\r  ', types: ['pending', 'pending', 'request_information'], keywords: [' vpn ', 'vpn', 'rede'] })]),
      lib([model({ recipients: ['user', 'user', 'manager'], reviewedAt: '' }), model({ id: 'b', reviewedAt: '2026-10-01' })]),
      lib([model({ reviewedAt: undefined, keywords: undefined, recipients: undefined })], { libraryName: '  Nome  ', libraryVersion: ' 2026.10.1 ' }),
    ];
    for (const raw of cases) {
      const checked = validateLibrary(raw);
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(normalizeLibrary(raw)).toEqual(checked.library);
    }
  });
});

describe('revisão de campos entre chaves no texto', () => {
  const ctx = { type: 'request_information', recipient: 'user', techLevel: 'simple' } as const;
  const codes = (t: string) => reviewText(t, ctx, DEFAULT_PROFILE).warnings.map((w) => w.code);

  it('campo da lista fechada sem preencher bloqueia a cópia', () => {
    const r = reviewText('Encaminhamos {chamado} para a equipe.', ctx, DEFAULT_PROFILE);
    expect(r.blocked).toBe(true);
    expect(r.warnings.find((w) => w.code === 'unfilled_field')?.message).toMatch(/Faltam campos entre chaves: \{chamado\}/);
  });

  it('chaves fora da lista avisam sem bloquear; texto sem chaves não aciona nada', () => {
    const stray = reviewText('Confira o item {x} antes de seguir.', ctx, DEFAULT_PROFILE);
    expect(stray.warnings.map((w) => w.code)).toContain('stray_braces');
    expect(stray.warnings.some((w) => w.code === 'unfilled_field')).toBe(false);
    expect(stray.blocked).toBe(false);
    expect(codes('Para analisarmos, envie uma captura de tela do erro.')).not.toContain('stray_braces');
    expect(codes('Para analisarmos, envie uma captura de tela do erro.')).not.toContain('unfilled_field');
  });
});

describe('biblioteca guardada que não pode ser usada', () => {
  it('informa o motivo: arquivo inválido ou assinatura que não confere', async () => {
    const bad = new AppStorage(new MemoryArea({ modelLibrary: { schemaVersion: 1, libraryName: 'x' } }), new MemoryArea());
    expect(await bad.loadLibraryChecked([])).toEqual({ library: null, problem: 'invalid' });
    expect((await new AppStorage(new MemoryArea(), new MemoryArea()).loadLibraryChecked([])).problem).toBeUndefined();
  });
});
