import { BLUEPRINTS, RECORD_SKIPPED, includedAt, isRecordStyle } from '../config/blueprints';
import type { SectionKind } from '../config/blueprints';
import { FIXED_PHRASES, FIXED_PHRASES_TO_USER, FLOW_LEADS, LABEL_OVERRIDES, LEAD_SIZE, NATURAL_EXPECTED_ACTION, NATURAL_LEADS } from '../config/templates';
import type { ResolvedTemplates } from '../config/templates';
import type { ClassifiedContext } from './classify';
import { capitalizeFirst, ensureQuestion, ensureTerminalPunctuation, lowerFirst, stripTerminalPunctuation } from './text-utils';
import type { GenerationSettings, LabelKey, LanguageProfile, PhraseChoices } from './types';
import { isoToBr } from './validators';
import { startsWithTeamVerb } from './voice';

/**
 * Planejamento da mensagem: decide quais seções existem e com qual conteúdo.
 * Não escreve texto corrido; a renderização apenas formata o plano.
 */

export interface PlannedSection {
  kind: SectionKind;
  label?: string;
  text?: string;
  items?: string[];
  /** Seções consecutivas do mesmo grupo, só com texto corrido, formam um único parágrafo (estilo natural). */
  group?: 'facts' | 'next';
}

export interface MessagePlan {
  sections: PlannedSection[];
  /** Redação usada em cada ponto com mais de uma opção (só índices). */
  choices?: PhraseChoices;
}

/** Estilo natural: o que aconteceu num parágrafo e o que falta (pendência, próximos passos) em outro. */
const PARAGRAPH_GROUP: Partial<Record<SectionKind, 'facts' | 'next'>> = {
  intent: 'facts',
  context: 'facts',
  actions_done: 'facts',
  result: 'facts',
  pending: 'next',
  actions_planned: 'next',
  expected_action: 'next',
};

const LABEL_KEY: Partial<Record<SectionKind, LabelKey>> = {
  context: 'context',
  justification: 'justification',
  actions_done: 'actions_done',
  actions_planned: 'actions_planned',
  result: 'result',
  pending: 'pending',
  depends_on: 'depends_on',
  questions: 'questions',
  approval_object: 'approval_object',
  approval_effect: 'approval_effect',
  expected_action: 'expected_action',
  deadline: 'deadline',
  evidence: 'evidence',
  notes: 'notes',
  attempts: 'attempts',
  reason: 'reason',
};

function pick(list: readonly string[], variant: number): string | undefined {
  if (list.length === 0) return undefined;
  return list[((variant % list.length) + list.length) % list.length];
}

/**
 * Escolhe um índice de variação independente para cada seção (sistema posicional misto).
 * A variação 0 usa o primeiro item de todas as listas. Cada incremento avança a primeira lista que
 * ainda tem opções e "vai um" para a seguinte, então N listas de tamanhos a, b, c geram a x b x c textos
 * distintos antes de repetir, sempre de forma determinística.
 */
export function variantIndexes(variant: number, sizes: readonly number[]): number[] {
  const total = sizes.reduce((acc, n) => (n > 1 ? acc * n : acc), 1);
  let rest = ((Math.trunc(variant) % total) + total) % total;
  return sizes.map((n) => {
    if (n <= 1) return 0;
    const digit = rest % n;
    rest = Math.floor(rest / n);
    return digit;
  });
}

/** Natural vale para textos a pessoas, sem rótulos próprios da organização e sem pedido do estilo estruturado. */
export function isNaturalStyle(settings: GenerationSettings, profile: LanguageProfile): boolean {
  if ((settings.style ?? 'natural') !== 'natural') return false;
  if (isRecordStyle(settings.type, settings.recipient)) return false;
  if (settings.recipient !== 'user' && settings.recipient !== 'manager' && settings.recipient !== 'other') return false;
  return Object.keys(profile.templates.labels ?? {}).length === 0;
}

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}'’-]{0,39}$/u;
const GREETING_WITH_NAME = /^(Olá|Prezado\(a\)|Prezada|Prezado),$/u;

/** Primeiro nome válido para a saudação, ou undefined (nunca monta saudação com texto estranho). */
export function greetingName(raw: string | undefined): string | undefined {
  const first = raw?.trim().split(/\s+/u)[0];
  return first && NAME_PATTERN.test(first) ? capitalizeFirst(first) : undefined;
}

/** Marcador do nome numa saudação ensinada pelo analista ("Bom dia, {nome},"). Fora dele, a saudação do perfil não muda. */
const NAME_SLOT = '{nome}';
const NAME_SLOT_WITH_SEPARATOR = /,?\s*\{nome\}/;

/** Saudação sem o marcador do nome (estilo estruturado ou nome não informado): "Bom dia, {nome}," vira "Bom dia,". */
function withoutNameSlot(base: string): string {
  return base.includes(NAME_SLOT) ? base.replace(NAME_SLOT_WITH_SEPARATOR, '').replace(/\s{2,}/g, ' ').trim() : base;
}

