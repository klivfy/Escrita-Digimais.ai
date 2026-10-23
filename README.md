# Escrita-Digimais.ai

A extensão deve ajudar analistas a produzir textos claros, cordiais, objetivos e tecnicamente adequados.

## Assistente de Textos do Service Desk

Extensão para Microsoft Edge (Chromium, Manifest V3) que ajuda analistas de Service Desk a redigir textos claros, cordiais e objetivos para chamados, a partir do contexto informado pelo próprio analista.

## Finalidade
Gera sugestões padronizadas para:
1. solicitar informações ao usuário;
2. registrar nota técnica;
3. registrar pendência;
4. solicitar aprovação ou “De acordo” de gestor;
5. comunicar andamento;
6. confirmar solução com o usuário;
7. encerrar chamado solucionado;
8. encerrar por ausência de retorno (somente com regra da organização e histórico suficiente);
9. redirecionar ou escalonar;
10. texto livre guiado.

## Limitações (por desenho)
- Auxilia a redação. Não decide, não altera chamados e não envia mensagens.
- Não lê páginas nem sistemas de chamados: o analista digita ou cola o contexto.
- O motor é determinístico (templates e regras), não um modelo de linguagem. Ele não reescreve livremente nem infere fatos: se faltar informação essencial, pergunta ao analista.
- A detecção de dados sensíveis e os indicadores de qualidade são heurísticos e podem errar. A revisão humana é obrigatória.
- O texto livre guiado usa a frase principal exatamente como informada.
- “Outra variação” alterna frases equivalentes de abertura, fechamento e cortesia, escolhidas por posição (sem sorteio): a mesma sequência de cliques gera sempre os mesmos textos, e os fatos informados não mudam. Há até 8 combinações em tipos como “Solicitar informações”. Tipos sem frases alternativas, como a nota técnica, repetem o texto. A organização amplia as opções no perfil de linguagem.

## Arquitetura
```
src/
  domain/          motor puro e testável
    normalize      normalização conservadora
    sensitive      detecção e mascaramento de dados sensíveis
    classify       ações concluídas e planejadas, datas, prazo explícito
    sufficiency    matriz de campos mínimos por tipo
    policy         consistência de encerramento e regras da organização
    planner        plano de seções da mensagem
    renderer       formatação do plano em texto
    risks, review  riscos e estilo; revisão de texto gerado ou editado
    proofread      correção de acento e grafia por lista de frequência (só sugere)
    agreement      concordância, crase e uso de palavras parecidas por regras fechadas (só sugere)
    quality        indicadores de 0 a 100 e regras acionadas
    engine         pipeline completo
  config/          dados: vocabulário, templates, blueprints, campos, perfil padrão, validação do perfil
  application/     provedor local, adaptador remoto desativado, formulário, preferências
  infrastructure/  chrome.storage, clipboard, sidePanel, service worker, política gerenciada
  ui/              React: painel lateral e popup
  tests/           Vitest, Testing Library, axe-core
scripts/           ícones, pós-build, verificação do pacote, empacotamento
examples/          perfil de linguagem de exemplo
```
Pipeline: normalização, dados sensíveis (bloqueio ou mascaramento), suficiência, classificação, política, planejamento, renderização, revisão e pontuação.

## Instalação e comandos
Requisitos: Node.js 20 ou superior.
```
npm ci
npm run check      # lint, typecheck, testes, builds e verificação dos pacotes
npm test           # somente testes
npm run dev        # build de desenvolvimento em dist-dev/, refeito a cada alteração
npm run build:dev  # build de desenvolvimento único, com verificação do pacote
npm run build      # gera dist/
npm run verify:dist
npm run package    # gera release/escrita-digimais.ai_v<versão>.zip
npm run icons      # regenera os ícones PNG (sem dependências externas)
npm run audit:deps # npm audit das dependências de produção
```

## Integração contínua
O workflow `.github/workflows/ci.yml` roda a cada pull request e a cada push no `main`: `npm ci`, `npm run check` (lint, typecheck, testes, builds de produção e de desenvolvimento e verificação dos pacotes), `npm audit` das dependências de produção e o empacotamento. O `.zip` da extensão fica disponível como artefato da execução por 14 dias. As actions são fixadas por SHA de commit, e o token tem apenas permissão de leitura.

