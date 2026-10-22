# Avaliação de naturalidade

Gerado por `src/tests/naturalness.test.ts` (rode `UPDATE_NATURALNESS=1 npx vitest run src/tests/naturalness.test.ts` para atualizar). Casos 100% fictícios; os textos humanos foram escritos pelo assistente, não por analistas. **Este é um piso mecânico, não a opinião de quem escreve chamados.**

## O que se mede
- **F1**: sobreposição de palavras com o texto humano (0 a 1). Mede vocabulário, não qualidade.
- **Rótulos**: quantos "Rótulo: valor" aparecem. Quanto menos, menos cara de formulário.
- **3ª pessoa**: "o usuário", "dele", "dela" em texto escrito ao próprio usuário.
- **Palavras por frase** e **tamanho** em relação ao texto humano.

## Resultado

| Caso | F1 natural | F1 estruturada | Rótulos (nat/est) | 3ª pessoa (nat/est) | Palavras/frase (nat/est) | Tamanho vs humano (nat) |
|---|---|---|---|---|---|---|
| vpn-andamento | 0.637 | 0.504 | 3/5 | 0/2 | 7.1/6.6 | 1.31 |
| outlook-confirmacao | 0.604 | 0.542 | 2/3 | 0/0 | 7.3/6.4 | 1.53 |
| planilha-informacoes | 0.688 | 0.677 | 2/2 | 0/0 | 6.6/7.2 | 1.33 |
| arquivo-pendencia | 0.658 | 0.597 | 2/3 | 0/0 | 5.9/6 | 1.62 |
| impressora-encerramento | 0.725 | 0.725 | 1/2 | 0/1 | 6/6.8 | 1.13 |
| software-aprovacao | 0.673 | 0.673 | 3/3 | 0/0 | 8/8 | 1.24 |
| armazenamento-encaminhamento | 0.69 | 0.612 | 1/1 | 0/0 | 5.8/6.7 | 1.21 |
| pasta-sem-retorno | 0.739 | 0.731 | 1/1 | 0/0 | 6.4/6.8 | 1.12 |
| **Média** | **0.677** | **0.633** | 1.875/2.5 | 0/0.375 | 6.637/6.813 | 1.311 |

## Casos reais (fora do repositório)
O repositório é público: **nunca** commite chamados reais. Para medir com casos reais, crie na raiz do projeto o arquivo `casos-reais.local.json` (ignorado pelo Git) e rode `CASOS_REAIS=1 npx vitest run src/tests/naturalness.test.ts`. Será criado `casos-reais.relatorio.local.md` (também ignorado) com texto gerado e texto humano lado a lado.

Formato do arquivo (uma lista; troque nomes, matrículas e hosts por exemplos):

```json
[
  {
    "id": "caso-1",
    "tipo": "progress_update",
    "destinatario": "user",
    "nivel": "simple",
    "formalidade": "cordial",
    "anotacao": "usuário sem acesso à VPN\nresetei a senha\nconexão ok no meu teste\naguardando teste do usuário",
    "nome": "Maria",
    "texto_humano": "Olá, Maria, ..."
  }
]
```

A anotação passa pelo rascunho livre (a mesma divisão que a tela faz) antes de gerar o texto, então o relatório também mostra como o classificador dividiu cada trecho.

## Detalhe dos casos

### vpn-andamento

Gerado (Natural):

```text
Olá, Maria,

Passamos para informar o andamento do seu chamado.

Resumo da situação: Usuário sem acesso à VPN desde ontem. Até aqui, resetamos a senha no AD e testamos conexão com a sua conta. O que observamos: Conexão ok no nosso teste.

O que ainda está pendente: Aguardamos seu teste. Em seguida, vamos validar com você amanhã.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, Maria,

Seguem novidades sobre o seu acesso à VPN. Redefinimos a sua senha no AD e testamos a conexão com a sua conta: no nosso teste, a conexão funcionou normalmente. Agora precisamos do seu teste. Amanhã validamos o resultado com você.

Agradecemos a colaboração.
Equipe de Service Desk
```

### outlook-confirmacao

Gerado (Natural):

```text
Olá, João,

Realizamos as ações descritas abaixo e gostaríamos de confirmar se a situação foi resolvida.

Resumo da situação: Outlook travando ao abrir anexos. Até aqui, reparamos o perfil do Outlook e limpamos o cache. O que observamos: Anexos abrindo normalmente.

A sua confirmação nos permitirá registrar o resultado do atendimento.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, João,

Reparamos o seu perfil do Outlook e limpamos o cache. Nos nossos testes, os anexos passaram a abrir normalmente. Você pode confirmar se a situação foi resolvida por aí?

Agradecemos a colaboração.
Equipe de Service Desk
```

### planilha-informacoes

Gerado (Natural):

