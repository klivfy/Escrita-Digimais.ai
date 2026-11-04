import { COMMUNICATION_TYPES } from '../domain/types';
import type { CommunicationType } from '../domain/types';

/**
 * Registro local do que a extensão aprendeu com os textos que o analista ensinou. Não guarda texto de chamado:
 * só trechos de redação (aberturas, pedidos, fechos e rótulos) já com os dados variáveis trocados por campos,
 * triados contra dado sensível, com a contagem de quantas vezes apareceram. Nada aqui sai do navegador sozinho.
 */

export const LEDGER_VERSION = 1;
export const BLOCK_ROLES = ['opening', 'request', 'closing'] as const;
export type BlockRole = (typeof BLOCK_ROLES)[number];

export const MAX_BLOCK_TEXT = 280;
export const MIN_BLOCK_TEXT = 8;
export const MAX_BLOCKS_PER_TYPE = 80;
export const MAX_LABELS_PER_TYPE = 30;
export const MAX_COUNT = 1_000_000;

export interface Counted {
  text: string;
  count: number;
}

export interface Block extends Counted {
  role: BlockRole;
}

export interface TypeLedger {
  /** Textos ensinados deste tipo que passaram pela triagem. */
  texts: number;
  blocks: Block[];
  /** Rótulos "X:" usados nos textos, sem os dois-pontos. */
  labels: Counted[];
}

export interface Ledger {
  version: 1;
  /** AAAA-MM-DD do primeiro texto acumulado. */
  since: string;
  /** AAAA-MM-DD do último. */
  updatedAt: string;
  /** Quantidade total de textos acumulados quando o último treino foi proposto (para avisar de novidade). */
  textsAtTraining: number;
  byType: Partial<Record<CommunicationType, TypeLedger>>;
}

export const emptyLedger = (today: string): Ledger => ({ version: 1, since: today, updatedAt: today, textsAtTraining: 0, byType: {} });

export const ledgerTexts = (ledger: Ledger): number => Object.values(ledger.byType).reduce((n, t) => n + (t?.texts ?? 0), 0);

// Campos da biblioteca ({nome}, {chamado}...) são permitidos; qualquer outro tipo de chave, link, HTML ou controle não.
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001F\u007F<>]|https?:\/\/|www\./iu;
const FIELDS = new Set(['nome', 'chamado', 'data', 'prazo', 'equipe', 'sistema', 'equipamento']);

/** Texto aceito no registro: uma linha de redação, sem controle, HTML, link nem chave fora da lista de campos. */
export function validBlockText(value: unknown, min = MIN_BLOCK_TEXT): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < min || text.length > MAX_BLOCK_TEXT || text !== value || BAD.test(text)) return false;
  const rest = text.replace(/\{([a-z]+)\}/g, (whole, name: string) => (FIELDS.has(name) ? '' : whole));
  return !/[{}]/.test(rest);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_COUNT ? v : undefined);
const day = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Mantém só os itens de maior contagem (desempate: o mais antigo sai primeiro). */
function top<T extends Counted>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const keep = new Set(
    items.map((item, i) => ({ item, i })).sort((a, b) => b.item.count - a.item.count || b.i - a.i).slice(0, max).map((x) => x.i),
  );
  return items.filter((_, i) => keep.has(i));
}

function cleanType(raw: unknown): TypeLedger | undefined {
  if (!isObject(raw)) return undefined;
  const texts = count(raw.texts);
  if (texts === undefined) return undefined;
  const blocks: Block[] = [];
  if (Array.isArray(raw.blocks)) {
    for (const b of raw.blocks) {
      if (!isObject(b) || !(BLOCK_ROLES as readonly unknown[]).includes(b.role) || !validBlockText(b.text)) continue;
      const c = count(b.count);
      if (c === undefined || blocks.some((x) => x.role === b.role && x.text === b.text)) continue;
      blocks.push({ role: b.role as BlockRole, text: b.text, count: c });
    }
  }
  const labels: Counted[] = [];
  if (Array.isArray(raw.labels)) {
    for (const l of raw.labels) {
      if (!isObject(l) || !validBlockText(l.text, 3)) continue;
      const c = count(l.count);
      if (c !== undefined && !labels.some((x) => x.text === l.text)) labels.push({ text: l.text, count: c });
    }
  }
  return { texts, blocks: top(blocks, MAX_BLOCKS_PER_TYPE), labels: top(labels, MAX_LABELS_PER_TYPE) };
}

/** Forma segura de um registro vindo do armazenamento ou de um arquivo importado, ou null se não for um registro. */
export function sanitizeLedger(raw: unknown): Ledger | null {
  if (!isObject(raw) || raw.version !== LEDGER_VERSION) return null;
  const since = day(raw.since);
  const updatedAt = day(raw.updatedAt);
  if (!since || !updatedAt) return null;
  const byType: Ledger['byType'] = {};
  if (isObject(raw.byType)) {
    for (const type of COMMUNICATION_TYPES) {
      const t = cleanType(raw.byType[type]);
      if (t) byType[type] = t;
    }
  }
  const textsAtTraining = typeof raw.textsAtTraining === 'number' && Number.isInteger(raw.textsAtTraining) && raw.textsAtTraining >= 0 ? Math.min(raw.textsAtTraining, MAX_COUNT) : 0;
  return { version: 1, since, updatedAt, textsAtTraining, byType };
}

function mergeCounted<T extends Counted>(base: T[], extra: T[], same: (a: T, b: T) => boolean): T[] {
  const out = base.map((x) => ({ ...x }));
  for (const item of extra) {
    const hit = out.find((x) => same(x, item));
    if (hit) hit.count = Math.min(MAX_COUNT, hit.count + item.count);
    else out.push({ ...item });
  }
  return out;
}

/** Soma dois registros (contagens somadas, limites reaplicados). Não altera os originais. */
export function mergeLedgers(a: Ledger, b: Ledger): Ledger {
  const byType: Ledger['byType'] = {};
  for (const type of COMMUNICATION_TYPES) {
    const x = a.byType[type];
    const y = b.byType[type];
    if (!x && !y) continue;
    byType[type] = {
      texts: Math.min(MAX_COUNT, (x?.texts ?? 0) + (y?.texts ?? 0)),
      blocks: top(mergeCounted(x?.blocks ?? [], y?.blocks ?? [], (p, q) => p.role === q.role && p.text === q.text), MAX_BLOCKS_PER_TYPE),
      labels: top(mergeCounted(x?.labels ?? [], y?.labels ?? [], (p, q) => p.text === q.text), MAX_LABELS_PER_TYPE),
    };
  }
  return {
    version: 1,
    since: a.since < b.since ? a.since : b.since,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    textsAtTraining: a.textsAtTraining,
    byType,
  };
}
