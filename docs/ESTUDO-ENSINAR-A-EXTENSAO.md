# Estudo: ensinar a extensão com os textos e os padrões da instituição

Pedido (23/10/2026): poder "treinar" a extensão com os textos mais comuns do atendimento do dia a dia e com os padrões de texto da instituição, para reduzir o trabalho repetido no processo; se for viável, montar um plano de ação.

Scripts e resultado do experimento: `scripts/estudo-ensino/`. Conjunto de teste fictício e de autor único.

## 1. Veredito

É viável, e a melhor forma não é treinar um modelo de IA: é **ensinar por curadoria**. A extensão aprende o que você der a ela em três camadas, todas locais, determinísticas e revisáveis por pessoas:

1. **Padrões da instituição** (aberturas, fechos, rótulos, termos preferidos e proibidos, siglas, textos obrigatórios): a extensão já aceita tudo isso por arquivo de perfil. Falta uma ferramenta que monte esse arquivo a partir de textos reais, em vez de escrevê-lo à mão.
2. **Biblioteca de modelos de texto** (os textos prontos mais usados, com campos a preencher): é o item novo. Resolve o pedido de reduzir o que se digita todo dia.
3. **Sugestão pelo que o analista escreve** (ele digita a intenção e a extensão oferece os modelos mais parecidos): medida neste estudo, funciona com texto simples, desde que a extensão **ofereça uma lista e nunca escolha sozinha**.

Treinar ou ajustar finamente um modelo de linguagem com os textos fica descartado: não roda no navegador, exigiria juntar conteúdo de chamados em um só lugar e não traz ganho que a biblioteca de modelos não traga com menos risco.

O ganho depende de uma decisão que não é técnica: **quem escolhe e revisa os textos**. Uma biblioteca com texto ruim espalha o texto ruim com rapidez.

## 2. O que existe hoje e o que falta

| Peça | Hoje | Limite |
|---|---|---|
| Perfil de linguagem da organização (`config/profile-schema.ts`) | Saudações, fechos, assinatura, `templates` (aberturas e fechos por tipo e formalidade, rótulos), termos preferidos e proibidos, textos obrigatórios, siglas, domínios internos | Edição manual de JSON; limite de 100 KB; guarda trechos curtos, não textos completos |
| Camada de equipe (`config/profile-overlay.ts`) | Equipe acrescenta termos, textos obrigatórios e domínios, mas só pode restringir | Não permite mudar estilo nem modelos, por desenho |
| Rascunho livre (`config/draft-model.json`) | Classificador regenerado de um corpus fictício por script | Treinado pelo desenvolvedor, não pelo gestor |
| Aprendizado do analista (`application/style-learning.ts`) | Contagens de redação mantida, tipos mais usados e próximos passos | Não guarda texto, então não aprende frases |
| Correção de texto (`config/proofread/rules.ts`) | Termos de TI que nunca são marcados | Lista fixa no código; a instituição não consegue acrescentar sigla ou produto próprio |

O que **não existe**: guardar e reutilizar texto completo, importar um corpus de textos e propor padrões, e buscar um modelo pela intenção.

## 3. O que se pode ensinar, por tipo de conhecimento

| O que ensinar | Exemplo | Mecanismo | Já existe? |
|---|---|---|---|
| Frases de abertura e fecho | "Prezado usuário, para darmos andamento..." | `templates.openings` e `typeClosings` do perfil | Sim, falta a ferramenta que sugere as frases mais usadas |
| Termos | "chamado" em vez de "ticket"; "acesso remoto" em vez de "VPN" para leigos | `preferredTerms`, `forbiddenTerms` | Sim |
| Siglas e produtos próprios | "SIGA", "ProtheusWeb" | `knownAcronyms` e glossário da correção | Siglas sim; glossário da correção não |
| Textos prontos completos | "Reinstalamos o driver da impressora e imprimimos uma página de teste..." | Biblioteca de modelos | Não |
| Quando usar cada texto | "Pedir print" para erro de tela | Sugestão por semelhança | Não |
| Regras que todo texto deve cumprir | Aviso de privacidade em pedidos de informação | `requiredTexts`, `privacyNotice` | Sim |
| Preferência pessoal | Tom mais direto | Aprendizado de contagens | Sim |

## 4. Medição: dá para sugerir o modelo certo pelo que o analista digita?

Experimento (`scripts/estudo-ensino/recuperacao.py`): biblioteca fictícia de 16 modelos de Service Desk; 64 consultas escritas como o analista escreveria (4 por modelo, com abreviações e sem acento); 16 consultas sobre assuntos que **não** estão na biblioteca. Método: trechos de 2 a 5 letras ponderados por raridade (TF-IDF) e semelhança por cosseno, sem modelo de IA.

