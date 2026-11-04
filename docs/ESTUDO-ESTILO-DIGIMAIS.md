# Estudo: tornar a extensão mais inteligente no estilo do ServiceDesk do Digimais

Data: 04/11/2026. Base: branch `claude/triagem-unica` (inclui biblioteca de modelos, ensinar e estilo).

## 1. Veredito

A reclamação procede, e dá para medi-la: **65% das palavras de um texto gerado vêm do roteiro fixo da extensão, e só 35% vêm do que o analista informou**. As partes que a equipe já pode ensinar (saudação, fecho, assinatura e textos inteiros como modelos) resolvem o caso em que o analista parte de um modelo. Quando ele gera sem modelo, o texto continua o mesmo para qualquer equipe.

Recomendação: **aprender o estilo por extração determinística dos textos de referência (opção A) e compor por blocos ensinados (opção B), em fases, com tudo proposto e aprovado pelo analista.** IA local do Edge (opção C) fica como complemento depois, atrás das travas que já existem. Isso é viável sem IA, sem rede e sem mudar as permissões.

Um ponto que depende de você: **sem textos reais do Digimais não dá para medir se o estilo aprendido é o certo.** Todas as medidas abaixo usam contextos fictícios do repositório. A seção 8 diz exatamente o que preciso.

## 2. Diagnóstico com números

Medida em 04/11/2026, com os contextos completos e fictícios de `src/tests/helpers.ts`, um por tipo de comunicação, estilo padrão da extensão.

| Tipo | Palavras | Vindas do analista | Variações distintas (0 a 3) | Rótulos "X:" |
|---|---|---|---|---|
| request_information | 56 | 34% | 4 | 3 |
| technical_note | 23 | 61% | **1** | 5 |
| pending | 34 | 18% | 4 | 1 |
| manager_approval | 44 | 50% | 4 | 3 |
| progress_update | 36 | 39% | 4 | 4 |
| solution_confirmation | 37 | 22% | 4 | 1 |
| closure_resolved | 42 | 24% | 4 | 1 |
| closure_no_response | 0 | sem texto | 1 | 0 |
| redirect_or_escalate | 36 | 33% | 4 | 1 |
| guided_free_text | 15 | 47% | 4 | 0 |
| **Total** | **323** | **35%** | | |

O que isso mostra:

1. **Pouca variação de verdade.** No máximo 4 redações por tipo, e a nota técnica tem 1. O analista que clica em "Outra variação" volta a ver o mesmo roteiro.
2. **Frases iguais em tudo.** "Olá,", "Agradecemos a colaboração." e "Equipe de Service Desk" aparecem em 8 dos 10 tipos. Isso é o que a etapa 2 de ensinar já resolve (estilo).
3. **Rótulos fixos.** Textos como "Resumo da situação:" e "O que observamos:" vêm da extensão. O perfil já aceita trocá-los (`templates.labels`, `templates.openings`, `templates.typeClosings`), mas nenhuma tela ensina isso: só dá para fazer editando um arquivo JSON de perfil.
4. **`closure_no_response` não gera texto com o contexto completo fictício.** É uma regra de encerramento (tentativas e aviso prévio). Não é defeito, mas conta como "sem texto" na estatística e precisa ser considerado ao medir.

Resumo do que existe hoje e do que cobre:

| Parte do estilo | Estado | Como o analista ensina |
|---|---|---|
| Saudação, fecho e assinatura | Feito | Aba Ensinar, "Ensinar o estilo" |
| Texto inteiro de um caso recorrente | Feito | Aba Ensinar, "Salvar modelo" |
| Aberturas por tipo | Só por arquivo de perfil | Não há tela |
| Rótulos das seções | Só por arquivo de perfil | Não há tela |
| Fecho por tipo | Só por arquivo de perfil | Não há tela |
| Termos preferidos da equipe | Só por arquivo de perfil | Não há tela |
| Estrutura (ordem, lista ou frase corrida, tamanho) | Não existe | Não há |
| Tom por destinatário | Existe (formalidade por destinatário) | Não aprende dos textos |

## 3. O que significa "entender o estilo"

Cinco camadas, da mais fácil à mais difícil:

1. **Moldura**: saudação, fecho, assinatura. Entregue.
2. **Fórmulas**: as frases que a equipe repete por tipo (como abre um pedido de informação, como fecha um encerramento) e os rótulos que usa.
3. **Estrutura**: ordem das partes, se usa lista numerada, tamanho típico.
4. **Tom**: formal ou direto, por destinatário.
5. **Conteúdo recorrente**: o que se diz sobre cada sistema ou equipamento.

Interpretar "o texto que referencia" significa decompor cada texto de referência nessas camadas. Já existe uma peça para isso: o rascunho livre (`domain/draft.ts`) separa um texto solto em campos (resumo, ações, resultado, pendência). Ele pode ser reaproveitado para dizer, em cada texto de referência, qual trecho é o resumo, qual é o pedido e qual é o fecho.

## 4. Opções

| Opção | O que faz | Prós | Contras e riscos | Esforço | Veredito |
|---|---|---|---|---|---|
| **A. Extração determinística** | Lê os textos de referência, acha as fórmulas que se repetem por tipo (aberturas, fechos, rótulos, tamanho) e propõe aplicar no perfil | Local, previsível, explica cada item com evidência ("em 4 de 6 textos"), usa campos do perfil que já existem, sem IA e sem rede | Precisa de pelo menos 3 a 5 textos por tipo; só pega o que se repete | Médio (3 a 4 dias por camada) | **Recomendada** |
| **B. Composição por blocos** | Divide os textos ensinados em blocos (abertura, pedido, fecho), guarda cada bloco com seu papel e monta o texto novo escolhendo blocos e preenchendo campos | Reaproveita a busca por semelhança e a triagem que já existem; dá variação de verdade com as palavras da equipe | Blocos mal recortados geram texto sem sentido; precisa de revisão do analista antes de usar | Médio a alto | **Recomendada, depois de A** |
| **C. IA local do Edge** | Reescreve o texto no estilo, com os textos de referência como exemplo | Mais natural | Prompt API e Writer API estão em prévia em Canary e Dev (origin trials no estável); o modelo Phi-4-mini deu 2 textos usáveis em 7 no estudo anterior e aprovou sozinho em nome de um gestor; exige 20 GB livres e GPU | Alto, e bloqueado hoje | **Adiar** |
| **D. IA remota** | Envia texto a uma API | Qualidade | Quebra a regra de nunca usar rede e envia dado de chamado | Fora do escopo | **Descartada** |
| **E. Treinar um modelo** | Ajuste fino com os textos da equipe | Estilo fiel | Dados reais, infraestrutura, privacidade, custo | Fora do escopo | **Descartada** |

## 5. Desenho recomendado

**Perfil de estilo aprendido dos textos de referência**, em fases, sempre com o analista aprovando:

1. **Corpus de referência.** A aba Ensinar passa a aceitar um lote de textos, cada um com tipo e destinatário (a extensão sugere o tipo, o analista corrige). O texto colado continua só em memória; o que se guarda é o resultado aprovado.
2. **Decomposição.** Cada texto é separado em saudação, abertura, corpo, pedido, fecho e assinatura, reaproveitando o modelo do rascunho livre.
3. **Aprendizado por tipo (opção A).** Para cada tipo, a extensão propõe: abertura mais frequente, fecho mais frequente, rótulos de seção, tamanho típico e se o corpo usa lista. Cada proposta mostra a evidência e só vale se aparecer em pelo menos metade dos textos e em pelo menos 3 textos.
4. **Aplicação.** O que for aprovado entra como `templates.openings`, `templates.typeClosings` e `templates.labels` do perfil pessoal, com a mesma trava do estilo atual: desligado quando a organização exige perfil assinado, triado de novo quando a camada de equipe muda.
5. **Blocos (opção B).** Os blocos aprovados alimentam uma segunda forma de gerar: "montar com o jeito da equipe", que escolhe a abertura, o pedido e o fecho ensinados mais parecidos e preenche com o formulário. O analista vê de onde veio cada bloco.

Pontos de projeto que valem a decisão agora:

- **Tudo é proposta com evidência.** A extensão nunca muda o texto do analista sem ação dele (regra do projeto).
- **A triagem de dado sensível vale para tudo que é guardado**, pelo mesmo módulo de triagem única que já existe.
- **O que for aprendido é revisável e removível**, como o estilo e os modelos.

