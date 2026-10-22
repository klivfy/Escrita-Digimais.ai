# Estudo: IA para corrigir, produzir texto e aprender com o analista

Pedido (22/10/2026): a correção deve ter capacidade gramatical completa e deixar passar o mínimo de erros; estudar de forma ampla um modelo de IA que ajude a extensão a produzir e exportar texto e, principalmente, aprender como o analista a usa e quais diálogos ele mais repete.

Interpretação de "exportar texto": redigir o texto final e entregá-lo pronto para colar no chamado. Inserir o texto direto no sistema de chamados exigiria `content_scripts` e `host_permissions`, proibidos pelas restrições de segurança do projeto, e fica fora deste estudo.

Scripts e resultados: `scripts/estudo-ia-aprendizado/`. Conjuntos fictícios: `scripts/estudo-correcao/gold*.json`.

## 1. Veredito

1. **Gramática:** nenhuma ferramenta local chega a "completa". O melhor caminho medido é somar às camadas atuais o modelo de IA do próprio Edge (Proofreader API ou Prompt API, com Phi-4-mini) passando pela trava determinística. Nos conjuntos do estudo, isso subiria o teto de acerto de 82% para 95% sem nenhuma alteração indevida em frase correta. O LanguageTool, motor gramatical aberto, foi medido e descartado: acertou menos que as camadas atuais e marcou termos de TI como erro.
2. **Produzir texto:** manter o motor determinístico como fonte dos fatos e usar a IA do Edge só para reescrever o texto do motor no estilo do analista, com a mesma trava de fatos. Modelo embarcado no pacote continua descartado (tamanho, velocidade e invenção de conteúdo, medidos nas rodadas anteriores). IA na nuvem daria a melhor qualidade, mas quebra a regra "sem rede".
3. **Aprender com o analista:** dá para começar já, sem guardar conteúdo de chamado, aprendendo por contagens: tipos e destinatários mais usados, a sequência entre tipos de comunicação (o "diálogo" do atendimento) e quais sugestões ele aceita. Guardar os textos do analista para aprender frases é possível, mas muda uma restrição não negociável do projeto e exige decisão de governança e de privacidade (LGPD) antes.

Disponibilidade é o limite principal: em outubro de 2026 a Proofreader API e a Prompt API ainda aparecem como prévia no Edge Canary e Dev, com testes de origem (origin trials) na versão estável, e o Phi-4-mini exige 5,5 GB de VRAM e 20 GB livres. O modelo menor (Aion-1.0-Instruct, que roda em CPU) está em pré-lançamento desde o Edge 150 Canary e Dev.

## 2. O aviso removido e o que ele não muda

A frase "Não é uma revisão gramatical completa e deixa passar erros." saiu da tela "Corrigir texto". A capacidade não mudou com isso: hoje as camadas locais resolvem 70 dos 85 textos com erro dos dois primeiros conjuntos (82%) e 30 de 32 do terceiro. Continuam na extensão a frase "Isso não garante que o texto esteja correto", exibida quando não há sugestão, e as limitações descritas no README e na documentação técnica. Recomendo manter essa frase até a camada de IA estar ativa e medida no piloto, porque sem ela o analista tende a confiar em um "nenhuma sugestão" que ainda erra em cerca de 1 de cada 5 textos.

## 3. Parte A: gramática o mais completa possível

### 3.1 Medições

Mesmos critérios dos estudos anteriores: aplica a primeira sugestão de cada ferramenta e compara com o texto esperado; maiúscula inicial e pontuação não contam.

| Ferramenta | gold.json (54 erros) | gold-novo.json (31) | gold-3.json (32) | Frases corretas com sugestão (93 + 10 textos do produto) |
|---|---|---|---|---|
| Camadas 1 e 2 da extensão | 47 | 23 | 30 | 0 |
| LanguageTool 6.6 local (pt-BR, sem os 8 GB de n-gramas) | 34 | 15 | 14 | 8 (todas no gold.json) |
| Extensão mais LanguageTool no que sobra | 48 | 26 | 29 | 8 |

- **Falsos positivos do LanguageTool:** `Resetamos` virou `Remetamos`, `spooler` virou `spoiler`, `jsilva` virou `Silva`, `Active Directory` virou `Aclive Diretor`, `plugin` virou `plugam`. Vocabulário de TI é o dia a dia do Service Desk, então esse comportamento derrubaria a confiança na ferramenta.
- **Pioras:** trocas parciais que deixam o texto pior que o original, por exemplo `as configuração estão` virando `as configurações está`.
- **Viés:** o gold-3 foi escrito por quem conhecia as regras da extensão, o que favorece as camadas atuais nessa comparação. Mesmo descontando isso, no gold.json o LanguageTool fica 13 textos atrás e com 8 falsos positivos.
- **Custo:** o LanguageTool é Java (cerca de 240 MB) e roda como servidor. Na extensão, isso significa um serviço local ou interno e uma permissão de rede, o que quebra a regra "sem rede".

