import type { QualityDimension, Severity } from '../domain/types';

/** Regras lexicais (dados). A lógica que as aplica fica em src/domain/risks.ts. */
export interface LexicalRule {
  code: string;
  pattern: RegExp;
  severity: Severity;
  dimension: QualityDimension;
  penalty: number;
  message: string;
  suggestion: string;
}

const i = 'iu';

export const BLAME_RULES: LexicalRule[] = [
  {
    code: 'accusatory_voice',
    pattern: new RegExp(
      [
        'como voc[êe] deveria',
        'voc[êe] (?:deveria|devia|precisava|tinha que|n[ãa]o (?:leu|fez|seguiu|respondeu|informou|entendeu))',
        'conforme j[áa] (?:informado|dito|comunicado|orientado|solicitado|explicado)',
        'j[áa] (?:informamos|avisamos|orientamos|dissemos|explicamos)',
        'falha humana',
        'erro d[oe] (?:usu[áa]rio|operador|cliente|analista)',
        'culpa',
        'neglig[êe]ncia',
        'descuido d[oe]',
        'problema (?:de|do|da) (?:voc[êe]s|usu[áa]rio|equipe|fornecedor)',
        'usu[áa]rio n[ãa]o (?:respondeu|retornou|seguiu|entendeu) (?:corretamente|direito|como)',
        'respondeu errado',
      ].join('|'),
      i,
    ),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 20,
    message: 'Trecho com voz acusatória ou que atribui culpa.',
    suggestion: 'Descreva o fato sem atribuir responsabilidade. Exemplo: "Para continuarmos, precisamos da informação X."',
  },
  {
    code: 'responsibility_deflection',
    pattern: new RegExp(
      'n[ãa]o [ée] (?:de nossa|da nossa) responsabilidade|n[ãa]o [ée] (?:conosco|com a gente|nosso problema)|problema nosso|n[ãa]o nos compete',
      i,
    ),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 20,
    message: 'Frase que afasta a responsabilidade, o que soa como recusa.',
    suggestion: 'Explique o motivo funcional do encaminhamento e qual será a continuidade.',
  },
  {
    code: 'passive_aggressive',
    pattern: new RegExp(
      'mais uma vez|pela [\\p{L}]+ vez|desta vez|como [ée] do seu conhecimento|favor ler|leia com aten[çc][ãa]o|como falei|conforme dito anteriormente|n[ãa]o sei se voc[êe] (?:entendeu|leu)',
      i,
    ),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 15,
    message: 'Expressão que pode soar passivo-agressiva.',
    suggestion: 'Retome a informação de forma neutra, sem referência a falhas anteriores.',
  },
  {
    code: 'condescending_tone',
    pattern: new RegExp(
      [
        'todo mundo sabe',
        'como (?:todos|qualquer um|qualquer pessoa) sabe',
        'qualquer (?:pessoa|um|usu[áa]rio) (?:sabe|consegue|entende)',
        '(?<![\\p{L}\\p{N}])[ée] s[óo] (?:voc[êe] )?(?:clicar|fazer|seguir|abrir|digitar|apertar|ligar|reiniciar|instalar)',
        '\\bsimplesmente (?:clique|fa[çc]a|siga|abra|digite|reinicie|instale)',
        '(?<!n[ãa]o )\\bbasta (?:voc[êe] )?(?:clicar|fazer|seguir|abrir|digitar|reiniciar|instalar)',
        '\\bat[ée] uma crian[çc]a',
      ].join('|'),
      i,
    ),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 12,
    message: 'Trecho que pode soar condescendente, como se a tarefa fosse trivial.',
    suggestion: 'Descreva o passo de forma neutra. Exemplo: "Para resolver, reinicie o computador e informe se o erro persiste."',
  },
  {
    code: 'pressure_language',
    pattern: new RegExp(
      [
        '\\bvoc[êe] (?:tem que|precisa obrigatoriamente)',
        '(?<![\\p{L}\\p{N}])[ée] (?:sua|de sua) (?:obriga[çc][ãa]o|responsabilidade)',
        '\\bexigimos\\b',
        '\\bdeterminamos que\\b',
        '\\bobrigatoriamente\\b',
        '\\bn[ãa]o (?:aceitamos|toleramos|admitimos)',
        '\\bsob (?:nenhuma )?hip[óo]tese',
        '\\bsem (?:demora|desculpas)',
        '\\ba qualquer custo',
      ].join('|'),
      i,
    ),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 15,
    message: 'Linguagem de pressão ou de ordem, que tende a gerar resistência.',
    suggestion: 'Explique o motivo e o que a pessoa precisa fazer, usando "por favor" e, se houver, o prazo informado no campo próprio.',
  },
  {
    code: 'hostile_language',
    pattern: new RegExp('rid[íi]culo|absurdo|idiota|burro|incompetente|in[úu]til|palha[çc]ada|desrespeito|inaceit[áa]vel', i),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 30,
    message: 'Linguagem hostil ou depreciativa.',
    suggestion: 'Reescreva em tom neutro e objetivo.',
  },
];

