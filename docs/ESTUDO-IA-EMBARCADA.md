# Estudo: IA embarcada na extensão

Data do estudo: 16/10/2026. Pergunta: dá para a extensão gerar textos mais naturais com um modelo de linguagem rodando no próprio computador, sem violar as regras do projeto (sem rede, sem conteúdo de chamado fora do navegador, permissões só `sidePanel` e `storage`)?

## 1. Caminhos possíveis

| Caminho | Situação em 16/10/2026 | Pontos de atenção |
|---|---|---|
| IA embutida do Edge (Prompt API e Writing Assistance APIs: Writer, Rewriter, Summarizer) | **Prévia para desenvolvedores só nos canais Canary e Dev** (versão 138.0.3309.2 ou superior), com flag ligada. Extensões podem usar. Modelo Phi-4-mini; a partir da 150.0.4070 há o modelo prévio Aion-1.0-Instruct, que roda também em CPU | Não está no Edge estável da maioria das empresas. Exige Windows 10/11 ou macOS 13.3+, 20 GB livres no perfil, 5,5 GB de VRAM para o Phi-4-mini e conexão sem limite para baixar o modelo. A documentação não lista idiomas, então o português precisa ser testado. Aceita saída restrita por JSON ou expressão regular (`responseConstraint`), útil para travar o formato |
| API embutida do Chrome (Rewriter, Prompt) | Teste de origem até o Chrome 148 para extensões; não vale para o Edge | Só serve de referência |
| Modelo empacotado na extensão (WebGPU ou WASM com WebLLM, transformers.js ou ONNX Runtime Web) | Funciona hoje em qualquer Edge com WebGPU | Pesos de centenas de MB a alguns GB dentro do pacote (ou baixados, o que quebra o "sem rede"); a política de conteúdo precisa liberar `'wasm-unsafe-eval'`, o que enfraquece a CSP atual; desempenho depende da máquina do analista |