Complementaridade com o modelo do Edge (saída do Phi-4-mini já medida em `scripts/estudo-correcao`, conjuntos gold e gold-novo, 85 textos com erro e 55 corretos):

| Método | Textos corrigidos exatamente |
|---|---|
| Camadas 1 e 2 da extensão | 70 (82%) |
| Phi-4-mini sem trava | 66, mas alterou 6 das 55 frases corretas e inventou conteúdo |
| Phi-4-mini com trava | 59, sem alterar nenhuma frase correta |
| Teto da soma (extensão ou modelo travado) | 81 (95%) |

O modelo travado resolve justamente o que as regras não alcançam: `esta` por `está` conforme o contexto, `licensa`, `camera`, `redefiniçao`, `os tickets abertas`, `a senha temporário`, `precisam ser trocado` e `mais o usuário` no lugar de `mas o usuário`. O teto supõe escolher o método certo em cada texto; a combinação real (regras primeiro, modelo travado no que sobra) fica um pouco abaixo e precisa ser medida quando a API estiver disponível.

### 3.2 Opções

| Opção | Cobertura esperada | Privacidade | Custo e dependência | Situação |
|---|---|---|---|---|
| Camadas locais atuais | 82% nos conjuntos | Total | Já entregue | Em uso |
| Proofreader API do Edge (Phi-4-mini) com trava | Teto de 95% na soma | Local, nada sai do aparelho | Exige Edge com a API liberada, 5,5 GB de VRAM e 20 GB livres | Prévia em Canary e Dev; origin trial na estável |
| Prompt API do Edge (Phi-4-mini ou Aion) com instrução de correção | Igual ou um pouco abaixo da Proofreader | Local | Mesmos requisitos; Aion roda em CPU | Prévia; Aion em pré-lançamento desde o 150 |
| LanguageTool em servidor interno | Abaixo das camadas atuais nos conjuntos | Texto vai ao servidor da empresa | Servidor Java e permissão de rede | Descartado |
| Microsoft Editor (corretor aprimorado do Edge, nuvem) | Alta, sem medida própria | Texto vai à Microsoft | Política `MicrosoftEditorProofingEnabled` | Já age nos campos se a TI não desligar |
| Modelo embarcado no pacote (transformers.js ou WebLLM) | Parecida com o Phi-4-mini, ou pior | Local | Centenas de MB a GB no pacote, `wasm-unsafe-eval` na CSP, lento sem GPU | Descartado nas rodadas anteriores |

### 3.3 Recomendação para a parte A

Camada 3 opcional, desligada por padrão e ligada por política da organização:

1. Detectar `Proofreader` (ou `LanguageModel`) e a disponibilidade do modelo. Sem API ou sem modelo, a extensão segue só com as camadas locais, sem aviso de erro.
2. Rodar depois das camadas 1 e 2, só nos trechos que elas não tocaram.
3. Passar cada correção do modelo pela trava determinística, portada de `scripts/estudo-correcao/trava_gec.py` para `src/domain`: aceita acento, flexão com o mesmo radical e pares fechados; recusa troca de palavra, de número, de nome, de sigla e qualquer acréscimo.
4. Mostrar a sugestão com a regra "IA local" e aceite individual, igual à camada 2.
5. Medir no piloto: taxa de aceite por camada, sugestões recusadas e textos que pioraram.

## 4. Parte B: IA para produzir o texto

O motor determinístico continua sendo a fonte dos fatos, porque é o que garante que nada é inventado, prometido ou aprovado em nome de alguém. A IA entra como reescrita opcional do texto que o motor gerou.

- **Onde:** Rewriter API ou Prompt API do Edge, com instrução fixa ("reescreva no tom X, sem acrescentar fatos") e, quando houver, exemplos do próprio analista (seção 5).
- **Trava de fatos:** compara o texto do motor com o reescrito e recusa a versão se mudar número, data, prazo, sigla, nome, código de chamado, link, compromisso ("vamos", "garantimos"), aprovação ou o número de perguntas. A rodada 2 do estudo de IA mostrou que modelos pequenos inventam compromissos e aprovações; sem essa trava, a reescrita não pode ir ao analista.
- **Entrega:** a reescrita aparece como alternativa ao lado da prévia, com diferenças marcadas (`DiffView`). Copiar continua exigindo um clique.
- **IA na nuvem (Azure OpenAI no tenant da empresa):** maior qualidade para corrigir e reescrever, mas exige `host_permissions`, mudar a CSP (`connect-src`), ativar o adaptador remoto hoje desativado, contrato e avaliação de impacto à proteção de dados. Contraria três restrições não negociáveis do `CLAUDE.md`. Só faz sentido se a organização decidir mudar essas regras.