| Método | Modelo certo em 1º | Modelo certo entre os 3 primeiros |
|---|---|---|
| Trechos de letras (2 a 5) | 91% | 98% |
| Palavras (1 e 2) | 86% | 97% |

Efeito de abster-se quando a semelhança é baixa (trechos de letras):

| Limiar | Consultas com sugestão | Sugestões corretas | Consultas fora da biblioteca que mesmo assim recebem sugestão |
|---|---|---|---|
| 0,00 | 100% | 91% | 16 de 16 |
| 0,20 | 97% | 94% | 10 de 16 |
| 0,25 | 97% | 94% | 6 de 16 |

Leitura:

- O modelo certo aparece entre os 3 primeiros em 98% dos casos: **mostrar 3 opções e deixar o analista escolher funciona**.
- O 1º lugar erra em 9%: **inserir sozinho o primeiro resultado não é seguro** (por exemplo, "resetei a senha do usuario" trouxe o texto do Wi-Fi em 1º).
- O limiar não separa bem o que está fora da biblioteca (6 de 16 ainda recebem sugestão com limiar alto), então a lista sempre precisa de "nenhum destes".
- Os erros mais difíceis são consultas muito curtas ou vagas ("marcar atendimento presencial"), em que o analista também levaria alguns segundos para achar o texto à mão.
- Limite: biblioteca de 16 textos e consultas escritas pelo mesmo autor dos modelos. Com 100 ou mais modelos parecidos entre si (várias variações de "encerrar chamado"), o acerto no 1º lugar cai e o rótulo do modelo passa a pesar mais (ver seção 6).

## 5. Quem ensina, e a que custo

| Via | Quem escolhe os textos | Onde ficam | Risco | Recomendação |
|---|---|---|---|---|
| A. Curadoria do gestor, distribuída por arquivo | Gestor ou líder do atendimento | Arquivo validado e assinado, importado em Configurações ou entregue por política | Baixo: texto revisado por pessoa, mesmo caminho do perfil | **Começar por aqui** |
| B. Modelos pessoais do analista | Cada analista, com um clique em "Salvar como modelo" | Navegador do analista (`storage.local`) | Médio: passa a guardar texto do analista, contra a regra atual do projeto; exige varredura de dado sensível e decisão de governança | Segunda etapa, com aprovação |
| C. Aprendizado automático dos textos copiados | Ninguém (a extensão observa) | Navegador do analista | Alto: guarda conteúdo de chamado sem escolha consciente | Não recomendado |
| D. Treinar ou ajustar um modelo de IA | Especialista | Servidor ou pacote | Alto e sem ganho sobre A | Descartado |

Os textos que o gestor coleta para curar também são risco: textos reais de atendimento trazem nome, telefone, matrícula e número de chamado. A ferramenta de curadoria precisa **mascarar antes de qualquer pessoa ou arquivo guardar o texto** (a extensão já tem o detector, em `src/domain/sensitive.ts`).

## 6. Desenho proposto

### 6.1 Biblioteca de modelos

```
Modelo {
  id, titulo (curto, para a lista),
  tipos: [tipo de comunicação], destinatarios: [destinatário] (opcional),
  texto com campos {nome} {chamado} {data} {prazo},
  palavras-chave (opcional, pesam na busca),
  origem: instituicao | equipe | pessoal,
  versao, revisadoEm
}
```

- **Arquivo próprio** (`biblioteca.json`), com esquema validado como o perfil: só texto simples, sem HTML, link ou código; no máximo 200 modelos de 1.500 caracteres (cerca de 300 KB; o `storage.local` comporta 10 MB). O perfil continua com o limite de 100 KB.
- **Assinatura:** reutiliza `application/profile-signing.ts`. Com chave de assinatura na política, só vale biblioteca assinada.
- **Validação na importação:** cada modelo passa pelo detector de dado sensível e pelas regras de revisão (`reviewText`): modelo que promete prazo, afirma solução ou contém credencial é recusado com o motivo. Isso evita que um texto padrão contradiga as regras que o próprio motor aplica.
- **Camada de equipe:** a biblioteca da equipe pode acrescentar modelos e nunca substituir os da instituição (mesma regra restritiva do overlay).

### 6.2 Uso pelo analista

- No modo "Gerar texto", um campo "Buscar modelo" abaixo do tipo: o analista digita a intenção ("pedir print") e vê até 3 modelos, com o título, as primeiras linhas e "Nenhum destes". Sem texto digitado, a lista mostra os mais usados do tipo e do destinatário.
- Escolher um modelo **preenche a prévia editável** e **nunca copia**. Campos como `{nome}` são preenchidos só com o que o analista informou; os que faltarem ficam marcados e impedem a cópia até serem resolvidos, para nada ser inventado.
- A prévia passa por revisão e por "Corrigir texto" como qualquer texto. O analista sempre pode editar.
- "Mais usados" e "próximo passo" (já implementados) passam a poder apontar para modelos, além de tipos.

