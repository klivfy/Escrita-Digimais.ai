/**
 * Limites da trava de correção do modelo de IA (domain/ai-guard.ts). Portados de scripts/estudo-correcao/trava_gec.py,
 * medidos com a saída gravada do Phi-4-mini (scripts/estudo-ia-aprendizado/saida-phi4mini.json).
 * Mexeu? Rode src/tests/ai-guard.test.ts e atualize docs/ESTUDO-IA-APRENDIZADO.md.
 */
export const AI_GUARD_LIMITS = {
  /** Troca só de acento: a palavra nova precisa existir na lista, mesmo que rara. */
  minZipfAccent: 1.5,
  /** Troca de terminação (flexão): a palavra nova precisa ser comum. */
  minZipfInflection: 3.0,
  /** Radical comum mínimo, e no máximo quantas letras do fim podem mudar. */
  minPrefix: 3,
  maxEndingChange: 3,
  /** Textos maiores que isso não são alinhados (o alinhamento é quadrático). */
  maxWords: 800,
} as const;

/** Trocas fechadas entre palavras parecidas, no formato "de>para" (minúsculas). Só estas trocas de palavra passam. */
export const AI_ALLOWED_PAIRS: ReadonlySet<string> = new Set([
  'mais>mas', 'a>há', 'a>à', 'à>a', 'porque>porquê', 'ouve>houve', 'houveram>houve', 'fazem>faz', 'existe>existem',
  'esta>está', 'ate>até', 'so>só', 'a baixo>abaixo',
]);
