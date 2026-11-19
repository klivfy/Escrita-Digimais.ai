import { CLOSURE_INCONSISTENT_PATTERN, HEDGE_PATTERN, NEGATIVE_RESULT_PATTERN } from '../config/vocabulary';
import type { ClassifiedContext } from './classify';
import type { BlockReason, CommunicationType, LanguageProfile, Warning } from './types';
import { daysBetweenIso, isoToBr, todayIso } from './validators';

/**
 * Regras de consistência e de política organizacional, avaliadas ANTES da renderização.
 * Violações com severidade `block` impedem a geração.
 */

export interface PolicyResult {
  warnings: Warning[];
  blockReason?: BlockReason;
}

const block = (code: string, message: string, suggestion: string, field?: Warning['field']): Warning => ({
  code,
  severity: 'block',
  message,
  suggestion,
  field,
  dimension: 'safety',
  penalty: 25,
});

export function checkPolicy(
  type: CommunicationType,
  c: ClassifiedContext,
  profile: LanguageProfile,
  now: Date,
): PolicyResult {
  const warnings: Warning[] = [];
  let blockReason: BlockReason | undefined;
  const fail = (reason: BlockReason, w: Warning): void => {
    warnings.push(w);
    blockReason ??= reason;
  };

  if (type === 'closure_resolved') {
    if (c.pendingItem) {
      fail(
        'inconsistent',
        block(
          'closure_with_pending',
          'Há uma pendência informada, então o chamado não pode ser encerrado como solucionado.',
          'Resolva ou remova a pendência antes de encerrar, ou use "Registrar pendência".',
          'pendingItem',
        ),
      );
    }
    if (c.userConfirmation === 'no') {
      fail(
        'inconsistent',
        block(
          'closure_user_denied',
          'O usuário informou que a situação não foi resolvida. O encerramento seria inconsistente.',
          'Continue o atendimento ou registre o motivo da divergência antes de encerrar.',
          'userConfirmation',
        ),
      );
    }
    if (c.observedResult && NEGATIVE_RESULT_PATTERN.test(c.observedResult)) {
      fail(
        'inconsistent',
        block(
          'closure_negative_result',
          'O resultado informado indica que o problema persiste ou que a ação não funcionou.',
          'Encerre como solucionado apenas com um resultado validado. Caso contrário, comunique andamento.',
          'observedResult',
        ),
      );
    } else if (c.observedResult && HEDGE_PATTERN.test(c.observedResult)) {
      warnings.push({
        code: 'closure_uncertain_result',
        severity: 'warning',
        message: 'O resultado usa termos de incerteza (por exemplo, "parece", "tentativa", "orientado").',
        suggestion: 'Encerrar como solucionado exige um resultado validado, não uma tentativa ou orientação.',
        field: 'observedResult',
        dimension: 'safety',
        penalty: 20,
      });
    }
  }

  // O pedido de confirmação de solução contradiz um resultado que diz que o problema continua. Só alerta: quem decide é o analista.
  if (type === 'solution_confirmation' && c.observedResult && NEGATIVE_RESULT_PATTERN.test(c.observedResult)) {
    warnings.push({
      code: 'confirmation_negative_result',
      severity: 'warning',
      message: 'O resultado informado indica que o problema continua ou persiste, mas o texto pede confirmação de que a situação foi resolvida.',
      suggestion: 'Se o problema continua, comunique o andamento em vez de pedir confirmação de solução.',
      field: 'observedResult',
      dimension: 'safety',
      penalty: 20,
    });
  }

  if (type === 'closure_no_response') {
    const rules = profile.closureRules;
    if (!rules.noResponseEnabled) {
      fail(
        'policy',
        block(
          'closure_no_response_disabled',
          'O encerramento por ausência de retorno está desativado pela organização.',
          'Peça ao administrador para habilitar a regra em "Configurações > Perfil de linguagem" (closureRules.noResponseEnabled).',
        ),
      );
    } else {
      const today = todayIso(now);
      const invalid = c.attempts.filter((a) => a.iso === null);
      if (invalid.length) {
        fail(
          'policy',
          block(
            'invalid_attempt_date',
            `Data de tentativa inválida: ${invalid.map((a) => `"${a.raw.slice(0, 20)}"`).join(', ')}.`,
            'Use o formato DD/MM/AAAA, uma data por linha.',
            'contactAttempts',
          ),
        );
      }
      const valid = [...new Set(c.attempts.map((a) => a.iso).filter((v): v is string => v !== null))].sort();
      if (valid.some((d) => d > today)) {
        fail('policy', block('future_attempt_date', 'Há tentativa de contato com data futura.', 'Corrija as datas registradas.', 'contactAttempts'));
      }
      if (valid.length < rules.minAttempts) {
        fail(
          'policy',
          block(
            'insufficient_attempts',
            `A organização exige pelo menos ${rules.minAttempts} tentativas de contato em datas distintas; foram registradas ${valid.length}.`,
            'Registre as tentativas reais ou continue o atendimento. Não é possível encerrar sem o histórico mínimo.',
            'contactAttempts',
          ),
        );
      }
      if (rules.requirePriorNotice) {
        const notice = c.priorNotice;
        if (!notice) {
          fail(
            'policy',
            block('missing_prior_notice', 'A organização exige aviso prévio de encerramento, e a data não foi informada.', 'Informe a data do aviso prévio enviado ao usuário.', 'priorNoticeDate'),
          );
        } else if (notice.iso === null) {
          fail('policy', block('invalid_notice_date', 'Data do aviso prévio inválida.', 'Use o formato DD/MM/AAAA.', 'priorNoticeDate'));
        } else {
          if (notice.iso > today) {
            fail('policy', block('future_notice_date', 'A data do aviso prévio está no futuro.', 'Corrija a data do aviso.', 'priorNoticeDate'));
          } else if (daysBetweenIso(notice.iso, today) < rules.minDaysAfterNotice) {
            fail(
              'policy',
              block(
                'notice_period_not_elapsed',
                `O prazo mínimo de ${rules.minDaysAfterNotice} dia(s) após o aviso prévio (${isoToBr(notice.iso)}) ainda não foi cumprido.`,
                'Aguarde o prazo mínimo definido pela organização antes de encerrar.',
                'priorNoticeDate',
              ),
            );
          }
          if (valid[0] && notice.iso < valid[0]) {
            fail(
              'policy',
              block('notice_before_attempts', 'O aviso prévio é anterior à primeira tentativa de contato registrada.', 'Revise as datas informadas.', 'priorNoticeDate'),
            );
          }
        }
      }
    }
  }

  if (type === 'manager_approval' && c.approvalObject) {
    const vague = /^(?:isso|isto|aquilo|o item|o pedido|a solicitação|a solicitacao|o chamado|tudo)\.?$/iu.test(c.approvalObject.trim());
    if (vague || c.approvalObject.trim().split(/\s+/).length < 2) {
      warnings.push({
        code: 'approval_without_object',
        severity: 'warning',
        message: 'O objeto da aprovação está vago. O gestor precisa saber exatamente o que aprova.',
        suggestion: 'Descreva o item, ação ou acesso a ser aprovado com precisão.',
        field: 'approvalObject',
        dimension: 'clarity',
        penalty: 20,
      });
    }
  }

  if (type === 'closure_resolved' && CLOSURE_INCONSISTENT_PATTERN.test(c.summary ?? '') && c.userConfirmation !== 'yes') {
    warnings.push({
      code: 'closure_context_mentions_pending',
      severity: 'info',
      message: 'O contexto menciona pendência ou andamento. Confirme que o encerramento é coerente.',
      field: 'summary',
      dimension: 'clarity',
      penalty: 4,
    });
  }

  return { warnings, blockReason };
}