### 6.3 Ferramenta de curadoria (para quem ensina)

Script local, sem rede (`scripts/curar-textos.mjs`), que o gestor roda em uma planilha ou pasta de textos exportados:

1. Mascara dado sensível (descarta o texto que traga credencial).
2. Agrupa textos quase iguais e conta quantas vezes cada grupo aparece.
3. Propõe, para revisão humana, os 30 a 50 grupos mais frequentes como modelos, já com os dados variáveis trocados por campos.
4. Extrai as aberturas e fechos mais usados por tipo, as siglas e os termos recorrentes, e propõe `templates`, `knownAcronyms` e `preferredTerms` do perfil.
5. Gera um relatório (o que entrou, o que foi descartado e por quê) e os arquivos `biblioteca.json` e um trecho de perfil, nunca publicados automaticamente.

O gestor revisa, edita e assina. Ninguém é "treinado" por uma caixa-preta: cada sugestão é um texto que uma pessoa leu e aprovou.

### 6.4 Glossário da instituição para a correção

A correção hoje marca palavras raras. Siglas, nomes de sistemas e termos próprios podem aparecer como erro. A biblioteca passa a carregar um glossário (palavras que a correção nunca marca), alimentado pela curadoria. Entra como dado de configuração, com o mesmo limite e a mesma validação.

## 7. Plano de ação

| Fase | Entrega | Quem | Esforço | Critério de aceite |
|---|---|---|---|---|
| 0. Levantamento | 30 a 50 textos mais usados, sem dado pessoal, classificados por tipo, destinatário e frequência, em planilha (colunas: tipo, destinatário, texto, vezes por semana, situação em que se usa) | Você e a liderança do atendimento | 2 a 3 dias | Textos revisados por 2 pessoas; nenhum dado pessoal; cobrem pelo menos 70% do volume informado |
| 1. Biblioteca (núcleo) | Esquema, validação, importação por arquivo, exportação, assinatura, varredura de dado sensível e de regras de revisão, testes | Desenvolvimento | 1 semana | Arquivo inválido ou com dado sensível é recusado com motivo; biblioteca assinada exigida quando a política pede |
| 2. Uso na tela | Campo "Buscar modelo", lista de até 3, inserção na prévia com campos pendentes, acessibilidade, contadores (`library.shown`, `library.used`, `library.none`) | Desenvolvimento | 1 semana | Teste de que nada é copiado ou preenchido sem ação; campo pendente bloqueia a cópia; axe sem violações; sem texto nos contadores |
| 3. Sugestão por semelhança | Busca por trechos de letras com título e palavras-chave, medida em conjunto nosso | Desenvolvimento | 3 a 4 dias | Modelo certo entre os 3 primeiros em pelo menos 90% das consultas do conjunto de teste |
| 4. Ferramenta de curadoria | `scripts/curar-textos.mjs` com relatório, mascaramento e propostas de modelos, aberturas, fechos, termos e siglas | Desenvolvimento, com você revisando a saída | 1 semana | Roda em 30 segundos em 5.000 textos; nenhum texto sensível sai do mascaramento; saída revisável |
| 5. Glossário da correção | Termos da instituição que a correção nunca marca | Desenvolvimento | 2 dias | Zero sugestões sobre siglas e produtos do glossário |
| 6. Piloto | 14 dias com 5 a 10 analistas; feedback semanal | Equipe | 2 semanas | Ver critérios abaixo |
| 7. Modelos pessoais (via B) | "Salvar como modelo" com varredura e limite | Governança aprova antes | 1 semana | Aprovação formal de privacidade; texto sempre mascarado e zerável |
| 8. Opcional: IA adapta o modelo ao caso | Reescrita com as travas de `ai-guard` | Depende do teste no Edge | 1 semana | Trava de fatos recusa 100% das invenções do conjunto de teste |

Ordem sugerida: 0 em paralelo com 1; depois 2, 3, 4 e 5; piloto; só então 7 e 8. As fases 1 a 5 não exigem mudança nas regras de segurança, mas a 1 acrescenta um tipo de dado salvo (a biblioteca importada), então `CLAUDE.md`, `PRIVACY.md` e `SECURITY.md` precisam ser atualizados na mesma entrega.

### Andamento (fase 1 entregue)

