import type { CommunicationType, Formality, LabelKey, TechLevel, TemplateOverrides } from '../domain/types';

/**
 * Frases-base dos templates. Todas as variações são fixas e selecionadas de forma determinística
 * (índice de variação), sem aleatoriedade. A organização pode sobrescrever via perfil de linguagem.
 * Placeholders permitidos: {organization} e {destination}.
 */

export type PhraseTable = Record<CommunicationType, Record<Formality, string[]>>;

const none: Record<Formality, string[]> = { cordial: [], formal: [], direct: [] };

const BASE_OPENINGS: PhraseTable = {
  request_information: {
    cordial: [
      'Para continuarmos a análise, precisamos de algumas informações.',
      'Para darmos andamento à análise, precisamos de algumas informações complementares.',
    ],
    formal: [
      'Para dar continuidade à análise deste chamado, solicitamos as informações abaixo.',
      'Solicitamos as informações a seguir para a continuidade da análise deste chamado.',
    ],
    direct: [
      'Precisamos das informações abaixo para continuar a análise.',
      'Por favor, envie as informações abaixo para continuarmos a análise.',
    ],
  },
  technical_note: none,
  pending: {
    cordial: ['O atendimento permanece pendente. Seguem os detalhes.', 'Registramos uma pendência neste atendimento. Seguem os detalhes.'],
    formal: [
      'Registramos a pendência descrita abaixo para a continuidade deste atendimento.',
      'Informamos que o atendimento permanece pendente, conforme descrito abaixo.',
    ],
    direct: ['O atendimento permanece pendente.', 'Há uma pendência neste atendimento.'],
  },
  manager_approval: {
    cordial: [
      'Precisamos do seu “De acordo” para prosseguir com a solicitação descrita abaixo.',
      'Solicitamos a sua manifestação sobre o item descrito abaixo.',
    ],
    formal: [
      'Solicitamos a sua manifestação formal quanto ao item descrito abaixo.',
      'Encaminhamos o item abaixo para a sua avaliação e manifestação.',
    ],
    direct: ['Solicitamos o seu “De acordo” para o item abaixo.', 'Precisamos da sua manifestação sobre o item abaixo.'],
  },
  progress_update: {
    cordial: ['Passamos para informar o andamento do seu chamado.', 'Seguem as atualizações do atendimento até o momento.'],
    formal: ['Informamos o andamento atual deste atendimento.', 'Seguem as informações sobre o andamento deste chamado.'],
    direct: ['Segue o andamento do atendimento.', 'Atualização do atendimento:'],
  },
  solution_confirmation: {
    cordial: [
      'Realizamos as ações descritas abaixo e gostaríamos de confirmar se a situação foi resolvida.',
      'Gostaríamos de confirmar com você se a situação foi resolvida após as ações descritas abaixo.',
    ],
    formal: [
      'Após as ações descritas abaixo, solicitamos a confirmação sobre a resolução da situação.',
      'Solicitamos a sua confirmação quanto à resolução da situação, após as ações descritas abaixo.',
    ],
    direct: [
      'Realizamos as ações abaixo. Pode confirmar se a situação foi resolvida?',
      'Feitas as ações abaixo, precisamos da sua confirmação sobre o resultado.',
    ],
  },
  closure_resolved: {
    cordial: [
      'Estamos encerrando este chamado com a situação solucionada, conforme descrito abaixo.',
      'Este chamado está sendo encerrado porque a situação foi solucionada. Seguem os detalhes.',
    ],
    formal: [
      'Informamos o encerramento deste chamado, com a situação solucionada, conforme descrito abaixo.',
      'Registramos o encerramento deste chamado com a situação solucionada, conforme detalhado abaixo.',
    ],
    direct: ['Chamado encerrado com a situação solucionada.', 'Encerramos o chamado com a situação solucionada.'],
  },
  closure_no_response: {
    cordial: [
      'Estamos encerrando este chamado porque não recebemos retorno às tentativas de contato registradas abaixo.',
      'Não recebemos retorno às tentativas de contato registradas abaixo, por isso estamos encerrando este chamado.',
    ],
    formal: [
      'Informamos o encerramento deste chamado por ausência de retorno, após as tentativas de contato registradas abaixo.',
      'Registramos o encerramento deste chamado por ausência de retorno, conforme as tentativas de contato abaixo.',
    ],
    direct: ['Chamado encerrado por ausência de retorno, após as tentativas de contato abaixo.', 'Encerramos o chamado por ausência de retorno.'],
  },
  redirect_or_escalate: {
    cordial: [
      'Para que a análise tenha continuidade, estamos encaminhando este atendimento. Destino: {destination}.',
      'Este atendimento seguirá para outra equipe, para a continuidade da análise. Destino: {destination}.',
    ],
    formal: [
      'Informamos que este atendimento está sendo encaminhado para a continuidade da análise. Destino: {destination}.',
      'Encaminhamos este atendimento conforme o motivo descrito abaixo. Destino: {destination}.',
    ],
    direct: ['Este atendimento está sendo encaminhado. Destino: {destination}.', 'Encaminhamos o atendimento. Destino: {destination}.'],
  },
  guided_free_text: none,
};

