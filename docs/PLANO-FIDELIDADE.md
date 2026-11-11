# Plano de fidelidade: o texto não afirma o que o analista não disse

A extensão não usa IA. A "alucinação" aqui é o motor afirmar algo que o analista não informou, ou o estudo dos textos de referência guardar fato de um chamado como se fosse redação reaproveitável. Este documento registra a medição de 11/11/2026 (textos fictícios, não textos reais do Digimais), o plano em fases e o estado de cada uma. A régua executável é `src/tests/fidelity.test.ts`.

## Defeitos medidos

### Estudo do texto de referência

| # | Defeito | Exemplo medido | Fase |
|---|---|---|---|
| E1 | Fato de um chamado vira "abertura" reaproveitável, com nome de terceiro | "Conforme contato telefônico realizado hoje com a Ana Paula da contabilidade, o notebook HP ProBook será trocado na quinta-feira." | 1 |
| E2 | A montagem cola esse trecho em outro assunto | Chamado de impressora recebeu a abertura do notebook | 2 |
| E3 | A montagem ignora o formulário | A pergunta digitada não aparece no texto montado | 2 |
| E4 | Palavra comum tomada por cortesia | "Identificamos" e "Verificamos" contêm "ficamos" | 1 |
| E5 | Trocas erradas por campo | "versão 2/3" e "24/7" viram data; "time do Flamengo" vira equipe; "Olá, Boa tarde," vira nome | 1 |
| E6 | Frase alheia entra no pedido | "O time do {equipe} ganhou. Favor enviar o print." guardado inteiro | 1 |

### Geração de texto

| # | Defeito | Exemplo medido | Fase |
|---|---|---|---|
| G1 | Ação já feita sai como próximo passo | "Agendamento removido da fila" em "Os próximos passos são" | 3 |
| G2 | Ação de terceiro sai como nossa | "O que já fizemos: Usuário reiniciou o computador. Fornecedor trocou o toner." | 3 |
| G3 | O tipo contradiz o conteúdo | Confirmação de solução com resultado "o erro continua" | 4 |
| G4 | Rótulo afirma mais que o analista | Sem confirmação do usuário, o texto diz "situação solucionada" | 4 |
| G5 | Fechos empilhados depois do treino | "Ficamos à disposição." seguido de "Agradecemos a colaboração." | 5 |
| G6 | Campo vazio deixa buraco | `{destination}` sem valor vira texto vazio (lido no código, não reproduzido) | 5 |

## Fases

| Fase | Prioridade | O que corrige | Modelo e esforço | Estado |
|---|---|---|---|---|
| 0. Régua de fidelidade | Pré-requisito | `fidelity.test.ts` com os casos da medição | Sonnet 5.5, médio | Feita |
| 1. Estudo de referência | Crítica | E1, E4, E5, E6 e o registro já guardado | Sonnet 5.5, alto | Feita |
| 2. Montagem por trechos | Crítica | E2, E3 | Sonnet 5.5, alto | Feita |
| 3. Fatos na geração | Crítica | G1, G2 | Sonnet 5.5, alto | Feita |
| 4. Coerência do texto | Alta | G3, G4 | Sonnet 5.5, médio | Feita |
| 5. Acabamento | Média | G5, G6 | Sonnet 5.5, baixo | Feita |
| 6. Medida com textos reais | Validação | Confirma tudo com 20 a 40 textos anonimizados do Digimais | Sonnet 5.5, médio | Depende dos textos |

Escalada para Opus 5.5 (esforço alto) só se a fase 1 ou a 3 não chegar a zero falso positivo em duas rodadas, ou se a fase 2 exigir mudar o formato do arquivo cifrado.

## Fase 1: o que mudou

- `domain/block-vetting.ts` é a única definição de "dado de chamado" (`redactionProblems`: nome próprio, sigla, número, dia da semana ou mês, "hoje", "ontem", "amanhã") e de "repetição mínima" (`MIN_BLOCK_USES = 2`). `judgeBlock` devolve `ok`, `waiting` (ainda sem repetição) ou `out` (fora das regras), sempre com o motivo.
- Ingestão (`style-corpus.ts`): trecho com dado de chamado nem chega a ser guardado. O pedido guarda só a frase que pede. A cortesia é reconhecida por palavra inteira.
- Campos (`teach.ts`, `style-learn.ts`): data sem ano só vira campo depois de palavra de data (dia, em, até, para, desde, prazo); dia e mês são validados; "time" só vira equipe com "de" ou "da"; "Bom dia" e "Boa tarde" não são nome.
- Treino (`style-train.ts`) e montagem (`style-compose.ts`) ignoram trecho com dado de chamado, e a montagem ignora trecho de uma ocorrência só.
- Triagem única (`application/analyst-content.ts`): `blocksNotInUse` lista, com o motivo, o que está guardado e fora de uso. Nada é apagado. A aba Ensinar mostra o painel "Trechos fora de uso" com o botão Esquecer e marca na lista "aguardando repetição".
- Privacidade: a exportação deixa no navegador o trecho antigo com dado de chamado, e a importação descarta o que chegar assim (conta como descartado no resumo).

### Trade-off assumido

A regra prefere perder aprendizado a vazar fato de chamado. Uma abertura que cita um sistema ("acesso ao SAP") não é aprendida como estilo, mesmo que se repita. O caminho para o analista é ensinar com campo (`{sistema}`, `{equipamento}`), que a biblioteca já aceita.

