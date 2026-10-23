# CLAUDE.md

Extensão MV3 para Microsoft Edge que gera sugestões de texto para chamados de Service Desk. 100% local, sem rede.

## Arquitetura
- `src/domain`: motor determinístico e puro (normalize, sensitive, classify, sufficiency, policy, planner, renderer, risks, review, quality, engine). Sem DOM, sem chrome.*.
- `src/config`: dados (vocabulário, templates, blueprints, campos, perfil padrão, validação do perfil). Não colocar lógica de UI aqui.
- `src/application`: casos de uso (provedor local, adaptador remoto desativado, mapeamento do formulário, preferências).
- `src/infrastructure`: chrome.storage, clipboard, sidePanel, service worker, política gerenciada.
- `src/ui`: React (painel lateral e popup). Só orquestra; regra de negócio fica no domínio.
  - `src/ui/hooks`: estado e efeitos reutilizáveis (`useUsageCounters`, `useStyleLearning`). `App.tsx` só compõe.
- Listas fechadas da voz (verbos, particípios, substantivos) ficam em `src/config/voice-lists.ts`; a lógica, em `src/domain/voice.ts`.

- Rascunho livre (`domain/draft.ts`, regras em `config/draft-rules.ts`, modelo em `config/draft-model.json`): só sugere campos; o analista confere antes de preencher; o texto colado nunca é persistido. O modelo é regenerado do corpus fictício com `UPDATE_MODEL=1 npx vitest run src/tests/draft-model.test.ts`. Mudou regra ou corpus? Rode a medida em `src/tests/draft.test.ts` e atualize `docs/AVALIACAO-RASCUNHO.md`.

- Correção de texto (`domain/proofread.ts`, limites e termos de TI em `config/proofread/rules.ts`, lista em `config/proofread/freq-pt.json`, carga em `application/proofread-data.ts`, tela em `ui/components/ProofreadMode.tsx`): só sugere (acento, grafia, concordância, crase e uso de palavras); nunca troca sem ação do analista; texto só em memória. A lista é regenerada com `python scripts/gerar-lista-frequencia.py` (wordfreq 3.1.1). Mexeu em limite ou regra? Rode `src/tests/proofread.test.ts` (confere 0 sinalizações indevidas nos conjuntos de `scripts/estudo-correcao` e em `docs/AMOSTRAS-FORMATO.md`) e atualize `docs/ESTUDO-CORRECAO-TEXTO.md`. Não use `fetch` para a lista. A camada 2 (`domain/agreement.ts`, léxico em `config/proofread/agreement-lexicon.ts`) só olha padrões estreitos, nunca mexe em gênero de nome de pessoa e só vale com teste positivo e negativo; `src/tests/agreement.test.ts` exige que nenhum texto com erro piore e que as frases corretas dos três conjuntos fiquem sem sugestão.

- Biblioteca de modelos (`config/library-schema.ts`, `domain/library-vetting.ts`, `application/library-import.ts`, armazenamento em `infrastructure/storage.ts`): a importação recusa o arquivo inteiro se algum modelo trouxer dado sensível ou violar as regras de revisão; modelo novo só entra com teste em `src/tests/library.test.ts`. Assinatura com `node scripts/sign-profile.mjs sign-library`. A busca e o uso na prévia (fases 2 e 3 de `docs/ESTUDO-ENSINAR-A-EXTENSAO.md`) ainda não existem: a biblioteca nunca insere nem copia texto sozinha.
- Travas para IA (`domain/ai-guard.ts`, limites em `config/ai-guard.ts`): `guardCorrections` só deixa passar acento, flexão do mesmo radical e pares fechados; `checkFacts` recusa reescrita que mude número, data, sigla, nome, link, compromisso, aprovação, solução afirmada, negação ou perguntas. Nenhuma IA é chamada ainda; qualquer uso futuro de modelo passa por essas funções. `src/tests/ai-guard.test.ts` usa as saídas gravadas dos modelos (`scripts/estudo-ia-aprendizado/saida-phi4mini.json`, `scripts/estudo-ia/saidas-rodada2.json`).

