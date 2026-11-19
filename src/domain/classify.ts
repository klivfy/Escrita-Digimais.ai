import type { TicketContext, UserConfirmation } from './types';
import { parseDateToIso } from './validators';

/**
 * Classificação do contexto: separa o que o analista informou explicitamente.
 * Nada é inferido além do que está nos campos: prazo só existe se informado,
 * e ações são separadas em concluídas e planejadas por marcadores textuais claros.
 */

export interface ParsedAttempt {
  raw: string;
  iso: string | null;
}

export interface ClassifiedContext {
  summary?: string;
  observedResult?: string;
  pendingItem?: string;
  expectedAction?: string;
  /** Prazo explícito informado pelo analista. */
  deadline?: string;
  notes?: string;
  approvalObject?: string;
  approvalEffect?: string;
  destinationTeam?: string;
  escalationReason?: string;
  freeIntent?: string;
  requesterName?: string;
  actionsDone: string[];
  actionsPlanned: string[];
  /** Ações cujo sujeito é outra parte; entram como informadas, com o texto do analista, nunca como feitas ou planejadas por nós. */
  actionsOthers: string[];
  evidence: string[];
  questions: string[];
  attempts: ParsedAttempt[];
  priorNotice?: ParsedAttempt;
  userConfirmation: UserConfirmation;
}

const PLANNED_PREFIX = /^\[?\s*(?:planejad[oa]s?|previst[oa]s?|pr[óo]ximo passo|a fazer|agendad[oa]s?)\s*\]?\s*[:.-]?\s*/iu;
// Só formas que anunciam o que ainda será feito. Radical solto (`agend\w+`, `planej\w+`) pegava substantivo e particípio
// de ação já feita ("Agendamento removido da fila", "Verificado o planejamento de capacidade").
const PLANNED_PATTERN =
  /\b(?:ser[áa]o?|vamos|iremos|pretend\w+|planej(?:ar|amos|aremos|arei)|agend(?:ar|aremos|arei)|agendad[oa]s? para|a (?:realizar|validar|verificar|testar|executar|enviar)|ser[áa] (?:realizad|feit|enviad|testad)\w*)(?=[\s.,;:!?]|$)/iu;

export function isPlannedAction(item: string): boolean {
  return PLANNED_PREFIX.test(item) || PLANNED_PATTERN.test(item);
}

// Quem agiu foi outra parte (usuário, fornecedor...), não a equipe. "O que já fizemos" nunca leva essas ações.
const OTHER_PARTY = '(?:usu[áa]rios?|clientes?|solicitantes?|requisitantes?|fornecedor(?:es|a)?|terceir[oa]s?|gestor(?:a|es)?|colaborador(?:a|es)?)';
const OTHER_PARTY_SUBJECT = new RegExp(
  `^(?:(?:o|a|os|as)\\s+)?${OTHER_PARTY}\\s+(?:(?:j[áa]|tamb[ée]m|n[ãa]o)\\s+)?\\p{L}+(?:ou|eu|iu|aram|eram|iram)(?=[\\s.,;:!?]|$)`,
  'iu',
);
const OTHER_PARTY_AGENT = new RegExp(`\\bpel[oa]s?\\s+${OTHER_PARTY}(?=[\\s.,;:!?]|$)`, 'iu');

/** Ação com sujeito de terceiro ("Fornecedor trocou o toner", "Toner trocado pelo fornecedor"). */
export function isOtherPartyAction(item: string): boolean {
  const text = item.trim();
  return OTHER_PARTY_SUBJECT.test(text) || OTHER_PARTY_AGENT.test(text);
}

function stripPlannedPrefix(item: string): string {
  return item.replace(PLANNED_PREFIX, '').trim();
}

export function classifyContext(context: TicketContext): ClassifiedContext {
  const actionsDone: string[] = [];
  const actionsPlanned: string[] = [];
  const actionsOthers: string[] = [];
  for (const item of context.actions ?? []) {
    if (isOtherPartyAction(item)) actionsOthers.push(item);
    else if (isPlannedAction(item)) actionsPlanned.push(stripPlannedPrefix(item));
    else actionsDone.push(item);
  }
  const parseDate = (raw: string): ParsedAttempt => ({ raw, iso: parseDateToIso(raw) });
  return {
    summary: context.summary,
    observedResult: context.observedResult,
    pendingItem: context.pendingItem,
    expectedAction: context.expectedAction,
    deadline: context.explicitDeadline,
    notes: context.notes,
    approvalObject: context.approvalObject,
    approvalEffect: context.approvalEffect,
    destinationTeam: context.destinationTeam,
    escalationReason: context.escalationReason,
    freeIntent: context.freeIntent,
    requesterName: context.requesterName,
    actionsDone,
    actionsPlanned,
    actionsOthers,
    evidence: context.evidence ?? [],
    questions: context.questions ?? [],
    attempts: (context.contactAttempts ?? []).map(parseDate),
    priorNotice: context.priorNoticeDate ? parseDate(context.priorNoticeDate) : undefined,
    userConfirmation: context.userConfirmation ?? 'unknown',
  };
}
