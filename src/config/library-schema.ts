import { COMMUNICATION_TYPES, RECIPIENTS } from '../domain/types';
import type { CommunicationType, Recipient } from '../domain/types';

/**
 * Biblioteca de modelos de texto da instituição: textos prontos, escolhidos e revisados por pessoas.
 * Validação estrita, no mesmo espírito do perfil de linguagem:
 * - chaves desconhecidas são recusadas (inclusive __proto__ e constructor);
 * - só texto simples: sem HTML, links, esquemas executáveis ou caracteres de controle;
 * - o único conteúdo variável são os campos entre chaves de uma lista fechada ({nome}, {chamado} ...);
 * - o objeto devolvido é montado campo a campo, nunca por mesclagem do JSON recebido.
 * A varredura de dado sensível e as regras de revisão ficam em domain/library-vetting.ts (precisam do perfil).
 */

export const LIBRARY_SCHEMA_VERSION = 1;
export const MAX_LIBRARY_FILE_BYTES = 400 * 1024;
export const MAX_LIBRARY_MODELS = 200;
export const MAX_MODEL_TEXT = 1500;
export const MAX_MODEL_TITLE = 80;
export const MAX_MODEL_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 40;

/** Campos que o analista preenche ou que a extensão preenche com o que ele informou. Lista fechada. */
export const MODEL_PLACEHOLDERS = ['nome', 'chamado', 'data', 'prazo', 'equipe', 'sistema', 'equipamento'] as const;
export type ModelPlaceholder = (typeof MODEL_PLACEHOLDERS)[number];

export interface LibraryModel {
  id: string;
  title: string;
  types: CommunicationType[];
  recipients: Recipient[];
  text: string;
  keywords: string[];
  /** AAAA-MM-DD da última revisão humana; vazio se não informado. */
  reviewedAt: string;
}

export interface ModelLibrary {
  schemaVersion: 1;
  libraryName: string;
  libraryVersion: string;
  models: LibraryModel[];
}

export type LibraryValidation = { ok: true; library: ModelLibrary } | { ok: false; errors: string[] };

// Esquemas só contam como esquema quando o texto emenda logo depois dos dois-pontos (data:text/html), e não no rótulo
// comum "Data: {data}" ou em "metadata:". javascript: e vbscript: ficam recusados sempre.
const UNSAFE_TEXT = /<[^>]*>|javascript:|vbscript:|(?<![\p{L}\p{N}_])(?:data|file):(?=[^\s{])|https?:\/\/|www\./iu;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^[0-9A-Za-z._-]{1,32}$/;
const BRACES = /[{}]/;
const FIELD = /\{([^{}]*)\}/g;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Campos usados no texto, na ordem em que aparecem (sem repetir). */
export function placeholdersIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(FIELD)) if (!found.includes(m[1])) found.push(m[1]);
  return found;
}

function plainText(value: unknown, path: string, max: number, errors: string[], opts: { multiline?: boolean } = {}): string {
  if (typeof value !== 'string') {
    errors.push(`${path}: deve ser texto.`);
    return '';
  }
  const text = opts.multiline ? value.replace(/\r\n?/g, '\n').trim() : value.trim();
  if (!text) errors.push(`${path}: não pode ficar vazio.`);
  if (text.length > max) errors.push(`${path}: passa de ${max} caracteres.`);
  if (CONTROL_CHARS.test(text) || (!opts.multiline && /[\n\r\t]/.test(text))) errors.push(`${path}: contém caracteres de controle.`);
  if (UNSAFE_TEXT.test(text)) errors.push(`${path}: só texto simples (sem HTML, links ou esquemas executáveis).`);
  return text;
}

function enumList<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[], min: number): T[] {
  if (!Array.isArray(value)) {
    errors.push(`${path}: deve ser uma lista.`);
    return [];
  }
  const out: T[] = [];
  for (const item of value) {
    if (typeof item === 'string' && (allowed as readonly string[]).includes(item)) {
      if (!out.includes(item as T)) out.push(item as T);
    } else errors.push(`${path}: valor não permitido "${String(item).slice(0, 40)}".`);
  }
  if (out.length < min) errors.push(`${path}: informe pelo menos ${min}.`);
  return out;
}