const BASE_TYPE_CLOSINGS: PhraseTable = {
  request_information: {
    cordial: ['O seu retorno permitirá que continuemos a análise.', 'Com o seu retorno, conseguiremos dar andamento à análise.'],
    formal: ['O retorno dessas informações permitirá a continuidade da análise.', 'O envio dessas informações viabilizará a continuidade da análise.'],
    direct: ['Com o retorno, continuamos a análise.', 'Com as informações, seguimos com a análise.'],
  },
  technical_note: none,
  pending: {
    cordial: ['Aguardamos a conclusão do item acima para seguirmos com o atendimento.', 'Após a conclusão do item acima, retomaremos o atendimento.'],
    formal: ['Aguardamos a conclusão do item acima para a continuidade do atendimento.', 'Concluído o item acima, retomaremos o atendimento.'],
    direct: ['Aguardamos a conclusão do item acima.', 'Aguardamos o item acima para retomar o atendimento.'],
  },
  manager_approval: none,
  progress_update: none,
  solution_confirmation: {
    cordial: ['A sua confirmação nos permitirá registrar o resultado do atendimento.', 'Com a sua confirmação, poderemos registrar o resultado do atendimento.'],
    formal: ['A confirmação permitirá registrar o resultado do atendimento.', 'A sua confirmação possibilitará o registro do resultado do atendimento.'],
    direct: ['Com a confirmação, registramos o resultado.', 'Precisamos da confirmação para registrar o resultado.'],
  },
  closure_resolved: none,
  closure_no_response: none,
  redirect_or_escalate: {
    cordial: ['O atendimento seguirá com a equipe indicada.', 'A equipe indicada dará continuidade ao atendimento.'],
    formal: ['O atendimento seguirá com a equipe indicada.', 'A continuidade do atendimento ficará a cargo da equipe indicada.'],
    direct: ['O atendimento segue com a equipe indicada.', 'A equipe indicada continua o atendimento.'],
  },
  guided_free_text: none,
};

type PartialTable = Partial<Record<CommunicationType, Partial<Record<Formality, string[]>>>>;

/**
 * Redações adicionais. Ficam sempre depois das originais: a variação 0 e os textos já validados não mudam.
 * Regras: pt-BR, sem travessão, sem emoji, sem caixa alta para ênfase, sem prazo, culpa, promessa ou marcador de
 * solução fora dos tipos de encerramento. O teste de variações percorre todas as combinações.
 */
