import { DEFAULT_LABELS, NATURAL_EXPECTED_ACTION, NATURAL_LEADS } from '../../config/templates';
import { PAST_FIRST_PERSON } from '../../config/voice-lists';
import { stripAccents, words } from '../../domain/text-utils';
import type { CommunicationType, GenerationSettings, LanguageProfile, TicketContext } from '../../domain/types';

/**
 * Medidas de naturalidade. São aproximações mecânicas, não substituem a leitura de quem escreve chamados:
 * contam o que denuncia o formulário (rótulos secos, terceira pessoa para o próprio usuário, primeira pessoa do
 * singular) e comparam o vocabulário com o texto que uma pessoa escreveria (F1 de palavras).
 */
export interface GoldCase {
  id: string;
  /** Fictício. Casos reais ficam fora do repositório (ver docs/AVALIACAO-NATURALIDADE.md). */
  type: CommunicationType;
  settings: Partial<GenerationSettings>;
  context: TicketContext;
  /** Texto como um analista experiente escreveria à mão para o mesmo chamado. */
  human: string;
  profile?: Partial<LanguageProfile>;
}

const norm = (s: string): string => stripAccents(s.toLocaleLowerCase('pt-BR'));

const allLabels = (): string[] => {
  const out = new Set<string>();
  for (const level of Object.values(DEFAULT_LABELS)) for (const v of Object.values(level)) out.add(v);
  for (const pool of Object.values(NATURAL_LEADS)) for (const v of pool ?? []) out.add(v);
  for (const pool of Object.values(NATURAL_EXPECTED_ACTION)) for (const v of pool) out.add(v);
  return [...out].sort((a, b) => b.length - a.length);
};

export interface Naturalness {
  /** Quantos rótulos "Algo: valor" aparecem no texto. */
  labels: number;
  /** Referências ao usuário em terceira pessoa ("o usuário", "dele"). Só conta quando o destinatário é o usuário. */
  thirdPersonUser: number;
  /** Verbos do analista na primeira pessoa do singular ("resetei"). */
  firstPersonSingular: number;
  /** Palavras por frase, em média. */
  wordsPerSentence: number;
  /** F1 de palavras contra o texto humano, de 0 a 1. */
  f1: number;
  /** Palavras do texto gerado dividido pelas do texto humano. */
  lengthRatio: number;
}

export function measure(text: string, human: string, recipientIsUser: boolean): Naturalness {
  const lower = norm(text);
  let labels = 0;
  for (const label of allLabels()) {
    const re = new RegExp(`(?:^|\\n|\\. )${norm(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g');
    labels += (lower.match(re) ?? []).length;
  }
  const thirdPersonUser = recipientIsUser ? (lower.match(/\b(?:o|a|os|as) usuari[oa]s?\b|\bdele\b|\bdela\b/g) ?? []).length : 0;
  const singular = Object.keys(PAST_FIRST_PERSON).map(norm);
  const firstPersonSingular = words(lower).filter((w) => singular.includes(w)).length;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u).map((s) => s.trim()).filter((s) => words(s).length > 1);
  const wordsPerSentence = sentences.length ? Math.round((words(text).length / sentences.length) * 10) / 10 : 0;

  const a = words(lower);
  const b = words(norm(human));
  const bag = new Map<string, number>();
  for (const w of b) bag.set(w, (bag.get(w) ?? 0) + 1);
  let overlap = 0;
  for (const w of a) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      overlap += 1;
      bag.set(w, n - 1);
    }
  }
  const precision = a.length ? overlap / a.length : 0;
  const recall = b.length ? overlap / b.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    labels,
    thirdPersonUser,
    firstPersonSingular,
    wordsPerSentence,
    f1: Math.round(f1 * 1000) / 1000,
    lengthRatio: b.length ? Math.round((a.length / b.length) * 100) / 100 : 0,
  };
}
