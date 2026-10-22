# Entrega: estado do projeto

Assistente de Textos do Service Desk, versão 1.0.0.1. Extensão para Microsoft Edge que ajuda analistas a redigir textos de chamados. Funciona 100% no navegador, sem rede e sem telemetria. Este documento fecha o desenvolvimento e lista, com dono, o que ainda depende de pessoas.

## Estado
**Funcional e pronto para demonstração.** O pacote `escrita-digimais.ai_v1.0.0.1.zip` instala sozinho no Edge (116 ou superior) e foi exercitado em Chromium real.

## O que está incluído
- **Geração** de 10 tipos de comunicação, com variações determinísticas, perfil de linguagem e limites de tamanho.
- **Segurança do conteúdo:** credenciais, tokens e chaves bloqueiam a geração e a cópia; dados pessoais e de infraestrutura são mascarados com aviso, desfazer e sem alterar o texto do analista.
- **Revisão de texto pronto** com alertas de tom, de compromisso implícito, de prazo, de causa sem evidência, de siglas e de tamanho.
- **Perfil e política:** perfil importável e validado; política gerenciada; assinatura opcional de perfil (ECDSA P-256) com reverificação a cada abertura; camada da equipe que só restringe regras.
- **Redação natural** (padrão para texto a pessoas): voz da equipe e para quem lê ("você" no lugar de "o usuário"), frases de ligação, parágrafos, saudação com o primeiro nome e catálogo de 4 redações por ponto; o estilo Estruturada preserva a redação anterior. Ver `docs/MELHORIAS-REDACAO.md`.
- **Aprendizado local de preferência** (opcional, desligado por padrão): só contagens inteiras, zerável. **Rascunho livre**: cola a anotação, a extensão sugere o campo de cada trecho e o analista confere antes de preencher. Treinado só com exemplos fictícios; a taxa de acerto real será medida no piloto (`docs/AVALIACAO-RASCUNHO.md`).
- **Contadores de uso** opcionais (desligados por padrão), só numéricos, exportáveis e analisáveis.
- **Interface** em Material Design 3 com Google Sans Flex local, tema claro e escuro, reflow a 320 px, desfazer de limpeza e anúncio para leitor de tela.
- **Modo de desenvolvimento** para o Edge e documentação de instalação.

## Distribuição e releases
- Como a equipe recebe a extensão (piloto manual, loja do Edge com instalação forçada, hospedagem própria): [DISTRIBUICAO.md](DISTRIBUICAO.md), com as decisões que cabem à TI.
- Dois zips por versão: o **instalável** (ID fixo, uma versão nova substitui a anterior mantendo as preferências) e o da **loja** (sem chave). A versão instalada aparece em Configurações.
- O zip é reprodutível e a release é publicada por tag (`.github/workflows/release.yml`), com SHA-256 e `SHA256SUMS.txt`.
- O CI roda a demonstração e o ensaio do piloto em Chromium real contra o zip extraído.

## O que foi verificado
| Verificação | Resultado |
|---|---|
| Testes automatizados (Vitest, Testing Library, axe-core) | 508 testes em 35 arquivos, todos verdes |
| Lint, typecheck, build de produção e de desenvolvimento, verificação do pacote | exit 0 |
| Dependências de produção (`npm audit`) | 0 vulnerabilidades |
| Permissões do pacote | somente `sidePanel` e `storage`, sem permissão de site |
| Política de conteúdo | `default-src 'none'`, `connect-src 'none'`, sem scripts inline |
| Detecção de dados sensíveis (corpus sintético de 112 casos) | 100% dos segredos bloqueantes pegos; precisão e revocação acima dos pisos do CI |
| Reflow a 320 px em Chromium real | 8 cenários OK |
| Roteiro de demonstração no zip extraído | 8 verificações OK (`scripts/demo-capture.mjs`) |
| Ensaio do piloto em Chromium real | 9 verificações OK (`scripts/pilot-rehearsal.mjs`) |

## Limitações conhecidas
- A detecção é heurística. Por desenho, CPF e CNPJ com pontuação são sinalizados mesmo com dígito inválido, e versões de quatro partes podem ser lidas como IP (`docs/AVALIACAO.md`).
- O teste com leitor de tela (NVDA e Narrador) exige uma pessoa e **não foi feito**. Há testes automáticos de acessibilidade, que não o substituem.
- O formato do texto no sistema de chamados real **não foi validado** (roteiro em `docs/VALIDACAO-PILOTO.md`, amostras em `docs/AMOSTRAS-FORMATO.md`).
- O texto é copiado e colado pelo analista: não há integração com o sistema de chamados.
- Nenhum PR teve revisão por outra pessoa.

## Decisões fechadas
| Item | Situação |
|---|---|
| D1 forma de mesclagem | Merge commit; PR único de entrega (este) |
| D2 contadores de uso | Implementado, opt-in |
| D3 | Não implementado, por recomendação (só se a organização autorizar a opção com política) |
| D4 perfis em camadas | Implementado, somente restritivo |
| D5 assinatura de perfil | Implementado, ECDSA P-256 |
| D8 inserir texto no sistema de chamados | Adiado: precisa de evidência de atrito ao colar, de revisão de segurança e de nova permissão |
| D9 IA por gateway corporativo | Adiado: pré-requisitos jurídicos, de segurança e de gateway |
| D10 skill nos outros repositórios | Não feito: o ambiente negou acesso a esses repositórios |

## Pendências, com dono
| # | Pendência | Dono | Observação |
|---|---|---|---|
| 1 | Mesclar o PR de entrega na `main` (merge commit) e fechar os PRs #2 a #17 | Você | A mesclagem foi negada ao ambiente automatizado |
| 2 | Proteger a `main`, ativar exclusão automática de branches, apagar a branch do PR #1, resolver a cobrança do Actions | Você | Passos em `docs/GOVERNANCA.md` (o ambiente não pôde aplicar) |
| 3 | Validar o formato no sistema de chamados real (D6) | Você | `docs/VALIDACAO-PILOTO.md`, seção 2 |
| 4 | Escolher o canal de feedback (D7) | Você | O repositório é público: não usar issues |
| 5 | Teste com NVDA e Narrador | Pessoa com leitor de tela | `docs/ACESSIBILIDADE.md` |
| 6 | Piloto de 14 dias e análise dos contadores | Você e o grupo piloto | `scripts/analyze-usage.mjs`; depois decide-se D8 |
| 7 | Gerar o pacote final na `main` e registrar o SHA-256 na release | Você ou o ambiente, após a mesclagem | `npm ci && npm run package` |
| 8 | Revisão humana do código de assinatura de perfil e do tema | Pessoa com perfil de segurança e de interface | Recomendada antes de produção |
