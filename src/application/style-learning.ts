import { DRAFT_CLASSES } from '../config/draft-rules';
import type { DraftClass } from '../config/draft-rules';
import { MAX_FREQUENT_TYPES, MIN_TYPE_USES } from '../config/dialogue';
import { rankByCount } from '../domain/dialogue';
import { COMMUNICATION_TYPES, FORMALITIES } from '../domain/types';
import type { CommunicationType, PhraseChoices, PhraseSlot, PreferredIndexes } from '../domain/types';

/**
 * Aprendizado local de preferência de redação (opção A). Garantias de desenho:
 * - só inteiros, em chaves de uma lista fechada: `acc|rej` + ponto do texto + escopo + índice da redação;
 * - nunca guarda texto de chamado, de campo, de edição ou nome de pessoa; guarda apenas "qual das redações
 *   prontas do próprio produto foi mantida ou trocada";
 * - desligado por padrão, zerável, sem sair do navegador;
 * - só muda qual redação aparece primeiro, quais tipos aparecem como atalho ("mais usados") e a ordem dos próximos
 *   passos sugeridos; nenhuma regra de segurança ou de política depende disso.
 * Chaves de uso (sem conteúdo): `use.<tipo>` (texto copiado daquele tipo) e `seq.<tipo>.<tipo>` (próximo passo escolhido).
 */

export type LearnKind = 'acc' | 'rej';
export type LearnEvent = [LearnKind, PhraseSlot, string, number];
export const MAX_INDEX = 9;
/** Evidência líquida mínima (aceitas menos trocadas) para a preferência passar a valer. */
export const MIN_NET = 3;
const HALVE_AT = 60;
const MAX_COUNT = 1000;

const SCOPES: Record<PhraseSlot, readonly string[]> = {
  opening: COMMUNICATION_TYPES,
  closing: COMMUNICATION_TYPES,
  courtesy: FORMALITIES,
  lead: ['any'],
};

export interface LearnedStats {
  version: 1;
  counts: Record<string, number>;
}

export const emptyStats = (): LearnedStats => ({ version: 1, counts: {} });

export function learnKey(kind: LearnKind, slot: PhraseSlot, scope: string, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) return null;
  if (!SCOPES[slot].includes(scope)) return null;
  return `${kind}.${slot}.${scope}.${index}`;
}

function parseKey(key: string): { kind: LearnKind; slot: PhraseSlot; scope: string; index: number } | null {
  const m = /^(acc|rej)\.(opening|closing|courtesy|lead)\.([a-z_]+)\.(\d)$/.exec(key);
  if (!m) return null;
  const kind = m[1] as LearnKind;
  const slot = m[2] as PhraseSlot;
  const scope = m[3] as string;
  const index = Number(m[4]);
  return learnKey(kind, slot, scope, index) ? { kind, slot, scope, index } : null;
}

/** Correções do rascunho livre: de qual campo o trecho foi tirado e para qual foi (ou 'ignore' se descartado). */
export type FixTarget = DraftClass | 'ignore';
const FIX_TARGETS: readonly string[] = [...DRAFT_CLASSES, 'ignore'];
const FIX_KEY = /^fix\.([a-z]+)\.([a-z]+)$/;

export function fixKey(from: DraftClass, to: FixTarget): string | null {
  return DRAFT_CLASSES.includes(from) && FIX_TARGETS.includes(to) && from !== to ? `fix.${from}.${to}` : null;
}

function parseFix(key: string): { from: DraftClass; to: FixTarget } | null {
  const m = FIX_KEY.exec(key);
  if (!m) return null;
  const from = m[1] as DraftClass;
  const to = m[2] as FixTarget;
  return fixKey(from, to) ? { from, to } : null;
}

const TYPES: readonly string[] = COMMUNICATION_TYPES;
const USE_KEY = /^use\.([a-z_]+)$/;
const SEQ_KEY = /^seq\.([a-z_]+)\.([a-z_]+)$/;

export function typeUseKey(type: string): string | null {
  return TYPES.includes(type) ? `use.${type}` : null;
}

export function stepKey(from: string, to: string): string | null {
  return TYPES.includes(from) && TYPES.includes(to) && from !== to ? `seq.${from}.${to}` : null;
}

function isUsageKey(key: string): boolean {
  const u = USE_KEY.exec(key);
  if (u) return typeUseKey(u[1] ?? '') === key;
  const q = SEQ_KEY.exec(key);
  return q ? stepKey(q[1] ?? '', q[2] ?? '') === key : false;
}

export function isLearnKey(key: string): boolean {
  return parseKey(key) !== null || parseFix(key) !== null || isUsageKey(key);
}

