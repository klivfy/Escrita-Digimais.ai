import type { CommunicationType, LengthMode } from '../domain/types';

export type SectionKind =
  | 'greeting'
  | 'opening'
  | 'intent'
  | 'context'
  | 'justification'
  | 'actions_done'
  | 'actions_others'
  | 'actions_planned'
  | 'result'
  | 'pending'
  | 'depends_on'
  | 'questions'
  | 'approval_object'
  | 'approval_effect'
  | 'approval_response'
  | 'expected_action'
  | 'deadline'
  | 'evidence'
  | 'notes'
  | 'attempts'
  | 'notice'
  | 'no_response_meaning'
  | 'user_confirmation'
  | 'reason'
  | 'privacy'
  | 'type_closing'
  | 'reopen'
  | 'required'
  | 'courtesy'
  | 'signature';

/** Tamanho mínimo em que a seção aparece: curto inclui só "short"; detalhado inclui tudo. */
type Min = LengthMode;
type Entry = [SectionKind, Min];

const S: Min = 'short';
const N: Min = 'standard';
const D: Min = 'detailed';

/**
 * Planos de mensagem por tipo: ordem das seções e o tamanho mínimo em que aparecem.
 * Seções sem conteúdo informado são omitidas; nada é preenchido por inferência.
 */
export const BLUEPRINTS: Record<CommunicationType, Entry[]> = {
  request_information: [
    ['greeting', S], ['opening', S], ['context', N], ['questions', S], ['expected_action', N], ['deadline', S],
    ['evidence', D], ['notes', D], ['privacy', N], ['type_closing', S], ['required', S], ['courtesy', S], ['signature', N],
  ],
  technical_note: [
    ['context', N], ['actions_done', S], ['actions_others', S], ['result', S], ['evidence', N], ['pending', S], ['actions_planned', S],
    ['expected_action', S], ['deadline', S], ['notes', N], ['required', S],
  ],
  pending: [
    ['greeting', S], ['opening', S], ['pending', S], ['depends_on', S], ['expected_action', S], ['deadline', S],
    ['context', N], ['actions_done', N], ['actions_others', N], ['result', D], ['evidence', D], ['notes', D], ['type_closing', N],
    ['required', S], ['courtesy', S], ['signature', N],
  ],
  manager_approval: [
    ['greeting', S], ['opening', S], ['approval_object', S], ['justification', S], ['approval_effect', S],
    ['actions_done', D], ['actions_others', D], ['expected_action', N], ['deadline', S], ['approval_response', S], ['evidence', D], ['notes', D],
    ['required', S], ['courtesy', S], ['signature', N],
  ],
  progress_update: [
    ['greeting', S], ['opening', S], ['context', N], ['actions_done', S], ['actions_others', S], ['result', S], ['pending', S],
    ['actions_planned', S], ['expected_action', S], ['deadline', S], ['evidence', D], ['notes', D],
    ['required', S], ['courtesy', S], ['signature', N],
  ],
  solution_confirmation: [
    ['greeting', S], ['opening', S], ['context', N], ['actions_done', S], ['actions_others', S], ['result', S], ['expected_action', N],
    ['deadline', S], ['evidence', D], ['notes', D], ['type_closing', S], ['required', S], ['courtesy', S], ['signature', N],
  ],
  closure_resolved: [
    ['greeting', S], ['opening', S], ['context', N], ['actions_done', S], ['actions_others', S], ['result', S], ['user_confirmation', S],
    ['evidence', D], ['notes', D], ['type_closing', S], ['reopen', N], ['required', S], ['courtesy', S], ['signature', N],
  ],
  closure_no_response: [
    ['greeting', S], ['opening', S], ['context', N], ['pending', S], ['attempts', S], ['notice', S],
    ['no_response_meaning', S], ['reopen', S], ['notes', D], ['required', S], ['courtesy', S], ['signature', N],
  ],
  redirect_or_escalate: [
    ['greeting', S], ['opening', S], ['reason', S], ['context', N], ['actions_done', N], ['actions_others', N], ['result', N], ['pending', N],
    ['expected_action', S], ['deadline', S], ['evidence', D], ['notes', D], ['type_closing', S],
    ['required', S], ['courtesy', S], ['signature', N],
  ],
  guided_free_text: [
    ['greeting', S], ['intent', S], ['context', N], ['actions_done', N], ['actions_others', N], ['result', N], ['pending', N],
    ['expected_action', S], ['deadline', S], ['evidence', D], ['notes', D], ['required', S], ['courtesy', S], ['signature', N],
  ],
};

const ORDER: Record<LengthMode, number> = { short: 0, standard: 1, detailed: 2 };

export function includedAt(min: Min, length: LengthMode): boolean {
  return ORDER[length] >= ORDER[min];
}

/** Registros internos não recebem saudação, cortesia nem assinatura. */
export function isRecordStyle(type: CommunicationType, recipient: string): boolean {
  if (type === 'technical_note') return true;
  if (type === 'pending') return !(recipient === 'user' || recipient === 'manager');
  return false;
}

export const RECORD_SKIPPED: SectionKind[] = ['greeting', 'courtesy', 'signature'];
