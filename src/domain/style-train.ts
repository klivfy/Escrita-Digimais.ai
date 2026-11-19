/**
 * Treino: consolida o registro acumulado em propostas de estilo (abertura e fecho por tipo, rótulos de seção), cada uma
 * com a evidência de quantos textos a sustentam. Só propõe; quem aprova é o analista. Pura e determinística.
 */
import { DEFAULT_LABELS, DEFAULT_OPENINGS, DEFAULT_TYPE_CLOSINGS } from '../config/templates';
import { matchLabelKey } from '../config/label-synonyms';
import { ledgerTexts } from '../config/learning-ledger';
import type { Ledger } from '../config/learning-ledger';
import { sanitizeTrainedStyle } from '../config/trained-style';
import type { TrainedStyle } from '../config/trained-style';
import { redactionProblems } from './block-vetting';
import { CATEGORY_LABELS, scanText } from './sensitive';
import { COMMUNICATION_TYPES } from './types';
import type { CommunicationType, LabelKey, LanguageProfile } from './types';

export const MIN_TYPE_TEXTS = 3;
export const MIN_LABEL_COUNT = 3;

export interface TrainingItem {
  /** Estável: "opening:<tipo>", "closing:<tipo>" ou "label:<rótulo>". */
  id: string;
  kind: 'opening' | 'closing' | 'label';
  type?: CommunicationType;
  labelKey?: LabelKey;
  /** Como o texto aparece na tela (com os campos da biblioteca). */
  text: string;
  /** Como o motor usa (campos do motor no lugar dos da biblioteca). */
  engineText: string;
  count: number;
  of: number;
  /** O que a extensão usa hoje no lugar. */
  replaces: string;
}

export interface TrainingProposal {
  items: TrainingItem[];
  /** Por que alguma coisa não virou proposta (poucos textos, campo que o motor não conhece...). */
  notes: string[];
  texts: number;
  /** Textos acumulados desde a última proposta. */
  newSinceLast: number;
}

/** {equipe} da biblioteca é {destination} no motor; qualquer outro campo não existe lá. */
export function toEngineText(text: string): string | undefined {
  const mapped = text.replace(/\{equipe\}/g, '{destination}');
  return /\{(?!destination\})[^}]*\}|[{}]/.test(mapped.replace(/\{destination\}/g, '')) ? undefined : mapped;
}

/** Linha de redação aprovada: sem dado sensível e sem termo proibido pelo perfil em vigor. */
export function vetLine(text: string, profile: LanguageProfile): string[] {
  const reasons: string[] = [];
  for (const f of scanText(text, { internalDomains: profile.internalDomains })) reasons.push(`dado sensível (${CATEGORY_LABELS[f.category]})`);
  const lower = text.toLowerCase();
  for (const term of profile.forbiddenTerms) if (term && lower.includes(term.toLowerCase())) reasons.push(`termo proibido pela organização ("${term}")`);
  return reasons;
}