## Carregar no Microsoft Edge
Resumo (o passo a passo completo, com depuração, política de teste e solução de problemas, está em [`docs/DESENVOLVIMENTO-EDGE.md`](docs/DESENVOLVIMENTO-EDGE.md)):
1. Rode `npm run dev` (desenvolvimento, gera `dist-dev/` e refaz o build a cada alteração) ou `npm run build` (produção, gera `dist/`).
2. Abra `edge://extensions` e ative “Modo de desenvolvedor”.
3. Clique em “Carregar sem compactação” e selecione `dist-dev/` ou `dist/` (nunca a raiz do repositório).
4. Clique no ícone da extensão e em “Abrir painel lateral”.

Sem Node, use o `.zip` do artefato do CI. Requer Edge 116 ou superior (API `chrome.sidePanel.open`).

## Qualidade da detecção
A detecção de dados sensíveis é medida contra um corpus sintético de 112 casos e protegida no CI por pisos de qualidade, com tolerância zero para segredos bloqueantes que escapem. Resultados, falhas conhecidas e limites em [docs/AVALIACAO.md](docs/AVALIACAO.md).

## Acessibilidade
A interface é testada com axe-core (WCAG 2.2 AA), verificação de marcos, títulos, nomes, foco e anúncios, e contraste nos dois temas. O teste com leitor de tela (NVDA e Narrador) exige uma pessoa e ainda não foi executado: o roteiro e a tabela de resultados estão em [docs/ACESSIBILIDADE.md](docs/ACESSIBILIDADE.md).

## Design visual

A interface segue o Material Design 3: papéis de cor tonais (tema claro e escuro conforme o sistema), formas, escala tipográfica e estados de interação (hover, foco, pressão). A fonte é a Google Sans Flex (variável, com tamanho óptico), embutida no pacote sob licença SIL OFL 1.1; não há CDN nem Google Fonts em tempo de execução. Sem a fonte, o navegador usa Google Sans, Roboto ou a fonte do sistema.

- Tokens em `src/ui/styles/tokens.css`; estilos em `app.css`; `@font-face` em `fonts.css`.
- Respeita `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast` e cores forçadas do Windows. O foco por teclado é sempre visível.
- `src/tests/contrast.test.ts` confere o contraste WCAG AA de todos os pares de cor usados, nos dois temas.
- Avisos de terceiros em `THIRD-PARTY-NOTICES.md`; a licença da fonte também vai dentro do pacote (`licenses/`).

## Entrega e demonstração
- Estado do projeto, limitações e pendências com dono: [docs/ENTREGA.md](docs/ENTREGA.md).
- Roteiro de demonstração de 7 minutos, ensaiado em navegador real: [docs/DEMONSTRACAO.md](docs/DEMONSTRACAO.md) (`node scripts/demo-capture.mjs <pasta-da-extensao> demo` gera as imagens de reserva).

## Validação, piloto e governança
- Roteiro de instalação, formato e piloto: [docs/VALIDACAO-PILOTO.md](docs/VALIDACAO-PILOTO.md); amostras: [docs/AMOSTRAS-FORMATO.md](docs/AMOSTRAS-FORMATO.md); modelo de feedback: [docs/FEEDBACK-PILOTO.md](docs/FEEDBACK-PILOTO.md).
- Análise dos contadores exportados: `node scripts/analyze-usage.mjs arquivo1.json arquivo2.json`.
- Proteção da `main` e demais ajustes de administração: [docs/GOVERNANCA.md](docs/GOVERNANCA.md).

