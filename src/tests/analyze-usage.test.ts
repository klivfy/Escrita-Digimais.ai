import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyCounters, exportCounters, FIXED_KEYS, increment } from '../application/usage-counters';
import { recordStep, recordUse, emptyStats, exportLearning } from '../application/style-learning';

const SCRIPT = join(process.cwd(), 'scripts', 'analyze-usage.mjs');
let dir = '';

const file = (name: string, content: unknown): string => {
  const p = join(dir, name);
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
};
const run = (...args: string[]): string => execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'usage-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const person = (generated: number, blocked: number, since: string, until: string, extra: Record<string, number> = {}) => ({
  desde: since,
  exportadoEm: until,
  contadores: {
    'generate.request_information': generated,
    ...(blocked ? { 'blocked.sensitive_data': blocked } : {}),
    copy: Math.floor(generated / 2),
    variant: 3,
    'time_to_copy.lt1m': 4,
    'alert.all_caps_emphasis': 6,
    ...extra,
  },
});

describe('análise do piloto', () => {
  it('calcula taxas e aplica o critério de corte por pessoa', () => {
    const a = file('a.json', person(36, 4, '2026-10-01', '2026-10-20'));
    const b = file('b.json', person(10, 0, '2026-10-10', '2026-10-20'));
    const out = run(a, b);
    expect(out).toContain('| a.json | 36 | 4 | 19 | sim |');
    expect(out).toContain('| b.json | 10 | 0 | 10 | não |');
    expect(out).toContain('Atendem ao corte: 1 de 2.');
    expect(out).toContain('taxa de bloqueio 8.0%');
    expect(out).toContain('Decida D8 e D9 apenas com os 1 arquivo(s)');
    expect(out).toContain('| all_caps_emphasis | 12 |');
  });

  it('sem arquivos no corte, manda estender o piloto; com todos, libera', () => {
    expect(run(file('c.json', person(5, 0, '2026-10-18', '2026-10-20')))).toContain('não decida D8 e D9 ainda');
    expect(run(file('d.json', person(40, 0, '2026-09-01', '2026-10-20')))).toContain('Todos os arquivos atendem ao corte');
  });

  it('os limites do corte são configuráveis', () => {
    const f = file('e.json', person(8, 0, '2026-10-15', '2026-10-20'));
    expect(run(f, '--min-geracoes=5', '--min-dias=3')).toContain('Atendem ao corte: 1 de 1.');
  });

  it('ignora chaves fora da lista fechada e valores que não são inteiros', () => {
    const f = file('f.json', person(40, 0, '2026-09-01', '2026-10-20', { 'Maria Silva abriu o chamado 123': 9, 'generate.x': 2.5, 'alert.Texto Livre': 1 }));
    const out = run(f);
    expect(out).toContain('Chaves ignoradas por não pertencerem à lista fechada: 3.');
    expect(out).not.toContain('Maria');
  });

  it('data ausente ou inválida impede o corte em vez de supor', () => {
    const f = file('g.json', { contadores: { 'generate.request_information': 90 } });
    expect(run(f)).toContain('| g.json | 90 | 0 | n/d | não |');
  });

  it('erros de uso e de leitura saem com código diferente de zero', () => {
    expect(spawnSync('node', [SCRIPT]).status).toBe(2);
    expect(spawnSync('node', [SCRIPT, file('h.json', '{ruim')]).status).toBe(1);
    expect(spawnSync('node', [SCRIPT, join(dir, 'nao-existe.json')]).status).toBe(1);
  });

  it('lê o arquivo exatamente como a extensão exporta', () => {
    let c = emptyCounters('2026-10-01');
    for (let i = 0; i < 31; i += 1) c = increment(c, 'generate.progress_update');
    c = increment(c, 'copy');
    const f = file('i.json', exportCounters(c, new Date('2026-10-20T12:00:00Z')));
    const out = run(f);
    expect(out).toContain('| i.json | 31 | 0 | 19 | sim |');
    expect(out).toContain('Cópias por geração: 3.2%');
  });

  it('resume o rascunho livre e o arquivo de aprendizado, e avisa quando poucas divisões chegam a preencher', () => {
    const base = person(40, 0, '2026-09-01', '2026-10-20', { draft_split: 20, draft_apply: 6 });
    const learn = {
      exportadoEm: '2026-10-20',
      contadores: { 'fix.result.action': 4, 'fix.summary.ignore': 2, 'acc.opening.pending.1': 5, 'rej.lead.any.0': 3, 'Maria Silva': 9, 'fix.x': 1 },
    };
    const out = run(file('g.json', base), file('aprendizado-g.json', learn));
    expect(out).toContain('Rascunho livre: 20 divisões, 6 formulários preenchidos (30.0% chegam a preencher).');
    expect(out).toContain('Correções do analista na divisão do rascunho: 6 (1.0 por formulário preenchido).');
    expect(out).toContain('| result | action | 4 |');
    expect(out).toContain('Redações mantidas: 5; trocadas: 3.');
    expect(out).toContain('Chaves ignoradas por não pertencerem à lista fechada: 2.');
    expect(out).toContain('Menos da metade das divisões do rascunho livre');
    expect(out).toContain('Arquivos: 1.'); // o arquivo de aprendizado não conta como pessoa
  });

  it('reconhece o arquivo de aprendizado pelo formato mesmo renomeado, e recusa chaves que a extensão não aceita', () => {
    const base = person(40, 0, '2026-09-01', '2026-10-20', { draft_split: 20, draft_apply: 15 });
    const learn = { contadores: { 'fix.result.action': 3, 'fix.foo.bar': 5, 'fix.result.result': 2, 'acc.opening.formal.1': 4 } };
    const out = run(file('h.json', base), file('minhas-preferencias.json', { contadores: { 'fix.summary.action': 2 } }), file('aprendizado-h.json', learn));
    expect(out).toContain('Arquivos: 1.');
    expect(out).toContain('Correções do analista na divisão do rascunho: 5');
    expect(out).toContain('Chaves ignoradas por não pertencerem à lista fechada: 3.');
    expect(out).toContain('2 arquivo(s) de aprendizado para 1 de uso');
  });
});

