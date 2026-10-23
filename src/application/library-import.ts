import { MAX_LIBRARY_FILE_BYTES, validateLibrary } from '../config/library-schema';
import type { ModelLibrary } from '../config/library-schema';
import { vetLibrary } from '../domain/library-vetting';
import type { ModelProblem } from '../domain/library-vetting';
import type { LanguageProfile } from '../domain/types';
import { canonicalJson, sanitizeSigningKeys, verifyProfileSignature } from './profile-signing';

/**
 * Importação da biblioteca de modelos. Mesmo desenho do perfil: com chaves de assinatura configuradas pela
 * organização, só vale o envelope assinado; sem chaves, aceita arquivo simples e recusa envelope (não há como verificar).
 * Envelope: { "format": "signed-library-v1", "library": { ... }, "signatureValue": "<base64url, r||s>" }
 * A assinatura cobre o JSON canônico da biblioteca (a mesma chave ECDSA P-256 do perfil). O que é guardado é exatamente
 * o que foi assinado, para poder ser reverificado a cada abertura.
 */

export const SIGNED_LIBRARY_FORMAT = 'signed-library-v1';

export type LibraryImportResult =
  | { ok: true; library: ModelLibrary; signature?: string; notices: ModelProblem[] }
  | { ok: false; errors: string[] };

const fail = (...errors: string[]): LibraryImportResult => ({ ok: false, errors });

function vetted(library: ModelLibrary, profile: LanguageProfile, signature?: string): LibraryImportResult {
  const vetting = vetLibrary(library, profile);
  if (!vetting.ok) {
    return fail(
      ...vetting.problems.slice(0, 20).flatMap((p) => p.reasons.slice(0, 3).map((r) => `Modelo "${p.id}" (${p.title}): ${r}`)),
    );
  }
  return { ok: true, library, signature, notices: vetting.notices };
}

export async function importLibraryText(text: string, publicKeys: readonly string[], profile: LanguageProfile): Promise<LibraryImportResult> {
  if (new TextEncoder().encode(text).length > MAX_LIBRARY_FILE_BYTES) {
    return fail(`O arquivo excede ${Math.round(MAX_LIBRARY_FILE_BYTES / 1024)} KB.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('O arquivo não é um JSON válido.');
  }
  const isEnvelope =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) && (raw as Record<string, unknown>).format === SIGNED_LIBRARY_FORMAT;
  const required = sanitizeSigningKeys([...publicKeys]).length > 0;

  if (!isEnvelope) {
    if (required) return fail('A organização exige biblioteca assinada. Importe o arquivo assinado fornecido pelo administrador.');
    const plain = validateLibrary(raw);
    return plain.ok ? vetted(plain.library, profile) : plain;
  }

  const env = raw as Record<string, unknown>;
  const extra = Object.keys(env).filter((k) => !['format', 'library', 'signatureValue'].includes(k));
  if (extra.length > 0 || typeof env.signatureValue !== 'string') return fail('Envelope assinado malformado.');
  if (!required) return fail('Este arquivo é assinado, mas nenhuma chave de assinatura foi configurada pela organização.');
  if (!(await verifyProfileSignature(env.library, env.signatureValue, publicKeys))) {
    return fail('Assinatura inválida: a biblioteca foi alterada ou não foi assinada pela organização.');
  }
  const checked = validateLibrary(env.library);
  if (!checked.ok) return checked;
  if (canonicalJson(checked.library) !== canonicalJson(env.library)) {
    return fail('A biblioteca assinada não está na forma normalizada. Exporte pela extensão, assine de novo e importe.');
  }
  return vetted(checked.library, profile, env.signatureValue);
}

/** Texto de exportação: a biblioteca guardada, em JSON legível. Sem nada além do que foi importado. */
export function exportLibraryJson(library: ModelLibrary): string {
  return JSON.stringify(library, null, 2);
}