## Uso
0. **Redação natural (padrão para texto a pessoas)**: o texto usa frases de ligação, fala em nome da equipe ("resetei" vira "resetamos", por lista fechada de verbos, com alerta informativo do que mudou) e pode saudar pelo primeiro nome. Quando o texto é para o próprio usuário, referências a ele em terceira pessoa passam para "você"/"seu" (por lista fechada, com aviso do que mudou), e fatos e próximos passos formam parágrafos. O estilo **Estruturada** mantém rótulos fixos e as suas palavras exatamente como digitadas. Notas técnicas e textos para equipe técnica ou fornecedor não mudam.
0. **Rascunho livre (opcional)**: em "Contexto", cole a sua anotação bruta e clique em "Dividir em campos". A extensão sugere em qual campo cada trecho entra (contexto, ação feita ou planejada, resultado, pendência, ação esperada, pergunta), você confere e corrige, e só então o formulário é preenchido, sem sobrescrever o que já estiver escrito. Dado que bloqueia a geração impede a divisão.
1. Escolha o tipo de comunicação e o destinatário (o destinatário aplica nível técnico e formalidade sugeridos, até você alterar manualmente).
2. Preencha os campos exibidos para o tipo. Campos opcionais ficam em “Campos opcionais”.
3. Confira o painel “Possíveis dados sensíveis”. Credenciais bloqueiam a geração. Outros dados podem ser substituídos por marcador com um clique (e desfeitos).
4. “Gerar prévia”. Se faltar algo essencial, a extensão lista perguntas objetivas e destaca os campos.
5. Revise e edite a prévia. “Revisar novamente” reavalia o texto editado. “Comparar com o texto inicial” mostra as diferenças.
6. “Copiar texto”. Em seguida, a extensão oferece limpar o conteúdo.
7. Limpou sem querer? “Desfazer limpeza” fica disponível por 30 segundos e restaura o conteúdo. Depois disso, ele é descartado da memória. A limpeza por inatividade nunca é desfeita, e “Limpar tudo” com a opção de apagar os dados salvos também descarta a possibilidade de desfazer. Os botões de limpar têm um escopo cada: “Limpar tudo” (cabeçalho, com confirmação), “Limpar formulário e prévia” (em “Mais ações”, com desfazer) e, no modo “Revisar texto pronto”, “Limpar revisão”, que apaga só a revisão e preserva o formulário de geração.

### Corrigir texto
O botão “Corrigir texto” abre um modo que sugere correções em duas camadas, sempre locais. Ortografia: acento ausente (“nao” por “não”) e palavras comuns escritas errado (“atualizaçao” por “atualização”), por uma lista de frequência do português. Regras fechadas: plural do substantivo e gênero do artigo (“os relatório”, “o senha”), adjetivo e particípio (“a lentidão foi resolvido”), verbo depois de sujeito plural (“as falhas persiste”), “houveram”, “fazem cinco horas”, “existe muitos”, crase em locuções (“à disposição”, “à tarde” depois de dia da semana, “encaminhado à infraestrutura”), “abaixo” e uso de “mas” e “mais”, “há” e “a”, “porquê” e “houve”. Cada sugestão mostra o trecho, a troca, a regra e o motivo, e só vale quando você aceita. “Aceitar acentos e grafia” aplica de uma vez só as de ortografia; as de regra são conferidas uma a uma. “Desfazer a última alteração” volta o texto e “Ignorar” vale só até a próxima verificação.

Limites: não é revisão gramatical completa e deixa passar muitos erros (só substantivos do léxico em `src/config/proofread/agreement-lexicon.ts` entram nas regras; nomes de pessoa ficam sem regra de gênero). Siglas, códigos, caminhos, e-mails, nomes próprios no meio da frase e termos de TI são ignorados. A lista de palavras (cerca de 1 MB) fica em arquivo separado e só é carregada na primeira verificação. Os campos de texto também pedem a verificação do próprio navegador em português. O texto nunca é enviado nem salvo. Medidas e limites em `docs/ESTUDO-CORRECAO-TEXTO.md`.

### Próximo passo e tipos mais usados
Depois de copiar um texto, o painel sugere até dois próximos passos comuns daquele atendimento (por exemplo, depois de "Solicitar informações": "Comunicar andamento" ou "Registrar pendência"). Escolher um passo troca o tipo e mantém os campos preenchidos para revisão; nada é gerado nem copiado sozinho. Os passos ficam em `src/config/dialogue.ts` e respeitam os tipos desativados pela organização. Com "Aprender com as redações que eu mantenho" ligado, a extensão reordena os passos pelo que o analista costuma escolher e mostra, abaixo do tipo, os tipos que ele mais copia ("Mais usados"). Só contagens são guardadas (`use.<tipo>` e `seq.<tipo>.<tipo>`), nunca texto.