export const STYLE_RULES: LexicalRule[] = [
  {
    code: 'cold_closing',
    pattern: new RegExp('\\bsem mais\\b|vimos por meio desta|venho por meio desta|outrossim|destarte|supracitad[oa]', i),
    severity: 'info',
    dimension: 'cordiality',
    penalty: 5,
    message: 'Expressão excessivamente burocrática.',
    suggestion: 'Prefira frases diretas, como "Aguardamos o seu retorno".',
  },
  {
    code: 'informal_language',
    pattern: new RegExp('\\b(?:blz|vlw|tmj|valeu|fala a[ií]|kkk+|rsrs+|haha+|t[áa] bom|n[ée]\\?|beleza\\?)\\b', i),
    severity: 'warning',
    dimension: 'cordiality',
    penalty: 10,
    message: 'Linguagem informal demais para um registro profissional.',
    suggestion: 'Use um tom cordial e profissional.',
  },
  {
    code: 'vague_deadline_phrase',
    pattern: new RegExp(
      'o quanto antes|assim que poss[íi]vel|em breve|\\blogo\\b(?! (?:ap[óo]s|que|abaixo|acima))|nos pr[óo]ximos dias|nas pr[óo]ximas horas|com a maior brevidade',
      i,
    ),
    severity: 'warning',
    dimension: 'clarity',
    penalty: 12,
    message: 'Prazo implícito ou vago, sem data ou período informado.',
    suggestion: 'Informe um prazo explícito no campo "Prazo" ou remova a expressão.',
  },
];

/** Prazos concretos que só podem aparecer se tiverem sido informados no campo de prazo. */
export const CONCRETE_TIME_PATTERN = new RegExp(
  'amanh[ãa]|ainda hoje|hoje mesmo|at[ée] hoje|at[ée] o (?:fim|final) do dia|ainda esta semana|na pr[óo]xima semana|em at[ée] \\d+\\s*(?:hora|minuto|dia|semana)s?(?:\\s+[úu]teis)?|dentro de \\d+\\s*(?:hora|minuto|dia|semana)s?|em \\d+\\s*(?:hora|minuto|dia|semana)s?(?:\\s+[úu]teis)?',
  i,
);

