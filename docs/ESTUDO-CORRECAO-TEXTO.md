# Estudo: correção gramatical, ortográfica e de concordância

Pedido: acrescentar uma função inteligente de correção (gramática, ortografia, concordância) aplicada a todas as funções da extensão e, se possível, uma seção exclusiva para as correções.

Escopo da medição: protótipos em `scripts/estudo-correcao/`, conjuntos fictícios de autor único, nenhuma alteração no produto.

## 1. Veredito

Vale construir, em três camadas determinísticas e locais, sem modelo embarcado.

1. **Camada 0 (custo zero):** `spellcheck="true"` e `lang="pt-BR"` nos campos de texto. Usa o corretor do próprio Edge, sem código novo de correção.
2. **Camada 1 (ortografia e acento):** lista de frequência do português com duas regras (só acento; grafia de termo raro). Medido: 0 sinalizações indevidas em 55 frases corretas e em 10 textos gerados pelo produto.
3. **Camada 2 (concordância e crase):** regras fechadas, só sugerem. Cobertura real baixa fora do que foi desenhado (ver 3.3), então entra como lista curta de padrões frequentes, não como corretor geral.

A seção exclusiva faz sentido, como terceiro modo ("Corrigir") ao lado de "Gerar texto" e "Revisar texto pronto", mais um aviso resumido nos modos existentes.

Não recomendo embarcar Phi-4-mini nem outro modelo. O modelo corrige bem, mas sozinho inventa conteúdo, e a trava que o torna seguro descarta uma parte das correções certas. Fica como camada opcional futura, só se a Prompt API ou a Proofreader API do Edge estiver disponível e liberada pela TI (seção 5).

## 2. O que existe hoje

- Os campos do formulário (`FieldControl`) já tinham `spellCheck`; faltavam o rascunho livre, a prévia e o modo Revisar. O `lang` do documento já era `pt-BR`.
- `reviewText` (`src/domain/review.ts`) só alerta, nunca corrige. Essa linha é a mesma que o `CLAUDE.md` impõe: nunca alterar o texto do analista em silêncio.
- O modo Revisar já tem `DiffView` e foco/região ao vivo, que servem de base para a lista de sugestões.
- Os textos gerados pelo motor já passam por regras de redação; a correção entra antes da geração (campos) e depois (prévia).

## 3. Medições

Conjuntos: `gold.json` (calibração, 54 frases com erro e 30 corretas) e `gold-novo.json` (validação, escrito depois de congelar o protótipo: 31 com erro e 25 corretas). Autor único, dados fictícios.

### 3.1 Dicionário em JavaScript (nspell com dictionary-pt-br)

Não concluiu a carga em 4 min 27 s de CPU. Descartado como inviável para um painel lateral.

### 3.2 Lista de frequência com duas regras (camada 1)

| Conjunto | Erros de ortografia/acento | Detectados | Sugestão certa | Sinalizações indevidas |
|---|---|---|---|---|
| gold.json | 22 | 19 | 18 | 0 |
| gold-novo.json | 11 | 8 | 8 | 0 |

- 30 + 25 frases corretas e 10 textos gerados pelo produto (498 palavras): 0 sinalizações.
- Perdas: `esta` por `está` (palavra válida, depende de contexto), `analizando`, `licensa`, `camera`, `redefiniçao`. Uma sugestão errada: `aquivo` virou `aquilo` em vez de `arquivo`.
- Custo medido no protótipo: lista de 118 mil palavras (cerca de 1,1 MB de texto), carga de cerca de 207 ms, 0,2 ms por palavra, cerca de 51 MB de memória. A medir de novo dentro do Edge.

### 3.3 Regras de concordância e crase (camada 2)

| Conjunto | Textos com erro de concordância/crase/uso | Exatamente corrigidos | Sugestão que piora o texto | Sem sugestão |
|---|---|---|---|---|
| gold.json (calibração) | 32 | 31 | 0 | 1 |
| gold-novo.json (validação) | 20 | 10 | 3 | 7 |

- O 31/32 é otimista: as regras foram ajustadas olhando esse conjunto.
- A medida honesta é a do gold-novo: 50% de acerto exato e 3 casos em que duas regras se contradizem e o texto fica pior. 1 de 25 frases corretas recebeu sugestão indevida; nos textos gerados pelo produto, 0.
- Conclusão: regras servem para padrões frequentes e inequívocos (plural depois de determinante, `houveram`, `fazem` com tempo, crase em `a tarde`/`a gerência`). Não generalizam para substantivos e verbos fora do léxico.

