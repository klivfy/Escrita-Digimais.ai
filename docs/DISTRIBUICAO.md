# Distribuição da extensão para a equipe

Documento para decidir com a TI como a extensão chega aos analistas. Ele não exige código novo para a maioria dos caminhos. Itens marcados com **(confirmar)** foram levantados na documentação pública da Microsoft e precisam ser conferidos no ambiente da organização antes de valer.

## 1. Situação hoje
- O pacote é um zip (`escrita-digimais.ai_vX.Y.Z.zip`, reprodutível, com SHA-256) instalado por "Carregar sem compactação" em `edge://extensions`, com o modo do desenvolvedor ligado.
- Isso serve ao piloto com poucas pessoas. Para a equipe inteira tem três problemas: depende de uma configuração de desenvolvedor, não atualiza sozinho e cada máquina vira uma instalação manual.
- A equipe usa o Edge **estável**.

## 1.1 Atualização: o que cada opção faz
| Opção | Atualiza sozinho? | Mantém as preferências? |
|---|---|---|
| A. Pasta (modo do desenvolvedor) | **Não.** Repetir o passo a passo de `docs/DESENVOLVIMENTO-EDGE.md` a cada versão | Sim, na mesma pasta e com o ID fixo do zip instalável |
| B. Loja do Edge com instalação forçada | **Sim**, pela atualização da própria loja | Sim, o ID da loja é estável entre versões |
| C. Hospedagem própria | Sim, se houver `update_url` e servidor | Sim, enquanto a chave não mudar |

O zip instalável tem ID fixo (`khilafnebmdhmlpkajikadidlgbcepdn`); o zip da loja não tem chave e recebe outro ID da loja. Políticas por ID precisam usar o ID do canal escolhido.

## 2. Opções

| Opção | Como funciona | Quando serve | Pontos de atenção |
|---|---|---|---|
| A. Instalação manual (modo do desenvolvedor) | Cada analista extrai o zip e carrega a pasta | Piloto com até uns 10 analistas, em máquinas de homologação | A política da organização pode bloquear o modo do desenvolvedor. O Edge pode avisar a cada abertura **(confirmar)**. Mover a pasta muda o ID e perde as preferências. Sem atualização automática |
| B. Edge Add-ons, listagem restrita, mais instalação forçada por política | Publicar na loja de extensões do Edge (visibilidade restrita ou oculta **(confirmar)**) e a TI força a instalação pelo ID | Produção para a equipe inteira | Revisão da Microsoft a cada versão. Exige conta de desenvolvedor da organização, política de privacidade pública, justificativa das permissões e capturas de tela. A extensão fica pública no repositório e o código é o mesmo da loja |
| C. Hospedagem própria (CRX e manifesto de atualização) | A TI hospeda o pacote assinado e um arquivo de atualização; a política aponta para ele | Se a organização não puder usar a loja | Exige gerar e guardar uma chave privada fora do repositório, fixar o ID com a chave no manifesto, adicionar `update_url` e manter um servidor interno. Em geral só funciona em máquinas gerenciadas **(confirmar)**. Mais trabalho de manutenção |

### Recomendação
1. **Piloto (14 dias):** opção A, em 5 a 10 máquinas de homologação, com a TI liberando o modo do desenvolvedor nelas.
2. **Produção:** opção B. É o único caminho com atualização automática, sem servidor próprio.
3. Opção C só se a TI recusar a loja.

## 3. Política para a opção B (instalação forçada)
- Política **ExtensionInstallForcelist**: cada item é o ID da extensão, opcionalmente seguido de `;` e a URL de atualização. Sem URL, o Edge usa o endereço de atualização do Edge Add-ons. Fonte: [documentação da política](https://learn.microsoft.com/deployedge/microsoft-edge-browser-policies/extensioninstallforcelist).
- Política **ExtensionSettings**: permite, por ID, fixar a extensão na barra e controlar a instalação. Guia: [ExtensionSettings](https://learn.microsoft.com/deployedge/microsoft-edge-manage-extensions-ref-guide).
- Configuração da própria extensão (política gerenciada), no registro, em `HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy` **(confirmar o caminho no ambiente)**. Chaves aceitas, definidas em `public/managed-schema.json`:
  - `languageProfile`: perfil de linguagem da organização (JSON). Tem precedência sobre perfis importados.
  - `profileSigningPublicKeys`: até duas chaves públicas ECDSA P-256 para exigir perfil assinado (`scripts/sign-profile.mjs`).
  - `usageCounters`: `off`, `optional` (padrão) ou `on`. Com `off`, o aprendizado de redação também fica desligado.
  - `aiProvider`: reservado, sem efeito nesta versão.

## 4. O que a TI precisa decidir ou fornecer
1. O modo do desenvolvedor pode ser liberado nas máquinas do piloto?
2. A organização aceita publicar na loja do Edge com visibilidade restrita? Quem é o titular da conta de desenvolvedor?
3. Qual é o processo de aprovação de extensões (lista de permitidas, revisão de segurança)? Esta extensão pede só `sidePanel` e `storage`, não acessa sites e não faz chamadas de rede (`docs/ENTREGA.md`, `SECURITY.md`).
4. Como o perfil de linguagem da organização será entregue (política, ou arquivo importado por cada analista)? Quem assina o perfil e guarda a chave privada?
5. Qual é o ID definitivo? Ele só existe depois da primeira publicação na loja (ou da fixação por chave na opção C).

## 5. Lista para publicar na loja (opção B)
- [ ] Conta de desenvolvedor da organização aberta no Partner Center do Edge.
- [ ] Política de privacidade em endereço público (use `PRIVACY.md` do repositório ou uma página equivalente).
- [ ] Descrição em português e capturas de tela (`scripts/demo-capture.mjs` gera as imagens; o CI as publica como artefato).
- [ ] Justificativa por permissão: `sidePanel` (painel lateral onde o analista trabalha) e `storage` (guardar preferências e perfil só no navegador).
- [ ] Declaração de que nada sai do navegador (sem rede, sem telemetria, conteúdo do chamado nunca é guardado).
- [ ] Versão do manifest incrementada e release publicada com o hash do zip.
- [ ] Teste do pacote da loja em máquina de homologação antes de forçar a instalação.

## 6. Atualização e retorno
- Cada versão nova é um zip novo, com SHA-256 registrado na release do GitHub.
- Na opção B a Microsoft revisa antes de publicar; planeje alguns dias entre o código pronto e o analista receber.
- Para voltar a uma versão anterior, publique a versão anterior com número maior (a loja não aceita número menor). Mantenha o zip anterior da release.
