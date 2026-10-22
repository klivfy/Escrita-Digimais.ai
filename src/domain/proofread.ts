/**
 * Correção de texto por camadas. Pura: recebe a lista já carregada e devolve sugestões. Nunca altera o texto sozinha.
 * Camada 1, ortografia por lista de frequência, com duas regras:
 *  - acento: a palavra digitada tem uma variante só com acento muito mais frequente ("nao" para "não");
 *  - grafia: a palavra é rara e existe uma palavra comum a uma edição de distância ("licensa" para "licença").
 * Camada 2 (domain/agreement.ts): concordância, crase e palavras parecidas, por regras fechadas.
 * Não corrige gramática em geral, e deixa passar muita coisa: sugestão ausente não quer dizer texto correto.
 */
import { PROOFREAD_DOMAIN_TERMS, PROOFREAD_LIMITS } from '../config/proofread/rules';
import { checkAgreement } from './agreement';
import { FUTURE_FIRST_PERSON, PARTICIPLE_OPENERS, PAST_FIRST_PERSON, POSSESSIVES } from '../config/voice-lists';

export const PROOFREAD_RULES = ['acento', 'grafia', 'concordancia', 'crase', 'uso'] as const;
export type ProofreadRule = (typeof PROOFREAD_RULES)[number];

/** Regras de ortografia (camada 1): trocas de baixo risco, que "Aceitar acentos e grafia" aplica de uma vez. */
export const SPELLING_RULES: ReadonlySet<ProofreadRule> = new Set<ProofreadRule>(['acento', 'grafia']);

export interface ProofreadSuggestion {
  /** Posição do trecho no texto original (índices UTF-16, fim exclusivo). */
  start: number;
  end: number;
  original: string;
  replacement: string;
  rule: ProofreadRule;
  /** Por que a troca é sugerida, em uma frase. */
  reason: string;
}

export interface FreqIndex {
  /** zipf de cada palavra da lista (minúscula, só letras). */
  zipf: ReadonlyMap<string, number>;
  /** Palavras da lista agrupadas pela forma sem acento. */
  byStripped: ReadonlyMap<string, readonly string[]>;
}

export const strip = (s: string): string => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

/** Palavras que o próprio produto escreve e que são corretas, mesmo quando raras na lista geral. */
const PRODUCT_WORDS: ReadonlySet<string> = new Set(
  [PAST_FIRST_PERSON, PARTICIPLE_OPENERS, FUTURE_FIRST_PERSON, POSSESSIVES].flatMap((t) => [...Object.keys(t), ...Object.values(t)]).map((w) => w.toLocaleLowerCase('pt-BR')),
);