## Fase 2: o que mudou

- `domain/style-compose.ts`: o texto montado leva, sem alteração, o que o analista digitou (pergunta, pendência, ação esperada), como parte "Informado" com origem "o que você digitou".
- Abertura e pedido só entram se combinarem com o assunto descrito (pontuação mínima `COMPOSE_MIN_SCORE = 0,25`, medida: mesmo assunto de 0,27 a 0,58, outro assunto até 0,23). Sem trecho do assunto, entra a abertura padrão do tipo, nunca a mais frequente de outro assunto. O fecho é cortesia e segue a frequência.
- A pontuação é calculada sobre todos os trechos do tipo juntos, porque o peso por raridade das palavras não vale com um trecho só.
- A montagem só é oferecida quando há ao menos um trecho ensinado do assunto; sem isso não há "jeito da equipe" a mostrar.
- Sobre bloquear a cópia com parte de uma ocorrência só: a fase 1 já impede que esse trecho entre na montagem, então não há o que bloquear. O teste garante que nenhuma parte ensinada tem menos de `MIN_BLOCK_USES`.
- Limite conhecido: o limiar vem de uma amostra pequena e fictícia. A fase 6 confirma com textos reais.

## Fase 3: o que mudou

- G1, `domain/classify.ts`: `isPlannedAction` deixou de usar radical solto (`agend\w+`, `planej\w+`). Só formas que anunciam o futuro contam (`agendar`, `agendaremos`, `agendado para`, `planejar`, `planejamos`...). "Agendamento removido da fila" e "tarefa agendada rodou" voltam a ser ação feita.
- G2, `isOtherPartyAction`: ação com sujeito de terceiro (usuário, cliente, solicitante, fornecedor, terceiro, gestor, colaborador, ou "pelo fornecedor") sai de "O que já fizemos" e de "Próximos passos". Vai para a seção nova `actions_others`, com o rótulo fixo "Informado por outras partes" (`OTHER_PARTY_LABEL`), nas posições de `actions_done` de cada tipo. O texto do analista entra como está, sem passar pela voz da equipe.
- O rótulo é fixo de propósito: não é um `LabelKey`, então o perfil e o treino não o trocam por um que afirme que a equipe agiu.
- Limites conhecidos: a detecção olha o início da frase (sujeito + verbo no passado) e a voz passiva com "pelo/pela"; frase com o sujeito no meio ("Hoje o usuário reiniciou") continua sendo tratada como ação da equipe. Ação planejada com marcador ("Planejado: fornecedor trocará") também. A fase 6 mede com textos reais quanto disso aparece.

## Fase 4: o que mudou

- G3, `config/vocabulary.ts` e `domain/policy.ts`: `NEGATIVE_RESULT_PATTERN` passou a reconhecer "o erro continua", "o problema persiste", "a falha segue", "continua travando". Em `solution_confirmation`, resultado negativo gera o aviso `confirmation_negative_result` (severidade aviso, não bloqueia): o texto pede confirmação de solução e o resultado diz que o problema continua. No encerramento solucionado o mesmo padrão já bloqueava, e agora pega mais casos.
- "o erro não continua" e "a situação segue normal" não disparam o aviso (teste negativo).
- G4, `domain/planner.ts` e `config/templates.ts`: em `closure_resolved`, sem confirmação do usuário registrada, a abertura usa `UNCONFIRMED_CLOSURE_OPENINGS` ("Estamos encerrando este chamado após as ações descritas abaixo."), que não afirma solução. Com confirmação `yes`, a abertura segue afirmando. Abertura definida no perfil (inclusive a aprovada no treino) é respeitada.
- Limites: o padrão de resultado negativo é lista fechada e não pega toda forma de dizer que o problema continua. G4 troca só a abertura; o analista que quer afirmar a solução registra a confirmação do usuário. A fase 6 mede com textos reais.

## Fase 5: o que mudou

- G5, `domain/planner.ts`: quando o fecho do tipo (inclusive o ensinado no treino) já é uma cortesia (disponibilidade, agradecimento: `COURTESY_FAMILY`), a cortesia do perfil que viria logo depois é omitida. Fecho que não é cortesia ("Aguardamos o seu retorno.") continua com a cortesia do perfil.
- G6, `fillComplete` e `pickComplete`: redação com campo sem valor (`{destination}`, `{organization}`) não sai com buraco ("equipe ."). O planejador usa a próxima redação da lista que esteja completa; sem nenhuma, a seção é omitida. Vale para abertura, fecho do tipo, cortesia, textos obrigatórios, aviso de privacidade e assinatura.
- Nenhum snapshot mudou: os textos padrão não tinham fecho empilhado nem campo vazio.
- Limites: `COURTESY_FAMILY` é lista fechada de três radicais (`disposi`, `agradec`, `obrigad`); fecho de cortesia com outra redação ainda empilha. Quando só resta redação com campo vazio, a seção some em silêncio, sem aviso ao analista.

## Como validar

- `npm run check` verde.
- `src/tests/fidelity.test.ts`: os testes das fases 1 a 5 passam e não resta `it.fails`. Falta a fase 6 (medida com textos reais).
- Na tela: ensinar os textos do estudo e conferir que nome de terceiro, sistema e dia da semana aparecem em "Trechos fora de uso" ou nem entram, e que a montagem só usa trechos vistos em pelo menos 2 textos.