describe('o script do piloto acompanha as chaves da extensão', () => {
  it('aceita todas as chaves fixas dos contadores e as chaves de uso do aprendizado', async () => {
    const { readCounts, isLearnKey } = (await import(pathToFileURL(SCRIPT).href)) as {
      readCounts: (raw: unknown) => { counts: Record<string, number>; ignored: number };
      isLearnKey: (k: string) => boolean;
    };
    const all = Object.fromEntries(FIXED_KEYS.map((k) => [k, 1]));
    expect(readCounts({ contadores: all }).ignored).toBe(0);
    const learned = recordStep(recordUse(emptyStats(), 'pending'), 'request_information', 'progress_update');
    for (const k of Object.keys(learned.counts)) expect(isLearnKey(k), k).toBe(true);
    expect(isLearnKey('seq.pending.pending')).toBe(false);
  });

  it('o relatório mostra correção por regra, próximo passo e passos aprendidos', () => {
    let c = emptyCounters('2026-10-01');
    for (const k of ['proofread.run', 'proofread.acento.acc', 'proofread.acento.acc', 'proofread.concordancia.ign', 'next_step.shown', 'next_step.shown', 'next_step.used', 'recipient.user', 'generate.pending']) c = increment(c, k);
    const usage = file('contadores-novos.json', exportCounters(c, new Date('2026-10-20T12:00:00Z')));
    const learn = file('aprendizado-novo.json', exportLearning(recordStep(emptyStats(), 'request_information', 'pending')));
    const out = run(usage, learn);
    expect(out).toContain('Corrigir texto: 1 verificações');
    expect(out).toContain('| acento | 2 | 0 | 100.0% |');
    expect(out).toContain('Próximo passo: sugerido 2 vezes, usado 1 (50.0%');
    expect(out).toContain('| request_information | pending | 1 |');
    expect(out).not.toMatch(/ignoradas por não pertencerem/);
  });
});

