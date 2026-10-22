/**
 * Travas para usar um modelo de IA (por exemplo, a Proofreader API ou a Prompt API do Edge) sem perder o controle do texto.
 * Puras e testáveis sem modelo nenhum:
 *  - guardCorrections: das correções propostas pelo modelo, só passam acento, flexão com o mesmo radical e trocas de
 *    uma lista fechada; troca de palavra, de número, de sigla, de nome e qualquer acréscimo ou remoção são recusados;
 *  - checkFacts: compara o texto do motor com uma reescrita e aponta fato novo ou perdido (número, data, sigla, nome,
 *    link), compromisso, aprovação ou solução afirmada que não existiam, negação e perguntas alteradas.
 * Nada aqui chama a IA nem altera texto: as funções só dizem o que pode ser oferecido ao analista como sugestão.
 */
import { AI_ALLOWED_PAIRS, AI_GUARD_LIMITS } from '../config/ai-guard';
import { PROOFREAD_DOMAIN_TERMS } from '../config/proofread/rules';
import { ignorable, keepCase, strip } from './proofread';
import type { FreqIndex } from './proofread';

/** Correção proposta pelo modelo, em posições do texto original (fim exclusivo). */
export interface ModelCorrection {
  start: number;
  end: number;
  replacement: string;
}

export type GuardKind = 'acento' | 'flexao' | 'par';

export interface GuardedCorrection extends ModelCorrection {
  original: string;
  kind: GuardKind;
}

export interface RejectedCorrection extends ModelCorrection {
  original: string;
  reason: string;
}

