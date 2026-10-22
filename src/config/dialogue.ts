import type { CommunicationType } from '../domain/types';

/**
 * Próximos passos comuns de um atendimento, a partir do tipo de texto que o analista acabou de copiar.
 * A ordem é a sugestão padrão; com o aprendizado ligado, a extensão reordena pelo que o analista costuma escolher.
 * Só sugere: escolher um passo muda o tipo do formulário e mantém os campos para revisão.
 */
export const DIALOGUE_NEXT: Readonly<Record<CommunicationType, readonly CommunicationType[]>> = {
  request_information: ['progress_update', 'closure_no_response', 'pending'],
  technical_note: ['progress_update', 'redirect_or_escalate'],
  pending: ['progress_update', 'request_information'],
  manager_approval: ['progress_update', 'pending'],
  progress_update: ['solution_confirmation', 'request_information', 'pending'],
  solution_confirmation: ['closure_resolved', 'closure_no_response'],
  closure_resolved: [],
  closure_no_response: [],
  redirect_or_escalate: ['progress_update', 'technical_note'],
  guided_free_text: [],
};

/** Quantos passos aparecem como atalho, e quantos tipos na lista "mais usados". */
export const MAX_NEXT_STEPS = 2;
export const MAX_FREQUENT_TYPES = 3;
/** Usos mínimos de um tipo para ele entrar na lista "mais usados". */
export const MIN_TYPE_USES = 3;
