# Segurança

## Modelo de ameaça resumido
| Ameaça | Mitigação |
|---|---|
| Vazamento de conteúdo de chamado para terceiros | Sem rede: CSP `connect-src 'none'`, sem permissões de host, ESLint e testes proíbem `fetch`, XHR, WebSocket e `sendBeacon`; `verify-dist` audita o pacote |
| Credenciais coladas em chamados | Detecção local bloqueia a geração e a cópia; o valor nunca é exibido nem retornado em alertas |
| Exposição de dados pessoais ou de infraestrutura | Detecção conservadora com mascaramento visível na prévia e remoção assistida com “Desfazer” |
| Persistência indevida de dados | Allowlist de chaves em `chrome.storage.local`; conteúdo vive só em memória; limpeza por inatividade e “Limpar tudo” |
| Perfil institucional trocado por um adulterado (arquivo ou disco local) | Com `profileSigningPublicKeys` na política: só importa envelope assinado (ECDSA P-256, WebCrypto local), falha fechada sem assinatura válida e reverifica o perfil guardado a cada abertura; a chave privada fica fora da extensão e do repositório |
| Camada de equipe afrouxando regras da organização | Mesclagem só restritiva (união de termos, menor tamanho, regras de encerramento mais rígidas); campos de estilo e de silenciamento de alertas são recusados; mesma validação de texto simples do perfil; revalidada a cada abertura |
| Telemetria que vire vazamento de conteúdo | Contadores desligados por padrão; só inteiros em chaves de lista fechada (códigos de alerta limitados por formato e quantidade); valores adulterados são descartados na leitura; sem texto, sem marca de tempo por evento, sem rede; política `usageCounters` permite à organização desligar ou ligar |
| Perfil importado malicioso (XSS, links de phishing, ReDoS, poluição de protótipo) | Validação estrita: só texto simples, sem HTML, URLs ou esquemas; chaves desconhecidas recusadas; termos escapados, nunca usados como regex; limite de 100 KB; React sem `innerHTML` |
| Código remoto ou injetado | CSP `script-src 'self'`, sem CDN, sem `eval`/`new Function`, sem scripts inline; build com Vite sem polyfill inline |
| Abuso de permissões | Somente `sidePanel` e `storage` |
| Texto que induz o usuário a enviar credenciais | Regra bloqueante `ask_credentials` impede gerar ou copiar pedidos de senha, token ou código |
| Entradas abusivas (desempenho) | Limites de tamanho por campo e total; regexes sem retrocesso catastrófico, com teste de entrada longa |

Limitações conhecidas: a detecção é heurística e pode ter falsos negativos. O analista continua responsável por revisar o texto.

## Permissões e justificativas
- `sidePanel`: exibir a interface principal no painel lateral.
- `storage`: salvar preferências não sensíveis e o perfil de linguagem; ler política gerenciada (`storage.managed`).