### Revisar um texto pronto
O botão “Revisar texto pronto” abre um modo só de revisão: cole um texto que você já escreveu, escolha o tipo e o destinatário e receba alertas, sugestões e indicadores pelas mesmas regras locais. O texto nunca é alterado, enviado ou salvo. O contexto opcional (evidência registrada, confirmação do usuário, prazo já definido) evita alertas indevidos, porque o revisor não vê o chamado.

## Permissões e justificativas
| Permissão | Justificativa |
|---|---|
| `sidePanel` | Exibir a interface principal no painel lateral |
| `storage` | Salvar preferências não sensíveis e o perfil de linguagem; ler política gerenciada |

Não solicitadas: acesso a sites, abas, histórico, scripts de conteúdo ou `clipboardWrite`. A cópia usa a API padrão em resposta a um clique.

## Configuração organizacional
O perfil de linguagem (JSON, `schemaVersion: 1`) permite configurar: nome da organização, saudações por formalidade e destinatário, fechamentos, assinatura (`{organization}`), nomes das categorias, termos preferidos e proibidos, textos obrigatórios por tipo, aviso de privacidade, tamanho máximo, regras de encerramento, perfis por destinatário, siglas conhecidas, domínios internos e sobrescritas de templates (aberturas, fechamentos por tipo e rótulos). Veja `examples/perfil-exemplo.json`.

Chaves ausentes herdam o padrão. Precedência: política gerenciada, perfil importado, padrão.

### Encerramento por ausência de retorno
Desativado por padrão (opção mais segura). Para habilitar: `closureRules.noResponseEnabled: true`. As regras exigem `minAttempts` tentativas em datas distintas, sem datas futuras, e, se `requirePriorNotice`, aviso prévio após a primeira tentativa e há pelo menos `minDaysAfterNotice` dias.

### Importação e exportação seguras
Em “Configurações > Perfil de linguagem”. A importação é local e recusa: JSON inválido, arquivo acima de 100 KB, chaves desconhecidas (inclusive `__proto__`), HTML, links, esquemas executáveis, caracteres de controle, placeholders não permitidos e valores fora de faixa. Termos são comparados como texto, nunca como expressão regular. A exportação gera o JSON do perfil efetivo.

### Política gerenciada (implantação empresarial)
O esquema está em `public/managed-schema.json`. Exemplo de valor para a chave `languageProfile` (string JSON) via política do Edge (GPO/Intune, `3rdparty > extensions > <id> > policy`). A chave `profileSigningPublicKeys` (até duas chaves públicas ECDSA P-256, SPKI em base64) faz a extensão exigir perfil assinado: importação sem assinatura válida é recusada e o perfil guardado é reverificado a cada abertura. A chave `usageCounters` (`off`, `optional` ou `on`; padrão `optional`) controla os contadores de uso agregados, sem conteúdo e só locais (ver PRIVACY.md). A chave `aiProvider` está reservada e não ativa nenhuma chamada nesta versão.

### Assinatura de perfil (opcional)
```
node scripts/sign-profile.mjs keygen chave-da-org              # cria chave-da-org.private.pem e imprime a chave pública
node scripts/sign-profile.mjs sign perfil.json chave-da-org.private.pem
```
Publique a chave pública em `profileSigningPublicKeys` pela política e distribua o `perfil.assinado.json`. O perfil precisa estar na forma normalizada: parta de um perfil exportado pela extensão. Guarde a chave privada em cofre e fora do repositório (`*.pem` já é ignorado). Para rotacionar, publique a chave nova junto da antiga, reassine e depois remova a antiga.

## Empacotamento
`npm run package` executa build, verificação do pacote e gera um `.zip` de `dist/` em `release/`. A verificação (`scripts/verify-dist.mjs`) falha se encontrar permissões extras, CSP insegura, scripts inline, recursos remotos, `eval`, `new Function`, `fetch`, XHR, WebSocket ou `sendBeacon`.

