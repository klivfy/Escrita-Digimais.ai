import type { Ledger } from '../config/learning-ledger';
import type { TaughtStyle } from '../config/taught-style';
import type { TrainedStyle } from '../config/trained-style';

/**
 * Exportação e importação cifradas do aprendizado, para compartilhar entre colegas sem expor o conteúdo.
 *
 * Formato (JSON): metadados em claro (formato, versão exata da extensão, data, parâmetros de derivação, salt, IV e um
 * verificador de senha) e o conteúdo cifrado com AES-256-GCM. A chave vem da senha por PBKDF2-SHA-256 (600.000 voltas,
 * salt de 16 bytes, aleatório por arquivo). Argon2 não existe no navegador sem biblioteca externa, e a extensão não
 * carrega código de terceiros nem WebAssembly, então o PBKDF2 do WebCrypto é a opção sem dependência.
 *
 * - Derivam-se 64 bytes: 32 para a chave AES e 32 para uma chave HMAC que só confere a senha (por isso "senha
 *   incorreta" e "arquivo corrompido" são erros diferentes).
 * - Os metadados entram como dado autenticado adicional (AAD) do GCM: trocar a versão ou os parâmetros no arquivo
 *   invalida a decifragem.
 * - A versão da extensão é conferida ANTES de pedir ou usar a senha: versão diferente interrompe a importação.
 * - A senha nunca é guardada nem escrita no arquivo.
 */

export const LEARNING_FORMAT = 'escrita-digimais-learning-v1';
export const KDF_NAME = 'PBKDF2-SHA256';
export const CIPHER_NAME = 'AES-256-GCM';
export const KDF_ITERATIONS = 600_000;
export const MAX_KDF_ITERATIONS = 2_000_000;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const CHECK_LABEL = 'escrita-digimais-learning-v1:senha';

export type LearningErrorCode =
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'NOT_AN_EXPORT'
  | 'UNSUPPORTED_FORMAT'
  | 'VERSION_UNKNOWN'
  | 'VERSION_MISMATCH'
  | 'WEAK_KDF'
  | 'WRONG_PASSWORD'
  | 'CORRUPTED'
  | 'INVALID_CONTENT'
  | 'TOO_LARGE'
  | 'NOTHING_TO_EXPORT'
  | 'CRYPTO_UNAVAILABLE';

export class LearningCryptoError extends Error {
  constructor(readonly code: LearningErrorCode, message: string) {
    super(message);
    this.name = 'LearningCryptoError';
  }
}

/** O que viaja cifrado. */
export interface LearningPayload {
  kind: 'learning';
  version: 1;
  ledger: Ledger | null;
  trained: TrainedStyle | null;
  style: TaughtStyle | null;
}

interface Header {
  format: string;
  extensionVersion: string;
  createdAt: string;
  kdf: { name: string; iterations: number; salt: string };
  cipher: { name: string; iv: string };
  check: string;
}

export interface EncryptedFile extends Header {
  ciphertext: string;
}