## 5. Parte C: aprender como o analista usa a extensão

"Diálogo" aqui significa o caminho de um atendimento: pedir informação, cobrar retorno, informar andamento, encerrar. A extensão já tem duas peças de aprendizado sem conteúdo: contadores de uso (opt-in) e o aprendizado de redação (qual frase pronta o analista mantém).

### 5.1 Níveis possíveis

| Nível | O que aprende | O que guarda | Muda regra do projeto? | Esforço |
|---|---|---|---|---|
| 1. Contagens de uso | Tipos, destinatários, tom e tamanho mais usados; ordem de preenchimento; regras de correção aceitas e recusadas | Inteiros em chaves fechadas | Não | 2 a 3 dias |
| 2. Sequência de diálogo | Qual tipo de comunicação costuma vir depois de qual (por exemplo, pedir informação, depois lembrete, depois encerramento por falta de retorno) | Contadores `seq.<tipo>.<tipo>`, sem chamado nem horário | Não | 2 dias |
| 3. Modelos pessoais | Respostas que o analista repete, salvas por ele com um clique e reaproveitadas | O texto do modelo, depois da varredura de dado sensível (bloqueia credencial, troca nomes, datas e números por marcadores) | Sim: passa a guardar texto do analista | 4 a 6 dias |
| 4. Memória automática | Agrupa os textos que o analista copiou nos últimos 30 dias e propõe transformar os repetidos em modelo | Textos mascarados, com prazo de retenção e botão de apagar | Sim, e exige avaliação de privacidade | 6 a 8 dias |
| 5. Estilo pessoal na IA | A reescrita da parte B usa os modelos pessoais como exemplos | Nada além do nível 3 ou 4 | Depende do nível usado | 3 dias, após a camada de IA |

Uso do que for aprendido, sempre como sugestão:

- abrir o painel no tipo e no destinatário que o analista mais usa;
- depois de copiar um "solicitar informações", oferecer o próximo passo mais comum ("lembrete em 2 dias") como atalho;
- mostrar primeiro as frases prontas e os modelos pessoais mais aceitos (o aprendizado de redação atual já faz isso com frases);
- calibrar as regras de correção pela taxa de aceite: regra muito recusada vira candidata a revisão.

### 5.2 Ciclo da equipe

O aprendizado individual não sai do navegador. Para a equipe aproveitar, o analista exporta os próprios modelos (arquivo JSON, como já acontece com os contadores), o gestor revisa e promove os bons ao perfil de linguagem da organização. Assim o conhecimento circula sem coleta automática.

### 5.3 Treinar um modelo com os textos dos analistas

Ajuste fino (fine-tuning ou LoRA) de um modelo por analista não roda no navegador. Centralizar os textos para treinar exigiria coletar conteúdo de chamados, o oposto da proposta do produto. Fica descartado; os níveis 3 a 5 personalizam sem treinar, usando exemplos e ordenação.

## 6. Arquitetura proposta

```
src/domain
  proofread.ts, agreement.ts    camadas 1 e 2 (já existem)
  ai-guard.ts                   trava de correção e trava de fatos (nova, pura, testável sem IA)
  dialogue.ts                   próximo passo provável a partir de contadores de sequência (nova)
src/application
  ai-local.ts                   detecta Proofreader, Rewriter e LanguageModel; nunca usa rede; desliga sem API
  usage-counters.ts             chaves novas: seq.<tipo>.<tipo>, proofread.<regra>.acc/rej
  personal-templates.ts         nível 3: salvar, mascarar, listar, exportar (só com decisão de governança)
src/infrastructure/policy       chave gerenciada para ligar a camada de IA e os modelos pessoais
src/ui                          sugestão "IA local" com aceite individual; atalho de próximo passo; "Meus modelos"
```

Nenhuma dessas peças pede permissão nova ao manifest. A Prompt API e a Proofreader API são APIs do navegador, sem `fetch`; a CSP atual continua válida. A camada de IA precisa de um teste de contrato com um modelo falso, que prova que a trava recusa invenção e que a extensão funciona igual sem a API.

## 7. Riscos e decisões que não são técnicas