interface Tok {
  w: string;
  s: number;
  e: number;
}
const WORD = /[\p{L}\p{N}_'’-]+/gu;
const tokens = (text: string): Tok[] => [...text.matchAll(WORD)].map((m) => ({ w: m[0], s: m.index, e: m.index + m[0].length }));

/**
 * Converte o texto corrigido pelo modelo em correções sobre o original, palavra a palavra (pontuação é ignorada).
 * Trechos com o mesmo número de palavras viram trocas uma a uma; os demais viram uma única correção do trecho todo.
 */
export function correctionsFromRewrite(original: string, corrected: string): ModelCorrection[] {
  const a = tokens(original);
  const b = tokens(corrected);
  const al = a.map((t) => t.w.toLocaleLowerCase('pt-BR'));
  const bl = b.map((t) => t.w.toLocaleLowerCase('pt-BR'));
  // Maior subsequência comum (os textos são curtos: limite de AI_GUARD_LIMITS.maxWords palavras).
  if (a.length > AI_GUARD_LIMITS.maxWords || b.length > AI_GUARD_LIMITS.maxWords) return [];
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = al[i] === bl[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: ModelCorrection[] = [];
  let i = 0;
  let j = 0;
  const flush = (i0: number, i1: number, j0: number, j1: number): void => {
    if (i0 === i1 && j0 === j1) return;
    if (i1 - i0 === j1 - j0) {
      for (let k = 0; k < i1 - i0; k++) out.push({ start: a[i0 + k].s, end: a[i0 + k].e, replacement: b[j0 + k].w });
      return;
    }
    const start = i0 < i1 ? a[i0].s : i0 < n ? a[i0].s : original.length;
    const end = i0 < i1 ? a[i1 - 1].e : start;
    out.push({ start, end, replacement: b.slice(j0, j1).map((t) => t.w).join(' ') });
  };
  let bi = 0;
  let bj = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      flush(bi, i, bj, j);
      i++;
      j++;
      bi = i;
      bj = j;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  flush(bi, n, bj, m);
  return out;
}

const prefixLength = (x: string, y: string): number => {
  let k = 0;
  while (k < x.length && k < y.length && x[k] === y[k]) k++;
  return k;
};

/** Decide, correção por correção, o que pode virar sugestão. Nunca aceita acréscimo, remoção ou troca de palavra. */
export function guardCorrections(
  original: string,
  corrections: readonly ModelCorrection[],
  index: FreqIndex,
): { accepted: GuardedCorrection[]; rejected: RejectedCorrection[] } {
  const accepted: GuardedCorrection[] = [];
  const rejected: RejectedCorrection[] = [];
  const L = AI_GUARD_LIMITS;
  const known = (w: string): number => index.zipf.get(w) ?? 0;
  for (const c of corrections) {
    const span = original.slice(c.start, c.end);
    const from = span.toLocaleLowerCase('pt-BR');
    const to = c.replacement.toLocaleLowerCase('pt-BR');
    const reject = (reason: string): void => {
      rejected.push({ ...c, original: span, reason });
    };
    const accept = (kind: GuardKind): void => {
      accepted.push({ ...c, replacement: keepCase(span, to), original: span, kind });
    };
    if (c.start < 0 || c.end > original.length || c.start > c.end) reject('posição inválida');
    else if (from === to) reject('sem mudança');
    else if (!from.trim()) reject('acréscimo de texto');
    else if (!to.trim()) reject('remoção de texto');
    else if (AI_ALLOWED_PAIRS.has(`${from}>${to}`)) accept('par');
    else if (/\s/.test(from) || /\s/.test(to)) reject('troca de mais de uma palavra');
    else if (/\p{N}/u.test(from + to)) reject('número, data ou código');
    else if (ignorable(span, c.start, original)) reject('sigla, nome, código ou termo protegido');
    else if (strip(from) === strip(to)) {
      if (known(to) >= L.minZipfAccent || PROOFREAD_DOMAIN_TERMS.has(to)) accept('acento');
      else reject('palavra desconhecida');
    } else {
      const shortest = Math.min(from.length, to.length);
      const sameRoot = prefixLength(strip(from), strip(to)) >= Math.max(L.minPrefix, shortest - L.maxEndingChange);
      if (!sameRoot) reject('troca de palavra');
      else if (known(to) >= L.minZipfInflection || PROOFREAD_DOMAIN_TERMS.has(to)) accept('flexao');
      else reject('palavra desconhecida');
    }
  }
  return { accepted, rejected };
}

// ---------- Trava de fatos para reescritas ----------

export type FactProblemKind =
  | 'fato_novo'
  | 'fato_removido'
  | 'compromisso'
  | 'aprovacao'
  | 'solucao_afirmada'
  | 'negacao'
  | 'perguntas';

export interface FactProblem {
  kind: FactProblemKind;
  detail: string;
}

// Limites de palavra com Unicode: \b só conhece letras ASCII e falharia em "não" ou "está".
const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const word = (body: string): RegExp => new RegExp(`${B}(?:${body})${E}`, 'giu');
const NUMBERISH = /[\p{L}\p{N}]*\p{N}[\p{L}\p{N}ºª]*(?:[.,:/-][\p{L}\p{N}ºª]+)*/gu;
const LINKS = /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\\\\[^\s]+/gi;
const ACRONYM = new RegExp(`${B}[A-ZÀ-Ú]{2,}\\d*${E}`, 'gu');
const COMMITMENT = word('vamos|iremos|garant\\p{L}*|prometemos|prometo|com certeza|sem falta|imediatamente|\\p{L}+(?:aremos|eremos|iremos)');
const APPROVAL = word('concordamos|concordo|aprovamos|aprovo|autorizamos|autorizo|(?:está|foi|estão|foram) (?:aprovad|autorizad|liberad)\\p{L}*');
const SOLVED = word('(?:está|estão|foi|foram|ficou|ficaram) (?:resolvid|solucionad|concluíd|normalizad|corrigid)\\p{L}*');
const NEGATION = word('não|nunca|nenhum|nenhuma|nada');

const lower = (s: string): string => s.toLocaleLowerCase('pt-BR');
const all = (re: RegExp, text: string): string[] => [...text.matchAll(re)].map((m) => lower(m[0]));
const count = (re: RegExp, text: string): number => [...text.matchAll(re)].length;

/** "foi resolvida" dentro de uma pergunta ("confirmar se a situação foi resolvida") não é afirmação. */
function solvedClaims(text: string): number {
  return [...text.matchAll(SOLVED)].filter((m) => !/\bse\s+(?:\p{L}+\s+){0,3}$/iu.test(text.slice(Math.max(0, m.index - 40), m.index))).length;
}

/** Nomes próprios: palavra com inicial maiúscula fora do começo de frase, que não seja sigla. */
function names(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\p{Lu}[\p{Ll}]+/gu)) {
    const before = text.slice(0, m.index);
    if (!before.trim() || /[.!?:;\n]\s*$/.test(before) || /["“(]\s*$/.test(before)) continue;
    out.push(lower(m[0]));
  }
  return out;
}

/**
 * Compara o texto de origem (gerado pelo motor, só o corpo) com uma reescrita. Lista vazia quer dizer que a reescrita
 * pode ser mostrada ao analista como alternativa; qualquer problema faz a reescrita ser descartada.
 */
export function checkFacts(source: string, rewritten: string): FactProblem[] {
  const problems: FactProblem[] = [];
  const srcLower = lower(source);
  const newLower = lower(rewritten);
  const facts = (text: string): string[] => [...all(NUMBERISH, text), ...all(LINKS, text), ...[...text.matchAll(ACRONYM)].map((m) => lower(m[0]))];
  const srcFacts = new Set(facts(source));
  const newFacts = new Set(facts(rewritten));
  for (const f of newFacts) if (!srcFacts.has(f)) problems.push({ kind: 'fato_novo', detail: f });
  for (const f of srcFacts) if (!newFacts.has(f)) problems.push({ kind: 'fato_removido', detail: f });
  for (const n of new Set(names(rewritten))) if (!srcLower.includes(n)) problems.push({ kind: 'fato_novo', detail: n });
  for (const n of new Set(names(source))) if (!newLower.includes(n)) problems.push({ kind: 'fato_removido', detail: n });

  const cs = count(COMMITMENT, source);
  const cr = count(COMMITMENT, rewritten);
  if (cr !== cs) problems.push({ kind: 'compromisso', detail: cr > cs ? 'compromisso novo' : 'compromisso retirado' });
  if (count(APPROVAL, rewritten) > count(APPROVAL, source)) problems.push({ kind: 'aprovacao', detail: 'aprovação ou concordância afirmada' });
  if (solvedClaims(rewritten) > solvedClaims(source)) problems.push({ kind: 'solucao_afirmada', detail: 'solução afirmada sem estar no texto' });
  if (count(NEGATION, rewritten) !== count(NEGATION, source)) problems.push({ kind: 'negacao', detail: 'negação acrescentada ou retirada' });
  const qs = (source.match(/\?/g) ?? []).length;
  const qr = (rewritten.match(/\?/g) ?? []).length;
  if (qs !== qr) problems.push({ kind: 'perguntas', detail: `perguntas: ${qs} no original, ${qr} na reescrita` });
  return problems;
}
