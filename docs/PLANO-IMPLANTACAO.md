# Plano de implantação: Assistente de Textos do Service Desk

Documento para a TI e para a coordenação do Service Desk. Descreve como a extensão chega aos analistas, em que ordem, quem decide o quê e como saber que deu certo. Os detalhes técnicos estão nos documentos citados em cada etapa; este plano só organiza a sequência.

Itens marcados com **(confirmar)** dependem de verificação no ambiente da organização antes de valer.

## 1. Resumo

- A extensão roda no Microsoft Edge estável, sem rede, com permissões `sidePanel` e `storage`. O texto nunca sai do navegador e o conteúdo do chamado não é guardado.
- O caminho mais rápido para a equipe inteira é a **loja do Edge em visibilidade restrita, com instalação forçada pela TI**. É o único caminho com atualização automática, sem servidor próprio.
- O maior prazo não é técnico: é a revisão da loja e a conta de desenvolvedor. Por isso o piloto roda em paralelo, em máquinas de homologação, com o pacote instalável.
- A inteligência artificial embarcada do Edge não entra neste plano. Ela está adiada até haver evidência de qualidade e disponibilidade no canal estável (`docs/ESTUDO-IA-EMBARCADA.md`).

## 2. Escopo

Dentro do escopo:
- instalação e atualização da extensão nas máquinas do piloto e depois da equipe;
- o perfil de linguagem da organização, entregue por política gerenciada;
- piloto de 14 dias com medição de uso;
- testes de formato no sistema de chamados e de leitor de tela.

Fora do escopo neste ciclo:
- inserção automática de texto no sistema de chamados;
- geração de texto por modelo de linguagem embarcado;
- integração com outros sistemas da organização.

## 3. Papéis

| Papel | Responsabilidade |
|---|---|
| Desenvolvimento | Manter o código, gerar os pacotes, responder a defeitos do piloto |
| TI | Decidir as políticas, o modo do desenvolvedor no piloto, a conta da loja e a instalação forçada |
| Coordenação do Service Desk | Escolher o grupo do piloto, receber o feedback semanal e decidir a ampliação |
| Titular da conta de desenvolvedor | Responder pela conta no Partner Center (**confirmar quem é**) |
| Analistas do piloto | Usar a extensão, preencher o feedback semanal e exportar os contadores ao final |

## 4. Decisões necessárias antes do piloto

| # | Decisão | Quem decide | Consequência se não houver resposta |
|---|---|---|---|
| D1 | O modo do desenvolvedor pode ficar ligado nas máquinas do piloto? | TI | Sem ele, o piloto não instala o pacote por pasta |
| D2 | A organização aceita publicar na loja do Edge em visibilidade restrita? Quem é o titular da conta? | TI e jurídico | Sem loja, o caminho passa a ser a opção C (servidor próprio), com mais prazo |
| D3 | Há processo de aprovação de extensões (lista de permitidas, revisão de segurança)? | TI e segurança | Pode adicionar uma etapa de revisão antes do piloto |
| D4 | Como o perfil de linguagem da organização chega aos analistas: por política (recomendado) ou por arquivo importado? Quem assina o perfil e guarda a chave privada? | TI e coordenação | Sem perfil, a extensão usa o padrão do projeto, que não reflete os termos da organização |
| D5 | Qual é o grupo do piloto e qual o tamanho (5 a 10 pessoas)? | Coordenação | Sem grupo, o piloto não começa |

## 5. Fases

