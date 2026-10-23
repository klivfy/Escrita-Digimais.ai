# Política de privacidade

Assistente de Textos do Service Desk, versão 1.0.0.1.

## Resumo
A extensão funciona inteiramente no navegador do analista. Ela não coleta, não transmite e não vende dados. Não há servidores, telemetria, analytics, pixels ou rastreadores.

## O que é processado
| Dado | Onde | Por quanto tempo |
|---|---|---|
| Texto digitado nos campos (contexto, ações, perguntas e similares) | Memória do painel lateral | Até o painel ser fechado, o analista limpar, ou o tempo de inatividade configurado expirar (padrão: 15 minutos). Após uma limpeza manual, uma cópia fica só em memória por 30 segundos para “Desfazer limpeza” e então é descartada (ou imediatamente, se o analista apagar também os dados salvos ou digitar algo novo) |
| Texto gerado e editado na prévia | Memória do painel lateral | Mesmo critério acima |
| Resultado da detecção de dados sensíveis | Memória do painel lateral | Mesmo critério acima |
| Texto do modo “Corrigir texto” e as sugestões | Memória do painel lateral | Mesmo critério acima. A lista de palavras usada na correção vem no pacote e não contém dado de chamado |

O processamento é local e determinístico. Os dados sensíveis detectados são exibidos somente de forma mascarada.

## O que é armazenado
Somente em `chrome.storage.local`, neste navegador:
- **Preferências**: nível técnico, formalidade, tamanho padrão, estilo de redação (natural ou estruturada) e tempo de limpeza automática.
- **Aprendizado de redação** (opcional, desligado por padrão): contadores inteiros de qual redação pronta do produto (abertura, fecho, cortesia, frase de ligação) foi mantida ou trocada, em chaves de lista fechada (`acc.opening.pending.1`), quantas vezes o analista copiou cada tipo de texto (`use.<tipo>`, para o atalho "Mais usados") e qual próximo passo escolheu depois de copiar (`seq.<tipo>.<tipo>`, para ordenar a sugestão). Nunca guarda texto digitado, texto gerado, campos do chamado nem nomes. Fica só no navegador, é zerável em Configurações e é desligado quando a política gerenciada `usageCounters` é `off`. O analista pode exportar essas contagens ("Exportar aprendizado", arquivo `aprendizado-de-redacao.json`, só números) para o piloto; nada é enviado automaticamente.
- **Rascunho livre**: a anotação colada fica apenas na tela e é descartada ao preencher, descartar, limpar ou fechar. Passa pela detecção de dados sensíveis antes de ser dividida. Com o aprendizado ligado, só são guardadas contagens do tipo `fix.<campo de origem>.<campo de destino>` (por exemplo `fix.result.action`), nunca o texto.
- O **nome de quem recebe** o texto (campo opcional) é usado só na saudação, passa pela detecção de dados sensíveis e nunca é gravado.
- **Perfil de linguagem importado** (opcional): textos institucionais validados, sem dados de chamados. Quando a organização exige assinatura, guarda também o valor da assinatura (texto, sem dados pessoais).
- **Camada da equipe** (opcional): regras restritivas validadas (termos, limites), sem dados de chamados.
- **Biblioteca de modelos** (opcional): textos prontos da instituição, escolhidos e revisados por pessoas e importados de um arquivo (`modelLibrary`, mais a assinatura quando a organização a exige). São textos padrão com campos como `{nome}`, nunca conteúdo de chamado: cada modelo passa pela detecção de dados sensíveis e pelas regras de revisão antes de ser aceito, e a importação inteira é recusada se algum falhar. Fica só neste navegador, o analista pode exportá-la ou removê-la em Configurações, e "Limpar tudo" com a opção de apagar os dados salvos também a remove. Nada é enviado.
- **Contadores de uso** (opcional, desligados por padrão): números inteiros por categoria de uma lista fechada, mais a data em que a contagem começou. O arquivo exportado inclui também o dia da exportação, gerado no momento de exportar e não guardado.

O texto colado no modo “Revisar texto pronto” segue as mesmas regras do restante do conteúdo. Nenhum conteúdo de chamado, texto gerado, histórico ou dado pessoal é armazenado. O botão “Limpar tudo” permite apagar também o que estiver salvo.

### Contadores de uso
- Desligados por padrão. O analista liga em Configurações, ou a organização força o estado pela política `usageCounters` (`off`, `optional` ou `on`).
- Contam apenas: quantos textos de cada tipo e para cada destinatário foram gerados, quantas gerações foram bloqueadas por motivo, quais códigos de alerta apareceram, cópias, outras variações, revisões, a faixa de tempo até copiar (menos de 1 min, 1 a 3 min, 3 a 10 min, mais de 10 min), verificações do modo “Corrigir texto” e sugestões aceitas ou ignoradas por regra (`proofread.<regra>.acc|ign`), e quantas vezes o atalho de próximo passo apareceu, foi usado e o atalho de tipo foi usado.
- Nunca registram texto digitado ou gerado, campos do chamado, número de chamado, identificação de pessoa, marca de tempo por evento ou dado sensível detectado.
- Ficam somente neste navegador. Nada é enviado: o analista pode exportar o arquivo e entregá-lo se quiser. “Zerar contadores” e “Limpar tudo” apagam o registro.

Administradores podem fornecer um perfil por política (`chrome.storage.managed`), somente leitura para a extensão.

## Corretor do navegador (fora do controle da extensão)
Os campos de texto pedem a verificação ortográfica do próprio Edge (`spellcheck`). A extensão não envia nada, mas o Edge pode usar o serviço Microsoft Editor para verificar campos de texto de qualquer página, inclusive deste painel, quando a política `MicrosoftEditorProofingEnabled` está ativada ou não configurada e o usuário não o desligou nas configurações de idiomas. Nesse caso o texto digitado pode ser enviado à Microsoft pelo navegador. Quem precisa garantir que nada saia da máquina deve desativar a política `MicrosoftEditorProofingEnabled` (o Edge passa a usar só os dicionários locais) ou `SpellcheckEnabled`. A correção do modo “Corrigir texto” é da extensão e sempre local.

## O que não é feito
- Não lê o conteúdo de páginas, abas, histórico, cookies nem campos de sistemas de chamados.
- Não envia mensagens nem altera chamados.
- Não copia nada para a área de transferência sem um clique explícito em “Copiar texto”.
- Não faz nenhuma chamada de rede. A política de segurança de conteúdo (CSP) da extensão contém `connect-src 'none'`.

## Inteligência artificial
Esta versão não usa serviços de IA. Existe apenas um ponto de extensão desativado. Uma ativação futura dependeria de política da organização, aviso de privacidade e consentimento organizacional, e de mascaramento prévio dos dados. Credenciais nunca seriam enviadas.

## Contato
Dúvidas sobre privacidade devem ser encaminhadas ao responsável pela implantação na sua organização.
