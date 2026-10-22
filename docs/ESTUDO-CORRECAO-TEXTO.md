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

- Nenhum campo usa `spellcheck` explícito; o `lang` do documento é `pt-BR`.
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
