import { fieldLabel } from '../config/fields';
import { pendingFields, strayBraces } from './library-search';
import { detectProfileIssues, detectTextRisks } from './risks';
import type { ReviewContext } from './risks';
import { dedupeWarnings, scoreQuality, sortWarnings } from './quality';
import { CATEGORY_LABELS, scanText } from './sensitive';
import type { LanguageProfile, QualityScore, SensitiveFinding, Warning } from './types';

export function findingsToWarnings(findings: SensitiveFinding[], type?: ReviewContext['type']): Warning[] {
  return findings.map((f) => {
    const where = f.field ? ` em "${fieldLabel(f.field, type)}"` : '';
    return {
      code: `sensitive_${f.category}`,
      severity: f.blocking ? ('block' as const) : ('warning' as const),
      message: `${CATEGORY_LABELS[f.category]}${where}. ${f.reason}`,
      suggestion: f.action,
      field: f.field,
      excerpt: f.maskedExcerpt,
      dimension: 'safety' as const,
      penalty: f.blocking ? 30 : 12,
    };
  });
}

/** Campos entre chaves que sobraram no texto (modelo da biblioteca não preenchido). Os da lista fechada bloqueiam a cópia. */
export function detectUnfilledFields(text: string): Warning[] {
  const warnings: Warning[] = [];
  const pending = pendingFields(text);
  if (pending.length > 0) {
    const list = pending.map((p) => `{${p}}`).join(', ');
    warnings.push({
      code: 'unfilled_field',
      severity: 'block',
      message: `Faltam campos entre chaves: ${list}. Preencha no texto da prévia para poder copiar.`,
      suggestion: 'Troque cada campo pelo valor real do chamado.',
      excerpt: list,
      trigger: list,
      dimension: 'completeness',
      penalty: 20,
    });
  }
  const stray = strayBraces(text);
  if (stray.length > 0) {
    const list = stray.join(', ');
    warnings.push({
      code: 'stray_braces',
      severity: 'warning',
      message: `Há trecho entre chaves que parece campo não preenchido: ${list}.`,
      suggestion: 'Confira se é um campo esquecido e troque pelo valor real, ou remova as chaves.',
      excerpt: list,
      dimension: 'completeness',
      penalty: 10,
    });
  }
  return warnings;
}

export interface ReviewOptions {
  /** Evita rever dados sensíveis já tratados na entrada (usado na geração). */
  skipSensitive?: boolean;
}

export interface ReviewResult {
  warnings: Warning[];
  quality: QualityScore;
  findings: SensitiveFinding[];
  blocked: boolean;
}

/**
 * Revisão automática de um texto (gerado ou editado pelo analista).
 * Nunca altera o texto; apenas retorna alertas, sugestões e pontuação.
 */
export function reviewText(
  text: string,
  ctx: ReviewContext,
  profile: LanguageProfile,
  options: ReviewOptions = {},
): ReviewResult {
  const findings = options.skipSensitive ? [] : scanText(text, { internalDomains: profile.internalDomains });
  const warnings = sortWarnings(
    dedupeWarnings([
      ...findingsToWarnings(findings, ctx.type),
      ...detectTextRisks(text, ctx, profile),
      ...detectProfileIssues(text, ctx, profile),
      ...detectUnfilledFields(text),
    ]),
  );
  return {
    warnings,
    quality: scoreQuality(warnings),
    findings,
    blocked: warnings.some((w) => w.severity === 'block'),
  };
}