## 6. Como medir

Uma medida precisa de textos reais; as metas abaixo valem para quando houver.

1. **Cobertura (offline, sem conteúdo guardado).** Deixa um texto de fora, aprende com os outros e mede quanto do texto deixado de fora a extensão reproduz (sequências de palavras em comum). Meta inicial: subir de 35% (hoje, só com o roteiro) para 60% ou mais nos 5 tipos mais usados.
2. **Esforço de edição (no piloto).** Contador numérico: percentual do texto que o analista alterou antes de copiar, comparando gerar com o roteiro e gerar com o estilo aprendido. Só números, no mesmo formato dos contadores atuais. Meta: reduzir a edição em pelo menos 30%.
3. **Naturalidade (cega).** O conjunto de `docs/AVALIACAO-NATURALIDADE.md` já existe: misturar textos da extensão com textos humanos e pedir a 3 analistas que apontem o que parece automático. Meta: menos da metade apontada.
4. **Segurança.** Zero texto com dado sensível salvo; zero alerta silenciado pelo estilo aprendido. Os testes de `analyst-content` e `style-learn` continuam valendo.

## 7. Plano em fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | Reunir 20 a 40 textos reais anonimizados e 5 tipos prioritários (seção 8). Sem código | Planilha com tipo, destinatário e texto, sem dado pessoal |
| 1 | Medir a cobertura de hoje com os textos reais (script, offline) | Número de partida registrado neste documento |
| 2 | Lote de textos na aba Ensinar e aprendizado de aberturas, fechos e rótulos por tipo (opção A), com evidência | Cobertura sobe; testes positivo e negativo por regra; nenhum alerta silenciado |
| 3 | Aplicar no perfil pessoal com as travas (assinatura, camada, triagem) | Testes de que a camada continua só restringindo |
| 4 | Montar por blocos (opção B) | Piloto com esforço de edição medido |
| 5 | Reavaliar IA local (opção C) quando a Prompt API estiver no Edge estável, atrás de `ai-guard` | Teste cego melhor que o determinístico, sem fato inventado |

## 8. O que preciso de você

1. **Textos reais, sem dado pessoal.** De 20 a 40 textos que o time considera bons, com pelo menos 5 por tipo para os tipos mais usados. Troque nomes, e-mails, telefones e números de chamado por `[nome]`, `[chamado]` etc. antes de me passar. Eu não preciso do chamado, só da redação.
2. **Os 5 tipos mais frequentes** no dia a dia do time.
3. **3 exemplos de texto que o time considera ruim** e por quê. Servem para regras de "evitar".
4. **Regras fixas da equipe**: termos que nunca se usam, frases obrigatórias, fechos por destinatário.
5. **Quem aprova** o que a extensão aprendeu antes de virar padrão da equipe.

Enquanto isso não chega, o analista já pode usar a aba Ensinar com 3 a 5 textos próprios (saudação, fecho, assinatura e modelos).

## 9. Riscos

| Risco | Como tratar |
|---|---|
| Texto de chamado real vai para o repositório ou para a extensão | A fase 0 é manual e anonimizada; o texto colado nunca é guardado; a triagem recusa dado sensível |
| Aprender um vício da equipe (um erro que se repete) | Tudo é proposta com evidência; o analista aprova; a correção ortográfica e o aviso de termo proibido continuam rodando no texto final |
| Poucos textos geram regras ruins | Mínimo de 3 textos e metade de repetição; a tela diz quando não há padrão |
| Estilo pessoal sobrepõe o da organização | Desligado quando há perfil assinado; camada de equipe sempre por último |
| Manutenção das regras de extração | Cada regra nova entra com teste positivo e negativo, como as demais |

## 10. Limites deste estudo

- Não há textos reais do Digimais. A medida de 35% usa contextos fictícios e o estilo padrão; mostra a estrutura do problema, não o grau exato no dia a dia.
- A comparação das opções com IA reaproveita o estudo anterior (`docs/ESTUDO-IA-APRENDIZADO.md`), que usou textos fictícios.
- A viabilidade da opção B (cortar textos em blocos) não foi testada com textos reais e é a parte mais incerta do desenho.
- Não medi o esforço de edição: ele só existe no piloto.
- As metas são hipóteses para serem confirmadas na fase 1.
