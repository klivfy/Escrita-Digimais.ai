# Rodar a extensão no Microsoft Edge em modo desenvolvedor

Guia para carregar a extensão sem publicá-la, testar e depurar. Os rótulos da interface do Edge podem variar um pouco entre versões; entre parênteses está o rótulo em inglês.

## Requisitos
- Microsoft Edge 116 ou superior (confira em `edge://settings/help`).
- Modo de desenvolvedor de extensões permitido pela política da organização. Se a opção estiver desativada e cinza em `edge://extensions`, peça à TI uma máquina de homologação.
- Para os caminhos A e B: Git, Node.js 20 ou superior e npm. O caminho C não exige Node.

## Escolha o caminho

| Caminho | Quando usar | Pasta a carregar no Edge |
|---|---|---|
| A. Desenvolvimento com rebuild automático | Editar código e ver o resultado | `dist-dev/` |
| B. Build de produção local | Teste manual antes de publicar (checklist do README) | `dist/` |
| C. Pacote gerado pelo CI | Testar sem instalar Node | Pasta extraída do artefato |

Carregue uma pasta por vez. Cada pasta carregada vira uma extensão separada, com ID e dados próprios.

> Não selecione a raiz do repositório. Ela também tem um `manifest.json` (a fonte), mas não tem o `background.js` compilado, e o Edge recusa a extensão.

## Caminho A: desenvolvimento

### 1. Preparar e iniciar o build em modo watch
```
git clone https://github.com/Mestrys/Escrita-Digimais.ai.git
cd Escrita-Digimais.ai
npm ci
npm run dev
```
Deixe o terminal aberto. O comando gera `dist-dev/` (com sourcemaps e sem minificação) e refaz o build a cada alteração em `src/`, `manifest.json` ou `public/`. Cada build termina com a linha `built in ...`.

### 2. Carregar a extensão
1. Abra `edge://extensions`.
2. Ative **Modo de desenvolvedor** (Developer mode).
3. Clique em **Carregar sem compactação** (Load unpacked) e selecione a pasta `dist-dev` (a que contém `manifest.json` e `background.js`).
4. Clique no botão **Extensões** da barra de ferramentas e fixe o "Assistente de Textos do Service Desk" para deixar o ícone visível.
5. Clique no ícone e em **Abrir painel lateral**.

Ao iniciar o Edge, pode aparecer um aviso para desativar extensões em modo de desenvolvedor. É esperado: escolha manter a extensão ativa.

### 3. Ciclo de edição
Não existe recarga automática no navegador. Isso é intencional: o hot reload do Vite depende de um servidor local e de WebSocket, o que violaria a CSP (`connect-src 'none'`) e o requisito de não usar rede.

| O que você alterou | O que fazer depois do `built in ...` |
|---|---|
| Interface, domínio, configuração ou CSS (`src/ui`, `src/domain`, `src/config`, `src/application`, `src/ui/styles`) | Fechar e reabrir o painel lateral (ou o popup) |
| Service worker (`src/infrastructure/background.ts`) | Em `edge://extensions`, clicar em **Recarregar** (Reload) no cartão da extensão |
| `manifest.json` ou `public/` (ícones, esquema da política) | **Recarregar** no cartão; se o Edge apontar erro de manifesto, corrija e recarregue de novo |

Recarregar no cartão também limpa o estado em memória do painel, o que equivale a começar do zero (o conteúdo de chamado nunca é persistido).

### 4. Depurar
- **Painel lateral:** clique com o botão direito dentro do painel e escolha **Inspecionar** (Inspect). Com os sourcemaps, a aba **Fontes** (Sources) mostra o TypeScript original para colocar breakpoints.
- **Popup:** clique com o botão direito no ícone da extensão e escolha **Inspecionar pop-up** (Inspect popup).
- **Service worker:** no cartão em `edge://extensions`, clique no link **service worker** em "Inspecionar modos de exibição" (Inspect views).
- **Erros de execução:** botão **Erros** (Errors) no cartão da extensão.
- **Dados guardados:** no console do service worker, `await chrome.storage.local.get(null)` deve mostrar apenas chaves da lista permitida: `preferences`, `languageProfile`, `profileSignature`, `profileOverlay` e, se você ligou as opções opcionais, `usageCounters` (contadores) e `learnedStyle` (preferências de redação, só números). Qualquer outra chave indica regressão de privacidade.

