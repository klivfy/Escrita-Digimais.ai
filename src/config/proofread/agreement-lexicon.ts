/**
 * Léxico de substantivos de chamado (gênero) para as regras de concordância da camada 2. Lista fechada: palavra fora dela
 * nunca gera sugestão. O plural é deduzido pela terminação. Acrescente só palavras comuns e sem ambiguidade de gênero.
 */
export const MASCULINE_NOUNS: readonly string[] = [
  'usuário', 'técnico', 'analista', 'gestor', 'chamado', 'erro', 'problema', 'acesso', 'arquivo', 'computador',
  'notebook', 'equipamento', 'servidor', 'sistema', 'aplicativo', 'programa', 'driver', 'cabo', 'teste', 'retorno',
  'envio', 'perfil', 'cadastro', 'e-mail', 'anexo', 'caso', 'incidente', 'serviço', 'prazo', 'horário', 'patrimônio',
  'monitor', 'mouse', 'teclado', 'switch', 'roteador', 'firewall', 'proxy', 'log', 'backup', 'relato', 'pedido',
  'resultado', 'cliente', 'colaborador', 'setor', 'departamento', 'contrato', 'ramal', 'token', 'certificado',
  'navegador', 'pacote', 'instalador', 'antivírus', 'disco', 'link', 'portal', 'print', 'documento', 'relatório',
  'fornecedor', 'suporte', 'treinamento', 'resumo', 'texto', 'campo', 'botão', 'menu', 'painel', 'formulário',
  'status',
];

export const FEMININE_NOUNS: readonly string[] = [
  'impressora', 'senha', 'conta', 'planilha', 'máquina', 'estação', 'conexão', 'rede', 'pasta', 'tela', 'mensagem',
  'solicitação', 'permissão', 'atualização', 'instalação', 'configuração', 'licença', 'falha', 'queda', 'lentidão',
  'equipe', 'infraestrutura', 'área', 'fila', 'diretoria', 'gerência', 'aprovação', 'validação', 'confirmação',
  'informação', 'resposta', 'captura', 'versão', 'política', 'manutenção', 'peça', 'garantia', 'câmera', 'impressão',
  'autenticação', 'ocorrência', 'pendência', 'causa', 'solução', 'tarefa', 'reunião', 'sala', 'caixa', 'mídia',
];

/** Nomes de pessoa: têm forma masculina e feminina, então a regra de gênero não mexe neles (o erro pode estar no nome, não no artigo). */
export const PERSON_NOUNS: readonly string[] = ['usuário', 'técnico', 'analista', 'gestor', 'cliente', 'colaborador', 'fornecedor'];