### Fase 0: fechar a versão (dia 0 a 1)
- Mesclar a integração (PR #20) com "Create a merge commit". Autorização: responsável pelo repositório.
- Criar a tag `v1.0.0.2`. O fluxo de release publica os dois pacotes e o arquivo `SHA256SUMS.txt`.
- Saída: release publicada, com os hashes conferidos.

### Fase 1: decisões e conta (semana 1, em paralelo com a fase 2)
- Responder D1 a D5 (seção 4).
- Abrir a conta de desenvolvedor da organização na loja do Edge (**confirmar prazo e custo**, se houver).
- Usar o `PRIVACY.md` público do repositório como política de privacidade, ou uma página equivalente da organização (**confirmar se a TI prefere outra**).
- Gerar as capturas de tela com `scripts/demo-capture.mjs` (o CI as publica como artefato).
- Saída: decisões registradas, conta criada, política de privacidade publicada.

### Fase 2: piloto com o pacote instalável (semana 1 a 3)
- Instalar o `escrita-digimais.ai_v1.0.0.2.zip` nas máquinas do piloto, pelo passo a passo de `docs/VALIDACAO-PILOTO.md`, seção 1.
- No primeiro dia, testar a atualização no lugar: instalar a versão seguinte por cima e conferir que as preferências permanecem e que não surge uma segunda extensão. Este teste ainda não foi feito no Edge real.
- Acompanhar pelo feedback semanal (`docs/FEEDBACK-PILOTO.md`) e pelos contadores opt-in.
- Saída: relatório do piloto com o resultado dos critérios da seção 7.

### Fase 3: loja em visibilidade restrita (semana 1 a 3, em paralelo)
- Enviar o pacote da loja (`escrita-digimais.ai_v1.0.0.2_loja.zip`, sem chave) com:
  - descrição em português;
  - capturas de tela;
  - justificativa das permissões: `sidePanel` (painel lateral de trabalho) e `storage` (preferências e perfil guardados só no navegador);
  - declaração de que nada sai do navegador e de que não há telemetria.
- Aguardar a revisão da loja (**prazo de revisão não documentado aqui; confirmar no Partner Center**).
- Saída: extensão publicada em visibilidade restrita, com o ID definitivo registrado.

### Fase 4: troca do piloto para a loja (quando a loja aprovar)
- Trocar o piloto da pasta para a instalação pela loja. As preferências locais se perdem nessa troca, pois cada ID tem seu próprio armazenamento. O perfil da organização, entregue por política, não se perde.
- Avisar os analistas: a troca é uma reinstalação única, e as preferências devem ser refeitas.
- Saída: piloto inteiro na loja, com o ID definitivo.

### Fase 5: instalação forçada para a equipe (depois do piloto aprovado)
- Configurar a política `ExtensionInstallForcelist` com o ID da loja, primeiro para o grupo do piloto e depois para a equipe. Referência: `docs/DISTRIBUICAO.md`, seção 3.
- Configurar o perfil da organização por `languageProfile` e, se houver assinatura, `profileSigningPublicKeys` (`docs/DISTRIBUICAO.md`, seção 3).
- Verificar a instalação em `edge://policy` e `edge://extensions` de uma máquina de cada grupo.
- Saída: equipe com a extensão instalada e atualizada pela loja.

### Fase 6: operação contínua
- A cada versão: `npm run check` verde, tag, release com hashes, envio à loja. A atualização chega sem ação do analista.
- Acompanhar pelos contadores opt-in e pelo `scripts/analyze-usage.mjs`, quando houver dados.
- Reavaliar a inteligência artificial embarcada só quando o canal estável tiver a API com qualidade comprovada.

## 6. Plano de contingência

| Situação | Ação |
|---|---|
| A TI recusa a loja | Usar a opção C de `docs/DISTRIBUICAO.md`: chave privada fora do repositório, `update_url` e servidor interno. Acrescenta dias de trabalho |
| A loja reprova a extensão | Ler o motivo informado pela loja, corrigir e reenviar. Enquanto isso, o piloto segue com o pacote instalável |
| Atualização no lugar falha no Edge real | Não instalar na equipe. Corrigir o ID ou a chave e repetir o teste da fase 2 |
| Defeito grave em uma versão | Publicar a versão seguinte com número maior (a loja não aceita número menor). Enquanto isso, a TI remove a extensão do grupo pela política |
| Analistas recusam o uso no piloto | Ouvir o motivo no feedback semanal; decidir entre ajustar o produto ou encerrar o piloto |

## 7. Critérios de sucesso

| Critério | Medida | Alvo | Onde se mede |
|---|---|---|---|
| Instalação | Máquinas com a extensão funcionando | Todas as do piloto | Checklist da fase 2 |
| Atualização | Preferências e instalação única após atualizar | Sem perda, sem duplicata | Teste do primeiro dia |
| Adoção | Divisões do rascunho livre que chegam a preencher o formulário | 70% ou mais (abaixo de 50% o rascunho livre volta ao desenho) | `draft_apply` sobre `draft_split` (`docs/AVALIACAO-RASCUNHO.md`) |
| Qualidade do texto | Feedback dos analistas sobre a naturalidade | Ao menos 7 de 10 respostas positivas | `docs/FEEDBACK-PILOTO.md` |
| Formato | Textos colados no sistema de chamados | Sem quebra de linha, numeração ou acento perdidos | `docs/AMOSTRAS-FORMATO.md` |
| Acessibilidade | Roteiro com leitor de tela | Sem bloqueio do fluxo principal | `docs/ACESSIBILIDADE.md` |

## 8. Segurança e privacidade

- Permissões: apenas `sidePanel` e `storage`. Sem acesso a sites, abas ou área de transferência em segundo plano.
- Rede: a extensão não faz chamadas. Não há telemetria; os contadores são números guardados no navegador e só saem quando o analista exporta o arquivo.
- Dados: o texto do chamado não é guardado. Credenciais e chaves bloqueiam a geração. Outros dados sensíveis são mascarados com aviso.
- Perfil importado: só texto simples validado. Com chave de assinatura configurada, só vale perfil assinado.
- Modelo de IA: nenhum modelo é empacotado nem baixado pela extensão nesta versão.

## 9. Comunicação aos analistas

- Antes do piloto: explicar o objetivo, o que a extensão faz e o que não faz, e que o texto não sai do navegador.
- Durante o piloto: feedback semanal por canal interno.
- Na troca para a loja: aviso com a data e a orientação de refazer as preferências.
- Na equipe: a atualização acontece sozinha; não é preciso reinstalar.

## 10. Cronograma de referência

| Semana | Entrega |
|---|---|
| 1 | Fase 0 concluída; decisões D1 a D5; conta da loja; piloto iniciado; envio à loja |
| 2 | Piloto em andamento; acompanhamento semanal; teste de formato e de leitor de tela |
| 3 | Fim do piloto; relatório com os critérios da seção 7; decisão de ampliação |
| 4 em diante | Troca para a loja (quando aprovada); instalação forçada para a equipe |

Os prazos são de referência. A loja e a TI determinam o ritmo real.

## 11. Referências

- `docs/DISTRIBUICAO.md`: opções A, B e C, política e decisões da TI
- `docs/VALIDACAO-PILOTO.md`: roteiro de instalação, de testes e de piloto
- `docs/GOVERNANCA.md`: proteção da branch principal e exclusão automática de branches
- `docs/DESENVOLVIMENTO-EDGE.md`: atualização sem duplicar a extensão
- `docs/ENTREGA.md`, `PRIVACY.md`, `SECURITY.md`: entrega, privacidade e segurança