const normalizeLabel = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function proposeTraining(ledger: Ledger, profile: LanguageProfile): TrainingProposal {
  const items: TrainingItem[] = [];
  const notes: string[] = [];
  const texts = ledgerTexts(ledger);

  for (const type of COMMUNICATION_TYPES) {
    const t = ledger.byType[type];
    if (!t) continue;
    if (t.texts < MIN_TYPE_TEXTS) {
      notes.push(`${type}: ${t.texts} texto(s); são necessários pelo menos ${MIN_TYPE_TEXTS}.`);
      continue;
    }
    for (const role of ['opening', 'closing'] as const) {
      // Trecho com fato de chamado (nome, sistema, número, dia) nunca vira estilo, mesmo que se repita.
      const candidates = t.blocks.filter((b) => b.role === role && redactionProblems(b.text, profile).length === 0).sort((a, b) => b.count - a.count);
      const best = candidates[0];
      if (!best) continue;
      if (best.count < 2 || best.count * 2 < t.texts) {
        notes.push(`${type}: nenhuma ${role === 'opening' ? 'abertura' : 'fecho'} aparece em pelo menos metade dos ${t.texts} textos.`);
        continue;
      }
      const engineText = toEngineText(best.text);
      if (!engineText) {
        notes.push(`${type}: "${best.text}" usa um campo que a geração automática não conhece; ela serve só para montar por trechos.`);
        continue;
      }
      const reasons = vetLine(best.text, profile);
      if (reasons.length > 0) {
        notes.push(`${type}: "${best.text}" não passa nas regras atuais: ${reasons[0]}.`);
        continue;
      }
      const current = role === 'opening'
        ? (profile.templates.openings?.[type]?.cordial ?? DEFAULT_OPENINGS[type].cordial)[0]
        : (profile.templates.typeClosings?.[type]?.cordial ?? DEFAULT_TYPE_CLOSINGS[type].cordial)[0];
      if (current === engineText) continue;
      items.push({ id: `${role}:${type}`, kind: role, type, text: best.text, engineText, count: best.count, of: t.texts, replaces: current ?? '' });
    }
  }

  // Rótulos: somados entre os tipos, ligados ao rótulo da extensão por sinônimo fechado.
  const tally = new Map<LabelKey, Map<string, number>>();
  let unmatched = 0;
  for (const type of COMMUNICATION_TYPES) {
    for (const l of ledger.byType[type]?.labels ?? []) {
      const key = matchLabelKey(l.text);
      if (!key) {
        unmatched += l.count;
        continue;
      }
      const byText = tally.get(key) ?? new Map<string, number>();
      byText.set(l.text, (byText.get(l.text) ?? 0) + l.count);
      tally.set(key, byText);
    }
  }
  for (const [key, byText] of tally) {
    const ranked = [...byText.entries()].sort((a, b) => b[1] - a[1]);
    const [text, count] = ranked[0];
    if (count < MIN_LABEL_COUNT || (ranked[1] && ranked[1][1] === count)) {
      notes.push(`Rótulo "${text}": aparece ${count} vez(es) ou empata com outro; são necessárias ${MIN_LABEL_COUNT} e um vencedor claro.`);
      continue;
    }
    if (normalizeLabel(text) === normalizeLabel(DEFAULT_LABELS.balanced[key])) continue;
    const reasons = vetLine(text, profile);
    if (reasons.length > 0) {
      notes.push(`Rótulo "${text}" não passa nas regras atuais: ${reasons[0]}.`);
      continue;
    }
    items.push({ id: `label:${key}`, kind: 'label', labelKey: key, text, engineText: text, count, of: texts, replaces: DEFAULT_LABELS.balanced[key] });
  }
  if (unmatched > 0) notes.push(`${unmatched} uso(s) de rótulo não corresponderam a nenhum rótulo da extensão e foram ignorados.`);

  return { items, notes, texts, newSinceLast: Math.max(0, texts - ledger.textsAtTraining) };
}

/** Junta o que o analista aprovou ao que já estava aprovado (cada espaço é substituído, o resto fica). */
export function approveItems(proposal: TrainingProposal, ids: readonly string[], previous: TrainedStyle | null): TrainedStyle | null {
  const next: TrainedStyle = { version: 1, openings: { ...previous?.openings }, closings: { ...previous?.closings }, labels: { ...previous?.labels } };
  for (const item of proposal.items) {
    if (!ids.includes(item.id)) continue;
    if (item.kind === 'opening' && item.type) next.openings = { ...next.openings, [item.type]: item.engineText };
    else if (item.kind === 'closing' && item.type) next.closings = { ...next.closings, [item.type]: item.engineText };
    else if (item.kind === 'label' && item.labelKey) next.labels = { ...next.labels, [item.labelKey]: item.engineText };
  }
  return sanitizeTrainedStyle(next);
}
