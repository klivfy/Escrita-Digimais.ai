import { describe, expect, it } from 'vitest';
import {
  acceptedEvents, draftBias, emptyStats, exportLearning, isLearnKey, MIN_NET, preferredIndexes, recordEvent, recordFix, rejectedEvents, sanitizeStats, StyleLearner,
} from '../application/style-learning';
import type { LearnedStats } from '../application/style-learning';
import { MemoryArea } from './memory-storage';
import { AppStorage, ALLOWED_KEYS } from '../infrastructure/storage';
import { gen, settings } from './helpers';
import { generate } from '../domain/engine';
import { DEFAULT_PREFERENCES, sanitizePreferences } from '../application/preferences';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { NOW } from './helpers';

const bump = (s: LearnedStats, n: number, ...args: Parameters<typeof recordEvent> extends [unknown, ...infer R] ? R : never): LearnedStats => {
  let out = s;
  for (let i = 0; i < n; i++) out = recordEvent(out, ...(args as Parameters<typeof recordEvent> extends [unknown, ...infer R] ? R : never));
  return out;
};

describe('chaves fechadas e sanitização', () => {
  it('aceita só combinações válidas de ponto, escopo e índice', () => {
    expect(isLearnKey('acc.opening.pending.1')).toBe(true);
    expect(isLearnKey('rej.courtesy.formal.0')).toBe(true);
    expect(isLearnKey('acc.lead.any.1')).toBe(true);
    for (const bad of ['acc.opening.formal.1', 'acc.courtesy.pending.1', 'acc.opening.pending.10', 'x.opening.pending.1',
      'acc.opening.pending', 'acc.lead.pending.0', 'acc.opening.pending.1; drop', 'Olá, Maria']) {
      expect(isLearnKey(bad)).toBe(false);
    }
  });

  it('descarta chaves desconhecidas, não inteiros e valores fora da faixa', () => {
    const s = sanitizeStats({ counts: { 'acc.opening.pending.1': 4, 'acc.opening.pending.2': 1.5, 'acc.opening.pending.3': -1, texto: 3, 'rej.lead.any.0': '9' } });
    expect(s.counts).toEqual({ 'acc.opening.pending.1': 4 });
    expect(sanitizeStats(null)).toEqual(emptyStats());
    expect(sanitizeStats({ counts: 'x' })).toEqual(emptyStats());
  });

  it('limita a contagem máxima', () => {
    expect(sanitizeStats({ counts: { 'acc.lead.any.1': 10 ** 12 } }).counts['acc.lead.any.1']).toBe(1000);
  });
});

describe('preferência derivada', () => {
  it('só vale com saldo líquido mínimo e quando não é a redação padrão', () => {
    let s = emptyStats();
    s = bump(s, MIN_NET - 1, 'acc', 'opening', 'pending', 1);
    expect(preferredIndexes(s, 'pending', 'cordial').opening).toBeUndefined();
    s = bump(s, 1, 'acc', 'opening', 'pending', 1);
    expect(preferredIndexes(s, 'pending', 'cordial').opening).toBe(1);
    expect(preferredIndexes(s, 'request_information', 'cordial').opening).toBeUndefined();
  });

  it('trocas descontam o saldo e a padrão (índice 0) nunca vira "preferência"', () => {
    let s = bump(emptyStats(), 5, 'acc', 'closing', 'pending', 1);
    s = bump(s, 3, 'rej', 'closing', 'pending', 1);
    expect(preferredIndexes(s, 'pending', 'cordial').closing).toBeUndefined();
    const z = bump(emptyStats(), 9, 'acc', 'courtesy', 'formal', 0);
    expect(preferredIndexes(z, 'pending', 'formal').courtesy).toBeUndefined();
  });

  it('esquece gradualmente: ao chegar ao limite, divide as contagens do mesmo ponto e escopo', () => {
    const s = bump(emptyStats(), 60, 'acc', 'opening', 'pending', 1);
    expect(s.counts['acc.opening.pending.1']).toBe(30);
  });

  it('eventos: aceitar registra tudo que tem opção; trocar registra só o que mudou', () => {
    const shown = { opening: { index: 0, size: 2 }, closing: { index: 1, size: 2 }, courtesy: { index: 0, size: 1 } };
    expect(acceptedEvents(shown, 'pending', 'cordial')).toEqual([
      ['acc', 'opening', 'pending', 0],
      ['acc', 'closing', 'pending', 1],
    ]);
    const next = { opening: { index: 1, size: 2 }, closing: { index: 1, size: 2 } };
    expect(rejectedEvents(shown, next, 'pending', 'cordial')).toEqual([['rej', 'opening', 'pending', 0]]);
  });
});

