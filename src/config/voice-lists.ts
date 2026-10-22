/**
 * Listas fechadas da voz da equipe e da voz para o destinatário. Só estas formas são convertidas; para acrescentar uma,
 * inclua o item aqui e um teste em `src/tests/natural-style.test.ts`. A lógica fica em `domain/voice.ts`.
 */

/** Primeira pessoa do singular (pretérito) para a do plural. Lista fechada, sem acento nas chaves. */
export const PAST_FIRST_PERSON: Record<string, string> = {
  resetei: 'resetamos', testei: 'testamos', reparei: 'reparamos', limpei: 'limpamos', reinstalei: 'reinstalamos',
  instalei: 'instalamos', validei: 'validamos', verifiquei: 'verificamos', reiniciei: 'reiniciamos',
  atualizei: 'atualizamos', configurei: 'configuramos', liberei: 'liberamos', conferi: 'conferimos',
  orientei: 'orientamos', tentei: 'tentamos', encaminhei: 'encaminhamos', abri: 'abrimos', fiz: 'fizemos',
  alterei: 'alteramos', criei: 'criamos', removi: 'removemos', habilitei: 'habilitamos', desbloqueei: 'desbloqueamos',
  ajustei: 'ajustamos', solicitei: 'solicitamos', enviei: 'enviamos', liguei: 'ligamos', analisei: 'analisamos',
  identifiquei: 'identificamos', corrigi: 'corrigimos', substitui: 'substituímos', troquei: 'trocamos',
  restaurei: 'restauramos', acessei: 'acessamos', consultei: 'consultamos', registrei: 'registramos',
  reabri: 'reabrimos', reativei: 'reativamos', reconfigurei: 'reconfiguramos', sincronizei: 'sincronizamos',
  redefini: 'redefinimos', desativei: 'desativamos', ativei: 'ativamos', movi: 'movemos', copiei: 'copiamos',
  recriei: 'recriamos', informei: 'informamos', avisei: 'avisamos', confirmei: 'confirmamos',
};

/** Particípio no início de uma ação ("Reinstalado o driver") para a forma de equipe ("Reinstalamos o driver"). */
export const PARTICIPLE_OPENERS: Record<string, string> = {
  reinstalado: 'reinstalamos', instalado: 'instalamos', validado: 'validamos', verificado: 'verificamos',
  reiniciado: 'reiniciamos', atualizado: 'atualizamos', configurado: 'configuramos', reconfigurado: 'reconfiguramos',
  testado: 'testamos', reparado: 'reparamos', liberado: 'liberamos', conferido: 'conferimos', ajustado: 'ajustamos',
  analisado: 'analisamos', identificado: 'identificamos', corrigido: 'corrigimos', restaurado: 'restauramos',
  redefinido: 'redefinimos', resetado: 'resetamos', habilitado: 'habilitamos', desbloqueado: 'desbloqueamos',
  encaminhado: 'encaminhamos', recriado: 'recriamos', sincronizado: 'sincronizamos', substituído: 'substituímos',
  removido: 'removemos', criado: 'criamos', alterado: 'alteramos', solicitado: 'solicitamos', enviado: 'enviamos',
};

export const FUTURE_FIRST_PERSON: Record<string, string> = {
  vou: 'vamos', irei: 'iremos', farei: 'faremos', verei: 'veremos', validarei: 'validaremos', testarei: 'testaremos',
  verificarei: 'verificaremos', retornarei: 'retornaremos', acompanharei: 'acompanharemos', encaminharei: 'encaminharemos',
  reiniciarei: 'reiniciaremos', atualizarei: 'atualizaremos', agendarei: 'agendaremos', contatarei: 'contataremos',
};

export const POSSESSIVES: Record<string, string> = { meu: 'nosso', minha: 'nossa', meus: 'nossos', minhas: 'nossas', comigo: 'conosco' };

export type Gender = 'm' | 'f';
export interface NounInfo {
  gender: Gender;
  plural: boolean;
}

/** Substantivos comuns de chamado, com gênero e número. Lista fechada: fora dela, o texto não é tocado. */
export const NOUNS: Record<string, NounInfo> = {
  teste: { gender: 'm', plural: false }, retorno: { gender: 'm', plural: false }, envio: { gender: 'm', plural: false },
  contato: { gender: 'm', plural: false }, arquivo: { gender: 'm', plural: false }, print: { gender: 'm', plural: false },
  acesso: { gender: 'm', plural: false }, login: { gender: 'm', plural: false }, perfil: { gender: 'm', plural: false },
  cadastro: { gender: 'm', plural: false }, computador: { gender: 'm', plural: false }, notebook: { gender: 'm', plural: false },
  equipamento: { gender: 'm', plural: false }, usuario: { gender: 'm', plural: false }, email: { gender: 'm', plural: false },
  conta: { gender: 'f', plural: false }, senha: { gender: 'f', plural: false }, resposta: { gender: 'f', plural: false },
  confirmacao: { gender: 'f', plural: false }, validacao: { gender: 'f', plural: false }, aprovacao: { gender: 'f', plural: false },
  informacao: { gender: 'f', plural: false }, planilha: { gender: 'f', plural: false }, captura: { gender: 'f', plural: false },
  maquina: { gender: 'f', plural: false }, estacao: { gender: 'f', plural: false }, conexao: { gender: 'f', plural: false },
  impressora: { gender: 'f', plural: false }, disponibilidade: { gender: 'f', plural: false },
  testes: { gender: 'm', plural: true }, arquivos: { gender: 'm', plural: true }, acessos: { gender: 'm', plural: true },
  permissoes: { gender: 'f', plural: true }, contas: { gender: 'f', plural: true }, senhas: { gender: 'f', plural: true },
  informacoes: { gender: 'f', plural: true }, respostas: { gender: 'f', plural: true },
};
