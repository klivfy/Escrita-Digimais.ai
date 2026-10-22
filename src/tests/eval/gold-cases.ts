import { DEFAULT_PROFILE } from '../../config/language-profile';
import type { GoldCase } from './naturalness';

/**
 * Conjunto de referência FICTÍCIO. Cada caso traz o contexto informado ao motor e o texto que um analista experiente
 * escreveria à mão. Os textos humanos foram escritos pelo assistente, no estilo esperado; troque ou acrescente casos
 * reais anonimizados fora do repositório (docs/AVALIACAO-NATURALIDADE.md, seção "Casos reais").
 */
export const GOLD_CASES: GoldCase[] = [
  {
    id: 'vpn-andamento',
    type: 'progress_update',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'Maria',
      summary: 'usuário sem acesso à VPN desde ontem',
      actions: ['resetei a senha no AD', 'testei conexão com a conta dele', 'Planejado: validar com o usuário amanhã'],
      observedResult: 'conexão ok no meu teste',
      pendingItem: 'aguardando teste do usuário',
    },
    human:
      'Olá, Maria,\n\nSeguem novidades sobre o seu acesso à VPN. Redefinimos a sua senha no AD e testamos a conexão com a sua conta: no nosso teste, a conexão funcionou normalmente. Agora precisamos do seu teste. Amanhã validamos o resultado com você.\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
  },
  {
    id: 'outlook-confirmacao',
    type: 'solution_confirmation',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'João',
      summary: 'Outlook travando ao abrir anexos',
      actions: ['reparei o perfil do Outlook', 'limpei o cache'],
      observedResult: 'anexos abrindo normalmente',
    },
    human:
      'Olá, João,\n\nReparamos o seu perfil do Outlook e limpamos o cache. Nos nossos testes, os anexos passaram a abrir normalmente. Você pode confirmar se a situação foi resolvida por aí?\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
  },
  {
    id: 'planilha-informacoes',
    type: 'request_information',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'Ana',
      summary: 'erro ao abrir a planilha de custos',
      questions: ['qual mensagem de erro aparece na tela', 'o erro ocorre com outros arquivos'],
      explicitDeadline: '20/10/2026 às 17h',
    },
    human:
      'Olá, Ana,\n\nPara continuar a análise do erro ao abrir a planilha de custos, precisamos de duas informações suas:\n\n1. Qual mensagem de erro aparece na tela?\n2. O erro ocorre com outros arquivos?\n\nSe puder responder até 20/10/2026 às 17h, conseguimos seguir com a análise.\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
  },
  {
    id: 'arquivo-pendencia',
    type: 'pending',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'Carlos',
      pendingItem: 'aguardando o envio da planilha corrigida',
      expectedAction: 'enviar o arquivo atualizado',
    },
    human:
      'Olá, Carlos,\n\nSeu atendimento segue pendente: aguardamos o envio da planilha corrigida. Assim que você enviar o arquivo atualizado, retomamos o atendimento.\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
  },
  {
    id: 'impressora-encerramento',
    type: 'closure_resolved',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'Paula',
      summary: 'impressora não imprimia',
      actions: ['reinstalei o driver da impressora'],
      observedResult: 'página de teste impressa e confirmada',
      userConfirmation: 'yes',
    },
    human:
      'Olá, Paula,\n\nEstamos encerrando o seu chamado. Reinstalamos o driver da impressora e a página de teste foi impressa e confirmada, e você também confirmou que a situação foi solucionada. Se precisar de apoio novamente, é só entrar em contato conosco.\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
  },
  {
    id: 'software-aprovacao',
    type: 'manager_approval',
    settings: { recipient: 'manager', techLevel: 'balanced', formality: 'formal' },
    context: {
      requesterName: 'Roberto',
      approvalObject: 'instalação do software de modelagem no equipamento patrimonial 00123',
      summary: 'necessário para o fechamento mensal',
      approvalEffect: 'a instalação será agendada',
    },
    human:
      'Prezado(a) Roberto,\n\nSolicitamos o seu "De acordo" para a instalação do software de modelagem no equipamento patrimonial 00123, necessária para o fechamento mensal. Com a aprovação, a instalação será agendada. Pedimos que responda com "De acordo" ou "Não aprovado".\n\nAtenciosamente,\nEquipe de Service Desk',
  },
  {
    id: 'armazenamento-encaminhamento',
    type: 'redirect_or_escalate',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'Lucia',
      destinationTeam: 'Equipe de Infraestrutura',
      escalationReason: 'a análise exige acesso administrativo ao armazenamento',
      actions: ['validei as permissões do usuário'],
    },
    human:
      'Olá, Lucia,\n\nValidamos as suas permissões, e a análise agora exige acesso administrativo ao armazenamento. Por isso encaminhamos o seu chamado para a Equipe de Infraestrutura, que dará continuidade ao atendimento.\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
  },
  {
    id: 'pasta-sem-retorno',
    type: 'closure_no_response',
    settings: { recipient: 'user', techLevel: 'simple', formality: 'cordial' },
    context: {
      requesterName: 'Marta',
      summary: 'solicitação de acesso à pasta compartilhada',
      pendingItem: 'confirmação do nome da pasta',
      contactAttempts: ['01/10/2026', '05/10/2026', '08/10/2026'],
      priorNoticeDate: '09/10/2026',
    },
    human:
      'Olá, Marta,\n\nNão recebemos retorno às nossas tentativas de contato sobre a sua solicitação de acesso à pasta compartilhada. Tentamos em 01/10/2026, 05/10/2026 e 08/10/2026, e avisamos do encerramento em 09/10/2026. Estamos encerrando o chamado, mas isso não significa que a situação foi resolvida. Se ainda precisar do acesso, entre em contato conosco e informe o nome da pasta.\n\nAgradecemos a colaboração.\nEquipe de Service Desk',
    profile: { closureRules: { ...DEFAULT_PROFILE.closureRules, noResponseEnabled: true } },
  },
];