export const PROMISE_RULES: LexicalRule[] = [
  {
    code: 'unfounded_promise',
    pattern: new RegExp(
      '\\bgarantimos\\b|\\bgarantido\\b|\\bprometemos\\b|\\bsem falta\\b|\\b100\\s?%|\\bresolveremos\\b|\\bser[áa] (?:resolvid|solucionad|corrigid)\\w*|\\bficar[áa] (?:pronto|resolvido|normalizado)\\b|com certeza (?:ser[áa]|vai|ficar[áa])',
      i,
    ),
    severity: 'warning',
    dimension: 'safety',
    penalty: 20,
    message: 'Promessa de resultado sem base no contexto informado.',
    suggestion: 'Prefira "seguimos com a análise" ou descreva apenas o próximo passo concreto.',
  },
  {
    code: 'implicit_commitment',
    pattern: new RegExp(
      [
        '\\bvamos (?:resolver|corrigir|solucionar|normalizar|consertar)\\b',
        '\\bvai (?:voltar ao normal|funcionar|ficar (?:tudo )?(?:bem|normal|certo|resolvido))',
        '\\b(?:n[ãa]o|nunca) (?:vai|ir[áa]) (?:mais )?(?:ocorrer|acontecer|se repetir|voltar a (?:ocorrer|acontecer))',
        '\\b(?:n[ãa]o|nunca) (?:ocorrer[áa]|acontecer[áa]) (?:mais|novamente|de novo)',
        '\\bnunca mais\\b',
        'n[ãa]o se repetir[áa]',
        '\\b(?:fique|pode ficar|podem ficar) tranquil[oa]s?\\b',
        // Só garantias futuras ou enfáticas: o relato de algo que já aconteceu ("realizamos a manutenção sem impacto") não alerta.
        '\\b(?:ser[áa]|ficar[áa]|vai ser|vai ficar)(?: \\p{L}+){0,2} sem (?:nenhum |qualquer )?(?:impacto|risco|custo adicional|perda de dados)',
        '\\bsem (?:nenhum|qualquer) (?:impacto|risco|custo adicional|perda de dados)',
        'n[ãa]o haver[áa] (?:novos? )?(?:problemas|impacto|indisponibilidade|falhas|perda)',
        '\\bser[áa] priorizad\\w*',
        'prioridade (?:m[áa]xima|total|absoluta)',
        'tratad[oa]s? com prioridade',
      ].join('|'),
      i,
    ),
    severity: 'warning',
    dimension: 'safety',
    penalty: 15,
    message: 'Compromisso ou garantia implícita que o contexto informado não sustenta.',
    suggestion:
      'Descreva apenas o que foi feito e o próximo passo concreto. Se houver compromisso real, registre-o no campo próprio, como o prazo informado.',
  },
];

export const CERTAINTY_RULES: LexicalRule[] = [
  {
    code: 'undue_certainty',
    pattern: new RegExp('\\bcertamente\\b|\\bcom certeza\\b|\\bsem d[úu]vida\\b|\\bdefinitivamente\\b|\\bcomprovadamente\\b|\\bobviamente\\b|\\bevidentemente\\b', i),
    severity: 'info',
    dimension: 'safety',
    penalty: 6,
    message: 'Afirmação com certeza que o contexto pode não sustentar.',
    suggestion: 'Descreva o que foi observado e, se houver, a evidência.',
  },
];

export const ROOT_CAUSE_PATTERN = new RegExp('causa raiz|a causa (?:foi|[ée]|era)|o problema (?:foi|[ée]) causado|causado por', i);

export const RESOLUTION_CLAIM_PATTERN = new RegExp(
  '(?:foi|est[áa]|ficou|foram) (?:resolvid|solucionad|corrigid|normalizad|sanad)\\w*|\\bresolvemos\\b|\\bsolucionamos\\b|problema resolvido|situa[çc][ãa]o (?:resolvida|solucionada|normalizada)',
  i,
);

export const CLOSURE_THREAT_PATTERN = new RegExp(
  'caso n[ãa]o (?:responda|retorne|se manifeste)|se n[ãa]o (?:houver|retornar|responder|se manifestar)|sob pena|ser[áa] encerrad|encerraremos|ser[áa] cancelad|ser[áa] fechad',
  i,
);

export const HEDGE_PATTERN = new RegExp('\\btalvez\\b|\\bpossivelmente\\b|\\baparentemente\\b|\\bparece\\b|\\bacredito\\b|\\btentativa\\b|\\borientad[oa]\\b|\\bprovavelmente\\b', i);

export const NEGATIVE_RESULT_PATTERN = new RegExp(
  'n[ãa]o (?:resolveu|funcionou|solucionou|foi (?:resolvid|solucionad))\\w*|sem sucesso|\\bpersiste\\b|\\bpersistiu\\b|continua (?:com|apresentando|ocorrendo|igual|sem|travando|falhando|lent[oa])|(?:erro|problema|falha|lentid[ãa]o|travamento)s? (?:ainda )?(?:continua|continuam|segue|seguem|se repete)\\b|ainda (?:ocorre|persiste|apresenta|n[ãa]o)|permanece (?:o|a|com)',
  i,
);

