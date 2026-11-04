import { describe, expect, it } from 'vitest';
import {
  assertSameVersion, checkPassword, decryptLearning, encryptLearning, inspectLearningFile, KDF_ITERATIONS, LEARNING_FORMAT,
  LearningCryptoError, MIN_PASSWORD_LENGTH,
} from '../application/learning-crypto';
import type { LearningErrorCode, LearningPayload } from '../application/learning-crypto';

const VERSION = '1.0.0.3';
const NOW = new Date('2026-11-04T12:00:00Z');
const PASSWORD = 'uma-senha-bem-longa-123';
const PAYLOAD: LearningPayload = {
  kind: 'learning', version: 1,
  ledger: { version: 1, since: '2026-10-01', updatedAt: '2026-11-04', textsAtTraining: 0, byType: { pending: { texts: 3, blocks: [{ role: 'closing', text: 'Ficamos no aguardo.', count: 3 }], labels: [] } } },
  trained: { version: 1, closings: { pending: 'Ficamos no aguardo.' } },
  style: { version: 1, signature: 'Time de Suporte' },
};

const codeOf = async (run: () => unknown): Promise<LearningErrorCode | 'no-error'> => {
  try {
    await run();
    return 'no-error';
  } catch (e) {
    if (e instanceof LearningCryptoError) return e.code;
    throw e;
  }
};
const tamper = (text: string, edit: (o: Record<string, unknown>) => void): string => {
  const o = JSON.parse(text) as Record<string, unknown>;
  edit(o);
  return JSON.stringify(o);
};

describe('cifragem e decifragem', () => {
  it('volta exatamente o que foi cifrado, e o arquivo traz só metadados em claro e o conteúdo cifrado', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    expect(await decryptLearning(file, PASSWORD, VERSION)).toEqual(PAYLOAD);
    const o = JSON.parse(file) as Record<string, unknown> & { kdf: Record<string, unknown>; cipher: Record<string, unknown> };
    expect(o).toMatchObject({ format: LEARNING_FORMAT, extensionVersion: VERSION, createdAt: '2026-11-04T12:00:00.000Z' });
    expect(o.kdf).toMatchObject({ name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS });
    expect(o.cipher).toMatchObject({ name: 'AES-256-GCM' });
    expect(file).not.toContain('Ficamos no aguardo');
    expect(file).not.toContain('Time de Suporte');
    expect(file).not.toContain(PASSWORD);
  });

  it('salt e IV são aleatórios: o mesmo conteúdo e a mesma senha geram arquivos diferentes', async () => {
    const a = JSON.parse(await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW)) as { kdf: { salt: string }; cipher: { iv: string }; ciphertext: string };
    const b = JSON.parse(await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW)) as typeof a;
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('aceita senha com acentos e normaliza a forma do Unicode', async () => {
    const composed = 'sênha-longa-ção-ÁÉÍ';
    const file = await encryptLearning(PAYLOAD, composed.normalize('NFC'), VERSION, NOW);
    expect(await decryptLearning(file, composed.normalize('NFD'), VERSION)).toEqual(PAYLOAD);
  });
});

