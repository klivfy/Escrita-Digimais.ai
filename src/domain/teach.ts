/**
 * Ensinar a extensão: transforma um texto real da organização em um modelo reaproveitável.
 * Pura e determinística. Nada é guardado aqui: a tela mostra cada troca e o analista decide salvar.
 *
 * O que a extensão troca sozinha por campo (lista fechada, sempre mostrado na tela):
 *   nome na saudação, número de chamado, data e prazo, nome da equipe de destino.
 * O que ela NÃO reconhece: nomes de pessoas fora da saudação. Por isso o aviso na tela e a triagem de dado sensível.
 */
import { MAX_MODEL_TEXT, MAX_MODEL_TITLE, validateLibrary } from '../config/library-schema';
import type { LibraryModel, ModelPlaceholder } from '../config/library-schema';
import { vetModel } from './library-vetting';
import type { CommunicationType, LanguageProfile, Recipient } from './types';

export interface TeachSubstitution {
  field: ModelPlaceholder;
  /** Trecho original. Só existe em memória, para a tela mostrar "Carlos vira {nome}". */
  original: string;
}

export interface TeachDraft {
  text: string;
  substitutions: TeachSubstitution[];
}

export const TEACH_NAME_NOTICE =
  'A extensão só troca o nome na saudação. Confira se não sobrou nome de pessoa, e-mail, telefone ou número de documento no texto.';

const NOT_A_NAME = '(?:[Ss]enhor|[Ss]enhora|[Ss]r|[Ss]ra|[Ee]quipe|[Tt]ime|[Tt]odos|[Pp]essoal|[Uu]suário|[Uu]suária)';
// Só a primeira linha. Maiúsculas conferidas pelo \p{Lu}, por isso sem a opção i.
const GREETING = new RegExp(
  `^(\\s*(?:Olá|Oi|Prezad[oa]s?|Caro|Cara|Bom dia|Boa tarde|Boa noite)[,!]?\\s+)(?!${NOT_A_NAME}\\b)(\\p{Lu}[\\p{L}'’-]+(?:\\s+\\p{Lu}[\\p{L}'’-]+){0,3})(?=\\s*[,!:.]|\\s*$)`,
  'u',
);
const TICKET_ID = /\b(?:INC|CHG|REQ|RITM|SD|TASK|PRB)[-\s]?\d{4,10}\b/g;
const TICKET_WORD = /\bchamado\s+(?:n[ºo°.]{0,2}\s*)?#?\d{3,10}\b/gi;
const DATE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*(?:às|as)\s*\d{1,2}(?::\d{2}|h\d{0,2})?)?/gu;
const TEAM = /\b(equipe|time|setor|área)\s+(de|da|do|das|dos)\s+(\p{Lu}[\p{L}]+(?:\s+\p{Lu}[\p{L}]+){0,2})/gu;
const DEADLINE_CUE = /(?:até|prazo)[^.\n]{0,14}$/i;

/** Troca os trechos que variam de um chamado para outro por campos e devolve cada troca feita. */
export function prepareTaught(raw: string): TeachDraft {
  let text = raw.replace(/\r\n?/g, '\n').trim();
  const substitutions: TeachSubstitution[] = [];
  const note = (field: ModelPlaceholder, original: string): void => {
    if (!substitutions.some((s) => s.field === field && s.original === original)) substitutions.push({ field, original });
  };

  const [first = '', ...rest] = text.split('\n');
  const greeting = first.match(GREETING);
  if (greeting) {
    note('nome', greeting[2]);
    text = [first.replace(GREETING, `$1{nome}`), ...rest].join('\n');
  }

  text = text.replace(TICKET_WORD, (m) => (note('chamado', m), '{chamado}'));
  text = text.replace(TICKET_ID, (m) => (note('chamado', m), '{chamado}'));
  text = text.replace(DATE, (m, offset: number) => {
    const field: ModelPlaceholder = DEADLINE_CUE.test(text.slice(Math.max(0, offset - 20), offset)) ? 'prazo' : 'data';
    note(field, m);
    return `{${field}}`;
  });
  text = text.replace(TEAM, (_m, noun: string, prep: string, name: string) => (note('equipe', name), `${noun} ${prep} {equipe}`));

  return { text, substitutions };
}

export interface TeachInput {
  title: string;
  text: string;
  type: CommunicationType;
  /** 'any' vale para qualquer destinatário. */
  recipient: Recipient | 'any';
}

export type TeachResult = { ok: true; model: LibraryModel } | { ok: false; errors: string[] };

const slug = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);

export const TAUGHT_ID_PREFIX = 'ensinado-';
export const MAX_TAUGHT_MODELS = 200;

const dayOf = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/**
 * Monta o modelo a guardar. Passa pelo mesmo esquema e pela mesma triagem da biblioteca da instituição:
 * dado sensível, credencial, prazo concreto, solução afirmada e demais regras recusam o salvamento, com o motivo.
 */
export function buildTaughtModel(input: TeachInput, existingIds: readonly string[], profile: LanguageProfile, now: Date): TeachResult {
  const title = input.title.trim();
  const text = input.text.replace(/\r\n?/g, '\n').trim();
  const errors: string[] = [];
  if (!title) errors.push('Dê um título ao modelo.');
  if (title.length > MAX_MODEL_TITLE) errors.push(`O título passa de ${MAX_MODEL_TITLE} caracteres.`);
  if (!text) errors.push('O texto do modelo está vazio.');
  if (text.length > MAX_MODEL_TEXT) errors.push(`O texto passa de ${MAX_MODEL_TEXT} caracteres.`);
  if (existingIds.length >= MAX_TAUGHT_MODELS) errors.push(`Limite de ${MAX_TAUGHT_MODELS} modelos ensinados atingido. Remova algum.`);
  if (errors.length > 0) return { ok: false, errors };

  const base = `${TAUGHT_ID_PREFIX}${slug(title) || 'modelo'}`;
  let id = base;
  for (let n = 2; existingIds.includes(id); n++) id = `${base}-${n}`.slice(0, 48);

  const model: LibraryModel = {
    id,
    title,
    types: [input.type],
    recipients: input.recipient === 'any' ? [] : [input.recipient],
    text,
    keywords: [],
    reviewedAt: dayOf(now),
  };
  const checked = validateLibrary({ schemaVersion: 1, libraryName: 'Modelos ensinados', libraryVersion: 'local', models: [model] });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const vetting = vetModel(checked.library.models[0], profile);
  if (vetting.reasons.length > 0) return { ok: false, errors: vetting.reasons };
  return { ok: true, model: checked.library.models[0] };
}
