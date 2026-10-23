"""Estudo: dá para sugerir o texto padrão da instituição a partir do que o analista digita, só com contagem de trechos de letras?
Biblioteca fictícia de 16 modelos; 64 consultas de como o analista escreveria (4 por modelo, com variação) e 16 consultas fora da biblioteca.
Mede acerto no 1º, nos 3 primeiros e o efeito de um limiar (abster quando a semelhança é baixa). Autor único: indica, não prova."""
import json, re, sys, unicodedata
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

MODELOS = {
 'pedir_print': 'Para analisarmos o erro, envie uma captura de tela com a mensagem completa e informe o horário em que ocorreu.',
 'reset_senha': 'Realizamos a redefinição da sua senha. Use a senha temporária enviada por mensagem direta e troque no primeiro acesso.',
 'vpn_reinstalar': 'Para restabelecer o acesso remoto, desconecte da VPN, reinicie o computador e conecte novamente. Se persistir, informe o código do erro.',
 'sem_retorno_1': 'Entramos em contato e ainda não recebemos retorno. Se o problema persistir, responda este chamado com as informações solicitadas.',
 'encerrar_sem_retorno': 'Como não houve retorno após as tentativas de contato, o chamado será encerrado. Se precisar, reabra respondendo este chamado.',
 'encerrar_resolvido': 'Confirmamos a solução com você e estamos encerrando este chamado. Se precisar de apoio novamente, entre em contato conosco.',
 'impressora_driver': 'Reinstalamos o driver da impressora e imprimimos uma página de teste com sucesso. Confirme se a impressão está normal.',
 'acesso_pasta': 'Para liberar o acesso à pasta de rede, precisamos do De acordo do gestor da área e do caminho completo da pasta.',
 'aprovacao_software': 'Solicitamos o De acordo para a instalação do software no equipamento informado, conforme a política de software da instituição.',
 'lentidao_notebook': 'Para investigar a lentidão, informe desde quando ocorre, quais programas estavam abertos e se o problema aparece em outro computador.',
 'email_caixa_cheia': 'A caixa de e-mail atingiu o limite. Arquive ou exclua mensagens antigas e esvazie a pasta de itens excluídos para liberar espaço.',
 'wifi_corporativo': 'Para conectar ao Wi-Fi corporativo, esqueça a rede, selecione novamente e entre com seu usuário e senha de rede.',
 'escalar_infra': 'Encaminhamos o chamado para a equipe de infraestrutura, pois a análise exige acesso administrativo ao servidor.',
 'agendar_visita': 'Para a visita técnica, confirme o melhor horário e informe a localização do equipamento, com andar e sala.',
 'perfil_outlook': 'Reparamos o perfil do Outlook e limpamos o cache. Reinicie o aplicativo e confirme se os anexos abrem normalmente.',
 'monitor_sem_imagem': 'Verifique se o cabo de vídeo está bem conectado nas duas pontas e teste outra entrada do monitor. Se não houver imagem, informe o modelo.',
}
CONSULTAS = {
 'pedir_print': ['pedir print do erro', 'preciso da captura de tela com a mensagem e o horario', 'manda um print da tela com o erro pra gente analisar', 'solicitar imagem do erro e a hora que aconteceu'],
 'reset_senha': ['resetei a senha do usuario', 'senha redefinida, mandei a temporaria', 'reset de senha concluido, trocar no primeiro acesso', 'liberei nova senha provisoria'],
 'vpn_reinstalar': ['vpn nao conecta, reiniciar e tentar de novo', 'orientar a desconectar da vpn e reiniciar o pc', 'acesso remoto caiu, pedir pra reconectar a vpn', 'problema de vpn pedir codigo do erro'],
 'sem_retorno_1': ['usuario nao respondeu ainda', 'cobrar retorno do usuario sobre o chamado', 'sem resposta, pedir que responda com as informacoes', 'ja liguei e nao tive retorno'],
 'encerrar_sem_retorno': ['encerrar chamado por falta de retorno', 'sem retorno apos varias tentativas, vou fechar', 'chamado fechado porque o usuario nao respondeu', 'encerramento por ausencia de resposta, pode reabrir'],
 'encerrar_resolvido': ['chamado resolvido, encerrando', 'solucao confirmada com o usuario, fechar', 'problema resolvido e confirmado, encerrar o atendimento', 'finalizar chamado solucionado'],
 'impressora_driver': ['reinstalei o driver da impressora', 'impressora voltou a imprimir apos driver novo', 'driver reinstalado, pagina de teste ok', 'impressao normalizada depois de reinstalar o driver'],
 'acesso_pasta': ['liberar acesso a pasta de rede', 'precisa do de acordo do gestor para a pasta', 'pasta compartilhada sem acesso, pedir caminho e aprovacao', 'solicitar autorizacao do gestor para acesso a pasta'],
 'aprovacao_software': ['pedir de acordo para instalar software', 'instalacao de programa precisa de aprovacao do gestor', 'solicito autorizacao para instalar o software na maquina', 'aprovacao de software conforme politica'],
 'lentidao_notebook': ['notebook lento, perguntar desde quando', 'computador devagar, quais programas abertos', 'lentidao: pedir se acontece em outra maquina tambem', 'investigar lentidao do computador'],
 'email_caixa_cheia': ['caixa de email cheia', 'limite do e-mail atingido, orientar a arquivar', 'orientar esvaziar itens excluidos para liberar espaco no email', 'email sem espaco'],
 'wifi_corporativo': ['wifi corporativo nao conecta', 'orientar esquecer a rede wi-fi e conectar de novo', 'problema no wifi da empresa, usar usuario e senha de rede', 'reconectar na rede sem fio corporativa'],
 'escalar_infra': ['encaminhar para a infraestrutura', 'escalar chamado para infra, precisa de acesso no servidor', 'redirecionar para equipe de infra', 'passar o caso a infraestrutura'],
 'agendar_visita': ['agendar visita tecnica', 'combinar horario da visita e local do equipamento', 'visita no local, pedir andar e sala', 'marcar atendimento presencial'],
 'perfil_outlook': ['reparei o perfil do outlook', 'outlook travando anexo, limpei o cache', 'perfil do outlook refeito, pedir pra reabrir', 'anexos do outlook nao abrem, reparo concluido'],
 'monitor_sem_imagem': ['monitor sem imagem', 'verificar cabo de video e testar outra entrada', 'tela preta, conferir conexao do cabo do monitor', 'sem video no monitor'],
}
FORA = ['pedir desculpas pela demora no atendimento', 'convite para treinamento de segurança da informação', 'atualizar o cadastro do usuário no sistema de rh', 'solicitar compra de teclado novo', 'informar manutenção programada do servidor no sábado', 'trocar o ramal do setor financeiro', 'renovar certificado digital do portal', 'abrir chamado para o fornecedor da internet', 'pedir nota fiscal do toner', 'liberar acesso ao prédio para o técnico', 'configurar assinatura de email com novo logotipo', 'backup do notebook antes da formatação', 'agradecer o retorno do usuário', 'solicitar troca de bateria do nobreak', 'orientar sobre mudança de política de senhas', 'cadastrar novo colaborador no domínio']

