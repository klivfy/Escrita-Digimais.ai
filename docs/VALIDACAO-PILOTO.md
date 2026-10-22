# Validação e piloto

Roteiro para quem valida a extensão antes e durante o piloto. Cada etapa diz o que fazer, o que esperar e onde registrar. Nada aqui exige enviar dados para fora do navegador.

## 1. Instalação no Edge (15 minutos)
1. Obtenha o `.zip` da release e confira o SHA-256 com o valor registrado na release (`sha256sum arquivo.zip` no Linux ou macOS; `Get-FileHash arquivo.zip` no PowerShell).
2. Extraia o `.zip` em uma pasta própria.
3. Abra `edge://extensions`, ative "Modo de desenvolvedor" e escolha "Carregar sem compactação", selecionando a pasta extraída (a que contém `manifest.json`).
4. Confirme que a extensão pede apenas as permissões `sidePanel` e `storage`.
5. Clique no ícone: o painel lateral abre com o título "Assistente de Textos do Service Desk".

Fluxo completo, com o resultado esperado:

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Tipo "Solicitar informações", preencha contexto e duas perguntas | Gerar prévia habilitado |
| 2 | Gerar prévia | Texto numerado, sem alerta de bloqueio |
| 3 | Colar um e-mail fictício no contexto | Aviso de dado mascarado, com opção de substituir e desfazer |
| 4 | Colar um valor com cara de senha (fictício) | Bloqueio da geração e da cópia, sem exibir o valor |
| 5 | "Outra variação" | Texto diferente, mesmo conteúdo |
| 6 | Copiar texto | Texto na área de transferência; pergunta se deseja limpar |
| 7 | "Mais ações", "Limpar formulário e prévia", "Desfazer limpeza" | Conteúdo some e volta |
| 8 | "Revisar texto pronto", cole um texto, "Revisar agora" | Alertas e indicadores |
| 9 | Configurações, importar perfil e camada da equipe (se houver) | Mensagem de validação |
| 10 | Fechar e reabrir o painel | Nenhum conteúdo de chamado permanece |
| 11 | "Colar uma anotação livre", cole 4 a 6 frases curtas, "Dividir em campos" | Lista de trechos com o campo sugerido; nada preenchido ainda |
| 12 | Mude o campo de um trecho e clique em "Preencher o formulário" | Campos preenchidos sem apagar o que já estava escrito; anotação descartada |
| 13 | Cole uma anotação com um valor com cara de senha (fictício) e divida | Recusa com o motivo, sem exibir o valor |
| 14 | Gere o mesmo texto em "Natural" e em "Estruturada" (campo "Redação") | Natural fala "você" no lugar de "o usuário" e agrupa em parágrafos; Estruturada mantém as palavras como digitadas |

## 2. Formato no sistema de chamados (D6)
Objetivo: confirmar que o texto gerado cola e é exibido corretamente no sistema de chamados real.

1. Abra [AMOSTRAS-FORMATO.md](AMOSTRAS-FORMATO.md). Os casos são fictícios.
2. Para cada um dos 10 tipos, copie o bloco de texto, cole em um chamado **de teste** (não em chamado real) e salve.
3. Registre o resultado:

| Tipo | Quebras de linha | Numeração | Acentos e aspas | Limite de caracteres | Campo aceita o texto inteiro | Observação |
|---|---|---|---|---|---|---|
| request_information | | | | | | |
| technical_note | | | | | | |
| pending | | | | | | |
| manager_approval | | | | | | |
| progress_update | | | | | | |
| solution_confirmation | | | | | | |
| closure_resolved | | | | | | |
| closure_no_response | | | | | | |
| redirect_or_escalate | | | | | | |
| guided_free_text | | | | | | |

4. Se algo quebrar (por exemplo o sistema remove linhas em branco), registre o caso. O ajuste é uma decisão de formato no perfil de linguagem, não do motor.
5. Apague os chamados de teste.

## 3. Leitor de tela
Execute o roteiro de [ACESSIBILIDADE.md](ACESSIBILIDADE.md) com NVDA e com o Narrador do Windows e preencha a tabela de resultados daquele documento. Mudanças recentes a conferir: seletor de modo segmentado, menu "Mais ações", os três botões de limpar e o destaque só do gatilho no alerta.

## 4. Piloto
Duração mínima: 14 dias. Participantes: o grupo definido pela organização.

1. Ligue os contadores: pela política `usageCounters` (`on`, ou `optional` com convite) ou pela caixa em Configurações. Eles guardam só números por categoria e ficam no navegador.
2. Peça o feedback semanal em [FEEDBACK-PILOTO.md](FEEDBACK-PILOTO.md), por canal interno.
3. Ao final, cada pessoa usa Configurações, "Exportar contadores", e entrega o arquivo `contadores-de-uso.json`. Quem ligou "Aprender com as redações que eu mantenho" também usa "Exportar aprendizado" e entrega `aprendizado-de-redacao.json` (o nome precisa continuar começando com "aprendizado"). Nenhum dos dois contém texto de chamado.
4. Reúna os arquivos em uma pasta e rode:

```
node scripts/analyze-usage.mjs pasta/*.json
```

O resumo traz, também, quantas divisões do rascunho livre chegam a preencher o formulário e as correções do analista (arquivos de aprendizado), além da taxa de bloqueio, cópias por geração, variações, revisões, tipos mais usados, destinatários, alertas mais frequentes e tempo até copiar; a taxa de aceite de cada regra do modo "Corrigir texto" (regra com aceite baixo é candidata a revisão); quantas vezes o atalho de próximo passo foi sugerido e usado (meta: 30%) e, nos arquivos de aprendizado, quais passos os analistas escolhem depois de cada tipo; além de dizer quem atende ao corte (padrão: 30 gerações e 14 dias por pessoa; ajustável com `--min-geracoes` e `--min-dias`).

### Ensaio ponta a ponta antes de ligar o piloto
Para provar que a cadeia funciona no seu ambiente, antes de convidar o grupo:

```
npm run build
node scripts/pilot-rehearsal.mjs dist ensaio-piloto
node scripts/analyze-usage.mjs ensaio-piloto/contadores-de-uso.json
```

O ensaio abre a extensão em Chromium, confirma que os contadores nascem desligados, liga, gera, copia, pede outra variação, provoca um bloqueio, exporta o arquivo e confere que nenhum texto digitado nem token foi guardado. Os dados do ensaio são fictícios e **não contam como dados de piloto**. Requer o Playwright (`PLAYWRIGHT_MODULE` pode apontar para o módulo).

### Política do piloto
Para ligar os contadores de todo o grupo sem depender de cada pessoa, defina a política `usageCounters` com o valor `on` (ou `optional`, que deixa a escolha com o analista e começa desligado). No Edge, a política da extensão fica em `3rdparty > extensions > <ID da extensão> > policy`, como descrito no README; no registro do Windows, o caminho equivalente é `HKLM\SOFTWARE\Policies\Microsoft\Edge\3rdparty\Extensions\<ID>\policy`, com o valor de texto `usageCounters`. Esse caminho não foi testado aqui: confirme na documentação do Edge e valide em uma máquina de teste. Com `on`, a opção some das Configurações e o texto informa que a organização ligou os contadores, o que deve constar do aviso aos participantes.

Texto sugerido para o convite (ajuste ao seu canal): "A extensão passa a contar, neste navegador, quantos textos de cada tipo você gera, quantos são bloqueados, quantas vezes copia e em que faixa de tempo. Não guarda o que você escreve nem identifica chamados ou pessoas. No fim, você exporta o arquivo e o entrega. Pode desligar ou zerar quando quiser, se a política permitir."

## 5. Como decidir D8 e D9
- Decida só com os arquivos que atendem ao corte e registre os excluídos.
- Alerta frequente que a maioria ignora: candidato a rebaixar de gravidade ou ajustar a regra.
- Tipo com muitas variações e poucas cópias: o modelo desse tipo precisa de revisão.
- Taxa de bloqueio alta por um único motivo: olhar a regra do detector com o corpus de avaliação (`docs/AVALIACAO.md`) antes de mexer.
- Rascunho livre: meta de pelo menos 70% das divisões chegando a preencher o formulário. Abaixo de 50%, o recurso atrapalha e deve voltar ao desenho. Muitas correções do mesmo tipo (por exemplo `result` para `action`) mostram qual regra de palavras ajustar.
- Naturalidade: peça a cada participante 3 textos gerados que eles consideraram artificiais e o que escreveriam; use `CASOS_REAIS=1` (`docs/AVALIACAO-NATURALIDADE.md`) com esses casos, sempre anonimizados e fora do repositório.
- Tempo até copiar sempre na faixa de menos de 1 minuto: pode indicar que o texto não está sendo lido; reforçar a orientação de revisar antes de copiar.

## 6. O que o piloto não consegue provar
- **D8 (inserir o texto no sistema de chamados):** os contadores medem tentativas, cópias e o tempo entre gerar e copiar. Eles **não medem** o tempo gasto colando, nem o atrito no sistema de chamados. Para decidir D8 é preciso também a tabela de formato (seção 2) e as respostas de feedback sobre colar. Se o atrito de colar não aparecer como principal custo em pelo menos quatro semanas de uso, mantenha D8 adiado. Se aparecer, o caminho mais estreito é `activeTab` com `scripting`, só no clique, e isso quebra a regra de permissões (somente `sidePanel` e `storage`): exige revisão de segurança própria.
- **D9 (IA por gateway corporativo):** nenhum número do piloto basta. Antes de qualquer decisão são necessários: gateway existente, parecer jurídico e de proteção de dados, mascaramento antes do envio, consentimento organizacional, desligamento por política e nenhuma chave na extensão. O corpus de avaliação (`docs/AVALIACAO.md`) serve para comparar o motor local com o assistido.
- **Amostra pequena:** com menos de 30 gerações por pessoa ou menos de 14 dias, o analisador recusa o corte de propósito. Estender o piloto é melhor que decidir com pouca base.