/** Monta o índice a partir dos grupos "<zipf x 100> palavra palavra ..." (formato de freq-pt.json). */
export function buildFreqIndex(groups: readonly string[]): FreqIndex {
  const zipf = new Map<string, number>();
  const byStripped = new Map<string, string[]>();
  for (const line of groups) {
    const [centi, ...words] = line.split(' ');
    const z = Number(centi) / 100;
    for (const w of words) {
      zipf.set(w, z);
      const s = strip(w);
      const list = byStripped.get(s);
      if (list) list.push(w);
      else byStripped.set(s, [w]);
    }
  }
  return { zipf, byStripped };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Formas sem acento a uma edição (troca, remoção, inserção ou letras trocadas de lugar) de `s`, incluindo `s`. */
function withinOneEdit(s: string): Set<string> {
  const out = new Set<string>([s]);
  for (let i = 0; i <= s.length; i++) {
    if (i < s.length) out.add(s.slice(0, i) + s.slice(i + 1));
    if (i < s.length - 1) out.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
    for (const c of LETTERS) {
      out.add(s.slice(0, i) + c + s.slice(i));
      if (i < s.length) out.add(s.slice(0, i) + c + s.slice(i + 1));
    }
  }
  return out;
}

function candidates(lower: string, index: FreqIndex): string[] {
  const found: string[] = [];
  for (const form of withinOneEdit(strip(lower))) {
    const words = index.byStripped.get(form);
    if (words) for (const w of words) if (w !== lower) found.push(w);
  }
  return found;
}

const WORD = /\p{L}[\p{L}\p{N}_'’-]*/gu;

/** Siglas, códigos, nomes próprios no meio da frase, caminhos e termos de TI não são verificados. */
export function ignorable(word: string, start: number, text: string): boolean {
  if (/\p{Nd}/u.test(word)) return true;
  if (text[start + word.length] === '@') return true;
  if (/^[A-ZÀ-Ú]{2,}$/.test(word)) return true;
  if (/[a-zà-ú][A-ZÀ-Ú]/.test(word)) return true;
  if (word.includes('-') && /[A-ZÀ-Ú]/.test(word)) return true;
  if (/^\p{Lu}/u.test(word) && start > 0) {
    const before = text.slice(0, start);
    if (!/[.!?:]\s*$/.test(before) && !before.endsWith('\n')) return true;
  }
  if (/[\\/:@]/.test(text.slice(Math.max(0, start - 3), start))) return true;
  const lower = word.toLocaleLowerCase('pt-BR');
  return PROOFREAD_DOMAIN_TERMS.has(lower) || PRODUCT_WORDS.has(lower);
}

function best(options: string[], zipf: ReadonlyMap<string, number>): string {
  return options.reduce((a, b) => {
    const za = zipf.get(a) ?? 0;
    const zb = zipf.get(b) ?? 0;
    return zb > za || (zb === za && b < a) ? b : a;
  });
}

export function keepCase(original: string, replacement: string): string {
  return /^\p{Lu}/u.test(original) ? replacement.charAt(0).toLocaleUpperCase('pt-BR') + replacement.slice(1) : replacement;
}

export interface ProofreadOptions {
  /** Palavras (minúsculas) que o analista pediu para ignorar nesta sessão. */
  ignore?: ReadonlySet<string>;
}

/** Sugestões de correção de acento e grafia, em ordem de posição. O texto de entrada nunca é alterado. */
export function proofread(text: string, index: FreqIndex, options: ProofreadOptions = {}): ProofreadSuggestion[] {
  const L = PROOFREAD_LIMITS;
  const out: ProofreadSuggestion[] = [];
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    const start = m.index;
    const lower = word.toLocaleLowerCase('pt-BR');
    if (options.ignore?.has(lower)) continue;
    if (ignorable(word, start, text)) continue;
    if (start > 0 && /\p{Nd}/u.test(text[start - 1])) continue;
    const known = index.zipf.get(lower) ?? 0;
    const near = candidates(lower, index);
    const stripped = strip(lower);
    const accent = near.filter((c) => strip(c) === stripped && (index.zipf.get(c) ?? 0) >= L.minZipfA && (index.zipf.get(c) ?? 0) >= known + L.deltaA);
    let rule: ProofreadRule | null = null;
    let pick = '';
    if (accent.length) {
      rule = 'acento';
      pick = best(accent, index.zipf);
    } else if (lower.length >= L.minLenB && known <= L.maxZipfB) {
      // A primeira letra quase nunca é a errada; exigir a mesma evita transformar logins ("jsilva") em nomes ("silva").
      const spelling = near.filter(
        (c) => strip(c)[0] === stripped[0] && (index.zipf.get(c) ?? 0) >= L.minZipfB && (index.zipf.get(c) ?? 0) >= known + L.deltaB,
      );
      if (spelling.length) {
        rule = 'grafia';
        pick = best(spelling, index.zipf);
      }
    }
    if (rule) {
      const reason = rule === 'acento' ? 'Falta acento: a forma com acento é muito mais comum.' : 'Grafia provável: existe uma palavra comum parecida.';
      out.push({ start, end: start + word.length, original: word, replacement: keepCase(word, pick), rule, reason });
    }
  }
  return out;
}

/** Aplica uma sugestão ao texto. Só deve ser chamada por ação explícita do analista. */
export function applySuggestion(text: string, s: ProofreadSuggestion): string {
  return text.slice(0, s.start) + s.replacement + text.slice(s.end);
}

/** Aplica várias sugestões (de trás para a frente, para não deslocar as posições). */
export function applySuggestions(text: string, list: readonly ProofreadSuggestion[]): string {
  return [...list].sort((a, b) => b.start - a.start).reduce((acc, s) => applySuggestion(acc, s), text);
}

/**
 * Camadas 1 e 2 juntas, em ordem de posição. Quando duas sugestões se tocam, vale a de ortografia (a de regra é descartada).
 * Palavras ignoradas valem para as duas camadas.
 */
export function proofreadAll(text: string, index: FreqIndex, options: ProofreadOptions = {}): ProofreadSuggestion[] {
  const spelling = proofread(text, index, options);
  const rules = checkAgreement(text).filter(
    (r) => !options.ignore?.has(r.original.toLocaleLowerCase('pt-BR')) && !spelling.some((s) => r.start < s.end && s.start < r.end),
  );
  return [...spelling, ...rules].sort((a, b) => a.start - b.start || a.end - b.end);
}