### 3.4 Modelo de linguagem (Phi-4-mini-instruct, correção mínima)

Métrica por edição (troca termo a termo), ignorando maiúscula inicial e ponto final.

| Conjunto | Modelo puro | Com trava determinística |
|---|---|---|
| gold-novo | precisão 88%, revocação 82% (28 certas, 4 indevidas, 6 perdidas) | precisão 100%, revocação 82% |
| gold.json (teste da trava) | precisão 62%, revocação 81% (48 certas, 29 indevidas, 11 perdidas) | precisão 100%, revocação 66% |

- O modelo puro inventou conteúdo em 5 de 30 textos corretos do gold.json (respostas como "Como uma IA, não posso..." e reescritas de frase). Sem trava, é inaceitável para texto de chamado.
- A trava (só acento, flexão com prefixo comum, pares fechados) zera as alterações indevidas nos dois conjuntos. Ela foi desenhada olhando o gold-novo; o gold.json é o teste e confirmou 0 indevidas.
- Custo da trava no teste: perde correções certas (`nescessário`, `analizando`, `manuntenção`, trocas de gênero como `uma` por `um`). A revocação cai de 81% para 66%.
- Velocidade: 8,3 s por item em CPU (4 threads, bf16). Não representa o Edge com GPU, mas mostra que embarcar não é opção.

### 3.5 Comparação

| Opção | Ortografia/acento | Concordância/crase | Risco de alterar sentido | Custo |
|---|---|---|---|---|
| Camada 0 (spellcheck do Edge) | bom, sem medida própria | não cobre | nenhum | zero |
| Lista de frequência | 8 de 11 (validação) | não cobre | 0 medido | baixo |
| Regras fechadas | não cobre | 10 de 20 (validação) | 3 casos pioram | baixo |
| LLM com trava | revocação 66% a 82% | idem | 0 medido, depende da trava | alto; modelo do Edge |

## 4. Análise crítica

Pontos fortes:
- As camadas 0 e 1 resolvem a maior parte do erro frequente de digitação com risco medido zero e custo baixo.
- Tudo é sugestão com aceite explícito, coerente com a regra do projeto.
- Roda local, sem rede, sem mudar permissões.

Riscos:
- Autor único e conjuntos fictícios: os números são indicativos, não garantia de desempenho com texto real.
- A calibração das regras foi otimista (31/32 contra 10/20 em dado novo). Só o segundo número vale como estimativa.
- Falso positivo na camada 1 pesa mais que perda: um analista que vê três sugestões erradas desliga o recurso. Por isso os limites são conservadores (zipf mínimo, termo raro, siglas e nomes ignorados).
- Licença: os dados do pacote de frequência (wordfreq) podem exigir atribuição (CC BY-SA em parte das fontes). Confirmar antes de embarcar e registrar em `THIRD-PARTY-NOTICES.md`.
- A lista cresce o pacote (cerca de 1,1 MB de texto, menos compactado) e exige carga preguiçosa por `import()` dinâmico. `fetch` é proibido pelo projeto.

## 5. Arquitetura proposta

Domínio (puro, sem DOM):
- `src/domain/proofread.ts`: recebe texto, devolve sugestões `{ inicio, fim, original, substituicao, regra, camada }`. Nunca aplica.
- Dados em `src/config/` (lista, léxico de gênero, pares fechados, termos de TI do domínio); sem lógica de UI lá.
- A lista carrega por `import()` dinâmico na primeira abertura de "Corrigir" ou ao primeiro campo com texto.
- Avisos relacionados entram em `risks.ts` e `reviewText`, com teste positivo e negativo por regra.

Interface:
- **Campos do Gerar texto:** `spellcheck="true"` (camada 0) e, no blur, contagem discreta de sugestões com link para a seção Corrigir. Nada é trocado em silêncio.
- **Prévia:** mesma contagem, mesma seção.
- **Modo "Corrigir"** (terceiro segmento do seletor de modo): área de texto, lista de sugestões com texto original, substituição, regra e três ações por item (Aceitar, Ignorar, Ir ao trecho), `DiffView` do resultado, "Aceitar todas as seguras" só para a camada 1, região `aria-live` única do painel já existente para anúncios, foco no resultado ao concluir.
- **Rascunho livre:** botão para enviar o texto à seção Corrigir.
- **Contadores opcionais** com chaves fechadas (`proofread_suggested`, `proofread_accepted`, `proofread_ignored` por camada); nunca o texto.
- **Dicionário do usuário** ("ignorar sempre esta palavra"): decisão de privacidade. A palavra seria texto de chamado persistido. Recomendo não persistir na primeira versão; ignorar só na sessão.
- **Camada 3 opcional (futura):** Proofreader API ou Prompt API do Edge, só com política da TI e disponibilidade confirmada. Sempre passa pela trava determinística e mostra as edições como sugestão. A página da Prompt API ainda a trata como prévia; teste controlado antes de qualquer decisão.