### 5. Antes de abrir um PR
```
npm run check
```
Roda lint, typecheck, testes, build de produção com verificação do pacote e o build de desenvolvimento (`build:dev`), garantindo que `dist-dev/` continue carregável.

## Caminho B: build de produção local
```
npm ci
npm run build
```
Carregue a pasta `dist/`. É exatamente o conteúdo que vai para o `.zip` (minificado e sem sourcemaps). Depois de cada novo build, clique em **Recarregar** no cartão.

## Caminho C: pacote gerado pelo CI (sem Node)
1. No GitHub, abra **Actions > CI**, escolha uma execução verde do `main` e, em **Artifacts**, baixe `extensao-<sha>` (exige login; o artefato fica disponível por 14 dias).
2. O download é um `.zip` que contém outro `.zip` (`escrita-digimais.ai_v<versão>.zip`). Extraia os dois.
3. Mova o conteúdo extraído para uma pasta estável, por exemplo `C:\Extensoes\assistente-service-desk\`, antes de carregar (veja a seção sobre o ID).
4. Siga os passos de "Carregar a extensão" do caminho A, selecionando essa pasta. Ela deve conter `manifest.json` diretamente, sem subpasta intermediária.

## Atualizar sem duplicar a extensão
O zip instalável (`escrita-digimais.ai_vX.Y.Z.zip`) leva no manifest a chave pública de `scripts/extension-key.json`, que fixa o **ID da extensão** em `khilafnebmdhmlpkajikadidlgbcepdn`, em qualquer pasta e em qualquer máquina. Por isso:

- uma versão nova é a **mesma extensão**, nunca uma segunda cópia ao lado da antiga;
- preferências, perfil importado e aprendizado ficam (o armazenamento pertence ao ID);
- a chave de política (próxima seção) e o ID que a TI cadastra são sempre os mesmos.

Verificado em Chromium real: com a chave, abrir o mesmo perfil a partir de outra pasta manteve o ID e as preferências; sem a chave, o ID mudou e as preferências ficaram para trás.

### Passo a passo para atualizar (uma vez por versão)
1. Feche o painel lateral da extensão.
2. **Na mesma pasta de sempre**, apague o conteúdo antigo e extraia o zip novo ali. No PowerShell (não executado neste ambiente):
   ```powershell
   $pasta = 'C:\Extensoes\assistente-service-desk'
   Get-ChildItem $pasta -Force | Remove-Item -Recurse -Force
   Expand-Archive -Path .\escrita-digimais.ai_v1.0.0.3.zip -DestinationPath $pasta
   ```
3. Em `edge://extensions`, clique em **Recarregar** (Reload) no cartão da extensão.
4. Abra **Configurações** no painel: a linha "Versão da extensão" deve mostrar a versão nova.

> **Não clique em Remover antes de atualizar.** Remover a extensão apaga as preferências e o aprendizado guardados no navegador. Se precisar carregar a versão nova de **outra pasta**, o ID é o mesmo e o Edge não mantém duas cópias; se ele avisar que a extensão já existe, volte ao passo 2 na pasta original **(confirmar no seu Edge)**.

### O que este método não faz
Instalar por pasta **nunca atualiza sozinho**: alguém precisa repetir os passos acima a cada versão. Atualização automática, sem ação do analista, só existe com a loja de extensões do Edge ou com instalação forçada por política (veja [DISTRIBUICAO.md](DISTRIBUICAO.md), opção B). O pacote da loja (`..._loja.zip`) não leva a chave: a loja define o ID dela, e esse ID é diferente do da instalação por pasta.