function greetWithName(base: string, name: string | undefined): string {
  if (base.includes(NAME_SLOT)) return name ? base.replace(NAME_SLOT, name) : withoutNameSlot(base);
  const m = name ? GREETING_WITH_NAME.exec(base) : null;
  if (!m || !name) return base;
  return m[1] === 'Olá' ? `Olá, ${name},` : `${m[1]} ${name},`;
}

const INFINITIVE = /^[\p{L}]{4,}(?:ar|er|ir)$/u;

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** Frase corrida quando todas as ações começam com verbo da equipe; senão undefined (cai na lista). */
function flowingActions(items: string[], planned: boolean, variant: number): string | undefined {
  if (items.length === 0 || items.length > 3) return undefined;
  const clauses: string[] = [];
  for (const raw of items) {
    const item = stripTerminalPunctuation(raw);
    if (startsWithTeamVerb(item)) clauses.push(lowerFirst(item));
    else if (planned && INFINITIVE.test(item.split(/\s+/u)[0] ?? '')) clauses.push(`vamos ${lowerFirst(item)}`);
    else return undefined;
  }
  const leads = planned ? FLOW_LEADS.planned : FLOW_LEADS.done;
  return `${leads[Math.abs(variant) % leads.length]}${joinClauses(clauses)}.`;
}

function sentence(text: string): string {
  return ensureTerminalPunctuation(capitalizeFirst(text));
}

export function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_whole, key: string) => vars[key] ?? '');
}