## 6. Recomendação acionável

Ordem de entrega, cada passo com `npm run check` verde:

1. Camada 0: `spellcheck="true"` e `lang="pt-BR"` nos campos (meio dia, risco nulo).
2. Módulo `proofread` com a camada 1, conjunto de teste (gold-novo como regressão) e carga preguiçosa. Confirmar a licença dos dados (1 a 2 dias).
3. Modo "Corrigir" com lista, aceitar/ignorar e acessibilidade (3 a 4 dias).
4. Camada 2, só com os padrões que passam em dado novo (houveram, fazem, plural após determinante, crase em expressões fixas). Excluir regras sem generalização (2 dias).
5. Piloto de 14 dias com contadores opt-in; decidir a camada 3 com dados reais.

Decisão que depende do usuário: aprovar a seção exclusiva e o escopo de camadas 0, 1 e 2 antes de implementar.

## 7. Critérios de validação

- Precisão da camada 1 em casos reais anonimizados: no mínimo 95% das sugestões aceitas; 0 sugestões que piorem o texto no conjunto de regressão.
- Falso positivo em texto gerado pelo produto: 0 em todos os blocos de `docs/AMOSTRAS-FORMATO.md`.
- Latência: primeira abertura de "Corrigir" com a lista pronta em menos de 500 ms no Edge estável da equipe; memória medida no Edge.
- Acessibilidade: `axe` sem violações; anúncio único por ação; foco coerente; navegação só por teclado.
- Nenhuma alteração silenciosa: teste que prova que o texto do campo só muda por ação explícita.
- Pacote: `verify:dist` aprovado, sem `fetch`, sem permissão nova.
- Conjunto novo, escrito por outra pessoa, congelado antes do ajuste: meta de 80% de acerto exato nos erros cobertos pelas camadas 1 e 2.

## 8. Limites deste estudo

- Dois conjuntos fictícios, escritos pelo mesmo autor, com 85 frases com erro no total e 55 corretas.
- Regras ajustadas no primeiro conjunto; só o segundo é validação honesta.
- Tempos do modelo medidos em CPU, não no Edge.
- A licença dos dados de frequência ainda não foi confirmada.
- Nenhum teste com texto real de chamado nem com analistas.

## 9. Implementação das camadas 0 e 1

Entregue no branch `claude/estudo-correcao` depois da aprovação do escopo.

- **Camada 0:** `spellCheck` nos campos que não tinham (rascunho livre, prévia, texto a revisar e texto a corrigir). O `lang` já era `pt-BR` nas duas páginas, e um teste confere. Efeito prático pequeno, porque o navegador já verifica `textarea` por padrão. **Atenção de privacidade:** com a política `MicrosoftEditorProofingEnabled` ativada ou não configurada, o Edge pode enviar o texto digitado ao serviço Microsoft Editor. Isso já valia para qualquer página e não foi criado pela extensão, mas contradiz "nada sai da máquina" se a TI não desligar a política. Registrado em `PRIVACY.md` e `SECURITY.md`; a TI decide.
- **Camada 1:** `src/domain/proofread.ts` (puro), limites em `src/config/proofread/rules.ts`, lista em `src/config/proofread/freq-pt.json` (118.326 palavras, cerca de 1 MB, gerada por `scripts/gerar-lista-frequencia.py`), carga por `import()` dinâmico e tela `ProofreadMode` como terceiro modo ("Corrigir ortografia"). Só sugere; aceitar, ignorar (só na sessão), aceitar todas e desfazer a última alteração; texto só em memória e coberto por "Limpar tudo", inatividade e "Desfazer limpeza".
- **Fora desta entrega:** contagem de sugestões nos campos do Gerar texto, contadores de uso do modo, camada 3 (IA do Edge). A camada 2 veio na seção 10.

### Duas correções ao protótipo

1. O 0 de sinalizações indevidas medido no protótipo dependia de `jsilva` estar na lista de termos de TI, entrada que eu tinha criado por causa de uma frase de teste. Na versão do produto essa entrada saiu e entraram duas regras gerais: a palavra seguida de `@` é ignorada e, na regra de grafia, o candidato precisa começar com a mesma letra (logins como `jsilva` ou `msouza` deixam de virar `silva` e `souza`). Em contrapartida, a lista de termos ganhou palavras de TI (por exemplo `reinstalamos`, `sharepoint`, `dhcp`), que só suprimem sugestões.
2. O relatório dizia que nenhum campo usava `spellcheck`; o `FieldControl` já usava.

