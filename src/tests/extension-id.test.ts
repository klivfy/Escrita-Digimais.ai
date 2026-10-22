import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs de script, sem tipos
import { extensionIdFromKey } from '../../scripts/extension-id.mjs';

const registered = JSON.parse(readFileSync('scripts/extension-key.json', 'utf8')) as { publicKey: string; extensionId: string };
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Record<string, unknown>;

describe('ID fixo da extensão instalável', () => {
  it('o ID registrado é o derivado da chave pública, no formato do Chromium (32 letras de a a p)', () => {
    expect(extensionIdFromKey(registered.publicKey)).toBe(registered.extensionId);
    expect(registered.extensionId).toMatch(/^[a-p]{32}$/);
  });

  it('a chave registrada é uma chave pública RSA (SPKI) e nenhuma chave privada está no repositório', () => {
    const der = Buffer.from(registered.publicKey, 'base64');
    expect(der[0]).toBe(0x30); // SEQUENCE
    expect(der.length).toBeGreaterThan(250);
    const text = readFileSync('scripts/extension-key.json', 'utf8');
    expect(text).not.toMatch(/PRIVATE KEY/);
  });

  it('o manifest da fonte não leva chave: a chave só entra no pacote instalável, para a loja definir o próprio ID', () => {
    expect('key' in manifest).toBe(false);
  });

  it('o ID é determinístico para a mesma chave e muda com outra chave', () => {
    expect(extensionIdFromKey(registered.publicKey)).toBe(extensionIdFromKey(registered.publicKey));
    expect(extensionIdFromKey(Buffer.from('outra chave').toString('base64'))).not.toBe(registered.extensionId);
  });
});