## Biblioteca de modelos
- Arquivo importado com limite de 400 KB, no máximo 200 modelos de 1.500 caracteres, só texto simples (sem HTML, links, esquemas executáveis ou caracteres de controle), chaves desconhecidas recusadas e campos entre chaves limitados a uma lista fechada (`config/library-schema.ts`). O objeto guardado é montado campo a campo, nunca por mesclagem do JSON.
- Triagem na importação (`domain/library-vetting.ts`): qualquer dado sensível, pedido de credencial ou de dado pessoal, prazo concreto, solução afirmada fora do encerramento, ameaça de encerramento, urgência sem motivo, termo proibido pelo perfil, emoji, pontuação exagerada e caixa alta de ênfase recusam a biblioteca inteira, com o motivo de cada modelo.
- Com `profileSigningPublicKeys` na política, só vale biblioteca assinada (`signed-library-v1`, a mesma chave ECDSA P-256 do perfil, `node scripts/sign-profile.mjs sign-library`). A assinatura guardada é reverificada a cada abertura (falha fechada). Assinatura de perfil não vale como biblioteca, porque o formato e o conteúdo assinado são outros.
- A biblioteca só oferece texto: nada é inserido, copiado ou enviado sem ação do analista.
- Modelos ensinados (`domain/teach.ts`, aba "Ensinar"): o salvamento exige clique do analista, passa pelo mesmo esquema (`validateLibrary`) e pela mesma triagem (`vetModel`) da biblioteca, e a leitura revalida cada modelo (um inválido derruba só a si mesmo) e refaz a triagem com o perfil e a camada em vigor. O texto colado vive só em memória. Limites: 200 modelos, 1.500 caracteres por modelo. Risco residual: nome de pessoa fora da saudação não é detectado; a tela avisa e o analista confere. A exportação usa o formato da biblioteca para a TI revisar, assinar e distribuir; modelos ensinados nunca valem como biblioteca assinada.
- Estilo ensinado (`config/taught-style.ts`, `domain/style-learn.ts`): só saudação, fecho e assinatura, linhas simples (sem chaves, links, HTML ou quebras de linha; `{nome}` só na saudação), revalidadas na leitura e na gravação, triadas por `vetStyle` (dado sensível e termos proibidos do perfil). Não altera alertas, termos proibidos, textos obrigatórios nem política: a revisão roda sobre o texto final. Com `profileSigningPublicKeys` na política o estilo pessoal não é aplicado, porque a camada de equipe já proíbe mudar saudação, fecho e assinatura sem perfil assinado.
- Triagem única (`application/analyst-content.ts`): biblioteca, modelos ensinados e estilo são reavaliados com o perfil efetivo (o mesmo da geração) ao abrir a extensão e sempre que o perfil ou a camada de equipe mudam. O que deixa de passar sai de uso, com o motivo, e não é apagado; a camada continua sendo aplicada por último e só restringe.

## Correção de texto e lista de palavras
- A lista de frequência (`src/config/proofread/freq-pt.json`, cerca de 1 MB) entra por `import()` dinâmico, resolvido no build: não há `fetch`, host novo nem permissão nova. Ela vem do pacote `wordfreq` 3.1.1 (licença dos dados: CC BY-SA 4.0; veja `THIRD-PARTY-NOTICES.md`) e é regenerada por `scripts/gerar-lista-frequencia.py`.
- A correção só sugere. Nenhuma troca acontece sem ação do analista, e o texto não é persistido.
- O corretor do navegador (`spellcheck`) e o serviço Microsoft Editor do Edge não são controlados pela extensão: veja `PRIVACY.md` e a política `MicrosoftEditorProofingEnabled`.

## Reportar vulnerabilidade
Envie um relato privado ao responsável de segurança da sua organização ou ao mantenedor do repositório, com passos de reprodução, versão e impacto. Não abra issue pública com detalhes exploráveis. Meta de resposta inicial: 5 dias úteis.

## Dependências
- Versões fixadas (sem `^` ou `~`), `package-lock.json` versionado e `save-exact=true` em `.npmrc`.
- Somente React em tempo de execução; ferramentas de build e teste são dependências de desenvolvimento.
- Rode `npm audit` antes de cada versão e revise atualizações manualmente.
- O teste `manifest.test.ts` falha se surgir biblioteca de rede, analytics ou rastreamento.
- No CI, as GitHub Actions são fixadas por SHA de commit (não por tag), o token do workflow tem somente `contents: read` e o checkout não persiste credenciais.
- A fonte Google Sans Flex é uma dependência de desenvolvimento (`@fontsource-variable/google-sans-flex`, versão fixa) e vira arquivo local em `assets/`. A CSP não libera `data:` nem hosts externos: a build usa `assetsInlineLimit: 0` e `verify:dist` recusa `data:` em CSS.

## Segredos
É proibido versionar segredos, chaves de API, tokens, certificados ou arquivos `.env`. O `.gitignore` bloqueia padrões comuns, e um teste procura formatos conhecidos de chave no código-fonte. A extensão nunca deve pedir chave de API ao usuário.
