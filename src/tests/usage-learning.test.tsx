import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyStats, frequentTypes, isLearnKey, rankNextSteps, recordStep, recordUse, sanitizeStats, StyleLearner,
} from '../application/style-learning';
import type { LearnedStats } from '../application/style-learning';
import { FIXED_KEYS, isCounterKey } from '../application/usage-counters';
import { DIALOGUE_NEXT } from '../config/dialogue';
import { nextStepCandidates } from '../domain/dialogue';
import { COMMUNICATION_TYPES } from '../domain/types';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { MemoryArea } from './memory-storage';
import { NOW } from './helpers';

afterEach(() => cleanup());

const times = (n: number, f: (s: LearnedStats) => LearnedStats, s: LearnedStats = emptyStats()): LearnedStats => {
  let out = s;
  for (let i = 0; i < n; i++) out = f(out);
  return out;
};

describe('aprendizado de uso: chaves e contagens (sem conteúdo)', () => {
  it('só aceita use.<tipo> e seq.<tipo>.<tipo> com tipos conhecidos', () => {
    expect(isLearnKey('use.request_information')).toBe(true);
    expect(isLearnKey('seq.request_information.progress_update')).toBe(true);
    expect(isLearnKey('seq.request_information.request_information')).toBe(false);
    expect(isLearnKey('use.planilha_de_custos')).toBe(false);
    expect(isLearnKey('seq.x.y')).toBe(false);
    const clean = sanitizeStats({ counts: { 'use.pending': 2, 'use.texto livre': 4, 'seq.pending.progress_update': 1.5 } });
    expect(clean.counts).toEqual({ 'use.pending': 2 });
  });

  it('tipos mais usados: mínimo de 3 usos, do mais ao menos usado, sem o tipo atual', () => {
    let s = times(5, (x) => recordUse(x, 'progress_update'));
    s = times(3, (x) => recordUse(x, 'pending'), s);
    s = times(2, (x) => recordUse(x, 'technical_note'), s);
    expect(frequentTypes(s)).toEqual(['progress_update', 'pending']);
    expect(frequentTypes(s, 'progress_update')).toEqual(['pending']);
  });

  it('próximos passos: ordem padrão, reordenada pelo que o analista escolhe', () => {
    const base = nextStepCandidates('request_information');
    expect(base).toEqual(DIALOGUE_NEXT.request_information);
    const s = times(2, (x) => recordStep(x, 'request_information', 'closure_no_response'));
    expect(rankNextSteps(s, 'request_information', base)[0]).toBe('closure_no_response');
    expect(rankNextSteps(emptyStats(), 'request_information', base)).toEqual(base);
  });

  it('respeita tipos desativados pela organização e nunca sugere o mesmo tipo', () => {
    expect(nextStepCandidates('request_information', new Set(['closure_no_response']))).not.toContain('closure_no_response');
    for (const t of COMMUNICATION_TYPES) expect(nextStepCandidates(t)).not.toContain(t);
  });

  it('esquecimento gradual: no limite, a família de chaves é dividida por dois', () => {
    let s = times(59, (x) => recordUse(x, 'pending'));
    s = times(10, (x) => recordUse(x, 'progress_update'), s);
    s = recordUse(s, 'pending');
    expect(s.counts['use.pending']).toBe(30);
    expect(s.counts['use.progress_update']).toBe(5);
  });

  it('desligado, o StyleLearner não grava uso', async () => {
    const save = vi.fn(async () => {});
    const learner = new StyleLearner({ load: async () => emptyStats(), save });
    await learner.recordUsage((s) => recordUse(s, 'pending'));
    expect(save).not.toHaveBeenCalled();
  });

  it('contadores novos são chaves fechadas, sem espaço para texto', () => {
    for (const k of ['recipient.user', 'proofread.run', 'proofread.concordancia.acc', 'proofread.acento.ign', 'next_step.shown', 'next_step.used', 'shortcut.type']) {
      expect(FIXED_KEYS).toContain(k);
    }
    expect(isCounterKey('recipient.Maria')).toBe(false);
    expect(isCounterKey('proofread.licensa.acc')).toBe(false);
  });
});

const SEGREDO = 'Planilha exclusiva 7Q2Z';

function setup(prefs: Record<string, unknown> = {}) {
  const local = new MemoryArea({ preferences: prefs });
  const storage = new AppStorage(local, new MemoryArea());
  const user = userEvent.setup();
  render(<App storage={storage} copy={vi.fn(async () => true)} now={() => NOW} loadUsage={async () => 'optional'} />);
  return { local, user };
}

async function generateAndCopy(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/Por que a informação é necessária/), { target: { value: `Erro ao abrir a ${SEGREDO}.` } });
  fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual mensagem de erro aparece na tela' } });
  await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
  await screen.findByLabelText('Prévia editável');
  await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
}

const typeSelect = () => screen.getByLabelText('Tipo de comunicação') as HTMLSelectElement;
const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