def strip(s): return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')
chaves = list(MODELOS)
def avaliar(nome, vec):
    M = vec.fit_transform([strip(MODELOS[k]) for k in chaves])
    def rank(q): s = cosine_similarity(vec.transform([strip(q)]), M)[0]; o = s.argsort()[::-1]; return [(chaves[i], float(s[i])) for i in o]
    dentro = [(k, q, rank(q)) for k, qs in CONSULTAS.items() for q in qs]
    top1 = sum(r[0][0] == k for k, _, r in dentro) / len(dentro)
    top3 = sum(k in [c for c, _ in r[:3]] for k, _, r in dentro) / len(dentro)
    fora = [rank(q) for q in FORA]
    linhas = [f'{nome}: top1 {top1:.0%}, top3 {top3:.0%} (n={len(dentro)})']
    for lim in (0.0, 0.10, 0.15, 0.20, 0.25):
        sug = [(k, r) for k, _, r in dentro if r[0][1] >= lim]
        certas = sum(r[0][0] == k for k, r in sug)
        erradas = len(sug) - certas
        fp_fora = sum(r[0][1] >= lim for r in fora)
        linhas.append(f'   limiar {lim:.2f}: sugere em {len(sug)/len(dentro):.0%} das consultas; entre as sugeridas {certas/max(1,len(sug)):.0%} certas ({erradas} erradas); sugere algo em {fp_fora}/{len(FORA)} consultas fora da biblioteca')
    return linhas, dentro, vec
for nome, vec in (('letras 2-5 (char_wb)', TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), sublinear_tf=True)),
                  ('palavras 1-2', TfidfVectorizer(analyzer='word', ngram_range=(1, 2), sublinear_tf=True))):
    l, dentro, _ = avaliar(nome, vec); print('\n'.join(l))
# erros do melhor
l, dentro, vec = avaliar('x', TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), sublinear_tf=True))
print('\nTop1 errados (letras 2-5):')
for k, q, r in dentro:
    if r[0][0] != k: print(f'  "{q}" esperado {k}, veio {r[0][0]} ({r[0][1]:.2f}); esperado em {[c for c,_ in r].index(k)+1}º')