### Quem já instalou uma versão anterior
As versões até 1.0.0.1 foram carregadas **sem** chave, e o ID delas veio do caminho da pasta. A primeira instalação do zip com chave vira, uma única vez, uma extensão nova (ID fixo): as preferências e o aprendizado anteriores não passam para ela, e a configuração é refeita. Remova a extensão antiga só depois de conferir que a nova abre. Daqui em diante o ID não muda mais.

## ID da extensão e dados locais
O ID aparece no cartão em `edge://extensions` e deve ser `khilafnebmdhmlpkajikadidlgbcepdn` para o zip instalável. Se for outro, a pasta foi carregada de um build sem a chave (por exemplo `dist/` ou `dist-dev/`, que são para desenvolvimento).

- **Build de desenvolvimento (`dist/`, `dist-dev/`):** sem a chave. O ID vem do caminho da pasta; mover ou renomear a pasta gera um ID novo e as preferências ficam para trás. Mantenha a pasta fixa durante os testes.
- **Zip instalável:** com a chave, ID fixo. A chave registrada é **pública**: ela só fixa o ID de uma extensão carregada da pasta. A chave privada correspondente foi descartada de propósito, porque não é necessária para isso.
- **Se a organização for hospedar o pacote assinado (CRX próprio):** isso exige um par de chaves novo e, portanto, muda o ID. Decida antes de a TI cadastrar políticas pelo ID.

## Testar a política gerenciada (opcional, Windows)
Simula o perfil de linguagem distribuído pela TI, que tem precedência sobre o importado. Use apenas em máquina de teste e com o perfil de exemplo, nunca com dados reais.

Em um PowerShell aberto como administrador, na raiz do repositório:
```powershell
$id  = 'COLE_AQUI_O_ID_DO_CARTAO'
$key = "HKCU:\Software\Policies\Microsoft\Edge\3rdparty\extensions\$id\policy"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name languageProfile -Value (Get-Content -Raw -Encoding UTF8 .\examples\perfil-exemplo.json)
```

Depois:
1. Abra `edge://policy` e clique em **Recarregar políticas** (Reload policies).
2. Feche e reabra o painel lateral. Em **Configurações > Perfil de linguagem**, a origem deve aparecer como "política da organização".

Se a origem continuar "padrão da extensão", o JSON foi recusado pela validação (a extensão ignora uma política inválida em silêncio e cai para o próximo nível). Para ver o motivo, use **Configurações > Perfil de linguagem > Importar perfil (JSON)** com o mesmo arquivo: a importação usa o mesmo validador e lista os erros. Se a política nem aparecer em `edge://policy`, a máquina pode não aceitar políticas locais; teste em uma máquina de homologação gerenciada pela TI.

Para remover a política de teste:
```powershell
Remove-Item -Path "HKCU:\Software\Policies\Microsoft\Edge\3rdparty\extensions\$id" -Recurse
```
E recarregue em `edge://policy`.

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Manifesto ausente ou ilegível" ao carregar | Pasta errada selecionada (raiz do repositório ou subpasta) | Selecione `dist-dev/`, `dist/` ou a pasta que contém `manifest.json` e `background.js` |
| Erro ao carregar o service worker | Raiz do repositório selecionada, ou `npm run dev` ainda não terminou o primeiro build | Aguarde `built in ...` e selecione a pasta de saída |
| Botão "Modo de desenvolvedor" cinza | Política corporativa bloqueia extensões em modo de desenvolvedor | Peça à TI uma máquina de homologação |
| Ícone não aparece na barra | Extensão não fixada | Botão **Extensões** > fixar a extensão |
| "Abrir painel lateral" não faz nada | Edge anterior à 116 ou erro no popup | Atualize o Edge; veja o botão **Erros** no cartão |
| Alteração não aparece | Painel não foi reaberto, build com erro no terminal ou pasta carregada é outra | Confira o terminal, reabra o painel, confira no cartão qual pasta está carregada |
| Preferências e perfil sumiram | A pasta foi movida e o ID mudou | Volte a pasta para o local original ou reimporte o perfil |
| Campos limpos depois de um tempo parado | Limpeza automática por inatividade (padrão de 15 minutos) | Comportamento esperado; o prazo é ajustável em Configurações |
