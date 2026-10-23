/**
 * Busca de modelos da biblioteca pelo que o analista digita, sem IA: trechos de 2 a 5 letras dentro de cada palavra,
 * ponderados pela raridade (TF-IDF) e comparados por cosseno. É o método medido em scripts/estudo-ensino/recuperacao.py
 * (modelo certo entre os 3 primeiros em 98% das consultas, mas só em 1º em 91%): por isso a tela sempre mostra uma
 * lista e nunca escolhe sozinha. Puro e determinístico.
 */
import type { LibraryModel } from '../config/library-schema';
import { MODEL_PLACEHOLDERS } from '../config/library-schema';
import type { CommunicationType, Recipient } from './types';

const NGRAM_MIN = 2;
const NGRAM_MAX = 5;

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\{[a-z]+\}/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Trechos de letras por palavra, como o analisador "char_wb" do scikit-learn (cada palavra entre espaços). */
function grams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of normalize(text).split(' ')) {
    if (!word) continue;
    const w = ` ${word} `;
    for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export interface SearchIndex {
  models: readonly LibraryModel[];
  idf: ReadonlyMap<string, number>;
  vectors: readonly ReadonlyMap<string, number>[];
}

function weigh(counts: Map<string, number>, idf: ReadonlyMap<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  let sum = 0;
  for (const [g, c] of counts) {
    const k = idf.get(g);
    if (k === undefined) continue; // trecho que nenhum modelo tem não ajuda a comparar
    const v = (1 + Math.log(c)) * k;
    vec.set(g, v);
    sum += v * v;
  }
  const norm = Math.sqrt(sum) || 1;
  for (const [g, v] of vec) vec.set(g, v / norm);
  return vec;
}

/** O que se compara: título, palavras-chave e texto do modelo (o título e as palavras-chave ajudam consultas curtas). */
const documentOf = (m: LibraryModel): string => `${m.title} ${m.keywords.join(' ')} ${m.text}`;

export function buildSearchIndex(models: readonly LibraryModel[]): SearchIndex {
  const docs = models.map((m) => grams(documentOf(m)));
  const df = new Map<string, number>();
  for (const d of docs) for (const g of d.keys()) df.set(g, (df.get(g) ?? 0) + 1);
  const n = models.length;
  const idf = new Map<string, number>();
  for (const [g, f] of df) idf.set(g, Math.log((1 + n) / (1 + f)) + 1);
  return { models, idf, vectors: docs.map((d) => weigh(d, idf)) };
}

export interface SearchOptions {
  type?: CommunicationType;
  recipient?: Recipient;
  /** Ignora o tipo do formulário e procura em todos. */
  anyType?: boolean;
  limit?: number;
  /** Semelhança mínima para entrar na lista (consulta vazia lista os primeiros, sem pontuação). */
  minScore?: number;
}

export interface SearchHit {
  model: LibraryModel;
  score: number;
}

const eligible = (m: LibraryModel, o: SearchOptions): boolean =>
  (o.anyType || !o.type || m.types.includes(o.type)) && (m.recipients.length === 0 || !o.recipient || m.recipients.includes(o.recipient));

/** Quantos modelos servem ao tipo e ao destinatário escolhidos (a tela usa para dizer se vale a pena buscar). */
export function countEligible(index: SearchIndex, options: SearchOptions = {}): number {
  return index.models.filter((model) => eligible(model, options)).length;
}

/** Sem consulta não há resultado: o analista só vê modelo depois de dizer o que precisa, nunca uma lista arbitrária. */
export function searchModels(index: SearchIndex, query: string, options: SearchOptions = {}): SearchHit[] {
  const limit = options.limit ?? 3;
  if (!normalize(query)) return [];
  const pool = index.models.map((model, i) => ({ model, i })).filter(({ model }) => eligible(model, options));
  const q = weigh(grams(query), index.idf);
  const minScore = options.minScore ?? 0.05;
  return pool
    .map(({ model, i }) => {
      let score = 0;
      const v = index.vectors[i];
      for (const [g, w] of q) score += w * (v.get(g) ?? 0);
      return { model, score, i };
    })
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(({ model, score }) => ({ model, score }));
}

// ---------- Campos entre chaves ----------

export type FieldValues = Partial<Record<(typeof MODEL_PLACEHOLDERS)[number], string>>;

const FIELD = new RegExp(`\\{(${MODEL_PLACEHOLDERS.join('|')})\\}`, 'g');

/** Preenche só os campos para os quais há valor informado pelo analista (uma linha, sem chaves). O resto fica pendente. */
export function fillModel(text: string, values: FieldValues): string {
  return text.replace(FIELD, (whole, name: keyof FieldValues) => {
    const v = values[name]?.trim();
    return v && !/[\n\r{}]/.test(v) ? v : whole;
  });
}

/** Campos que ainda estão entre chaves no texto, sem repetir, na ordem em que aparecem. */
export function pendingFields(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(FIELD)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const ANY_BRACES = /\{([^{}\n]{1,30})\}/g;

/** Trechos entre chaves que NÃO são um dos campos da lista fechada (por exemplo {x}), sem repetir. */
export function strayBraces(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ANY_BRACES)) {
    const name = m[1].trim();
    if (name && !(MODEL_PLACEHOLDERS as readonly string[]).includes(name) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}
