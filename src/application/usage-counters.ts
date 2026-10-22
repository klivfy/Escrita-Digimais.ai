import { PROOFREAD_RULES } from '../domain/proofread';
import { COMMUNICATION_TYPES, RECIPIENTS } from '../domain/types';

/**
 * Contadores de uso agregados, sem conteúdo. Servem para medir se a ferramenta ajuda (quais tipos são usados,
 * quantas gerações são bloqueadas, quanto tempo leva até copiar). Garantias de desenho:
 * - só inteiros, em chaves de uma lista fechada (mais códigos de alerta, que são identificadores fixos do código);
 * - nenhum texto, nenhum campo do chamado, nenhum identificador de pessoa ou de chamado;
 * - tempo só em faixas, nunca marca de tempo por evento; a única data guardada é o dia em que a contagem começou;
 * - desligado por padrão; a organização pode forçar desligado ou ligado pela política gerenciada;
 * - nada sai do navegador: o analista exporta o JSON manualmente, se quiser.
 */

export const BLOCK_REASONS = [
  'sensitive_data', 'missing_information', 'policy', 'inconsistent', 'unsafe_content', 'input_too_long',
] as const;
export const TIME_BUCKETS = ['lt1m', '1to3m', '3to10m', 'gt10m'] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

/** Chaves fixas. Os códigos de alerta (`alert.<codigo>`) são validados por padrão e limitados em quantidade. */
export const FIXED_KEYS: readonly string[] = [
  ...COMMUNICATION_TYPES.map((t) => `generate.${t}`),
  ...BLOCK_REASONS.map((r) => `blocked.${r}`),
  'copy',
  'variant',
  'review_again',
  'draft_split',
  'draft_apply',
  ...TIME_BUCKETS.map((b) => `time_to_copy.${b}`),
  ...RECIPIENTS.map((r) => `recipient.${r}`),
  'proofread.run',
  ...PROOFREAD_RULES.flatMap((r) => [`proofread.${r}.acc`, `proofread.${r}.ign`]),
  'next_step.shown',
  'next_step.used',
  'shortcut.type',
];

const FIXED_SET = new Set(FIXED_KEYS);
const ALERT_KEY = /^alert\.[a-z][a-z0-9_]{1,47}$/;
export const MAX_ALERT_KEYS = 150;
export const MAX_COUNT = 1_000_000_000;

export type UsagePolicy = 'off' | 'optional' | 'on';

export interface UsageCounters {
  version: 1;
  /** Dia (AAAA-MM-DD) em que a contagem começou ou foi zerada. */
  since: string;
  counts: Record<string, number>;
}

export const dayString = (d: Date): string => d.toISOString().slice(0, 10);

export function emptyCounters(today: string): UsageCounters {
  return { version: 1, since: today, counts: {} };
}

export function isCounterKey(key: string): boolean {
  return FIXED_SET.has(key) || ALERT_KEY.test(key);
}

/** Aceita somente chaves conhecidas e inteiros válidos; descarta todo o resto. */
export function sanitizeCounters(raw: unknown, today: string): UsageCounters {
  const out = emptyCounters(today);
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.since)) out.since = r.since;
  if (typeof r.counts !== 'object' || r.counts === null) return out;
  let alertKeys = 0;
  for (const [key, value] of Object.entries(r.counts as Record<string, unknown>)) {
    if (!isCounterKey(key)) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) continue;
    if (key.startsWith('alert.')) {
      if (alertKeys >= MAX_ALERT_KEYS) continue;
      alertKeys += 1;
    }
    out.counts[key] = Math.min(value, MAX_COUNT);
  }
  return out;
}

/** Soma `n` à chave. Chaves inválidas e o excesso de códigos de alerta distintos são ignorados. */
export function increment(counters: UsageCounters, key: string, n = 1): UsageCounters {
  if (!isCounterKey(key) || !Number.isInteger(n) || n < 1) return counters;
  const isNewAlert = key.startsWith('alert.') && !(key in counters.counts);
  if (isNewAlert && Object.keys(counters.counts).filter((k) => k.startsWith('alert.')).length >= MAX_ALERT_KEYS) {
    return counters;
  }
  const next = Math.min((counters.counts[key] ?? 0) + n, MAX_COUNT);
  return { ...counters, counts: { ...counters.counts, [key]: next } };
}

export function timeBucket(ms: number): TimeBucket {
  if (!(ms >= 0)) return 'lt1m';
  if (ms < 60_000) return 'lt1m';
  if (ms < 180_000) return '1to3m';
  if (ms < 600_000) return '3to10m';
  return 'gt10m';
}

/** Chaves de uma geração: tipo (ou motivo do bloqueio) e códigos distintos de alerta. */
export function generationKeys(type: string, blockReason: string | undefined, warningCodes: readonly string[]): string[] {
  const keys = blockReason ? [`blocked.${blockReason}`] : [`generate.${type}`];
  for (const code of new Set(warningCodes)) keys.push(`alert.${code}`);
  return keys.filter(isCounterKey);
}

/**
 * Política da organização: "off" força desligado, "on" força ligado, "optional" deixa a escolha do analista
 * (que começa desligada).
 */
export function effectiveUsageMode(policy: UsagePolicy, userOptIn: boolean): { enabled: boolean; locked: boolean } {
  if (policy === 'off') return { enabled: false, locked: true };
  if (policy === 'on') return { enabled: true, locked: true };
  return { enabled: userOptIn, locked: false };
}

export function exportCounters(counters: UsageCounters, now: Date = new Date()): string {
  return JSON.stringify(
    {
      nota: 'Contadores agregados sem conteúdo de chamado. Gerado localmente pela extensão.',
      desde: counters.since,
      exportadoEm: dayString(now),
      contadores: counters.counts,
    },
    null,
    2,
  );
}

interface CounterIo {
  load(): Promise<UsageCounters>;
  save(counters: UsageCounters): Promise<void>;
}

/** Serializa as gravações e só grava quando habilitado. Falhas de armazenamento nunca interrompem o uso. */
export class UsageRecorder {
  private enabled = false;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly io: CounterIo) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  record(keys: string | readonly string[]): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    const list = (Array.isArray(keys) ? keys : [keys]) as string[];
    const valid = list.filter(isCounterKey);
    if (valid.length === 0) return Promise.resolve();
    const task = this.chain.then(async () => {
      let current = await this.io.load();
      for (const key of valid) current = increment(current, key);
      await this.io.save(current);
    });
    this.chain = task.catch(() => undefined);
    return task.catch(() => undefined);
  }

  async snapshot(): Promise<UsageCounters> {
    await this.chain;
    return this.io.load();
  }
}
