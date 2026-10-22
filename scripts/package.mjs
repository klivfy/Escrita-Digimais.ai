// Empacota dist/ em dois zips reprodutíveis em release/:
//   escrita-digimais.ai_v<versão>.zip       INSTALÁVEL: o manifest leva a chave pública de scripts/extension-key.json, então o
//                                           ID da extensão é sempre o mesmo, em qualquer pasta, e instalar uma versão nova
//                                           substitui a anterior mantendo as preferências.
//   escrita-digimais.ai_v<versão>_loja.zip  SEM chave, para envio à loja de extensões (a loja define o ID).
// Reprodutível: arquivos em ordem alfabética, datas fixas (SOURCE_DATE_EPOCH, padrão 01/01/2026 UTC), sem atributos extras.
// Gerar duas vezes o mesmo commit produz os mesmos SHA-256 (dado o mesmo utilitário zip).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extensionIdFromKey } from './extension-id.mjs';

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const epoch = Number(process.env.SOURCE_DATE_EPOCH ?? 1767225600);
if (!Number.isInteger(epoch) || epoch < 315532800) {
  console.error('SOURCE_DATE_EPOCH inválido (use segundos desde 1970, a partir de 1980).');
  process.exit(1);
}

const keyFile = JSON.parse(readFileSync('scripts/extension-key.json', 'utf8'));
if (extensionIdFromKey(keyFile.publicKey) !== keyFile.extensionId) {
  console.error('scripts/extension-key.json: o ID registrado não corresponde à chave pública.');
  process.exit(1);
}

/** Lista arquivos de forma recursiva, em ordem alfabética estável, e fixa a data de cada item. */
function collect(dir, prefix = '') {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) files.push(...collect(full, rel));
    else files.push(rel);
    utimesSync(full, epoch, epoch);
  }
  utimesSync(dir, epoch, epoch);
  return files;
}

function zipDir(dir, out) {
  const files = collect(dir);
  rmSync(out, { force: true });
  execFileSync('zip', ['-X', '-D', '-@', out], {
    cwd: dir,
    input: `${files.join('\n')}\n`,
    env: { ...process.env, TZ: 'UTC' },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`Pacote criado: ${out}`);
}

mkdirSync('release', { recursive: true });

// Instalável: cópia de dist/ com a chave pública no manifest.
const stage = resolve('release', '.instalavel');
rmSync(stage, { recursive: true, force: true });
cpSync('dist', stage, { recursive: true });
const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
const { manifest_version: mv, ...rest } = manifest;
writeFileSync(join(stage, 'manifest.json'), JSON.stringify({ manifest_version: mv, key: keyFile.publicKey, ...rest }, null, 2) + '\n');
zipDir(stage, resolve('release', `escrita-digimais.ai_v${version}.zip`));
rmSync(stage, { recursive: true, force: true });

// Loja: o dist/ como está, sem chave.
zipDir('dist', resolve('release', `escrita-digimais.ai_v${version}_loja.zip`));
console.log(`ID fixo do pacote instalável: ${keyFile.extensionId}`);