export const CLOSURE_INCONSISTENT_PATTERN = new RegExp('\\baguardando\\b|\\bpendente\\b|\\bpend[êe]ncia\\b|ainda n[ãa]o|persiste|em andamento', i);

export const SILENCE_AS_SOLUTION_PATTERN = new RegExp('presumimos|presume-se|entendemos que (?:foi|est[áa]) (?:resolvid|solucionad)\\w*|sil[êe]ncio|considerad[oa] (?:como )?(?:resolvid|solucionad)\\w*', i);

export const ASK_CREDENTIALS_PATTERN = new RegExp(
  '\\b(?:informe|envie|passe|compartilhe|forne[çc]a|digite|mande|encaminhe|poderia (?:nos )?(?:informar|enviar|passar)|pode (?:nos )?(?:informar|enviar|passar))\\b[^.?!\\n]{0,40}\\b(?:senha|token|chave|c[óo]digo (?:de (?:acesso|verifica[çc][ãa]o|autentica[çc][ãa]o)|mfa)|credenciais?)\\b|\\bqual (?:[ée] )?(?:a )?(?:sua |a )?senha\\b',
  i,
);

export const ASK_PERSONAL_DATA_PATTERN = new RegExp(
  '\\b(?:informe|envie|passe|compartilhe|forne[çc]a|digite|mande|encaminhe|poderia (?:nos )?(?:informar|enviar|passar)|pode (?:nos )?(?:informar|enviar|passar))\\b[^.?!\\n]{0,40}\\b(?:cpf|rg|cnpj|n[úu]mero do cart[ãa]o|dados banc[áa]rios|data de nascimento)\\b',
  i,
);

export const VAGUE_QUESTION_PATTERNS: RegExp[] = [
  /^(?:pode|poderia)\s+(?:me\s+|nos\s+)?(?:dar|passar|enviar|fornecer)\s+(?:mais\s+)?(?:detalhes|informa[çc][õo]es)/iu,
  /^qual\s+(?:[ée]\s+)?o\s+problema\s*\??$/iu,
  /^o\s+que\s+(?:aconteceu|houve|est[áa]\s+acontecendo)\s*\??$/iu,
  /explicar\s+melhor/iu,
  /\bmais\s+(?:detalhes|informa[çc][õo]es)\b/iu,
  /^(?:como|por\s+que)\s*\??$/iu,
];

export const GREETING_PATTERN = /^(?:ol[áa]|prezad|bom dia|boa tarde|boa noite|caro|cara|oi)\b/iu;
export const COURTESY_PATTERN = /por favor|obrigad|agradec|cordial|atenciosamente|aguardamos|à disposi[çc][ãa]o|estamos [àa] disposi/iu;
export const SOLUTION_MARKER_PATTERN = /resolvid|solucionad|normalizad|funcionando|restabelecid|conclu[íi]d|corrigid|sanad/iu;

export const URGENT_PATTERN = /\burgente\b|\burg[êe]ncia\b/iu;
export const URGENT_JUSTIFICATION_PATTERN = /\b(?:pois|porque|devido|em raz[ãa]o|impacta|impacto|afeta|paralis|prazo)\b/iu;

export const JARGON_TERMS = [
  'cache', 'kernel', 'stack trace', 'payload', 'handshake', 'timeout', 'latência', 'throughput', 'deadlock',
  'rollback', 'endpoint', 'socket', 'hash', 'traceroute', 'ping', 'dns', 'dhcp', 'tcp', 'ldap', 'kerberos', 'gpo',
  'vlan', 'nat', 'mtu', 'ttl', 'sso', 'saml', 'oauth', 'registry', 'daemon', 'thread',
];

export const DEFAULT_KNOWN_ACRONYMS = [
  'TI', 'PDF', 'USB', 'PC', 'SMS', 'CPF', 'CNPJ', 'CEP', 'RH', 'OK', 'ID', 'URL', 'WIFI', 'HD', 'SSD', 'RAM', 'CPU', 'EDGE',
];

/** Siglas em caixa alta de 2 a 6 letras. Palavras comuns em caixa alta são tratadas à parte (ênfase). */
export const ACRONYM_PATTERN = /(?<![\p{L}\p{N}])[A-ZÀ-Ú]{2,6}(?![\p{L}\p{N}])/gu;
