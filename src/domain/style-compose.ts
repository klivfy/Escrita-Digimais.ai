/**
 * Montar um texto com o jeito da equipe: escolhe, entre os trechos ensinados do tipo, a abertura, o pedido e o fecho
 * mais parecidos com o que o analista descreveu, e junta com a saudação e a assinatura do perfil. Só monta; o
 * analista vê de onde veio cada parte e edita antes de copiar. Pura e determinística.
 */
import type { LibraryModel } from '../config/library-schema';
import type { Block, BlockRole, Ledger } from '../config/learning-ledger';
import { DEFAULT_OPENINGS } from '../config/templates';
import { MIN_BLOCK_USES, redactionProblems } from './block-vetting';
import { buildSearchIndex, fillModel, searchModels } from './library-search';
import type { FieldValues } from './library-search';
import { greetingFor } from './planner';
import type { CommunicationType, Formality, LanguageProfile, Recipient } from './types';

export interface CompositionPart {
  role: 'greeting' | 'opening' | 'informed' | 'request' | 'closing' | 'signature';
  text: string;
  /** "formulario" é o que o analista digitou, sem alteração; "perfil" é redação padrão do tipo. */
  origin: 'ensinado' | 'perfil' | 'formulario';
  /** Em quantos textos ensinados o trecho apareceu (só para origem "ensinado"). */
  count?: number;
}

export interface Composition {
  text: string;
  parts: CompositionPart[];
  /** Quantas combinações diferentes existem para este tipo (para "outra combinação"). */
  options: number;
}

export interface ComposeInput {
  ledger: Ledger;
  type: CommunicationType;
  recipient: Recipient;
  formality: Formality;
  profile: LanguageProfile;
  /** O que o analista já descreveu no formulário; vazio escolhe o trecho mais frequente. */
  query: string;
  values: FieldValues;
  /** Frases que o analista digitou no formulário (pergunta, pendência, ação esperada). Entram como estão, sem reescrita. */
  typed?: string[];
  /** Aceita só trechos que ainda passam nas regras em vigor. */
  usable?: (block: Block) => boolean;
  variant?: number;
}

/**
 * Pontuação mínima para um trecho valer como "do mesmo assunto". Medida com trechos de impressora, notebook e acesso:
 * do mesmo assunto de 0,27 a 0,58; de outro assunto até 0,23. Na dúvida fica abaixo: entra a abertura padrão do tipo.
 */
export const COMPOSE_MIN_SCORE = 0.25;

/** Pontua todos os trechos do tipo juntos (a raridade das palavras só faz sentido com o conjunto inteiro). */
function scoreAll(blocks: Block[], type: CommunicationType, query: string): Map<Block, number> {
  const scores = new Map<Block, number>();
  if (blocks.length === 0 || !query.trim()) return scores;
  const models: LibraryModel[] = blocks.map((b, i) => ({ id: `b${i}`, title: '', types: [type], recipients: [], text: b.text, keywords: [], reviewedAt: '' }));
  const byId = new Map(searchModels(buildSearchIndex(models), query, { anyType: true, limit: models.length, minScore: 0 }).map((h) => [h.model.id, h.score]));
  blocks.forEach((b, i) => scores.set(b, byId.get(`b${i}`) ?? 0));
  return scores;
}

/** Com descrição, só entram trechos do mesmo assunto (`COMPOSE_MIN_SCORE`); sem descrição, vale a frequência. */
function rank(blocks: Block[], scores: Map<Block, number> | null): Block[] {
  if (!scores) return [...blocks].sort((a, b) => b.count - a.count);
  return blocks
    .filter((b) => (scores.get(b) ?? 0) >= COMPOSE_MIN_SCORE)
    .sort((x, y) => (scores.get(y) ?? 0) - (scores.get(x) ?? 0) || y.count - x.count);
}

/** Abertura padrão do tipo (perfil ou produto), só se não pedir campo que a montagem não conhece. */
function defaultOpening(type: CommunicationType, formality: Formality, profile: LanguageProfile, values: FieldValues): string | undefined {
  const pool = profile.templates.openings?.[type]?.[formality] ?? DEFAULT_OPENINGS[type][formality];
  const text = (pool[0] ?? '').replace(/\{organization\}/g, profile.organizationName).replace(/\{destination\}/g, values.equipe ?? '');
  return text && !/\{[^}]*\}/.test(text) ? text : undefined;
}

export function composeFromBlocks(input: ComposeInput): Composition | null {
  const { ledger, type, recipient, formality, profile, query, values } = input;
  const variant = Math.max(0, Math.trunc(input.variant ?? 0));
  // Defesa em profundidade: mesmo sem o filtro da triagem, trecho de uma ocorrência ou com fato de chamado não entra.
  const all = (ledger.byType[type]?.blocks ?? []).filter(
    (b) => b.count >= MIN_BLOCK_USES && redactionProblems(b.text, profile).length === 0 && (input.usable?.(b) ?? true),
  );
  const scores = scoreAll(all, type, query);
  const pick = (role: BlockRole): { block: Block; size: number } | undefined => {
    // O fecho é cortesia, não assunto: vale a frequência. Abertura e pedido só entram se combinarem com o que foi descrito.
    const ranked = rank(all.filter((b) => b.role === role), role === 'closing' || !query.trim() ? null : scores);
    return ranked.length > 0 ? { block: ranked[variant % ranked.length], size: ranked.length } : undefined;
  };
  const opening = pick('opening');
  const request = pick('request');
  const closing = pick('closing');
  // Só monta quando há ao menos um trecho ensinado que combina com o assunto; do contrário não há "jeito da equipe" a mostrar.
  if (!opening && !request && !closing) return null;

  const typed = (input.typed ?? []).map((t) => t.trim()).filter(Boolean);
  const parts: CompositionPart[] = [{ role: 'greeting', text: greetingFor(profile, formality, recipient, values.nome), origin: 'perfil' }];
  if (opening) {
    parts.push({ role: 'opening', text: fillModel(opening.block.text, values), origin: 'ensinado', count: opening.block.count });
  } else {
    const standard = defaultOpening(type, formality, profile, values);
    if (standard) parts.push({ role: 'opening', text: standard, origin: 'perfil' });
  }
  for (const t of typed) parts.push({ role: 'informed', text: t, origin: 'formulario' });
  if (request) parts.push({ role: 'request', text: fillModel(request.block.text, values), origin: 'ensinado', count: request.block.count });
  parts.push(
    closing
      ? { role: 'closing', text: fillModel(closing.block.text, values), origin: 'ensinado', count: closing.block.count }
      : { role: 'closing', text: profile.closings[formality][0] ?? '', origin: 'perfil' },
  );
  parts.push({ role: 'signature', text: profile.signature, origin: 'perfil' });

  const body = parts.filter((p) => p.role !== 'closing' && p.role !== 'signature' && p.text).map((p) => p.text);
  const tail = parts.filter((p) => (p.role === 'closing' || p.role === 'signature') && p.text).map((p) => p.text);
  return {
    text: `${body.join('\n\n')}\n\n${tail.join('\n')}`.trim(),
    parts: parts.filter((p) => p.text),
    options: Math.max(opening?.size ?? 1, request?.size ?? 1, closing?.size ?? 1),
  };
}