const EXTRA_OPENINGS: PartialTable = {
  request_information: {
    cordial: ['Precisamos da sua ajuda com algumas informações para seguir com o atendimento.', 'Para avançarmos com o seu chamado, pedimos que nos envie as informações abaixo.'],
    formal: ['Para a continuidade deste atendimento, solicitamos o envio das informações a seguir.', 'Pedimos a gentileza de informar os itens abaixo para que a análise prossiga.'],
    direct: ['Para seguir com a análise, precisamos do que está listado abaixo.', 'Envie as informações abaixo para a análise continuar.'],
  },
  pending: {
    cordial: ['Há um ponto em aberto neste atendimento. Seguem os detalhes.', 'Este atendimento depende de um item pendente, descrito abaixo.'],
    formal: ['Comunicamos que este atendimento depende da pendência descrita abaixo.', 'Registramos que o atendimento aguarda o tratamento da pendência a seguir.'],
    direct: ['O atendimento depende do item abaixo.', 'Existe um item pendente neste atendimento.'],
  },
  manager_approval: {
    cordial: ['Precisamos da sua aprovação para dar andamento ao item descrito abaixo.', 'Pedimos o seu “De acordo” para seguir com a solicitação abaixo.'],
    formal: ['Submetemos à sua avaliação o item descrito abaixo, que requer a sua manifestação.', 'Solicitamos a sua análise e manifestação sobre a solicitação descrita abaixo.'],
    direct: ['Precisamos do seu “De acordo” para a solicitação abaixo.', 'A solicitação abaixo depende da sua manifestação.'],
  },
  progress_update: {
    cordial: ['Seguem as novidades sobre o seu chamado.', 'Atualizamos o andamento do seu atendimento. Veja abaixo.'],
    formal: ['Prestamos, a seguir, informações sobre o andamento deste atendimento.', 'Segue a atualização sobre o andamento deste chamado.'],
    direct: ['Atualização do chamado:', 'Situação atual do atendimento:'],
  },
  solution_confirmation: {
    cordial: ['Fizemos os ajustes descritos abaixo. Poderia confirmar se tudo voltou a funcionar?', 'Realizamos as ações descritas abaixo e gostaríamos de saber se a situação foi resolvida para você.'],
    formal: ['Realizadas as ações descritas abaixo, solicitamos que confirme se a situação foi resolvida.', 'Pedimos que confirme se a situação foi resolvida, após as ações abaixo.'],
    direct: ['Executamos as ações abaixo. Pode confirmar se a situação foi resolvida?', 'Ações descritas abaixo. Pode confirmar o resultado?'],
  },
  closure_resolved: {
    cordial: ['Este chamado está sendo encerrado, pois a situação foi solucionada. Veja os detalhes abaixo.', 'Encerramos este chamado com a situação solucionada. Seguem os detalhes.'],
    formal: ['Comunicamos o encerramento deste chamado, com a situação solucionada, conforme abaixo.', 'Este chamado é encerrado com a situação solucionada, conforme o registro abaixo.'],
    direct: ['Chamado solucionado e encerrado.', 'Situação solucionada. Encerramos o chamado.'],
  },
  closure_no_response: {
    cordial: ['Como não houve retorno às tentativas de contato registradas abaixo, estamos encerrando este chamado.', 'Encerramos este chamado por falta de retorno, após as tentativas de contato abaixo.'],
    formal: ['Comunicamos o encerramento deste chamado por ausência de retorno, após as tentativas registradas abaixo.', 'Em razão da ausência de retorno às tentativas de contato abaixo, este chamado é encerrado.'],
    direct: ['Sem retorno às tentativas de contato abaixo. Chamado encerrado.', 'Chamado encerrado por falta de retorno.'],
  },
  redirect_or_escalate: {
    cordial: ['Vamos encaminhar este atendimento para dar sequência à análise. Destino: {destination}.', 'O seu chamado seguirá para outra equipe, que continuará a análise. Destino: {destination}.'],
    formal: ['Comunicamos o encaminhamento deste atendimento para a continuidade da análise. Destino: {destination}.', 'Este atendimento será encaminhado conforme o motivo descrito abaixo. Destino: {destination}.'],
    direct: ['Atendimento encaminhado. Destino: {destination}.', 'Estamos encaminhando o atendimento. Destino: {destination}.'],
  },
};

const EXTRA_TYPE_CLOSINGS: PartialTable = {
  request_information: {
    cordial: ['Assim que recebermos esses dados, seguimos com a análise.', 'Com essas informações, conseguimos avançar com o seu chamado.'],
    formal: ['Com o envio das informações, a análise poderá prosseguir.', 'A resposta a estes itens é necessária para a continuidade da análise.'],
    direct: ['Com as informações, a análise segue.', 'Retornando os itens, retomamos a análise.'],
  },
  pending: {
    cordial: ['Assim que o item acima for tratado, voltamos a cuidar do seu atendimento.', 'Quando o item acima estiver finalizado, retomamos o atendimento.'],
    formal: ['Finalizado o item acima, o atendimento será retomado.', 'A retomada do atendimento depende do tratamento do item acima.'],
    direct: ['Retomamos o atendimento após o item acima.', 'Retomamos assim que o item acima for finalizado.'],
  },
  solution_confirmation: {
    cordial: ['A sua confirmação nos ajuda a registrar o resultado corretamente.', 'Com a sua resposta, registramos o resultado do atendimento.'],
    formal: ['A confirmação é necessária para o registro do resultado do atendimento.', 'Com a sua confirmação, será possível registrar o resultado do atendimento.'],
    direct: ['Confirmando, registramos o resultado.', 'A sua resposta define o registro do resultado.'],
  },
  redirect_or_escalate: {
    cordial: ['A equipe indicada vai assumir a partir daqui.', 'Daqui em diante, a equipe indicada cuida do atendimento.'],
    formal: ['A equipe indicada assumirá a continuidade do atendimento.', 'O atendimento prossegue sob responsabilidade da equipe indicada.'],
    direct: ['A equipe indicada assume o atendimento.', 'Daqui, o atendimento é da equipe indicada.'],
  },
};