export function buildPlan(
  settings: GenerationSettings,
  c: ClassifiedContext,
  profile: LanguageProfile,
  templates: ResolvedTemplates,
): MessagePlan {
  const { type, recipient, formality, techLevel, length } = settings;
  const variant = settings.variant ?? 0;
  const openingPool = templates.openings[type][formality];
  const typeClosingPool = templates.typeClosings[type][formality];
  const courtesyPool = profile.closings[formality];
  const learned = settings.learned ?? {};
  const withBase = (digit: number, size: number, base: number | undefined): number =>
    size > 1 ? (digit + Math.max(0, Math.trunc(base ?? 0))) % size : 0;
  const [d0, d1, d2] = variantIndexes(variant, [openingPool.length, typeClosingPool.length, courtesyPool.length]);
  const openingIdx = withBase(d0 ?? 0, openingPool.length, learned.opening);
  const typeClosingIdx = withBase(d1 ?? 0, typeClosingPool.length, learned.closing);
  const courtesyIdx = withBase(d2 ?? 0, courtesyPool.length, learned.courtesy);
  /** A frase de ligação segue a variação, a partir da preferência aprendida. */
  const leadVariant = (learned.lead ?? 0) + variant;
  const record = isRecordStyle(type, recipient);
  const vars = { organization: profile.organizationName, destination: c.destinationTeam ?? '' };
  const natural = isNaturalStyle(settings, profile);
  const labels = { ...templates.labels[techLevel], ...(LABEL_OVERRIDES[type] ?? {}) };
  if (natural) {
    const base = templates.labels[techLevel];
    const overrides = LABEL_OVERRIDES[type] ?? {};
    for (const [key, pool] of Object.entries(NATURAL_LEADS) as [LabelKey, readonly string[]][]) {
      const override = overrides[key];
      if (override === undefined || override === base[key]) labels[key] = pick(pool, leadVariant) ?? labels[key];
    }
    if (overrides.expected_action === undefined) {
      labels.expected_action = pick(NATURAL_EXPECTED_ACTION[recipient === 'manager' ? 'manager' : 'person'], leadVariant) ?? labels.expected_action;
    }
  }

  const content = (kind: SectionKind): (Pick<PlannedSection, 'text' | 'items'> & { flowing?: boolean }) | undefined => {
    switch (kind) {
      case 'greeting':
        return { text: natural ? greetWithName(profile.greetings[formality][recipient], greetingName(c.requesterName)) : withoutNameSlot(profile.greetings[formality][recipient]) };
      case 'opening': {
        const t = pick(openingPool, openingIdx);
        return t ? { text: fillPlaceholders(t, vars) } : undefined;
      }
      case 'intent':
        return c.freeIntent ? { text: sentence(c.freeIntent) } : undefined;
      case 'context':
      case 'justification':
        return c.summary ? { text: sentence(c.summary) } : undefined;
      case 'actions_done': {
        if (!c.actionsDone.length) return undefined;
        const flow = natural ? flowingActions(c.actionsDone, false, leadVariant) : undefined;
        return flow ? { text: flow, flowing: true } : { items: c.actionsDone.map(sentence) };
      }
      case 'actions_planned': {
        if (!c.actionsPlanned.length) return undefined;
        const flow = natural ? flowingActions(c.actionsPlanned, true, leadVariant) : undefined;
        return flow ? { text: flow, flowing: true } : { items: c.actionsPlanned.map(sentence) };
      }
      case 'result':
        return c.observedResult ? { text: sentence(c.observedResult) } : undefined;
      case 'pending':
        return c.pendingItem ? { text: sentence(c.pendingItem) } : undefined;
      case 'depends_on':
        // Ao escrever para o próprio usuário, "Pendente com: usuário" soa estranho; "O que precisamos de você" já diz isso.
        return recipient === 'other' || (natural && recipient === 'user') ? undefined : { text: profile.recipients[recipient].displayName };
      case 'questions':
        return c.questions.length ? { items: c.questions.map((q) => ensureQuestion(capitalizeFirst(q))) } : undefined;
      case 'approval_object':
        return c.approvalObject ? { text: sentence(c.approvalObject) } : undefined;
      case 'approval_effect':
        return c.approvalEffect ? { text: sentence(c.approvalEffect) } : undefined;
      case 'approval_response': {
        const t = pick(FIXED_PHRASES.approval_response[formality], variant);
        return t ? { text: t } : undefined;
      }
      case 'expected_action':
        return c.expectedAction ? { text: sentence(c.expectedAction) } : undefined;
      case 'deadline':
        return c.deadline ? { text: stripTerminalPunctuation(c.deadline) } : undefined;
      case 'evidence':
        return c.evidence.length ? { items: c.evidence.map(sentence) } : undefined;
      case 'notes':
        return c.notes ? { text: sentence(c.notes) } : undefined;
      case 'attempts': {
        const dates = [...new Set(c.attempts.map((a) => a.iso).filter((v): v is string => v !== null))].sort();
        return dates.length ? { items: dates.map(isoToBr) } : undefined;
      }
      case 'notice': {
        const iso = c.priorNotice?.iso;
        return iso ? { text: FIXED_PHRASES.notice.replace('{date}', isoToBr(iso)) } : undefined;
      }
      case 'no_response_meaning':
        return { text: FIXED_PHRASES.no_response_meaning };
      case 'user_confirmation':
      {
        const phrases = natural && recipient === 'user' ? FIXED_PHRASES_TO_USER : FIXED_PHRASES;
        return { text: c.userConfirmation === 'yes' ? phrases.user_confirmed : phrases.user_not_confirmed };
      }
      case 'reason':
        return c.escalationReason ? { text: sentence(c.escalationReason) } : undefined;
      case 'privacy':
        return profile.privacyNotice.text && profile.privacyNotice.types.includes(type)
          ? { text: fillPlaceholders(profile.privacyNotice.text, vars) }
          : undefined;
      case 'type_closing': {
        const t = pick(typeClosingPool, typeClosingIdx);
        return t ? { text: fillPlaceholders(t, vars) } : undefined;
      }
      case 'reopen':
        return profile.closureRules.reopenInstruction ? { text: profile.closureRules.reopenInstruction } : undefined;
      case 'required': {
        const texts = profile.requiredTexts
          .filter((r) => r.types.length === 0 || r.types.includes(type))
          .map((r) => fillPlaceholders(r.text, vars));
        return texts.length ? { text: [...new Set(texts)].join('\n') } : undefined;
      }
      case 'courtesy': {
        const t = pick(courtesyPool, courtesyIdx);
        return t ? { text: fillPlaceholders(t, vars) } : undefined;
      }
      case 'signature':
        return profile.signature ? { text: fillPlaceholders(profile.signature, vars).trim() } : undefined;
    }
  };

  const sections: PlannedSection[] = [];
  for (const [kind, min] of BLUEPRINTS[type]) {
    if (!includedAt(min, length)) continue;
    if (record && RECORD_SKIPPED.includes(kind)) continue;
    const body = content(kind);
    if (!body) continue;
    const key = LABEL_KEY[kind];
    const { flowing, ...rest } = body;
    sections.push({ kind, label: key && !flowing ? labels[key] : undefined, ...rest, ...(natural && PARAGRAPH_GROUP[kind] ? { group: PARAGRAPH_GROUP[kind] } : {}) });
  }
  const has = (kind: SectionKind): boolean => sections.some((s) => s.kind === kind);
  const choices: PhraseChoices = {};
  if (has('opening') && openingPool.length > 1) choices.opening = { index: openingIdx, size: openingPool.length };
  if (has('type_closing') && typeClosingPool.length > 1) choices.closing = { index: typeClosingIdx, size: typeClosingPool.length };
  if (has('courtesy') && courtesyPool.length > 1) choices.courtesy = { index: courtesyIdx, size: courtesyPool.length };
  if (natural) choices.lead = { index: ((leadVariant % LEAD_SIZE) + LEAD_SIZE) % LEAD_SIZE, size: LEAD_SIZE };
  return { sections, choices };
}