Fontes: [Prompt API no Edge](https://learn.microsoft.com/microsoft-edge/web-platform/prompt-api), [Writing Assistance APIs no Edge](https://learn.microsoft.com/microsoft-edge/web-platform/writing-assistance-apis), [Rewriter API no Chrome](https://developer.chrome.com/docs/ai/rewriter-api).

## 2. Experimento (modelos reais, mesmo texto do motor)

Rodei modelos pequenos em CPU (4 núcleos, bf16, decodificação determinística) sobre 7 textos do próprio motor, um por tipo de comunicação. Dois desenhos:

- **Reescrita**: o modelo recebe o texto pronto do motor e deve "soar natural" sem mudar fatos.
- **Geração do corpo**: o modelo recebe só os fatos estruturados, mais 2 exemplos de texto bom, e escreve o corpo da mensagem (saudação e assinatura seriam colocadas pelo código).

Trava automática usada: nomes, siglas, números, datas e termos entre aspas do original precisam continuar no texto; nenhum número ou data novo; nenhum alerta novo da revisão do próprio produto (`reviewText`); sem travessão ou emoji; saudação e assinatura preservadas (no desenho de reescrita).

| Modelo | Desenho | Passou na trava | Tempo médio por texto (CPU) | Leitura humana da qualidade |
|---|---|---|---|---|
| Qwen2.5-0.5B-Instruct | reescrita | 3 de 7 | 7 s | Copia o texto em 3 casos e inventa em 2: "Vou enviar o retorno logo após essa data", assinatura "[Seu Nome]" |
| Qwen2.5-1.5B-Instruct | reescrita | 6 de 7 | 15 s | Praticamente devolve o texto igual: passa na trava, mas **não fica mais natural** |
| Qwen2.5-1.5B-Instruct | geração do corpo | 6 de 7 | 9 s | Fluente em parte, mas com erros de sentido: inverteu a pendência ("a planilha está sendo enviada"), respondeu "De acordo" no lugar do gestor, acrescentou promessa ("faremos o melhor esforço") e "solução implementada" |
| Phi-4-mini-instruct (o modelo do Edge) | geração do corpo | 5 de 7 | 18 s | O mais natural de todos ("Atualizamos o status do seu chamado... Resetamos sua senha"), mas **só 2 dos 7 textos ficaram usáveis**: aprovou sozinho em nome do gestor ("De acordo. A instalação será agendada conforme possível"), disse "Fico feliz em saber" onde ninguém relatou nada, embaralhou o encaminhamento |

Duas conclusões que importam:

1. **A trava automática é necessária, mas não basta.** Ela deixou passar textos com sentido errado (pendência invertida, promessa nova sem número ou data). A taxa "passou na trava" superestima a qualidade real. Só leitura humana pega esses erros.
2. **Modelos abaixo de cerca de 4 bilhões de parâmetros não seguem de forma confiável a regra "só os fatos".** Eles melhoram o português corrido, mas trocam quem faz o quê, criam compromissos e decidem pelo analista. Justamente o que o motor atual bloqueia.

Velocidade: uma máquina com GPU compatível tende a ser bem mais rápida que os 3 a 15 tokens por segundo medidos em CPU, mas isso não foi medido aqui.

Limites do experimento: 7 casos, sem GPU, sem o Aion-1.0-Instruct, sem modelos de 7B ou mais, um único conjunto de instruções. Não é uma medida de produção; é evidência suficiente para decidir o desenho.

## 3. Arquitetura recomendada

1. **Motor determinístico continua sendo a fonte de verdade.** Ele produz o texto base, com todas as travas.
2. **Prosa determinística melhor (prioridade)**: o ganho de naturalidade mais seguro está em tirar do texto o que denuncia o formulário. Exemplos vistos nas saídas: "conta dele" e "o teste do usuário" escritos para o próprio usuário; blocos com rótulo ("Resumo da situação: ..."); conectores repetidos. Isso é regra, não modelo, e não tem risco de invenção.
3. **IA embutida do Edge como recurso opcional, desligado por padrão, "Sugerir reescrita"**, só quando `LanguageModel.availability()` ou `Rewriter.availability()` responder "available":
   - entrada: o texto base já mascarado pelo motor, nunca o campo cru;
   - saída restrita por `responseConstraint` ao formato esperado;
   - a sugestão só vira texto se passar na trava (fatos preservados, nenhum número ou data novo, nenhum alerta novo, nenhuma aprovação ou confirmação em nome de terceiros) e é mostrada com comparação lado a lado; o analista aceita ou descarta;
   - qualquer falha volta ao texto do motor, sem aviso de erro;
   - o recurso se esconde sozinho onde a API não existe (hoje, o Edge estável).
4. **Não empacotar modelo próprio** neste ciclo: exigiria enfraquecer a CSP e carregar centenas de MB sem ganho comprovado sobre a opção 3.

## 4. Como decidir com dados
- Antes de qualquer código da opção 3: o analista testar o texto-base e a sugestão do Edge Canary/Dev (ou da Aion) em 10 chamados reais e marcar quantos ficaram melhores. Critério de entrada: pelo menos 7 em 10 melhores e nenhum com sentido alterado.
- Se o piloto rodar em Edge estável, a opção 3 não ajuda ninguém ainda; vale então concentrar tudo na prosa determinística.

## 4.1 Decisão (16/10/2026)
A equipe usa o **Microsoft Edge estável**. Segundo a documentação do Edge (atualizada em 06/10/2026), a Prompt API e as APIs Writer e Rewriter continuam em prévia só nos canais Canary e Dev. Portanto o recurso opcional "Sugerir reescrita" (opção 3) **não funcionaria hoje para ninguém da equipe** e fica adiado. Todo o esforço de naturalidade segue na prosa determinística. Reavaliar quando a API chegar ao Edge estável ou se a equipe adotar um canal de pré-lançamento.

Atualização (22/10/2026): as notas do Edge 147 a 149 listam a Prompt API e a Proofreader API como testes de origem (origin trials) na versão estável, e a página da Prompt API (atualizada em 19/10/2026) ainda as descreve como prévia em Canary e Dev. A decisão continua valendo; o caminho atual está em `docs/ESTUDO-IA-APRENDIZADO.md` (fase 3: camada de correção pela IA do Edge, ligada por política, depois das travas de `src/domain/ai-guard.ts`).

## 5. Como reproduzir
Os scripts e as saídas brutas estão em `scripts/estudo-ia/` (`rodar_reescrita.py`, `rodar_geracao.py`, `fatos.json`, `rascunhos.json`, `saidas-dos-modelos.json`). Requer Python, `torch` (CPU) e `transformers`; baixa os modelos da Hugging Face. Rode fora do pacote da extensão: nada disso entra no zip.

## 6. Rodada 2 (16/10/2026): interpretar e refinar textos curtos

Pergunta: um modelo simples e embarcado consegue interpretar anotações curtas e refiná-las? Separei em duas partes, porque têm riscos diferentes.

### 6.1 Interpretar (sugerir o campo de cada trecho do rascunho livre)
Comparei o pipeline atual (regras + Naive Bayes) com classificadores treinados no mesmo corpus fictício de 165 trechos, em três conjuntos: fácil (48), bagunçado (24) e deslocado (60, vocabulário que o corpus e as regras não cobrem, em `scripts/estudo-ia/deslocado.json`). Reproduzir: `scripts/estudo-ia/embeddings.py`.

Correção de método: classificar cada trecho isolado o tratava como primeiro da anotação e lhe dava +1,5 para contexto, o que rebaixava o pipeline (68%). Na posição realista ele acerta 47/60 (78%).

| Método | Fácil (48) | Bagunçado (24) | Deslocado (60) |
|---|---|---|---|
| Pipeline atual | 48 | 21 | 47 |
| n-gramas de caracteres (regressão logística), sozinho | 46 | 14 | 50 |
| Embeddings estáticos (potion-multilingual-128M), sozinho | 39 | 14 | 47 |
| multilingual-e5-small (118 MB quantizado), sozinho | 46 | 17 | 53 |
| paraphrase-multilingual-MiniLM (118 MB), sozinho | 41 | 9 | 49 |
| Pipeline + n-gramas, somados à pontuação (peso 0,5) | 48 | 20 | 54 |
| Pipeline + e5, somados à pontuação (peso 0,5 a 1) | 48 | 21 | 54 |

Leitura:
- O ganho existe e vem de somar um classificador discriminativo à pontuação, sem regressão nos conjuntos antigos para pesos até 1 (peso escolhido nos dois conjuntos antigos, o deslocado ficou de fora).
- **O encoder não se distingue dos n-gramas**: 3 acertos exclusivos contra 2 (p=1). Os n-gramas custam de 60 a 150 KB e rodam em TypeScript puro; o e5 custa 118 MB, mais ONNX Runtime em WASM e `wasm-unsafe-eval` na CSP.
- A fusão com n-gramas contra o pipeline puro: 7 contra 1 casos discordantes (p=0,07). Provável, não provado.
- Limites: corpus e conjuntos escritos pela mesma pessoa; nenhum dado real.

### 6.2 Refinar (reescrever o texto do motor)
Mesmo desenho do item 2, com modelos mais novos (CPU, determinístico, 7 textos; saídas em `saidas-rodada2.json`):

| Modelo | Textos usáveis (leitura humana) | Falhas principais |
|---|---|---|
| Qwen3-1.7B | 1 a 2 de 7 | aprova em nome do gestor, "foi resolvida" onde só se pede confirmação, palavra errada ("reinstituímos"), "amanhã" muda de dono |
| SmolLM3-3B | 1 a 2 de 7 | "A situação está resolvida" sem confirmação, promessa nova ("informaremos a razão da negativa"), "precisamos de mais acesso" |
| Qwen3-4B | 4 de 7 | vazou "2º andar" do exemplo para outro chamado, devolveu o pedido ao gestor como lista de fatos, afirmou "ainda não enviou" sem esse dado; cerca de 20 s por texto |

A conclusão da seção 2 se mantém: abaixo de cerca de 4 bilhões de parâmetros há invenção de compromissos, e mesmo no limite os erros mudam o sentido.

### 6.3 Decisão
1. Nenhum modelo generativo é embarcado. Nenhum encoder é embarcado.
2. Próximo passo de menor risco: somar à pontuação do rascunho livre um classificador de n-gramas de caracteres, gerado de forma reprodutível a partir do corpus, com peso fixo e o aprendizado local desempatando como hoje. Sem nova permissão e sem mudança de CSP.
3. Para "refinar" o que o analista digita: corretor determinístico de abreviações e acentos (vc, pq, nao), sempre como sugestão. Hoje o motor só detecta gíria.
4. Critério para reabrir: casos reais anonimizados mostrando que o ganho some, ou API de IA do Edge no canal estável.