Fase 1 (núcleo da biblioteca) implementada no branch `claude/biblioteca-modelos`: esquema e validação (`config/library-schema.ts`), triagem (`domain/library-vetting.ts`), importação com assinatura (`application/library-import.ts`, `sign-library` em `scripts/sign-profile.mjs`), armazenamento revalidado na leitura, seção em Configurações (importar, exportar, remover, avisos ao curador) e arquivo de exemplo. Decisões tomadas na implementação:

- A importação é tudo ou nada: um modelo recusado impede a biblioteca inteira, para que o que fica guardado seja exatamente o que foi revisado e assinado.
- Os alertas `low_cordiality` e `required_text_missing` não valem para trecho de texto (o motor acrescenta saudação, fecho e textos obrigatórios) e ficam fora da triagem.
- Fora desta fase: política gerenciada para entregar a biblioteca sem importação manual, busca e inserção na prévia (fases 2 e 3), contadores `library.*` e a ferramenta de curadoria (fase 4).

## 8. Riscos e como tratá-los

| Risco | Tratamento |
|---|---|
| Dado pessoal nos textos de origem | Mascaramento antes de qualquer outro passo; descarte do texto com credencial; revisão humana da saída |
| Biblioteca com texto desatualizado | Campo `revisadoEm`; relatório mostra modelos sem revisão há mais de 6 meses |
| Texto padrão que contradiz as regras do motor | Validação na importação pelas mesmas regras de revisão |
| Analista confia e não lê | Lista de opções (nunca inserção automática), prévia sempre editável, campos pendentes bloqueiam a cópia |
| Modelos parecidos demais confundem a busca | Título curto obrigatório e palavras-chave; curadoria agrupa quase iguais |
| Texto de um analista vira padrão do grupo sem revisão | Modelo pessoal nunca sobe sozinho: o gestor decide o que vira modelo da instituição |
| Crescimento sem controle | Limite de 200 modelos e de 1.500 caracteres por modelo |

## 9. Critérios de validação

- **Busca:** no conjunto de teste da instituição (escrito por pessoa diferente de quem fez os modelos), modelo certo entre os 3 primeiros em pelo menos 90%.
- **Ganho de tempo:** no piloto, mediana do tempo entre abrir e copiar nos textos que usaram modelo pelo menos 30% menor que nos que não usaram (contador `time_to_copy` por faixa, já existente).
- **Qualidade:** pelo menos 70% dos textos copiados que partiram de modelo foram editados em menos de 20% do conteúdo (mede se o modelo serviu); modelo com uso alto e edição alta volta para a curadoria.
- **Cobertura:** `library.none` (analista escolheu "nenhum destes") abaixo de 30% das buscas; acima disso, faltam modelos.
- **Privacidade:** nenhum texto digitado em contadores e nenhum texto de chamado no armazenamento (teste automático e ensaio do piloto).
- **Segurança:** biblioteca assinada exigida quando a política pede; arquivo com HTML, link, credencial ou promessa de prazo recusado.

## 10. Como começar hoje, sem código

1. Liste os 30 a 50 textos que sua equipe mais envia, do mais ao menos frequente.
2. Para cada um, registre o tipo (pedir informação, comunicar andamento, confirmar solução, encerrar etc.), o destinatário e em que situação se usa.
3. Troque nomes, telefones, matrículas e números de chamado por campos entre chaves: `{nome}`, `{chamado}`, `{data}`.
4. Reúna a liderança para escolher, entre variações do mesmo texto, **uma** versão aprovada.
5. Guarde isso em uma planilha com as colunas `tipo, destinatário, título, texto, vezes por semana, situação`. Essa planilha é a entrada das fases 1 e 4.

## 11. Decisões que dependem de você

1. Quem cura e aprova os textos da instituição, e quem assina o arquivo.
2. Se haverá modelos pessoais do analista (via B) ou só biblioteca curada pelo gestor. Recomendo só curada no primeiro ciclo.
3. De onde vêm os textos para a curadoria e se o sistema de chamados permite exportá-los.
4. Se o aviso de privacidade aos analistas e a aprovação de governança cobrem guardar a biblioteca no navegador.

## 12. Limites deste estudo

- O experimento usa 16 modelos e 64 consultas fictícias do mesmo autor. Com uma biblioteca real maior e mais repetitiva, o acerto no 1º lugar tende a cair; a medida de 90% entre os 3 primeiros deve ser refeita com textos reais.
- Não há medida do ganho de tempo: ele só aparece no piloto.
- Não avaliei o formato de exportação do seu sistema de chamados.
- Embeddings e IA não foram necessários neste experimento; o estudo anterior já mostrou que aumentar o modelo traz pouco ganho para esta tarefa, e a recuperação por letras roda em milissegundos no navegador.
