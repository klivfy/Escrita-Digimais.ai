/**
 * Triagem da biblioteca de modelos antes de ser aceita. Um modelo que a própria extensão não deixaria o analista
 * escrever também não entra na biblioteca. Pura e determinística: usa o detector de dado sensível e as regras de revisão.
 *
 * Recusa (a biblioteca inteira não é importada):
 *  - qualquer dado sensível no texto (e-mail, telefone, documento, credencial, IP, caminho e demais categorias);
 *  - alertas de bloqueio, prazo concreto sem campo {prazo}, solução afirmada, ameaça de encerramento, urgência sem
 *    motivo, pedido de dado pessoal, termo proibido pelo perfil, emoji, pontuação exagerada e caixa alta de ênfase.
 * Os demais alertas (por exemplo parágrafo longo, termo preferido, sigla sem explicação) viram avisos para o curador.
 */
import type { LibraryModel, ModelLibrary } from '../config/library-schema';
import type { MODEL_PLACEHOLDERS } from '../config/library-schema';
import { CATEGORY_LABELS, scanText } from './sensitive';
import { reviewText } from './review';
import type { ReviewContext } from './risks';
import type { LanguageProfile } from './types';

/** Alertas da revisão que impedem um modelo de entrar na biblioteca. */
export const REJECTING_CODES: ReadonlySet<string> = new Set([
  'unsupported_deadline', 'resolution_claim', 'silence_as_solution', 'closure_threat', 'unjustified_urgency',
  'ask_credentials', 'ask_personal_data', 'forbidden_term', 'emoji', 'excessive_punctuation', 'all_caps_emphasis',
]);

/**
 * Alertas que não fazem sentido para um trecho de texto: o motor acrescenta saudação, fecho, textos obrigatórios e
 * o resto da mensagem. Ficam de fora da triagem para não encher a lista de avisos.
 */
const FRAGMENT_CODES: ReadonlySet<string> = new Set(['low_cordiality', 'required_text_missing']);

/** Como cada campo aparece quando o texto é examinado: uma expressão neutra, sem dado nenhum. */
const SAMPLE: Record<(typeof MODEL_PLACEHOLDERS)[number], string> = {
  nome: 'o usuário',
  chamado: 'este chamado',
  data: 'a data combinada',
  prazo: 'o prazo informado',
  equipe: 'a equipe responsável',
  sistema: 'o sistema',
  equipamento: 'o equipamento',
};

export function withSamples(text: string): string {
  return text.replace(/\{([a-z]+)\}/g, (whole, name: string) => (name in SAMPLE ? SAMPLE[name as keyof typeof SAMPLE] : whole));
}

export interface ModelProblem {
  id: string;
  title: string;
  reasons: string[];
}

export interface VettingResult {
  ok: boolean;
  /** Modelos recusados e por quê. Se houver algum, a biblioteca não é importada. */
  problems: ModelProblem[];
  /** Avisos que não impedem a importação, para o curador decidir. */
  notices: ModelProblem[];
}

function contextFor(model: LibraryModel, type: LibraryModel['types'][number], profile: LanguageProfile): ReviewContext {
  const recipient = model.recipients[0] ?? 'user';
  return {
    type,
    recipient,
    techLevel: profile.recipients[recipient].defaultTechLevel,
    // Modelo de encerramento de chamado solucionado só vale depois da confirmação, que o analista registra no chamado.
    userConfirmation: type === 'closure_resolved' ? 'yes' : 'unknown',
    hasEvidence: type === 'closure_resolved',
  };
}

export function vetModel(model: LibraryModel, profile: LanguageProfile): { reasons: string[]; notices: string[] } {
  const reasons: string[] = [];
  const notices: string[] = [];
  const text = withSamples(model.text);
  for (const finding of scanText(text, { internalDomains: profile.internalDomains })) {
    reasons.push(`dado sensível no texto (${CATEGORY_LABELS[finding.category]}): ${finding.maskedExcerpt}`);
  }
  for (const label of [model.title, ...model.keywords]) {
    for (const finding of scanText(label, { internalDomains: profile.internalDomains })) {
      reasons.push(`dado sensível no título ou nas palavras-chave (${CATEGORY_LABELS[finding.category]})`);
    }
  }
  const seen = new Set<string>();
  for (const type of model.types) {
    const result = reviewText(text, contextFor(model, type, profile), profile, { skipSensitive: true });
    for (const w of result.warnings) {
      const key = `${w.code}`;
      if (seen.has(key) || FRAGMENT_CODES.has(w.code)) continue;
      seen.add(key);
      const line = `${w.message}${w.excerpt ? ` Trecho: "${w.excerpt}"` : ''}`;
      if (w.severity === 'block' || REJECTING_CODES.has(w.code)) reasons.push(line);
      else notices.push(line);
    }
  }
  return { reasons, notices };
}

export function vetLibrary(library: ModelLibrary, profile: LanguageProfile): VettingResult {
  const problems: ModelProblem[] = [];
  const notices: ModelProblem[] = [];
  for (const model of library.models) {
    const r = vetModel(model, profile);
    if (r.reasons.length > 0) problems.push({ id: model.id, title: model.title, reasons: r.reasons });
    if (r.notices.length > 0) notices.push({ id: model.id, title: model.title, reasons: r.notices });
  }
  return { ok: problems.length === 0, problems, notices };
}
