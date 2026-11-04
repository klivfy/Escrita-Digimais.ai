import type { LabelKey } from '../domain/types';

/**
 * Lista fechada que liga o rótulo que a equipe usa ("Pendência:", "O que foi feito:") ao rótulo da extensão que ele
 * substitui. Só entra em uso o que casar de forma inequívoca; rótulo sem correspondência é ignorado, nunca inventado.
 */
export const LABEL_SYNONYMS: Record<LabelKey, readonly string[]> = {
  context: ['contexto', 'situacao', 'resumo', 'cenario'],
  justification: ['justificativa', 'motivo da solicitacao', 'motivo do pedido'],
  actions_done: ['acoes realizadas', 'o que foi feito', 'validacoes e acoes', 'acoes executadas'],
  actions_planned: ['proximos passos', 'o que sera feito', 'acoes planejadas'],
  result: ['resultado', 'o que observamos'],
  pending: ['pendencia', 'o que esta pendente', 'em aberto'],
  depends_on: ['pendente com', 'aguardando'],
  questions: ['informacoes necessarias', 'o que precisamos saber', 'perguntas', 'precisamos saber'],
  expected_action: ['acao esperada', 'o que e necessario agora', 'o que precisamos de voce'],
  deadline: ['prazo'],
  evidence: ['evidencia'],
  notes: ['observacao', 'observacoes', 'notas'],
  approval_object: ['objeto da aprovacao', 'o que sera aprovado'],
  approval_effect: ['efeito da aprovacao', 'o que muda com a aprovacao'],
  attempts: ['tentativas de contato', 'datas em que tentamos contato'],
  notice: ['aviso previo'],
  reason: ['motivo do encaminhamento', 'motivo'],
};

const normalize = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * A qual rótulo da extensão o texto corresponde. Vence o sinônimo mais longo contido no rótulo; empate entre rótulos
 * diferentes é ambíguo e devolve undefined.
 */
export function matchLabelKey(label: string): LabelKey | undefined {
  const n = normalize(label);
  let best: { key: LabelKey; length: number } | undefined;
  let tie = false;
  for (const [key, list] of Object.entries(LABEL_SYNONYMS) as [LabelKey, readonly string[]][]) {
    for (const syn of list) {
      if (!n.includes(syn)) continue;
      if (!best || syn.length > best.length) {
        best = { key, length: syn.length };
        tie = false;
      } else if (syn.length === best.length && key !== best.key) tie = true;
    }
  }
  return best && !tie ? best.key : undefined;
}