| Ponto | Risco | Quem decide |
|---|---|---|
| Disponibilidade da API no Edge estável | O recurso fica parado até a Microsoft liberar; origin trial em extensão ainda precisa ser confirmado | Acompanhamento técnico; teste no Edge da equipe |
| Hardware | Sem GPU de 5,5 GB, o Phi-4-mini não roda; o Aion (CPU) ainda é pré-lançamento | TI: rodar `edge://on-device-internals` em uma amostra de máquinas |
| Download do modelo | Vários GB por máquina na primeira vez | TI: política `GenAILocalFoundationalModelSettings` |
| Guardar texto do analista (níveis 3 e 4) | Conteúdo de chamado persistido no navegador, contra a regra atual do projeto | Governança, privacidade e segurança |
| Confiança excessiva | Sem o aviso, "nenhuma sugestão" pode ser lido como texto correto | Produto (ver seção 2) |
| Microsoft Editor | Pode enviar o texto à nuvem pelo corretor do navegador | TI: `MicrosoftEditorProofingEnabled` |

## 8. Plano em fases

| Fase | Entrega | Depende de | Prazo |
|---|---|---|---|
| 1 | Níveis 1 e 2 de aprendizado (contagens e sequência de diálogo) e atalho de próximo passo | Nada | 1 semana |
| 2 | `ai-guard.ts` com testes, usando a saída já gravada do Phi-4-mini como dado de teste | Nada | 1 semana |
| 3 | Camada 3 de correção (Proofreader ou Prompt API) desligada por padrão e ligada por política | Fase 2; teste em Edge com a API | 1 semana, mais o teste |
| 4 | Reescrita opcional com trava de fatos | Fase 3 | 1 a 2 semanas |
| 5 | Modelos pessoais (nível 3) e estilo pessoal na IA (nível 5) | Decisão de governança | 1 a 2 semanas |
| 6 | Memória automática (nível 4) | Avaliação de privacidade aprovada | 1 a 2 semanas |

## 9. Critérios de validação

- Camada de IA: no piloto, pelo menos 95% das sugestões aceitas corretas e 0 texto piorado; recusa de 100% das invenções no conjunto de teste da trava; extensão idêntica sem a API.
- Cobertura: em um conjunto novo, escrito por outra pessoa, as camadas somadas corrigem pelo menos 90% dos textos com erro, sem sugestão em frases corretas.
- Aprendizado: o atalho de próximo passo é usado em pelo menos 30% das vezes em que aparece; nenhuma chave nova guarda texto (teste automático, como o atual dos contadores).
- Privacidade: `verify:dist` aprovado, sem permissão nova; nenhum conteúdo de chamado no `chrome.storage` nos níveis 1 e 2 (teste e ensaio do piloto).

## 10. Limites deste estudo

- Os três conjuntos são fictícios e do mesmo autor; o gold-3 foi escrito por quem conhecia as regras da extensão.
- A Proofreader API não foi testada no Edge real: os números do modelo vêm do Phi-4-mini rodando em CPU, que é o mesmo modelo da API, mas sem a instrução e os ajustes internos da Microsoft.
- Não há documentação pública dos idiomas suportados pela Proofreader API; os exemplos oficiais usam só inglês. Português precisa ser testado.
- O LanguageTool foi medido sem os 8 GB de n-gramas e sem as regras da versão paga; com eles, a cobertura de palavras confundíveis melhora, mas o custo e a rede continuam.
- O Aion-1.0-Instruct não estava publicado no Hugging Face na data do estudo e não foi medido.

## Fontes

- [Proofreader API, Microsoft Edge (atualizado em 02/09/2026)](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/proofreader-api)
- [Prompt API, Microsoft Edge (atualizado em 19/10/2026)](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api)
- [Writing Assistance APIs, Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/writing-assistance-apis)
- [Notas da plataforma web do Edge 149 (origin trials da Prompt API e da Proofreader API)](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/release-notes/149)
- [Notas da plataforma web do Edge 153](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/release-notes/153)
- [Notas do Edge estável 139 (Phi-4-mini e política GenAILocalFoundationalModelSettings)](https://learn.microsoft.com/deployedge/microsoft-edge-relnote-archive-stable-channel)
- [Política BuiltInAIAPIsEnabled](https://learn.microsoft.com/deployedge/microsoft-edge-policies/builtinaiapisenabled)
- [Política MicrosoftEditorProofingEnabled](https://learn.microsoft.com/deployedge/microsoft-edge-policies/microsofteditorproofingenabled)
- [Proofreader API, Chrome (opção expectedInputLanguages)](https://developer.chrome.com/docs/ai/proofreader-api)
- [LanguageTool (licença LGPL e servidor próprio)](https://en.wikipedia.org/wiki/LanguageTool)
- [Transformers.js em extensão Chrome](https://huggingface.co/blog/transformersjs-chrome-extension)
- [CSP e wasm-unsafe-eval em extensões MV3](https://bugzil.la/1766027)
- [Anúncio do Aion 1.0 (Build 2026)](https://ai-tldr.dev/releases/microsoft-aion-1-build2026/)