function withExtras(base: PhraseTable, extra: PartialTable): PhraseTable {
  const out = structuredClone(base);
  for (const [type, byFormality] of Object.entries(extra) as [CommunicationType, Partial<Record<Formality, string[]>>][]) {
    for (const [formality, list] of Object.entries(byFormality) as [Formality, string[]][]) out[type][formality].push(...list);
  }
  return out;
}

export const DEFAULT_OPENINGS: PhraseTable = withExtras(BASE_OPENINGS, EXTRA_OPENINGS);
export const DEFAULT_TYPE_CLOSINGS: PhraseTable = withExtras(BASE_TYPE_CLOSINGS, EXTRA_TYPE_CLOSINGS);

export const DEFAULT_LABELS: Record<TechLevel, Record<LabelKey, string>> = {
  balanced: {
    context: 'Contexto',
    justification: 'Justificativa',
    actions_done: 'Ações realizadas',
    actions_planned: 'Próximos passos',
    result: 'Resultado observado',
    pending: 'Pendência',
    depends_on: 'Pendente com',
    questions: 'Informações necessárias',
    expected_action: 'Ação esperada',
    deadline: 'Prazo informado',
    evidence: 'Evidências',
    notes: 'Observações',
    approval_object: 'Objeto da aprovação',
    approval_effect: 'Efeito da aprovação',
    attempts: 'Tentativas de contato registradas',
    notice: 'Aviso prévio',
    reason: 'Motivo do encaminhamento',
  },
  simple: {
    context: 'Situação',
    justification: 'Motivo da solicitação',
    actions_done: 'O que foi feito',
    actions_planned: 'O que será feito',
    result: 'O que observamos',
    pending: 'O que está pendente',
    depends_on: 'Pendente com',
    questions: 'O que precisamos saber',
    expected_action: 'O que é necessário agora',
    deadline: 'Prazo informado',
    evidence: 'Evidências',
    notes: 'Observações',
    approval_object: 'O que será aprovado',
    approval_effect: 'O que muda com a aprovação',
    attempts: 'Datas em que tentamos contato',
    notice: 'Aviso prévio',
    reason: 'Motivo do encaminhamento',
  },
  technical: {
    context: 'Contexto',
    justification: 'Justificativa',
    actions_done: 'Validações e ações realizadas',
    actions_planned: 'Próximos passos',
    result: 'Resultado observado',
    pending: 'Pendência',
    depends_on: 'Pendente com',
    questions: 'Informações necessárias',
    expected_action: 'Ação esperada',
    deadline: 'Prazo informado',
    evidence: 'Evidências',
    notes: 'Observações',
    approval_object: 'Objeto da aprovação',
    approval_effect: 'Efeito da aprovação',
    attempts: 'Tentativas de contato registradas',
    notice: 'Aviso prévio',
    reason: 'Motivo do encaminhamento',
  },
};

/** Rótulos específicos por tipo, aplicados por cima dos rótulos do nível técnico. */
export const LABEL_OVERRIDES: Partial<Record<CommunicationType, Partial<Record<LabelKey, string>>>> = {
  request_information: { deadline: 'Prazo para retorno', context: 'Contexto' },
  technical_note: { pending: 'Situação atual', expected_action: 'Próximo passo' },
  manager_approval: { deadline: 'Prazo para manifestação', context: 'Justificativa' },
  solution_confirmation: { deadline: 'Prazo para retorno' },
  closure_resolved: { result: 'Resultado validado' },
  closure_no_response: { context: 'Solicitação do atendimento', pending: 'Informação aguardada' },
  redirect_or_escalate: { actions_done: 'Verificações já realizadas', expected_action: 'Continuidade esperada' },
};

/**
 * Frases de ligação do estilo natural, no lugar dos rótulos secos. Duas variações por seção, escolhidas
 * pelo índice de variação. Aplicadas só a textos para pessoas (usuário, gestor, outro) e só quando a
 * organização não definiu rótulos próprios no perfil.
 */