describe('senha', () => {
  it('é obrigatória na exportação e tem tamanho mínimo', async () => {
    expect(await codeOf(() => encryptLearning(PAYLOAD, '', VERSION, NOW))).toBe('PASSWORD_REQUIRED');
    expect(await codeOf(() => encryptLearning(PAYLOAD, 'a'.repeat(MIN_PASSWORD_LENGTH - 1), VERSION, NOW))).toBe('PASSWORD_TOO_SHORT');
    expect(() => checkPassword('a'.repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });

  it('senha errada é rejeitada com erro próprio, sem dizer nada do conteúdo', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    expect(await codeOf(() => decryptLearning(file, 'outra-senha-longa-456', VERSION))).toBe('WRONG_PASSWORD');
    expect(await codeOf(() => decryptLearning(file, '', VERSION))).toBe('PASSWORD_REQUIRED');
    const error = await decryptLearning(file, 'outra-senha-longa-456', VERSION).catch((e: Error) => e);
    expect((error as Error).message).toBe('Senha incorreta.');
  });
});

describe('versão da extensão', () => {
  it('versão diferente interrompe a importação, com mensagem que diz as duas versões, antes de qualquer senha', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    const error = await decryptLearning(file, PASSWORD, '1.0.0.4').catch((e: Error) => e);
    expect(error).toBeInstanceOf(LearningCryptoError);
    expect((error as LearningCryptoError).code).toBe('VERSION_MISMATCH');
    expect((error as Error).message).toMatch(/1\.0\.0\.3/);
    expect((error as Error).message).toMatch(/1\.0\.0\.4/);
    // Nem senha errada nem vazia mudam o resultado: a versão é conferida primeiro.
    expect(await codeOf(() => decryptLearning(file, '', '1.0.0.4'))).toBe('VERSION_MISMATCH');
    expect(await codeOf(() => decryptLearning(file, 'errada-errada-errada', '2.0.0'))).toBe('VERSION_MISMATCH');
  });

  it('a comparação é exata: 1.0.0 não vale por 1.0.0.3 e vice-versa', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    expect(await codeOf(() => decryptLearning(file, PASSWORD, '1.0.0'))).toBe('VERSION_MISMATCH');
    const short = await encryptLearning(PAYLOAD, PASSWORD, '1.0.0', NOW);
    expect(await codeOf(() => decryptLearning(short, PASSWORD, VERSION))).toBe('VERSION_MISMATCH');
  });

  it('não exporta nem importa sem saber a versão da extensão', async () => {
    expect(await codeOf(() => encryptLearning(PAYLOAD, PASSWORD, '', NOW))).toBe('VERSION_UNKNOWN');
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    expect(await codeOf(() => decryptLearning(file, PASSWORD, ''))).toBe('VERSION_UNKNOWN');
  });

  it('trocar a versão dentro do arquivo para burlar o bloqueio invalida a decifragem', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    const forged = tamper(file, (o) => { o.extensionVersion = '1.0.0.4'; });
    // Na extensão 1.0.0.4 a versão confere, mas o dado autenticado não: o arquivo é rejeitado como alterado.
    expect(await codeOf(() => decryptLearning(forged, PASSWORD, '1.0.0.4'))).toBe('CORRUPTED');
  });

  it('assertSameVersion sozinho serve para avisar antes de pedir a senha', () => {
    expect(() => assertSameVersion({ extensionVersion: VERSION }, VERSION)).not.toThrow();
    expect(() => assertSameVersion({ extensionVersion: VERSION }, '1.0.0.9')).toThrow(/Versão incompatível/);
  });
});

describe('arquivo corrompido ou que não é do aprendizado', () => {
  it('alterar o conteúdo cifrado, o IV ou os parâmetros é detectado, com a senha certa', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    const flip = (b64: string): string => { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); bytes[bytes.length - 1] ^= 1; return btoa(String.fromCharCode(...bytes)); };
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { o.ciphertext = flip(o.ciphertext as string); }), PASSWORD, VERSION))).toBe('CORRUPTED');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { (o.cipher as { iv: string }).iv = flip((o.cipher as { iv: string }).iv); }), PASSWORD, VERSION))).toBe('CORRUPTED');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { o.createdAt = '2020-01-01T00:00:00.000Z'; }), PASSWORD, VERSION))).toBe('CORRUPTED');
  });

  it('JSON inválido, outro formato e partes faltando têm erros próprios', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    expect(await codeOf(() => decryptLearning('não é json', PASSWORD, VERSION))).toBe('NOT_AN_EXPORT');
    expect(await codeOf(() => decryptLearning('{"a":1}', PASSWORD, VERSION))).toBe('NOT_AN_EXPORT');
    expect(await codeOf(() => decryptLearning('[]', PASSWORD, VERSION))).toBe('NOT_AN_EXPORT');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { o.format = 'outro-v9'; }), PASSWORD, VERSION))).toBe('UNSUPPORTED_FORMAT');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { delete o.ciphertext; }), PASSWORD, VERSION))).toBe('CORRUPTED');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { (o.kdf as { salt: string }).salt = 'curto'; }), PASSWORD, VERSION))).toBe('CORRUPTED');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { o.ciphertext = '!!!'; }), PASSWORD, VERSION))).toBe('CORRUPTED');
  });

  it('recusa derivação mais fraca que a exigida (ataque de rebaixamento) e exagero que travaria o navegador', async () => {
    const file = await encryptLearning(PAYLOAD, PASSWORD, VERSION, NOW);
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { (o.kdf as { iterations: number }).iterations = 1000; }), PASSWORD, VERSION))).toBe('WEAK_KDF');
    expect(await codeOf(() => decryptLearning(tamper(file, (o) => { (o.kdf as { iterations: number }).iterations = 50_000_000; }), PASSWORD, VERSION))).toBe('CORRUPTED');
  });

  it('arquivo grande demais é recusado antes de ser lido', () => {
    expect(() => inspectLearningFile('x'.repeat(4 * 1024 * 1024))).toThrow(LearningCryptoError);
  });

  it('conteúdo cifrado que não é um aprendizado é recusado depois de decifrar', async () => {
    const file = await encryptLearning({ ...PAYLOAD, kind: 'outro' } as unknown as LearningPayload, PASSWORD, VERSION, NOW);
    expect(await codeOf(() => decryptLearning(file, PASSWORD, VERSION))).toBe('INVALID_CONTENT');
  });
});
