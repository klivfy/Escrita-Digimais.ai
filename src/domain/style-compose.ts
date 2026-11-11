/**
 * Montar um texto com o jeito da equipe: escolhe, entre os trechos ensinados do tipo, a abertura, o pedido e o fecho
 * mais parecidos com o que o analista descreveu, e junta com a saudação e a assinatura do perfil. Só monta; o
 * analista vê de onde veio cada parte e edita antes de copiar. Pura e determinística.
 */
import type { LibraryModel } from '../config/library-schema';
import type { Block, BlockRole, Ledger } from '../config/learning-ledger';
import { MIN_BLOCK_USES, redactionProblems } from './block-vetting';
import { buildSearchIndex, fillModel, searchModels } from './library-search';
import type { FieldValues } from './library-search';
import { greetingFor } from './planner';
import type { CommunicationType, Formality, LanguageProfile, Recipient } from './types';

export interface CompositionPart {
  role: 'greeting' | 'opening' | 'request' | 'closing' | 'signature';
  text: string;
  origin: 'ensinado' | 'perfil';
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
  /** Aceita só trechos que ainda passam nas regras em vigor. */
  usable?: (block: Block) => boolean;
  variant?: number;
}

function rank(blocks: Block[], type: CommunicationType, query: string): Block[] {
  if (blocks.length <= 1 || !query.trim()) return [...blocks].sort((a, b) => b.count - a.count);
  const models: LibraryModel[] = blocks.map((b, i) => ({ id: `b${i}`, title: '', types: [type], recipients: [], text: b.text, keywords: [], reviewedAt: '' }));
  const scores = new Map(searchModels(buildSearchIndex(models), query, { anyType: true, limit: models.length, minScore: 0 }).map((h) => [h.model.id, h.score]));
  return blocks
    .map((b, i) => ({ b, score: scores.get(`b${i}`) ?? 0 }))
    .sort((x, y) => y.score - x.score || y.b.count - x.b.count)
    .map((x) => x.b);
}

export function composeFromBlocks(input: ComposeInput): Composition | null {
  const { ledger, type, recipient, formality, profile, query, values } = input;
  const variant = Math.max(0, Math.trunc(input.variant ?? 0));
  // Defesa em profundidade: mesmo sem o filtro da triagem, trecho de uma ocorrência ou com fato de chamado não entra.
  const all = (ledger.byType[type]?.blocks ?? []).filter(
    (b) => b.count >= MIN_BLOCK_USES && redactionProblems(b.text, profile).length === 0 && (input.usable?.(b) ?? true),
  );
  const pick = (role: BlockRole): { block: Block; size: number } | undefined => {
    const ranked = rank(all.filter((b) => b.role === role), type, query);
    return ranked.length > 0 ? { block: ranked[variant % ranked.length], size: ranked.length } : undefined;
  };
  const opening = pick('opening');
  const request = pick('request');
  const closing = pick('closing');
  if (!opening && !request) return null;

  const parts: CompositionPart[] = [{ role: 'greeting', text: greetingFor(profile, formality, recipient, values.nome), origin: 'perfil' }];
  if (opening) parts.push({ role: 'opening', text: fillModel(opening.block.text, values), origin: 'ensinado', count: opening.block.count });
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
