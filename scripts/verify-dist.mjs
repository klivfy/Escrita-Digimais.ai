// Verificação do pacote final: sem código remoto, sem eval, sem chamadas de rede, permissões mínimas.
// Uso: node scripts/verify-dist.mjs [diretório] [--com-chave]  (padrão: dist, sem chave)
// Sem --com-chave o manifest NÃO pode ter `key` (pacote da loja e dist/). Com --com-chave ele precisa ter exatamente a chave registrada.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extensionIdFromKey } from './extension-id.mjs';

const problems = [];
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const args = process.argv.slice(2);
const withKey = args.includes('--com-chave');
const dir = args.find((a) => !a.startsWith('--')) ?? 'dist';
const files = walk(dir);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

const registered = JSON.parse(readFileSync('scripts/extension-key.json', 'utf8'));
if (withKey) {
  if (manifest.key !== registered.publicKey) problems.push('O manifest do pacote instalável deve ter a chave pública registrada em scripts/extension-key.json.');
  else if (extensionIdFromKey(manifest.key) !== registered.extensionId) problems.push('O ID derivado da chave não é o ID registrado.');
} else if ('key' in manifest) {
  problems.push('O manifest não pode ter `key` fora do pacote instalável (a loja define o ID).');
}

const allowedPermissions = ['sidePanel', 'storage'];
for (const p of manifest.permissions ?? []) if (!allowedPermissions.includes(p)) problems.push(`Permissão não prevista: ${p}`);
if (manifest.host_permissions?.length) problems.push('host_permissions não é permitido nesta versão.');
if (manifest.optional_permissions?.length || manifest.optional_host_permissions?.length) problems.push('Permissões opcionais não previstas.');
if (manifest.content_scripts) problems.push('content_scripts não é permitido (não lemos páginas).');
if (manifest.externally_connectable) problems.push('externally_connectable não é permitido.');
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (/unsafe-eval|unsafe-inline|https?:|\*/.test(csp)) problems.push(`CSP insegura: ${csp}`);
if (!/connect-src 'none'/.test(csp)) problems.push("CSP deve conter connect-src 'none'.");

const forbidden = [
  [/\beval\s*\(/, 'eval('],
  [/new\s+Function\s*\(/, 'new Function('],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bimportScripts\s*\(/, 'importScripts('],
];
for (const f of files) {
  if (/\.(js|html|css|json)$/.test(f)) {
    const text = readFileSync(f, 'utf8');
    for (const [re, name] of forbidden) if (re.test(text)) problems.push(`${f}: uso de ${name}`);
    if (/\.(js)$/.test(f) && /\bfetch\s*\(/.test(text)) problems.push(`${f}: chamada fetch(`);
    if (/\.html$/.test(f)) {
      if (/<script(?![^>]*\ssrc=)[^>]*>[^<]/i.test(text)) problems.push(`${f}: script inline`);
      if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(text)) problems.push(`${f}: recurso remoto`);
      if (/\son\w+=/i.test(text)) problems.push(`${f}: manipulador inline`);
    }
    if (/\.css$/.test(f) && /url\(\s*['"]?data:/i.test(text)) problems.push(`${f}: data: URI em CSS (a CSP não permite)`);
    if (/\.(js|css)$/.test(f) && /(?:src|href|url)\(?\s*=?\s*["']https?:\/\/(?!www\.w3\.org|react\.dev|reactjs\.org)/.test(text)) {
      problems.push(`${f}: possível recurso remoto`);
    }
  }
}
if (problems.length) {
  console.error(`Verificação de ${dir} FALHOU:\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log(`Verificação de ${dir}${withKey ? ' (com chave)' : ''} aprovada (${files.length} arquivos, permissões: ${(manifest.permissions ?? []).join(', ')}).`);