## Comandos de verificação
```
npm run check        # lint + typecheck + testes + build + verify:dist + build:dev
npm run dev          # dist-dev/ em modo watch para carregar no Edge (docs/DESENVOLVIMENTO-EDGE.md)
npm test             # Vitest (jsdom, Testing Library, axe-core)
npm run package      # gera release/*.zip
```
Atualizar snapshots de template só quando a mudança de texto for intencional: `npx vitest run src/tests/engine.test.ts -u`.

## Padrões
- TypeScript estrito; sem `any`; `import type` para tipos.
- Textos gerados em pt-BR, sem travessão, sem emoji, sem caixa alta para ênfase.
- Regras novas: dado em `src/config/vocabulary.ts`, lógica em `src/domain/risks.ts`, teste positivo e negativo.
- Nunca alterar o texto do analista silenciosamente: alertar, sugerir, e só mudar por ação explícita.
- Mudou detector de dado sensível? Adicione caso ao corpus (`src/tests/eval/sensitive-corpus.ts`, só dados fictícios) e atualize `docs/AVALIACAO.md` se as métricas mudarem.

- Visual: Material Design 3 por tokens (`src/ui/styles/tokens.css`). Cor nova entra como token nos temas claro e escuro e em `contrast.test.ts`. Fonte só local (Google Sans Flex em `fonts.css`), sem CDN, sem `@import`, sem `data:`.
- Movimento só em opacidade e cor, com `prefers-reduced-motion` respeitado. Não adicionar biblioteca de animação (por exemplo `motion`) nem `backdrop-filter`; a skill `apple-design` serve de guia de princípios, não de dependências.

## Restrições de segurança (não negociáveis)
- Permissões: apenas `sidePanel` e `storage`. Nada de host_permissions, content_scripts, tabs ou clipboardWrite.
- Sem `fetch`, XHR, WebSocket, sendBeacon, `eval`, `new Function`, CDN ou script inline (ESLint e testes bloqueiam).
- Persistir apenas preferências (allowlist em `application/preferences.ts`), perfil validado, biblioteca de modelos da instituição importada de arquivo (`config/library-schema.ts`: texto simples, campos de lista fechada, triagem por `domain/library-vetting.ts`, assinatura exigida quando a política pede; nunca texto de chamado), contadores numéricos opt-in (`application/usage-counters.ts`, lista fechada de chaves) e o aprendizado de redação opt-in (`application/style-learning.ts`: só `acc|rej` + ponto + escopo + índice, inteiros). O aprendizado só muda qual redação pronta vem primeiro (e, no rascunho livre, desempata a sugestão de campo com chaves `fix.<origem>.<destino>`), quais tipos aparecem em "Mais usados" (`use.<tipo>`) e a ordem do próximo passo sugerido (`seq.<tipo>.<tipo>`, passos em `config/dialogue.ts`); nunca afeta bloqueios, alertas ou política. Nunca conteúdo de chamado.
- Credenciais, tokens e chaves bloqueiam a geração; demais dados sensíveis são mascarados com aviso.
- Perfil importado: só texto simples validado por `config/profile-schema.ts`; termos nunca viram regex. Com `profileSigningPublicKeys` na política, só vale perfil assinado (`application/profile-signing.ts`); chave privada nunca no repositório. Camada de equipe (`config/profile-overlay.ts`) só restringe: toda regra nova de mesclagem precisa de teste provando que não afrouxa.
- Nenhum segredo ou chave de API no repositório. Provedor remoto permanece desativado.

## Definição de pronto
`npm run check` verde, snapshots revisados, README/PRIVACY/SECURITY atualizados quando houver mudança de comportamento, permissões ou dados.
