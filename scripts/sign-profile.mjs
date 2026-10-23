// Gera o par de chaves e assina perfis de linguagem (ECDSA P-256, SHA-256). Roda só na máquina do administrador.
//   node scripts/sign-profile.mjs keygen <prefixo>                       cria <prefixo>.private.pem e imprime a chave pública
//   node scripts/sign-profile.mjs sign <perfil.json> <privada.pem> [saida.json]
//   node scripts/sign-profile.mjs sign-library <biblioteca.json> <privada.pem> [saida.json]   (biblioteca de modelos)
// A chave privada NUNCA deve entrar no repositório (*.pem já está no .gitignore). A saída é um envelope
// { format, profile, signatureValue } que a extensão importa quando a política define profileSigningPublicKeys.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicSpkiBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

export function publicKeyOf(privatePem) {
  return createPublicKey(createPrivateKey(privatePem)).export({ type: 'spki', format: 'der' }).toString('base64');
}

export function signProfile(profile, privatePem) {
  const value = sign('sha256', Buffer.from(canonicalJson(profile)), { key: createPrivateKey(privatePem), dsaEncoding: 'ieee-p1363' });
  return { format: 'signed-profile-v1', profile, signatureValue: value.toString('base64url') };
}

/** Forma normalizada que a extensão guarda: padrões preenchidos, textos aparados, quebras de linha unificadas, listas sem repetição. */
export function normalizeLibrary(lib) {
  const uniq = (list) => [...new Set((list ?? []).map((x) => (typeof x === 'string' ? x.trim() : x)))];
  return {
    schemaVersion: lib.schemaVersion,
    libraryName: String(lib.libraryName ?? '').trim(),
    libraryVersion: String(lib.libraryVersion ?? '').trim(),
    models: (lib.models ?? []).map((m) => ({
      id: String(m.id ?? '').trim(),
      title: String(m.title ?? '').trim(),
      types: uniq(m.types),
      recipients: uniq(m.recipients),
      text: String(m.text ?? '').replace(/\r\n?/g, '\n').trim(),
      keywords: uniq(m.keywords),
      reviewedAt: m.reviewedAt ?? '',
    })),
  };
}

export function signLibrary(library, privatePem) {
  const normalized = normalizeLibrary(library);
  const value = sign('sha256', Buffer.from(canonicalJson(normalized)), { key: createPrivateKey(privatePem), dsaEncoding: 'ieee-p1363' });
  return { format: 'signed-library-v1', library: normalized, signatureValue: value.toString('base64url') };
}

function main(argv) {
  const [cmd, a, b, c] = argv;
  if (cmd === 'keygen' && a) {
    const { privatePem, publicSpkiBase64 } = generateKeys();
    writeFileSync(`${a}.private.pem`, privatePem, { mode: 0o600 });
    console.log(`Chave privada: ${a}.private.pem (guarde em cofre; não versionar).`);
    console.log('Chave pública para a política profileSigningPublicKeys:');
    console.log(publicSpkiBase64);
    return 0;
  }
  if (cmd === 'sign' && a && b) {
    const envelope = signProfile(JSON.parse(readFileSync(a, 'utf8')), readFileSync(b, 'utf8'));
    const out = c ?? a.replace(/\.json$/u, '') + '.assinado.json';
    writeFileSync(out, JSON.stringify(envelope, null, 2) + '\n');
    console.log(`Perfil assinado gravado em ${out}`);
    console.log(`Chave pública correspondente: ${publicKeyOf(readFileSync(b, 'utf8'))}`);
    return 0;
  }
  if (cmd === 'sign-library' && a && b) {
    const envelope = signLibrary(JSON.parse(readFileSync(a, 'utf8')), readFileSync(b, 'utf8'));
    const out = c ?? a.replace(/\.json$/u, '') + '.assinada.json';
    writeFileSync(out, JSON.stringify(envelope, null, 2) + '\n');
    console.log(`Biblioteca assinada gravada em ${out}`);
    console.log(`Chave pública correspondente: ${publicKeyOf(readFileSync(b, 'utf8'))}`);
    return 0;
  }
  console.error('Uso:\n  node scripts/sign-profile.mjs keygen <prefixo>\n  node scripts/sign-profile.mjs sign <perfil.json> <privada.pem> [saida.json]\n  node scripts/sign-profile.mjs sign-library <biblioteca.json> <privada.pem> [saida.json]');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