describe('próximo passo e tipos mais usados na interface', () => {
  it('depois de copiar, sugere o próximo passo; escolher troca o tipo, mantém os campos e leva o foco ao tipo', async () => {
    const { user } = setup();
    await generateAndCopy(user);
    const step = screen.getByRole('button', { name: 'Preparar: Comunicar andamento' });
    // O encerramento por ausência de retorno está desativado no perfil padrão e não aparece.
    expect(screen.queryByRole('button', { name: 'Preparar: Encerrar por ausência de retorno' })).toBeNull();
    await user.click(step);
    expect(typeSelect().value).toBe('progress_update');
    expect(typeSelect()).toHaveFocus();
    expect((screen.getByLabelText(/Contexto do chamado/) as HTMLTextAreaElement).value).toContain(SEGREDO);
    expect(live()).toMatch(/Tipo alterado para Comunicar andamento\. Os campos foram mantidos/);
  });

  it('sem aprendizado, a ordem é a padrão e nada é gravado', async () => {
    const { local, user } = setup();
    await generateAndCopy(user);
    const buttons = screen.getAllByRole('button', { name: /^Preparar:/ }).map((b) => b.textContent);
    expect(buttons).toEqual(['Preparar: Comunicar andamento', 'Preparar: Registrar pendência']);
    await user.click(screen.getByRole('button', { name: 'Preparar: Comunicar andamento' }));
    expect(local.data.learnedStyle).toBeUndefined();
    expect(screen.queryByRole('group', { name: 'Tipos que você mais usa' })).toBeNull();
  });

  it('com aprendizado: grava uso e passo escolhido (só contagens), reordena e mostra os tipos mais usados', async () => {
    const { local, user } = setup({ learnStyle: true, usageCounters: true });
    for (let i = 0; i < 3; i++) {
      fireEvent.change(typeSelect(), { target: { value: 'request_information' } });
      await generateAndCopy(user);
      await user.click(screen.getByRole('button', { name: 'Preparar: Registrar pendência' }));
    }
    const counts = () => (local.data.learnedStyle as { counts: Record<string, number> }).counts;
    await waitFor(() => expect(counts()['seq.request_information.pending']).toBe(3));
    expect(counts()['use.request_information']).toBe(3);
    // Ordem aprendida: o passo escolhido vem primeiro.
    fireEvent.change(typeSelect(), { target: { value: 'request_information' } });
    await generateAndCopy(user);
    expect(screen.getAllByRole('button', { name: /^Preparar:/ })[0].textContent).toBe('Preparar: Registrar pendência');
    // Tipos mais usados aparecem quando o tipo atual é outro.
    fireEvent.change(typeSelect(), { target: { value: 'technical_note' } });
    const group = await screen.findByRole('group', { name: 'Tipos que você mais usa' });
    await user.click(screen.getByRole('button', { name: 'Solicitar informações' }));
    expect(typeSelect().value).toBe('request_information');
    expect(group).toBeTruthy();
    await waitFor(() => expect((local.data.usageCounters as { counts: Record<string, number> }).counts['next_step.used']).toBe(3));
    const usage = (local.data.usageCounters as { counts: Record<string, number> }).counts;
    expect(usage['recipient.user']).toBeGreaterThanOrEqual(4);
    expect(usage['next_step.shown']).toBeGreaterThanOrEqual(4);
    expect(usage['shortcut.type']).toBe(1);
    const raw = JSON.stringify(local.data);
    expect(raw).not.toContain(SEGREDO);
    expect(raw).not.toMatch(/7Q2Z|mensagem de erro/);
  });

  it('sem violações de acessibilidade (axe) com o próximo passo na tela', async () => {
    const { user } = setup({ learnStyle: true });
    await generateAndCopy(user);
    expect(screen.getByRole('group', { name: /Próximo passo comum/ })).toBeTruthy();
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  it('o modo Corrigir texto registra verificação e decisões por regra nos contadores', async () => {
    const { local, user } = setup({ usageCounters: true });
    await user.click(screen.getByRole('button', { name: 'Corrigir texto' }));
    fireEvent.change(screen.getByLabelText('Texto a corrigir'), { target: { value: 'nao foi possivel e houveram falhas' } });
    await user.click(screen.getByRole('button', { name: 'Verificar texto' }));
    await screen.findByRole('heading', { name: /^Sugestões/ }, { timeout: 15000 });
    await user.click(screen.getByRole('button', { name: 'Aceitar: trocar houveram por houve' }));
    await user.click(screen.getByRole('button', { name: 'Ignorar a palavra nao' }));
    const counts = () => (local.data.usageCounters as { counts: Record<string, number> } | undefined)?.counts ?? {};
    await waitFor(() => expect(counts()['proofread.acento.ign']).toBe(1));
    expect(counts()['proofread.run']).toBe(1);
    expect(counts()['proofread.concordancia.acc']).toBe(1);
    expect(JSON.stringify(local.data)).not.toMatch(/possivel|houveram|falhas/);
  });
});