type Bytes = Uint8Array<ArrayBuffer>;
const encoder = new TextEncoder();
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new LearningCryptoError('CRYPTO_UNAVAILABLE', 'Este navegador não oferece criptografia segura (WebCrypto). Exportar e importar ficam indisponíveis.');
  return s;
}

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromBase64(value: unknown): Bytes | null {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function checkPassword(password: string): string {
  const normalized = password.normalize('NFKC');
  if (!normalized) throw new LearningCryptoError('PASSWORD_REQUIRED', 'Informe uma senha. Sem senha o arquivo não é gerado.');
  if ([...normalized].length < MIN_PASSWORD_LENGTH) {
    throw new LearningCryptoError('PASSWORD_TOO_SHORT', `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return normalized;
}

async function deriveKeys(password: string, salt: Bytes, iterations: number): Promise<{ aes: CryptoKey; mac: CryptoKey }> {
  const s = subtle();
  const base = await s.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  const aes = await s.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const mac = await s.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  bits.fill(0);
  return { aes, mac };
}

const checkInput = (salt: Bytes): Bytes => {
  const label = encoder.encode(CHECK_LABEL);
  const out = new Uint8Array(label.length + salt.length);
  out.set(label);
  out.set(salt, label.length);
  return out;
};

/** Metadados na ordem fixa que entra como dado autenticado. */
const headerBytes = (h: Header): Bytes =>
  encoder.encode(JSON.stringify({ format: h.format, extensionVersion: h.extensionVersion, createdAt: h.createdAt, kdf: { name: h.kdf.name, iterations: h.kdf.iterations, salt: h.kdf.salt }, cipher: { name: h.cipher.name, iv: h.cipher.iv }, check: h.check }));

export async function encryptLearning(payload: LearningPayload, password: string, extensionVersion: string, now: Date): Promise<string> {
  const pwd = checkPassword(password);
  if (!extensionVersion) {
    throw new LearningCryptoError('VERSION_UNKNOWN', 'Não foi possível ler a versão da extensão. Exporte de dentro da extensão instalada.');
  }
  const s = subtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const { aes, mac } = await deriveKeys(pwd, salt, KDF_ITERATIONS);
  const check = new Uint8Array(await s.sign('HMAC', mac, checkInput(salt)));
  const header: Header = {
    format: LEARNING_FORMAT,
    extensionVersion,
    createdAt: now.toISOString(),
    kdf: { name: KDF_NAME, iterations: KDF_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: CIPHER_NAME, iv: toBase64(iv) },
    check: toBase64(check),
  };
  const ciphertext = new Uint8Array(
    await s.encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(header), tagLength: 128 }, aes, encoder.encode(JSON.stringify(payload))),
  );
  const file: EncryptedFile = { ...header, ciphertext: toBase64(ciphertext) };
  return JSON.stringify(file, null, 2);
}

/** Lê e confere a forma do arquivo, sem senha. Lança NOT_AN_EXPORT, UNSUPPORTED_FORMAT, WEAK_KDF, TOO_LARGE ou CORRUPTED. */
export function inspectLearningFile(text: string): EncryptedFile {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    throw new LearningCryptoError('TOO_LARGE', 'O arquivo é grande demais para ser um arquivo de aprendizado.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new LearningCryptoError('NOT_AN_EXPORT', 'Este arquivo não é um arquivo de aprendizado da extensão.');
  }
  if (!isObject(raw) || typeof raw.format !== 'string') {
    throw new LearningCryptoError('NOT_AN_EXPORT', 'Este arquivo não é um arquivo de aprendizado da extensão.');
  }
  if (raw.format !== LEARNING_FORMAT) {
    throw new LearningCryptoError('UNSUPPORTED_FORMAT', 'Formato de arquivo de aprendizado não reconhecido por esta versão da extensão.');
  }
  const { kdf, cipher } = raw;
  const corrupted = (): never => {
    throw new LearningCryptoError('CORRUPTED', 'O arquivo está corrompido ou foi alterado: faltam partes ou elas estão fora do formato.');
  };
  if (typeof raw.extensionVersion !== 'string' || !/^[0-9][0-9.]{0,30}$/.test(raw.extensionVersion)) corrupted();
  if (typeof raw.createdAt !== 'string' || raw.createdAt.length > 40) corrupted();
  if (!isObject(kdf) || !isObject(cipher)) return corrupted();
  if (kdf.name !== KDF_NAME || cipher.name !== CIPHER_NAME) {
    throw new LearningCryptoError('UNSUPPORTED_FORMAT', 'Algoritmo de cifra não reconhecido por esta versão da extensão.');
  }
  if (typeof kdf.iterations !== 'number' || !Number.isInteger(kdf.iterations)) corrupted();
  if ((kdf.iterations as number) < KDF_ITERATIONS) {
    throw new LearningCryptoError('WEAK_KDF', 'O arquivo usa uma derivação de senha mais fraca do que a exigida e foi recusado.');
  }
  if ((kdf.iterations as number) > MAX_KDF_ITERATIONS) corrupted();
  if (fromBase64(kdf.salt)?.length !== SALT_BYTES || fromBase64(cipher.iv)?.length !== IV_BYTES) corrupted();
  if (fromBase64(raw.check)?.length !== 32) corrupted();
  const body = fromBase64(raw.ciphertext);
  if (!body || body.length < 17) corrupted();
  return raw as unknown as EncryptedFile;
}

/** Interrompe se a versão do arquivo não for exatamente a desta extensão. Roda antes de qualquer uso da senha. */
export function assertSameVersion(file: Pick<EncryptedFile, 'extensionVersion'>, currentVersion: string): void {
  if (!currentVersion) {
    throw new LearningCryptoError('VERSION_UNKNOWN', 'Não foi possível ler a versão desta extensão. Importe de dentro da extensão instalada.');
  }
  if (file.extensionVersion !== currentVersion) {
    throw new LearningCryptoError(
      'VERSION_MISMATCH',
      `Versão incompatível: o arquivo foi gerado pela extensão ${file.extensionVersion} e esta é a ${currentVersion}. Instale a mesma versão nos dois lados e exporte de novo.`,
    );
  }
}

export async function decryptLearning(text: string, password: string, currentVersion: string): Promise<LearningPayload> {
  const file = inspectLearningFile(text);
  assertSameVersion(file, currentVersion);
  const pwd = checkPassword(password);
  const s = subtle();
  const salt = fromBase64(file.kdf.salt) as Bytes;
  const iv = fromBase64(file.cipher.iv) as Bytes;
  const { aes, mac } = await deriveKeys(pwd, salt, file.kdf.iterations);
  const ok = await s.verify('HMAC', mac, fromBase64(file.check) as Bytes, checkInput(salt));
  if (!ok) throw new LearningCryptoError('WRONG_PASSWORD', 'Senha incorreta.');
  let plain: ArrayBuffer;
  try {
    plain = await s.decrypt({ name: 'AES-GCM', iv, additionalData: headerBytes(file), tagLength: 128 }, aes, fromBase64(file.ciphertext) as Bytes);
  } catch {
    throw new LearningCryptoError('CORRUPTED', 'O arquivo está corrompido ou foi alterado depois de gerado. Nada foi importado.');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  } catch {
    throw new LearningCryptoError('INVALID_CONTENT', 'O conteúdo do arquivo não pôde ser lido.');
  }
  if (!isObject(payload) || payload.kind !== 'learning' || payload.version !== 1) {
    throw new LearningCryptoError('INVALID_CONTENT', 'O conteúdo do arquivo não é um aprendizado desta extensão.');
  }
  return payload as unknown as LearningPayload;
}