/** Soma 1 a uma chave de uso. No limite, divide por dois todas as chaves da mesma família (esquecimento gradual). */
function bumpFamily(stats: LearnedStats, key: string | null, family: string): LearnedStats {
  if (!key) return stats;
  const counts = { ...stats.counts, [key]: Math.min((stats.counts[key] ?? 0) + 1, MAX_COUNT) };
  if ((counts[key] ?? 0) >= HALVE_AT) {
    for (const k of Object.keys(counts)) {
      if (!k.startsWith(family)) continue;
      const half = Math.floor((counts[k] ?? 0) / 2);
      if (half < 1) delete counts[k];
      else counts[k] = half;
    }
  }
  return { version: 1, counts };
}

/** Texto copiado de um tipo: conta para a lista de tipos mais usados. */
export const recordUse = (stats: LearnedStats, type: CommunicationType): LearnedStats => bumpFamily(stats, typeUseKey(type), 'use.');

/** Próximo passo escolhido pelo analista depois de copiar um texto do tipo `from`. */
export const recordStep = (stats: LearnedStats, from: CommunicationType, to: CommunicationType): LearnedStats =>
  bumpFamily(stats, stepKey(from, to), `seq.${from}.`);

/** Tipos que o analista mais copia (pelo menos MIN_TYPE_USES vezes), do mais usado ao menos usado. */
export function frequentTypes(stats: LearnedStats, exclude?: CommunicationType, max = MAX_FREQUENT_TYPES): CommunicationType[] {
  const used = COMMUNICATION_TYPES.filter((t) => t !== exclude && (stats.counts[`use.${t}`] ?? 0) >= MIN_TYPE_USES);
  return rankByCount(used, (t) => stats.counts[`use.${t}`] ?? 0).slice(0, max);
}

/** Reordena os próximos passos pelo que o analista costuma escolher depois de `from`. */
export function rankNextSteps(stats: LearnedStats, from: CommunicationType, candidates: readonly CommunicationType[]): CommunicationType[] {
  return rankByCount(candidates, (t) => stats.counts[`seq.${from}.${t}`] ?? 0);
}

/** Aceita somente chaves conhecidas e inteiros válidos. */
export function sanitizeStats(raw: unknown): LearnedStats {
  const out = emptyStats();
  if (typeof raw !== 'object' || raw === null) return out;
  const counts = (raw as Record<string, unknown>).counts;
  if (typeof counts !== 'object' || counts === null) return out;
  for (const [key, value] of Object.entries(counts as Record<string, unknown>)) {
    if (!isLearnKey(key)) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) continue;
    out.counts[key] = Math.min(value, MAX_COUNT);
  }
  return out;
}

/** Soma 1 a uma correção do rascunho. Ao chegar ao limite, divide por dois todas as correções (esquecimento gradual). */
export function recordFix(stats: LearnedStats, from: DraftClass, to: FixTarget): LearnedStats {
  const key = fixKey(from, to);
  if (!key) return stats;
  const counts = { ...stats.counts, [key]: Math.min((stats.counts[key] ?? 0) + 1, MAX_COUNT) };
  if ((counts[key] ?? 0) >= HALVE_AT) {
    for (const k of Object.keys(counts)) {
      if (parseFix(k)) {
        const half = Math.floor((counts[k] ?? 0) / 2);
        if (half < 1) delete counts[k];
        else counts[k] = half;
      }
    }
  }
  return { version: 1, counts };
}

/**
 * Viés por campo, a partir do saldo das correções (trechos que entraram no campo menos os que saíram dele).
 * Só vale com saldo de pelo menos MIN_NET e é pequeno: serve para desempatar, nunca para anular as regras.
 */
export function draftBias(stats: LearnedStats): Partial<Record<DraftClass, number>> {
  const net: Partial<Record<DraftClass, number>> = {};
  for (const [k, v] of Object.entries(stats.counts)) {
    const f = parseFix(k);
    if (!f) continue;
    net[f.from] = (net[f.from] ?? 0) - v;
    if (f.to !== 'ignore') net[f.to] = (net[f.to] ?? 0) + v;
  }
  const out: Partial<Record<DraftClass, number>> = {};
  for (const cls of DRAFT_CLASSES) {
    const n = net[cls] ?? 0;
    if (Math.abs(n) >= MIN_NET) out[cls] = Math.sign(n) * Math.min(Math.abs(n), 10) * 0.2;
  }
  return out;
}

