/**
 * Aprender o estilo da organização a partir de textos reais colados pelo analista: saudação, fecho e assinatura.
 * Pura e determinística; só propõe. Cada item vem com a evidência ("em 4 de 5 textos") e o analista decide o que salvar.
 */
import {
  MAX_STYLE_CLOSING, MAX_STYLE_GREETING, MAX_STYLE_SIGNATURE, NAME_SLOT, sanitizeTaughtStyle,
} from '../config/taught-style';
import type { TaughtStyle } from '../config/taught-style';
import { CATEGORY_LABELS, scanText } from './sensitive';
import type { LanguageProfile } from './types';

export interface StyleItem {
  value: string;
  /** Em quantos textos aparece. */
  count: number;
}

export interface StyleProposal {
  texts: number;
  greeting?: StyleItem;
  closing?: StyleItem;
  signature?: StyleItem;
}

export const MIN_STYLE_TEXTS = 3;
export const MAX_STYLE_TEXTS = 20;
/** Separador entre textos colados: uma linha só com três hifens. */
export const TEXT_SEPARATOR = /^\s*-{3,}\s*$/m;

const HEAD = /^(Olá|Oi|Prezado\(a\)|Prezad[oa]s?|Caro|Cara|Bom dia|Boa tarde|Boa noite)(?=[\s,!:.]|$)/u;
/** Saudações em que o nome vem depois de vírgula ("Bom dia, Maria,"); nas demais, só espaço ("Prezado Maria,"). */
const COMMA_BEFORE_NAME = new Set(['Olá', 'Oi', 'Bom dia', 'Boa tarde', 'Boa noite']);
const COLLECTIVE = /^(equipe|time|pessoal|todos|senhor|senhora|sr\.?|sra\.?|gestor|gestora|colegas|prezados)\b/iu;

export function splitTexts(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .split(TEXT_SEPARATOR)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_STYLE_TEXTS);
}

/**
 * Saudação ensinada. Se o texto cumprimenta uma pessoa ("Bom dia, Maria!"), guarda "Bom dia, {nome}," para o motor usar o
 * nome informado; sem nome ("Prezados,"), guarda a linha como está. Saudação coletiva ("Olá, equipe,") fica inteira.
 */
export function greetingBase(firstLine: string): string | undefined {
  const l = firstLine.trim();
  if (!l || l.length > 60) return undefined;
  const m = HEAD.exec(l);
  if (!m) return undefined;
  const rest = l.slice(m[0].length).replace(/^[,\s]+/, '').replace(/[,!:.\s]+$/, '');
  if (!rest) return `${m[0]},`;
  const first = rest.split(/\s+/)[0] ?? '';
  if (COLLECTIVE.test(first)) return `${m[0]}, ${rest},`;
  return COMMA_BEFORE_NAME.has(m[0]) ? `${m[0]}, ${NAME_SLOT},` : `${m[0]} ${NAME_SLOT},`;
}

function top(values: (string | undefined)[], total: number): StyleItem | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: StyleItem | undefined;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  // Precisa se repetir em pelo menos 2 textos e em metade deles; o que aparece uma vez só é do chamado, não do estilo.
  return best && best.count >= 2 && best.count * 2 >= total ? best : undefined;
}

const linesOf = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean);

export function learnStyle(texts: readonly string[]): StyleProposal {
  const docs = texts.map(linesOf).filter((l) => l.length > 0);
  const n = docs.length;
  const proposal: StyleProposal = { texts: n };
  if (n < MIN_STYLE_TEXTS) return proposal;

  const greeting = top(docs.map((l) => greetingBase(l[0])), n);
  if (greeting) proposal.greeting = greeting;

  const signature = top(docs.map((l) => (l.length >= 2 && l[l.length - 1].length <= MAX_STYLE_SIGNATURE ? l[l.length - 1] : undefined)), n);
  if (signature) proposal.signature = signature;

  // Fecho: a linha logo antes da assinatura (ou a última, sem assinatura repetida).
  const closing = top(
    docs.map((l) => {
      const last = signature && l[l.length - 1] === signature.value ? l.length - 2 : l.length - 1;
      const cand = l[last];
      return last >= 1 && cand && cand.length <= MAX_STYLE_CLOSING && cand !== signature?.value ? cand : undefined;
    }),
    n,
  );
  if (closing) proposal.closing = closing;
  return proposal;
}

export interface StyleVetting {
  ok: boolean;
  reasons: string[];
}

/** O que será guardado também passa pela triagem: dado sensível, termo proibido pelo perfil e formato. */
export function vetStyle(style: Omit<TaughtStyle, 'version'>, profile: LanguageProfile): StyleVetting {
  const reasons: string[] = [];
  const lines: [string, string | undefined, number][] = [
    ['Saudação', style.greeting, MAX_STYLE_GREETING], ['Fecho', style.closing, MAX_STYLE_CLOSING], ['Assinatura', style.signature, MAX_STYLE_SIGNATURE],
  ];
  for (const [label, value, max] of lines) {
    if (!value) continue;
    if (value.length > max) reasons.push(`${label}: passa de ${max} caracteres.`);
    for (const f of scanText(value, { internalDomains: profile.internalDomains })) {
      reasons.push(`${label}: dado sensível (${CATEGORY_LABELS[f.category]}).`);
    }
    const lower = value.toLowerCase();
    for (const term of profile.forbiddenTerms) {
      if (term && lower.includes(term.toLowerCase())) reasons.push(`${label}: usa um termo proibido pela organização ("${term}").`);
    }
  }
  if (!sanitizeTaughtStyle({ version: 1, ...style })) reasons.push('O estilo não tem nenhum item válido para guardar (sem chaves, links ou quebras de linha).');
  return { ok: reasons.length === 0, reasons };
}
