// ID da extensão derivado da chave pública do manifest (mesma regra do Chromium): SHA-256 do DER, 16 primeiros bytes, letras a a p.
import { createHash } from 'node:crypto';

export function extensionIdFromKey(publicKeyBase64) {
  const der = Buffer.from(publicKeyBase64, 'base64');
  const alphabet = 'abcdefghijklmnop';
  return [...createHash('sha256').update(der).digest().subarray(0, 16)].map((b) => alphabet[b >> 4] + alphabet[b & 15]).join('');
}