/** Soma 1 ao evento. Ao chegar a um limite, divide por dois todos os eventos do mesmo ponto e escopo (esquecimento gradual). */
export function recordEvent(stats: LearnedStats, kind: LearnKind, slot: PhraseSlot, scope: string, index: number): LearnedStats {
  const key = learnKey(kind, slot, scope, index);
  if (!key) return stats;
  const counts = { ...stats.counts, [key]: Math.min((stats.counts[key] ?? 0) + 1, MAX_COUNT) };
  if ((counts[key] ?? 0) >= HALVE_AT) {
    for (const k of Object.keys(counts)) {
      const p = parseKey(k);
      if (p && p.slot === slot && p.scope === scope) {
        const half = Math.floor((counts[k] ?? 0) / 2);
        if (half < 1) delete counts[k];
        else counts[k] = half;
      }
    }
  }
  return { version: 1, counts };
}

const scopeOf = (slot: PhraseSlot, type: string, formality: string): string =>
  slot === 'courtesy' ? formality : slot === 'lead' ? 'any' : type;

/** Redação preferida por ponto: a de maior saldo (aceitas menos trocadas), se o saldo chegar a MIN_NET e não for a padrão. */
export function preferredIndexes(stats: LearnedStats, type: string, formality: string): PreferredIndexes {
  const out: PreferredIndexes = {};
  for (const slot of Object.keys(SCOPES) as PhraseSlot[]) {
    const scope = scopeOf(slot, type, formality);
    let best = -1;
    let bestNet = 0;
    for (let i = 0; i <= MAX_INDEX; i++) {
      const net = (stats.counts[`acc.${slot}.${scope}.${i}`] ?? 0) - (stats.counts[`rej.${slot}.${scope}.${i}`] ?? 0);
      if (net > bestNet) {
        best = i;
        bestNet = net;
      }
    }
    if (best > 0 && bestNet >= MIN_NET) out[slot] = best;
  }
  return out;
}

/** Eventos de "mantida" para tudo o que foi mostrado. */
export function acceptedEvents(choices: PhraseChoices, type: string, formality: string): LearnEvent[] {
  const events: LearnEvent[] = [];
  for (const slot of Object.keys(choices) as PhraseSlot[]) {
    const c = choices[slot];
    if (c && c.size > 1) events.push(['acc', slot, scopeOf(slot, type, formality), c.index]);
  }
  return events;
}

/** Eventos de "trocada" só para os pontos cuja redação mudou de uma variação para a seguinte. */
export function rejectedEvents(before: PhraseChoices, after: PhraseChoices, type: string, formality: string): LearnEvent[] {
  const events: LearnEvent[] = [];
  for (const slot of Object.keys(before) as PhraseSlot[]) {
    const b = before[slot];
    const a = after[slot];
    if (b && a && b.size > 1 && a.index !== b.index) events.push(['rej', slot, scopeOf(slot, type, formality), b.index]);
  }
  return events;
}

/** Arquivo exportado pelo analista para o piloto: só as contagens, sem texto. O nome do arquivo começa com "aprendizado". */
export function exportLearning(stats: LearnedStats, now: Date = new Date()): string {
  return JSON.stringify(
    {
      nota: 'Contagens de preferência de redação, de correções do rascunho livre, de tipos usados e de próximos passos escolhidos. Sem conteúdo de chamado. Gerado localmente pela extensão.',
      exportadoEm: now.toISOString().slice(0, 10),
      contadores: stats.counts,
    },
    null,
    2,
  );
}

interface StatsIo {
  load(): Promise<LearnedStats>;
  save(stats: LearnedStats): Promise<void>;
}

/** Serializa as gravações, só grava quando habilitado e nunca interrompe o uso por falha de armazenamento. */
export class StyleLearner {
  private enabled = false;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly io: StatsIo) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  recordFixes(fixes: readonly [DraftClass, FixTarget][]): Promise<void> {
    if (!this.enabled || fixes.length === 0) return Promise.resolve();
    const task = this.chain.then(async () => {
      let current = await this.io.load();
      for (const [from, to] of fixes) current = recordFix(current, from, to);
      await this.io.save(current);
    });
    this.chain = task.catch(() => undefined);
    return task.catch(() => undefined);
  }

  /** Registra uso de tipo ou próximo passo escolhido (só contagens). */
  recordUsage(change: (stats: LearnedStats) => LearnedStats): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    const task = this.chain.then(async () => {
      await this.io.save(change(await this.io.load()));
    });
    this.chain = task.catch(() => undefined);
    return task.catch(() => undefined);
  }

  record(events: readonly LearnEvent[]): Promise<void> {
    if (!this.enabled || events.length === 0) return Promise.resolve();
    const task = this.chain.then(async () => {
      let current = await this.io.load();
      for (const [kind, slot, scope, index] of events) current = recordEvent(current, kind, slot, scope, index);
      await this.io.save(current);
    });
    this.chain = task.catch(() => undefined);
    return task.catch(() => undefined);
  }

  async snapshot(): Promise<LearnedStats> {
    await this.chain;
    return this.io.load();
  }
}
