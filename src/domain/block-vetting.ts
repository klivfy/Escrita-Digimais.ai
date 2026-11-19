/**
 * Triagem de fidelidade dos trechos aprendidos: um trecho só serve de redação reaproveitável se não carrega fato de um
 * chamado (nome de pessoa, sistema, equipamento, número, dia da semana, "hoje", "amanhã") e se apareceu em mais de um
 * texto. Pura e determinística. É a única definição disso: ingestão, treino, montagem e triagem única usam esta função.
 */
import type { Block } from '../config/learning-ledger';
import { vetModel } from './library-vetting';
import type { CommunicationType, LanguageProfile } from './types';

/** Em quantos textos um trecho precisa aparecer para ser usado. O que aparece uma vez só é do chamado, não do estilo. */
export const MIN_BLOCK_USES = 2;

const NOT_LETTER = '(?<![\\p{L}\\p{N}_])';
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}_])';
const word = (source: string): RegExp => new RegExp(`${NOT_LETTER}(?:${source})${NOT_LETTER_AFTER}`, 'iu');

const FIELD = /\{[a-z]+\}/g;
/** Siglas genéricas de processo que não identificam um chamado; as demais siglas são sistema ou equipe. */
const GENERIC_ACRONYMS = new Set(['TI', 'SLA']);
/** Expressões fixas da redação que começam com maiúscula no meio da frase (“De acordo”). */
const GENERIC_CAPITALIZED = new Set(['De']);

const WEEKDAY_FEIRA = word('(?:segunda|ter[çc]a|quarta|quinta|sexta)-feira');
const WEEKDAY_BARE = word('s[áa]bado|domingo');
const WEEKDAY_WITH_ARTICLE = new RegExp(`${NOT_LETTER}(?:na|nesta|nessa|desta|dessa|at[ée]|toda|pr[óo]xima)\\s+(?:segunda|ter[çc]a|quarta|quinta|sexta)${NOT_LETTER_AFTER}`, 'iu');
const RELATIVE_DAY = word('hoje|ontem|amanh[ãa]|anteontem');
const MONTH = word('janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro');

const withoutFields = (text: string): string => text.replace(FIELD, ' ');

/** Palavras com inicial maiúscula fora do começo de frase, e siglas: nome de pessoa, sistema, equipamento ou equipe. */
function properNouns(text: string, allowed: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_])\p{Lu}[\p{L}\p{N}'’-]*/gu)) {
    const token = m[0];
    if (allowed.has(token) || GENERIC_CAPITALIZED.has(token) || GENERIC_ACRONYMS.has(token)) continue;
    const before = text.slice(0, m.index).replace(/[\s"“”'‘’([]+$/u, '');
    const startsSentence = before === '' || /[.!?:\n]$/u.test(before);
    const isAcronym = token.length >= 2 && token === token.toUpperCase() && /\p{Lu}{2}/u.test(token);
    if (isAcronym || !startsSentence) found.push(token);
  }
  return found;
}

/**
 * Motivos pelos quais o texto carrega fato de chamado. Não depende de quantas vezes o trecho apareceu: serve para
 * recusar na ingestão (o nome nem chega a ser guardado) e para triar o que já estava guardado.
 */
export function redactionProblems(text: string, profile?: Pick<LanguageProfile, 'organizationName'>): string[] {
  const plain = withoutFields(text);
  const reasons: string[] = [];
  const allowed = new Set((profile?.organizationName ?? '').split(/\s+/u).filter(Boolean));
  const names = properNouns(plain, allowed);
  if (names.length > 0) reasons.push(`cita nome próprio, sigla ou sistema ("${names[0]}"), que é dado do chamado`);
  if (/\d/u.test(plain)) reasons.push('contém número, que é dado do chamado');
  if (WEEKDAY_FEIRA.test(plain) || WEEKDAY_BARE.test(plain) || WEEKDAY_WITH_ARTICLE.test(plain) || MONTH.test(plain)) {
    reasons.push('cita dia da semana ou mês, que é dado do chamado');
  }
  if (RELATIVE_DAY.test(plain)) reasons.push('usa "hoje", "ontem" ou "amanhã", que só vale para aquele chamado');
  return reasons;
}

export type BlockState =
  /** Pode ser usado na montagem e no treino. */
  | { state: 'ok' }
  /** Passa nas regras, mas ainda não apareceu em textos suficientes. Continua guardado. */
  | { state: 'waiting'; reasons: string[] }
  /** Não passa nas regras em vigor. Continua guardado, fora de uso, com o motivo. */
  | { state: 'out'; reasons: string[] };

const sentence = (text: string): string => (/[.!?]$/u.test(text.trim()) ? text.trim() : `${text.trim()}.`);

export function judgeBlock(block: Block, type: CommunicationType, profile: LanguageProfile): BlockState {
  const rules = [...redactionProblems(block.text, profile)];
  const pseudo = { id: 'bloco', title: 'Bloco', types: [type], recipients: [], text: block.text, keywords: [], reviewedAt: '' };
  rules.push(...vetModel(pseudo, profile).reasons);
  if (rules.length > 0) return { state: 'out', reasons: rules.slice(0, 2).map(sentence) };
  if (block.count < MIN_BLOCK_USES) {
    return { state: 'waiting', reasons: [`Visto em ${block.count} texto; precisa aparecer em pelo menos ${MIN_BLOCK_USES}.`] };
  }
  return { state: 'ok' };
}