export const LEAD_SIZE = 4;
export const NATURAL_LEADS: Partial<Record<LabelKey, readonly string[]>> = {
  context: ['Resumo da situação', 'Sobre o seu atendimento', 'Situação registrada', 'O que motivou o chamado'],
  actions_done: ['O que já fizemos', 'Até aqui, realizamos', 'Já realizamos as seguintes ações', 'O que fizemos até agora'],
  actions_planned: ['Os próximos passos são', 'Em seguida, faremos o seguinte', 'O que faremos a seguir', 'Planejamos as seguintes ações'],
  result: ['O que observamos', 'Resultado até o momento', 'O que encontramos', 'Resultado das verificações'],
  pending: ['O que ainda está pendente', 'Pendência no momento', 'O que falta tratar', 'Ponto ainda em aberto'],
  questions: ['Para avançarmos, precisamos saber', 'Pode nos ajudar com as informações abaixo', 'Precisamos que nos informe', 'Para seguir, pedimos estas informações'],
};

/** Quem age em "ação esperada" muda conforme o destinatário. */
export const NATURAL_EXPECTED_ACTION: Record<'person' | 'manager', readonly string[]> = {
  person: ['O que precisamos de você', 'Próximo passo do seu lado', 'Precisamos de você para avançar', 'Próximo passo a seu cargo'],
  manager: ['Ação esperada do gestor', 'Ação esperada nesta etapa', 'Próximo passo esperado do gestor', 'Ação esperada para o avanço do atendimento'],
};

/** Aberturas de frase corrida para ações feitas e planejadas. */
export const FLOW_LEADS = {
  done: ['Até aqui, ', 'Nesta etapa, ', 'Até o momento, ', 'Por enquanto, '],
  planned: ['Em seguida, ', 'Na sequência, ', 'Depois disso, ', 'Como próximo passo, '],
} as const;

/** Frases fixas por formalidade, usadas em seções específicas. */
export const FIXED_PHRASES = {
  approval_response: {
    cordial: ['Por favor, responda com “De acordo” ou “Não aprovado”.'],
    formal: ['Solicitamos que a manifestação seja registrada como “De acordo” ou “Não aprovado”.'],
    direct: ['Responda com “De acordo” ou “Não aprovado”.'],
  },
  user_confirmed: 'O usuário confirmou a solução.',
  user_not_confirmed: 'Até o momento do encerramento, não há registro de confirmação do usuário sobre a solução.',
  no_response_meaning: 'Este encerramento não indica que a situação foi resolvida.',
  notice: 'Aviso prévio de encerramento registrado em {date}.',
} as const;

/** Versões das frases fixas para quando o texto é escrito ao próprio usuário (estilo natural). */
export const FIXED_PHRASES_TO_USER = {
  user_confirmed: 'Você confirmou a solução.',
  user_not_confirmed: 'Até o momento do encerramento, não há registro de confirmação da sua parte sobre a solução.',
} as const;

/** Rótulo de ações cujo sujeito é outra parte (usuário, fornecedor...). Fixo: não afirma que a equipe fez ou fará. */
export const OTHER_PARTY_LABEL = 'Informado por outras partes';

export interface ResolvedTemplates {
  openings: PhraseTable;
  typeClosings: PhraseTable;
  labels: Record<TechLevel, Record<LabelKey, string>>;
}


export function resolveTemplates(overrides: TemplateOverrides = {}): ResolvedTemplates {
  const mergeTable = (base: PhraseTable, patch: TemplateOverrides['openings']): PhraseTable => {
    const out = structuredClone(base);
    for (const [type, byFormality] of Object.entries(patch ?? {}) as [CommunicationType, Partial<Record<Formality, string[]>>][]) {
      for (const [formality, list] of Object.entries(byFormality ?? {}) as [Formality, string[]][]) {
        if (Array.isArray(list)) out[type][formality] = [...list];
      }
    }
    return out;
  };
  const labels = structuredClone(DEFAULT_LABELS);
  for (const [level, patch] of Object.entries(overrides.labels ?? {}) as [TechLevel, Partial<Record<LabelKey, string>>][]) {
    Object.assign(labels[level], patch);
  }
  return {
    openings: mergeTable(DEFAULT_OPENINGS, overrides.openings),
    typeClosings: mergeTable(DEFAULT_TYPE_CLOSINGS, overrides.typeClosings),
    labels,
  };
}