```text
Olá, Ana,

Para continuarmos a análise, precisamos de algumas informações.

Contexto: Erro ao abrir a planilha de custos.

Para avançarmos, precisamos saber:
1. Qual mensagem de erro aparece na tela?
2. O erro ocorre com outros arquivos?

Prazo para retorno: 20/10/2026 às 17h

Por segurança, não envie senhas, tokens ou outros dados de acesso neste chamado.

O seu retorno permitirá que continuemos a análise.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, Ana,

Para continuar a análise do erro ao abrir a planilha de custos, precisamos de duas informações suas:

1. Qual mensagem de erro aparece na tela?
2. O erro ocorre com outros arquivos?

Se puder responder até 20/10/2026 às 17h, conseguimos seguir com a análise.

Agradecemos a colaboração.
Equipe de Service Desk
```

### arquivo-pendencia

Gerado (Natural):

```text
Olá, Carlos,

O atendimento permanece pendente. Seguem os detalhes.

O que ainda está pendente: Aguardando o envio da planilha corrigida. O que precisamos de você: Enviar o arquivo atualizado.

Aguardamos a conclusão do item acima para seguirmos com o atendimento.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, Carlos,

Seu atendimento segue pendente: aguardamos o envio da planilha corrigida. Assim que você enviar o arquivo atualizado, retomamos o atendimento.

Agradecemos a colaboração.
Equipe de Service Desk
```

### impressora-encerramento

Gerado (Natural):

```text
Olá, Paula,

Estamos encerrando este chamado com a situação solucionada, conforme descrito abaixo.

Resumo da situação: Impressora não imprimia. Até aqui, reinstalamos o driver da impressora. Resultado validado: Página de teste impressa e confirmada.

Você confirmou a solução.

Se precisar de apoio novamente, entre em contato conosco.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, Paula,

Estamos encerrando o seu chamado. Reinstalamos o driver da impressora e a página de teste foi impressa e confirmada, e você também confirmou que a situação foi solucionada. Se precisar de apoio novamente, é só entrar em contato conosco.

Agradecemos a colaboração.
Equipe de Service Desk
```

### software-aprovacao

Gerado (Natural):

```text
Prezado(a) gestor(a),

Solicitamos a sua manifestação formal quanto ao item descrito abaixo.

Objeto da aprovação: Instalação do software de modelagem no equipamento patrimonial 00123.

Justificativa: Necessário para o fechamento mensal.

Efeito da aprovação: A instalação será agendada.

Solicitamos que a manifestação seja registrada como “De acordo” ou “Não aprovado”.

Atenciosamente,
Equipe de Service Desk
```

Texto humano de referência:

```text
Prezado(a) Roberto,

Solicitamos o seu "De acordo" para a instalação do software de modelagem no equipamento patrimonial 00123, necessária para o fechamento mensal. Com a aprovação, a instalação será agendada. Pedimos que responda com "De acordo" ou "Não aprovado".

Atenciosamente,
Equipe de Service Desk
```

### armazenamento-encaminhamento

Gerado (Natural):

```text
Olá, Lucia,

Para que a análise tenha continuidade, estamos encaminhando este atendimento. Destino: Equipe de Infraestrutura.

Motivo do encaminhamento: A análise exige acesso administrativo ao armazenamento.

Até aqui, validamos as suas permissões.

O atendimento seguirá com a equipe indicada.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, Lucia,

Validamos as suas permissões, e a análise agora exige acesso administrativo ao armazenamento. Por isso encaminhamos o seu chamado para a Equipe de Infraestrutura, que dará continuidade ao atendimento.

Agradecemos a colaboração.
Equipe de Service Desk
```

### pasta-sem-retorno

Gerado (Natural):

```text
Olá, Marta,

Estamos encerrando este chamado porque não recebemos retorno às tentativas de contato registradas abaixo.

Solicitação do atendimento: Solicitação de acesso à pasta compartilhada.

Informação aguardada: Confirmação do nome da pasta.

Datas em que tentamos contato:
1. 01/10/2026
2. 05/10/2026
3. 08/10/2026

Aviso prévio de encerramento registrado em 09/10/2026.

Este encerramento não indica que a situação foi resolvida.

Se precisar de apoio novamente, entre em contato conosco.

Agradecemos a colaboração.
Equipe de Service Desk
```

Texto humano de referência:

```text
Olá, Marta,

Não recebemos retorno às nossas tentativas de contato sobre a sua solicitação de acesso à pasta compartilhada. Tentamos em 01/10/2026, 05/10/2026 e 08/10/2026, e avisamos do encerramento em 09/10/2026. Estamos encerrando o chamado, mas isso não significa que a situação foi resolvida. Se ainda precisar do acesso, entre em contato conosco e informe o nome da pasta.

Agradecemos a colaboração.
Equipe de Service Desk
```