## Checklist de publicação e implantação
- [ ] Workflow de CI verde no commit a ser publicado (equivale a `npm ci && npm run check` em ambiente limpo).
- [ ] `npm audit` sem vulnerabilidades relevantes; atualizações revisadas.
- [ ] Versão atualizada em `manifest.json` e `package.json`.
- [ ] Snapshots de template revisados por alguém de comunicação/qualidade.
- [ ] Perfil de linguagem da organização validado pela importação e testado com casos reais anonimizados.
- [ ] Decisão sobre `closureRules` registrada pela gestão do Service Desk.
- [ ] Teste manual no Edge: carregar `dist/`, gerar cada tipo, conferir bloqueios, copiar e limpar.
- [ ] Revisão de acessibilidade com leitor de tela (Narrador ou NVDA) e navegação só por teclado.
- [ ] `PRIVACY.md` e `SECURITY.md` revisados por privacidade e segurança.
- [ ] Publicação na Microsoft Edge Add-ons (privada/oculta) ou distribuição por política (`ExtensionInstallForcelist`), com o perfil em `languageProfile`.
- [ ] Canal de reporte de vulnerabilidades comunicado à equipe.

## Licença
Domínio público (Unlicense). Veja `LICENSE`.

### Biblioteca de modelos (opcional)
Textos prontos da instituição, escolhidos e revisados por pessoas, importados em Configurações (arquivo de exemplo em `examples/biblioteca-exemplo.json`). Cada modelo tem `id`, `title`, `types` (tipos de comunicação), `recipients` (opcional), `text`, `keywords` (opcional) e `reviewedAt` (opcional, AAAA-MM-DD). O texto pode usar campos entre chaves: `{nome}`, `{chamado}`, `{data}`, `{prazo}`, `{equipe}`, `{sistema}` e `{equipamento}`; qualquer outro campo é recusado. Limites: 400 KB, 200 modelos e 1.500 caracteres por modelo. Na importação, cada modelo passa pela detecção de dado sensível e pelas regras de revisão; se algum for recusado, nada é importado e a tela lista o motivo de cada um. Avisos que não impedem o uso (por exemplo, sigla não explicada) aparecem para o curador. Com `profileSigningPublicKeys` na política, só vale arquivo assinado:
```
node scripts/sign-profile.mjs sign-library biblioteca.json chave-da-org.private.pem
```
Nesta versão a biblioteca é importada, exportada e removida; a busca e a inserção do modelo na prévia vêm na etapa seguinte do plano em `docs/ESTUDO-ENSINAR-A-EXTENSAO.md`.

### Camada da equipe (opcional)
Além do perfil da organização, cada analista pode importar uma camada da equipe em Configurações. A mesclagem é restritiva: a camada só endurece regras, nunca afrouxa. Formato:
```json
{ "schemaVersion": 1, "overlayName": "Equipe Redes", "forbiddenTerms": ["gambiarra"], "maxLength": 1500, "closureRules": { "minAttempts": 4 } }
```
Campos aceitos: `forbiddenTerms`, `preferredTerms`, `requiredTexts`, `internalDomains` (somados à base), `maxLength` (vale o menor) e, em `closureRules`, `noResponseEnabled` (só desliga), `minAttempts` e `minDaysAfterNotice` (vale o maior) e `requirePriorNotice` (só liga). Saudações, fechamentos, assinatura, modelos, siglas conhecidas e aviso de privacidade são recusados. Como não pode afrouxar nada, a camada não exige assinatura, mesmo quando a organização exige perfil assinado.

## Decisões registradas
- Encerramento por ausência de retorno desativado por padrão.
- Dados pessoais e de infraestrutura são mascarados na prévia (com aviso), mantendo o campo original intacto.
- Credenciais e pedidos de credenciais bloqueiam geração e cópia.
- Conteúdo nunca é persistido; limpeza por inatividade padrão de 15 minutos.
- Contadores de uso são opt-in (ou definidos por política), apenas numéricos, em lista fechada de chaves, locais e exportáveis manualmente.
