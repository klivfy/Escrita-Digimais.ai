/* global chrome -- usado dentro de page.evaluate, que roda no navegador */
// Ensaio ponta a ponta do piloto, em Chromium real e com a extensão carregada. Roda também no CI (job e2e) e NÃO produz dados de piloto:
// usa textos fictícios só para provar a cadeia ligar contadores, usar, exportar e analisar.
// Uso: npm run build && node scripts/pilot-rehearsal.mjs [dist] [pasta-de-saida]
// Requer o Playwright (PLAYWRIGHT_MODULE pode apontar para o módulo).
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, process.argv[2] ?? 'dist');
const outDir = resolve(process.argv[3] ?? 'ensaio-piloto');
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'));
} catch {
  console.error('Playwright não encontrado. Instale-o ou aponte PLAYWRIGHT_MODULE para o módulo.');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 420, height: 900 },
  acceptDownloads: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
const origin = `chrome-extension://${new URL(sw.url()).host}`;
const page = await ctx.newPage();
await page.goto(`${origin}/sidepanel.html`);

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK    ' : 'FALHA '} ${label}`);
};

const MARCADOR = 'Marcador exclusivo do ensaio 7Q9Z';
const TOKEN = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');

// 1. Contadores desligados por padrão: nada gravado depois de usar.
const fill = async (why) => {
  await page.getByLabel(/Por que a informação é necessária/).fill(why);
  await page.getByLabel(/^Perguntas ao destinatário/).fill('Qual mensagem de erro aparece na tela\nO erro ocorre com outros arquivos');
};
await fill(`Erro ao abrir a planilha. ${MARCADOR}`);
await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
await page.getByLabel('Prévia editável').waitFor();
let stored = await page.evaluate(() => chrome.storage.local.get(null));
check(!('usageCounters' in stored), 'desligado por padrão: nenhum contador gravado');

// 2. Ligar os contadores em Configurações.
await page.getByRole('button', { name: 'Configurações' }).click();
await page.getByLabel(/Registrar contadores de uso/).check();
await page.getByRole('button', { name: 'Configurações' }).click();

// 3. Uso: gerar, copiar, outra variação, revisar de novo e uma geração bloqueada.
for (let i = 0; i < 3; i += 1) {
  await fill(`Erro ao abrir a planilha ${i}. ${MARCADOR}`);
  await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
  await page.getByLabel('Prévia editável').waitFor();
  await page.getByRole('button', { name: 'Copiar texto' }).click();
  await page.getByText(/Texto copiado/).first().waitFor({ timeout: 5000 }).catch(() => {});
}
await page.getByRole('button', { name: 'Outra variação' }).click();
await page.getByRole('button', { name: 'Revisar novamente' }).click();
await page.getByLabel(/Por que a informação é necessária/).fill(`Token ${TOKEN} no script`);
await page.getByRole('button', { name: 'Gerar prévia', exact: true }).click();
await page.waitForTimeout(500);

// 4. O que ficou no armazenamento: só números, nenhum texto digitado, nenhum token.
stored = await page.evaluate(() => chrome.storage.local.get(null));
const dump = JSON.stringify(stored);
const counts = stored.usageCounters?.counts ?? {};
check(Object.values(counts).length > 0 && Object.values(counts).every(Number.isInteger), 'contadores gravados são só inteiros');
check(!dump.includes(MARCADOR) && !dump.includes(TOKEN) && !/planilha/.test(dump), 'nenhum texto digitado nem token no armazenamento');
check((counts['generate.request_information'] ?? 0) >= 3, 'gerações contadas');
check((counts.copy ?? 0) >= 1, 'cópia contada (a área de transferência respondeu)');
check((counts.variant ?? 0) >= 1 && (counts.review_again ?? 0) >= 1, 'variação e nova revisão contadas');
check(Object.keys(counts).some((k) => k.startsWith('blocked.')), 'geração bloqueada contada pelo motivo');

// 5. Exportar o arquivo como o participante faria.
await page.getByRole('button', { name: 'Configurações' }).click();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar contadores' }).click()]);
const file = resolve(outDir, 'contadores-de-uso.json');
await download.saveAs(file);
const exported = JSON.parse(readFileSync(file, 'utf8'));
check(/^\d{4}-\d{2}-\d{2}$/.test(exported.desde) && /^\d{4}-\d{2}-\d{2}$/.test(exported.exportadoEm), 'arquivo traz o início e o dia da exportação');
check(!readFileSync(file, 'utf8').includes(MARCADOR), 'arquivo exportado sem texto digitado');
console.log(`Arquivo gravado em ${file}`);

await ctx.close();
process.exit(failures === 0 ? 0 : 1);