### Medida da versão entregue

`src/tests/proofread.test.ts` roda a implementação em TypeScript contra os mesmos conjuntos do estudo:

- 0 sugestões nas 55 frases corretas dos dois conjuntos e nos 10 blocos gerados pelo produto.
- Pelo menos 26 das 33 trocas esperadas de ortografia sugeridas corretamente (o protótipo em Python acertou 26: 18 de 22 e 8 de 11).
- Nenhuma sugestão fora do esperado nos 52 textos com erro de concordância, crase e uso de palavra (esta camada não os cobre).
- No Chromium real, com a extensão empacotada e a CSP estrita: primeira verificação em cerca de 260 ms (inclui carregar o trecho de 1 MB), aceitar uma sugestão em cerca de 30 ms, sem erro de console e sem rolagem horizontal a 320 px.

O conjunto continua sendo de autor único e escrito pelo mesmo autor das regras. O critério de aceite do piloto (seção 7) segue valendo.

## 10. Implementação da camada 2 (concordância, crase e uso de palavras)

`src/domain/agreement.ts` (regras), `src/config/proofread/agreement-lexicon.ts` (léxico de substantivos e nomes de pessoa) e `proofreadAll` em `src/domain/proofread.ts`, que junta as camadas 1 e 2 (se duas sugestões se tocam, vale a de ortografia). O modo ganhou o nome "Corrigir texto". Cada sugestão traz regra e motivo. "Aceitar acentos e grafia" aplica só ortografia; concordância, crase e uso pedem aceite individual.

### O que mudou em relação ao protótipo (e por quê)

| Mudança | Motivo |
|---|---|
| O número do determinante vale para o núcleo ("os computador" já conta como plural) | Sem isso, a regra do adjetivo "corrigia" `foram atualizados` para o singular. Eram 3 das 3 sugestões que pioravam o texto no conjunto de validação |
| "a tarde" e "a noite" só levam crase depois de dia da semana, "hoje", "ontem" ou "amanhã"; "a espera de" só depois de estar, ficar ou permanecer; saíram "a vista" e "a frente" | "A tarde foi tranquila", "durante a tarde" e "e a noite não teve queda" estavam corretos e eram marcados |
| `porque` só com a grafia exata (sem acento) | O protótipo "trocava" `porquê` por `porquê` |
| "mais" só vira "mas" antes de ele, ela, eu, nós, não, ainda, isso e já; o artigo ficou de fora | ", mais o anexo" pode ser soma |
| Nomes de pessoa (usuário, técnico, analista, gestor, cliente, colaborador, fornecedor) ficam sem regra de gênero; no adjetivo só se ajusta o número | "a analista" é correto, e "a usuário" pode ser erro no nome, não no artigo |
| 20 verbos no pretérito entraram na lista de plural (verificou, concluiu, abriu e outros) | Cobertura de sujeito composto e plural; testados contra as frases corretas |

### Medida (camadas 1 e 2 juntas, só os textos com erro de concordância, crase ou uso)

| Conjunto | Exatamente corrigidos | Texto piorado | Frases corretas com sugestão |
|---|---|---|---|
| gold.json (calibração) | 30 de 32 | 0 | 0 de 30 |
| gold-novo.json (validação) | 16 de 20 | 0 | 0 de 25 |
| gold-3.json (novo) | 30 de 32 | 0 | 0 de 38 |

- O protótipo, antes dos ajustes, no gold-3: 26 de 32, 4 textos piorados e 5 sugestões indevidas em frases corretas (3 de crase em "a tarde", 1 de porquê, mais as trocas de singular que o determinante evita).
- **Leitura honesta:** o gold-novo foi usado para decidir os ajustes, então os 16 de 20 não são mais validação. O gold-3 foi escrito antes do porte e rodado uma vez, mas quem o escreveu conhecia as regras: ele mede a regressão e as armadilhas conhecidas, não a cobertura em texto real. A revocação em texto livre será menor. Os erros que escapam são, em geral, substantivos fora do léxico (`pendrive`, `filial`), verbos fora da lista e "mais o" no lugar de "mas o".
- Limite de projeto mantido: nenhuma sugestão é aplicada sem ação, e o teste exige que um texto com erro nunca fique pior do que o original.
