/* global document, chrome -- usados dentro de page.evaluate, que roda no navegador */
// Executa o roteiro da demonstração (docs/DEMONSTRACAO.md) em Chromium real, com a extensão carregada, e salva imagens.
// Serve para ensaiar a apresentação e para ter imagens de reserva. Dados fictícios. Roda também no CI (job e2e), contra o zip extraído.
// Uso: node scripts/demo-capture.mjs <pasta-da-extensao-descompactada> [pasta-de-saida]
// Requer o Playwright (PLAYWRIGHT_MODULE pode apontar para o módulo).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const ext = resolve(process.argv[2] ?? 'dist');
const out = resolve(process.argv[3] ?? 'demo');
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'));
} catch {
  console.error('Playwright não encontrado. Instale-o ou aponte PLAYWRIGHT_MODULE para o módulo.');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 420, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
const page = await ctx.newPage();
await page.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel.html`);

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK    ' : 'FALHA '} ${label}`);
};
const shot = (name) => page.screenshot({ path: resolve(out, name), fullPage: true });
const why = () => page.getByRole('textbox', { name: /Por que a informação é necessária/ });
const questions = () => page.getByLabel(/^Perguntas ao destinatário/);
const generate = () => page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
const bodyText = () => page.evaluate(() => document.body.innerText);

await shot('01-inicial.png');

// 1. Texto normal
await why().fill('Usuária relata erro ao abrir a planilha de custos.');
await questions().fill('Qual mensagem de erro aparece na tela\nO erro ocorre com outros arquivos');
await generate();
const preview = page.getByLabel('Prévia editável');
await preview.waitFor();
check((await preview.inputValue()).includes('1. Qual mensagem de erro aparece na tela?'), 'prévia gerada com perguntas numeradas');
await shot('02-previa.png');

// 2. Dado pessoal: aviso com opção de substituir
await why().fill('Usuária maria.souza@exemplo.test relata erro ao abrir a planilha.');
await page.waitForTimeout(300);
check(/e-mail/i.test(await bodyText()), 'e-mail fictício sinalizado antes de gerar');
await shot('03-dado-sensivel.png');

// 3. Credencial: bloqueio
await why().fill('O usuário informou: senha: Teste@12345 para acessar o portal.');
await generate();
await page.waitForTimeout(500);
check(/bloque|impede|credencial/i.test(await bodyText()), 'credencial fictícia bloqueia a geração');
await shot('04-bloqueio.png');
await why().fill('Usuária relata erro ao abrir a planilha de custos.');

// 4. Revisar texto pronto
await page.getByRole('button', { name: 'Revisar texto pronto' }).click();
await page.getByLabel('Texto a revisar').fill('Como você deveria ter lido, o erro é seu. Garantimos a solução ainda hoje. URGENTE!!');
await page.getByRole('button', { name: 'Revisar agora' }).click();
await page.getByRole('region', { name: 'Resultado da revisão' }).waitFor();
const review = await bodyText();
check(/Garantimos|compromisso|promete|prazo/i.test(review) || /Alerta/.test(review), 'revisão aponta alertas no texto pronto');
await shot('05-revisao.png');
await page.getByRole('button', { name: 'Gerar texto' }).click();

// 4b. Rascunho livre: dividir, conferir e só então preencher
await why().fill('');
await questions().fill('');
await page.getByText('Colar uma anotação livre (opcional)').click();
await page.getByLabel('Anotação livre').fill('usuária sem acesso à pasta compartilhada\nqual o nome da pasta?\nqual o horário em que o erro começou?');
await page.getByRole('button', { name: 'Dividir em campos' }).click();
await page.getByText(/Confira a divisão/).waitFor();
check((await questions().inputValue()).trim() === '', 'rascunho livre não preenche nada antes da conferência');
await shot('05b-rascunho-livre.png');
await page.getByRole('button', { name: 'Preencher o formulário' }).click();
check((await questions().inputValue()).includes('qual o nome da pasta'), 'rascunho livre preenche as perguntas depois da conferência');
check(/Usuária sem acesso/.test(await why().inputValue()), 'rascunho livre preenche o contexto depois da conferência');

// 4c. Corrigir ortografia: a lista de palavras carrega sob a CSP, sugere e só troca ao aceitar
await page.getByRole('button', { name: 'Corrigir ortografia' }).click();
await page.getByLabel('Texto a corrigir').fill('o usuario nao consegue abrir a planilha');
await page.getByRole('button', { name: 'Verificar texto' }).click();
await page.getByRole('heading', { name: /^Sugestões \(/ }).waitFor({ timeout: 15000 });
check((await page.getByLabel('Texto a corrigir').inputValue()) === 'o usuario nao consegue abrir a planilha', 'correção só sugere: o texto não muda antes do aceite');
await shot('05c-corrigir.png');
await page.getByRole('button', { name: 'Aceitar todas (2)' }).click();
check((await page.getByLabel('Texto a corrigir').inputValue()) === 'o usuário não consegue abrir a planilha', 'aceitar todas aplica as trocas');
await page.getByRole('button', { name: 'Limpar texto' }).click();
await page.getByRole('button', { name: 'Gerar texto' }).click();

// 5. Configurações (contadores, perfil, camada da equipe)
await page.getByRole('button', { name: 'Configurações' }).click();
check(await page.getByLabel(/Registrar contadores de uso/).isVisible(), 'contadores aparecem desligados e opcionais nas configurações');
check(await page.getByLabel('Importar camada da equipe (JSON)').isVisible(), 'camada da equipe disponível');
await shot('06-configuracoes.png');
await page.getByRole('button', { name: 'Configurações' }).click();

// 6. Tema escuro e 320 px
await page.emulateMedia({ colorScheme: 'dark' });
await shot('07-tema-escuro.png');
await page.emulateMedia({ colorScheme: 'light' });
await page.setViewportSize({ width: 320, height: 800 });
await shot('08-320px.png');
check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'sem rolagem horizontal a 320 px');

// 7. Nada de rede e nada de conteúdo guardado
const stored = JSON.stringify(await page.evaluate(() => chrome.storage.local.get(null)));
check(!/planilha|Teste@12345|maria\.souza/.test(stored), 'nenhum conteúdo digitado ficou guardado');

console.log(`Imagens em ${out}`);
await ctx.close();
process.exit(failures === 0 ? 0 : 1);