function validateModel(raw: unknown, index: number, errors: string[]): LibraryModel | null {
  const at = `models[${index}]`;
  if (!isObject(raw)) {
    errors.push(`${at}: deve ser um objeto.`);
    return null;
  }
  const before = errors.length;
  for (const key of Object.keys(raw)) {
    if (!['id', 'title', 'types', 'recipients', 'text', 'keywords', 'reviewedAt'].includes(key)) {
      errors.push(`${at}: chave desconhecida ou não permitida "${key.slice(0, 40)}".`);
    }
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!ID.test(id)) errors.push(`${at}.id: use letras minúsculas, números, "_" ou "-" (até 48 caracteres).`);
  const title = plainText(raw.title, `${at}.title`, MAX_MODEL_TITLE, errors);
  const text = plainText(raw.text, `${at}.text`, MAX_MODEL_TEXT, errors, { multiline: true });
  const types = enumList<CommunicationType>(raw.types, COMMUNICATION_TYPES, `${at}.types`, errors, 1);
  const recipients = raw.recipients === undefined ? [] : enumList<Recipient>(raw.recipients, RECIPIENTS, `${at}.recipients`, errors, 0);

  const keywords: string[] = [];
  if (raw.keywords !== undefined) {
    if (!Array.isArray(raw.keywords)) errors.push(`${at}.keywords: deve ser uma lista.`);
    else {
      if (raw.keywords.length > MAX_MODEL_KEYWORDS) errors.push(`${at}.keywords: no máximo ${MAX_MODEL_KEYWORDS} palavras-chave.`);
      raw.keywords.slice(0, MAX_MODEL_KEYWORDS).forEach((k, i) => {
        const word = plainText(k, `${at}.keywords[${i}]`, MAX_KEYWORD_LENGTH, errors);
        if (word && !keywords.includes(word)) keywords.push(word);
      });
    }
  }

  let reviewedAt = '';
  // Vazio quer dizer "não informado": é como a forma normalizada guarda a ausência da data.
  if (raw.reviewedAt !== undefined && raw.reviewedAt !== '') {
    if (typeof raw.reviewedAt !== 'string' || !DAY.test(raw.reviewedAt) || Number.isNaN(Date.parse(raw.reviewedAt))) {
      errors.push(`${at}.reviewedAt: use a data no formato AAAA-MM-DD.`);
    } else reviewedAt = raw.reviewedAt;
  }

  // Campos entre chaves: só os da lista fechada; chaves soltas ou aninhadas são recusadas.
  for (const name of placeholdersIn(text)) {
    if (!(MODEL_PLACEHOLDERS as readonly string[]).includes(name)) {
      errors.push(`${at}.text: campo "{${name.slice(0, 30)}}" não existe. Campos permitidos: ${MODEL_PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}.`);
    }
  }
  if (BRACES.test(text.replace(FIELD, ''))) errors.push(`${at}.text: chave "{" ou "}" solta; os campos devem ser escritos como {nome}.`);

  return errors.length === before ? { id, title, types, recipients, text, keywords, reviewedAt } : null;
}

/** Valida e normaliza uma biblioteca. Qualquer problema recusa o arquivo inteiro, com a lista do que corrigir. */
export function validateLibrary(raw: unknown): LibraryValidation {
  if (!isObject(raw)) return { ok: false, errors: ['A biblioteca deve ser um objeto JSON.'] };
  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!['schemaVersion', 'libraryName', 'libraryVersion', 'models'].includes(key)) {
      errors.push(`chave desconhecida ou não permitida "${key.slice(0, 40)}".`);
    }
  }
  if (raw.schemaVersion !== LIBRARY_SCHEMA_VERSION) errors.push('schemaVersion: versão de esquema não suportada; use 1.');
  const libraryName = plainText(raw.libraryName, 'libraryName', 80, errors);
  const libraryVersion = typeof raw.libraryVersion === 'string' ? raw.libraryVersion.trim() : '';
  if (!VERSION.test(libraryVersion)) errors.push('libraryVersion: use até 32 letras, números, ponto, "_" ou "-" (por exemplo 2026.10.1).');

  const models: LibraryModel[] = [];
  if (!Array.isArray(raw.models)) errors.push('models: deve ser uma lista.');
  else {
    if (raw.models.length === 0) errors.push('models: informe pelo menos um modelo.');
    if (raw.models.length > MAX_LIBRARY_MODELS) errors.push(`models: no máximo ${MAX_LIBRARY_MODELS} modelos.`);
    const seen = new Set<string>();
    raw.models.slice(0, MAX_LIBRARY_MODELS).forEach((m, i) => {
      const model = validateModel(m, i, errors);
      if (!model) return;
      if (seen.has(model.id)) errors.push(`models[${i}].id: "${model.id}" já foi usado por outro modelo.`);
      seen.add(model.id);
      models.push(model);
    });
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 40) };
  return { ok: true, library: { schemaVersion: 1, libraryName, libraryVersion, models } };
}