describe('aprendiz e armazenamento', () => {
  const make = () => {
    const local = new MemoryArea();
    const store = new AppStorage(local, new MemoryArea());
    const learner = new StyleLearner({ load: () => store.loadLearning(), save: (s) => store.saveLearning(s) });
    return { local, store, learner };
  };

  it('desligado não grava nada', async () => {
    const { local, learner } = make();
    await learner.record([['acc', 'lead', 'any', 1]]);
    expect(await local.get(null)).toEqual({});
  });

  it('ligado grava só inteiros em chaves fechadas, e zerar remove tudo', async () => {
    const { local, store, learner } = make();
    learner.setEnabled(true);
    await learner.record([['acc', 'opening', 'pending', 1], ['rej', 'lead', 'any', 0]]);
    await learner.record([['acc', 'opening', 'pending', 1]]);
    const snap = await learner.snapshot();
    expect(snap.counts).toEqual({ 'acc.opening.pending.1': 2, 'rej.lead.any.0': 1 });
    const raw = JSON.stringify(await local.get(null));
    expect(raw).not.toMatch(/Olá|Maria|chamado/);
    await store.resetLearning();
    expect(await local.get(null)).toEqual({});
  });

  it('a chave entra na lista permitida e "limpar tudo" remove o aprendizado', async () => {
    const { local, store, learner } = make();
    expect(ALLOWED_KEYS).toContain('learnedStyle');
    learner.setEnabled(true);
    await learner.record([['acc', 'lead', 'any', 1]]);
    await store.clearAll();
    expect(await local.get(null)).toEqual({});
  });

  it('dado adulterado no armazenamento é descartado na leitura', async () => {
    const { store } = make();
    await (store as unknown as { local: MemoryArea }).local.set({ learnedStyle: { counts: { 'acc.opening.pending.1': 3, '<script>': 9 } } });
    expect((await store.loadLearning()).counts).toEqual({ 'acc.opening.pending.1': 3 });
  });

  it('a preferência começa desligada e só aceita booleano', () => {
    expect(DEFAULT_PREFERENCES.learnStyle).toBe(false);
    expect(sanitizePreferences({ learnStyle: 'sim' }).learnStyle).toBe(false);
    expect(sanitizePreferences({ learnStyle: true }).learnStyle).toBe(true);
  });
});

describe('efeito no motor', () => {
  const ctx = { pendingItem: 'envio do arquivo', expectedAction: 'enviar o arquivo' };
  const run = (learned?: Record<string, number>, variant = 0) =>
    generate({ settings: { ...settings('pending'), variant, learned }, context: ctx }, DEFAULT_PROFILE, { now: NOW });

  it('sem preferência, nada muda', () => {
    expect(run().text).toBe(gen('pending', ctx).text);
  });

  it('a redação preferida passa a vir primeiro e o texto-base é uma das opções existentes', () => {
    const base = run();
    const learnt = run({ opening: 1 });
    expect(learnt.text).not.toBe(base.text);
    expect(learnt.text).toContain('Registramos uma pendência neste atendimento.');
    expect(learnt.choices?.opening).toEqual({ index: 1, size: 4 });
  });

  it('a variação continua girando a partir da preferência, e índice fora da faixa é tratado com módulo', () => {
    expect(run({ opening: 1 }, 1).choices?.opening?.index).toBe(2);
    expect(run({ opening: 7 }).choices?.opening?.index).toBe(3);
  });

  it('a preferência nunca contorna bloqueios nem avisos de segurança', () => {
    const r = generate(
      { settings: { ...settings('pending'), learned: { opening: 1, lead: 1 } }, context: { pendingItem: 'a senha é Abc@12345 do usuário' } },
      DEFAULT_PROFILE,
      { now: NOW },
    );
    expect(r.blocked || r.warnings.some((w) => w.code.startsWith('sensitive_'))).toBe(true);
    if (r.blocked) expect(r.choices).toBeUndefined();
  });
});

describe('correções do rascunho livre', () => {
  it('chaves de correção são fechadas: só campos conhecidos e nunca de um campo para ele mesmo', () => {
    expect(isLearnKey('fix.result.action')).toBe(true);
    expect(isLearnKey('fix.summary.ignore')).toBe(true);
    for (const bad of ['fix.action.action', 'fix.notes.action', 'fix.action.notes', 'fix.x.y', 'fix.ignore.action', 'fix.action', 'fix.result.action.1']) {
      expect(isLearnKey(bad)).toBe(false);
    }
  });

  it('o viés só aparece com saldo mínimo, favorece o destino e desfavorece a origem', () => {
    let s = emptyStats();
    for (let i = 0; i < MIN_NET - 1; i++) s = recordFix(s, 'result', 'action');
    expect(draftBias(s)).toEqual({});
    s = recordFix(s, 'result', 'action');
    const b = draftBias(s);
    expect(b.action).toBeCloseTo(0.6);
    expect(b.result).toBeCloseTo(-0.6);
  });

  it('descartar um trecho só desfavorece a origem e o viés é limitado', () => {
    let s = emptyStats();
    for (let i = 0; i < 30; i++) s = recordFix(s, 'summary', 'ignore');
    const b = draftBias(s);
    expect(b.summary).toBeLessThanOrEqual(0);
    expect(Math.abs(b.summary ?? 0)).toBeLessThanOrEqual(2);
    expect(b.action).toBeUndefined();
  });

  it('esquece gradualmente ao chegar ao limite', () => {
    let s = emptyStats();
    for (let i = 0; i < 60; i++) s = recordFix(s, 'result', 'action');
    expect(s.counts['fix.result.action']).toBe(30);
  });

  it('o aprendiz grava as correções só quando ligado', async () => {
    const local = new MemoryArea();
    const store = new AppStorage(local, new MemoryArea());
    const learner = new StyleLearner({ load: () => store.loadLearning(), save: (x) => store.saveLearning(x) });
    await learner.recordFixes([['result', 'action']]);
    expect(await local.get(null)).toEqual({});
    learner.setEnabled(true);
    await learner.recordFixes([['result', 'action'], ['pending', 'ignore']]);
    expect((await learner.snapshot()).counts).toEqual({ 'fix.result.action': 1, 'fix.pending.ignore': 1 });
  });
});

describe('exportação do aprendizado', () => {
  it('traz só as contagens e a data, sem texto', () => {
    let s = recordFix(emptyStats(), 'result', 'action');
    s = recordEvent(s, 'acc', 'lead', 'any', 1);
    const out = JSON.parse(exportLearning(s, new Date('2026-10-16T10:00:00Z')));
    expect(out.exportadoEm).toBe('2026-10-16');
    expect(out.contadores).toEqual({ 'fix.result.action': 1, 'acc.lead.any.1': 1 });
    expect(Object.keys(out).sort()).toEqual(['contadores', 'exportadoEm', 'nota']);
  });
});
