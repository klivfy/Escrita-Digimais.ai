/**
 * Voz da equipe: o analista costuma anotar na primeira pessoa do singular ("resetei a senha",
 * "no meu teste"), mas o texto enviado ao usuário fala em nome do Service Desk. Este módulo
 * converte apenas formas conhecidas (listas fechadas), nunca por regra genérica, e informa
 * exatamente o que mudou para que a alteração nunca seja silenciosa.
 */

import { FUTURE_FIRST_PERSON, NOUNS, PARTICIPLE_OPENERS, PAST_FIRST_PERSON, POSSESSIVES } from '../config/voice-lists';
import type { Gender, NounInfo } from '../config/voice-lists';

/** Particípios também no feminino e no plural ("Validadas as permissões"), sem alterar a lista de configuração. */
function withInflections(base: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const [participle, team] of Object.entries(base)) {
    const stem = participle.slice(0, -1);
    for (const suffix of ['a', 'os', 'as']) out[`${stem}${suffix}`] = team;
  }
  return out;
}

const PARTICIPLES = withInflections(PARTICIPLE_OPENERS);

const WORD = /(?<![\p{L}\p{N}_])[\p{L}]+(?![\p{L}\p{N}_])/gu;

function matchCase(original: string, replacement: string): string {
  const first = original.charAt(0);
  const upper = first !== first.toLowerCase() && first === first.toUpperCase();
  return upper ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

function lookup(table: Record<string, string>, word: string): string | undefined {
  const key = word.toLocaleLowerCase('pt-BR');
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export interface VoiceChange {
  from: string;
  to: string;
}

export interface VoiceResult {
  text: string;
  changes: VoiceChange[];
}

/** Converte uma única frase ou item para a voz da equipe. Não toca em palavras fora das listas. */
export function toTeamVoice(text: string): VoiceResult {
  const changes: VoiceChange[] = [];
  const note = (from: string, to: string): string => {
    changes.push({ from, to });
    return to;
  };

  let first = true;
  const converted = text.replace(WORD, (word) => {
    const isFirst = first;
    first = false;
    if (isFirst) {
      const participle = lookup(PARTICIPLES, word);
      if (participle) return note(word, matchCase(word, participle));
    }
    const table = [PAST_FIRST_PERSON, FUTURE_FIRST_PERSON, POSSESSIVES];
    for (const t of table) {
      const hit = lookup(t, word);
      if (hit) return note(word, matchCase(word, hit));
    }
    return word;
  });
  return { text: converted, changes };
}

/** True quando a frase começa com um verbo conhecido na primeira pessoa do plural (pretérito ou futuro). */
const TEAM_VERBS = new Set<string>([
  ...Object.values(PAST_FIRST_PERSON),
  ...Object.values(PARTICIPLES),
  ...Object.values(FUTURE_FIRST_PERSON),
].map((v) => v.toLocaleLowerCase('pt-BR')));

export function startsWithTeamVerb(text: string): boolean {
  const first = text.match(/^[\s\p{P}]*([\p{L}]+)/u)?.[1];
  return first ? TEAM_VERBS.has(first.toLocaleLowerCase('pt-BR')) : false;
}

export function dedupeChanges(changes: VoiceChange[]): VoiceChange[] {
  const seen = new Set<string>();
  const out: VoiceChange[] = [];
  for (const c of changes) {
    const key = `${c.from.toLocaleLowerCase('pt-BR')}>${c.to.toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: c.from.toLocaleLowerCase('pt-BR'), to: c.to.toLocaleLowerCase('pt-BR') });
  }
  return out;
}

// ---------- Voz para o destinatário (texto escrito ao próprio usuário) ----------

const POSSESSIVE: Record<Gender, [string, string]> = { m: ['seu', 'seus'], f: ['sua', 'suas'] };

const strip = (w: string): string => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
const nounOf = (w: string): NounInfo | undefined => {
  const key = strip(w);
  return Object.prototype.hasOwnProperty.call(NOUNS, key) ? NOUNS[key] : undefined;
};
const possessiveFor = (n: NounInfo): string => POSSESSIVE[n.gender][n.plural ? 1 : 0];

/**
 * "Usuário" seguido de nome próprio indica outra pessoa; nesse caso não se converte.
 * Atenção: com a flag `i`, `\p{Lu}` casa também minúsculas, por isso estes padrões não usam `i`.
 */
const NOT_NAMED = '(?!\\s+\\p{Lu})';
const USER = '[Uu]su[áa]ri[oa]s?';

const RULES_PERSON: { pattern: RegExp; to: string; capital: string }[] = [
  { pattern: new RegExp(`(?<![\\p{L}])[Cc]om (?:o|a) ${USER}(?![\\p{L}])${NOT_NAMED}`, 'gu'), to: 'com você', capital: 'Com você' },
  { pattern: new RegExp(`(?<![\\p{L}])[Pp]ara (?:o|a) ${USER}(?![\\p{L}])${NOT_NAMED}`, 'gu'), to: 'para você', capital: 'Para você' },
  { pattern: new RegExp(`(?<![\\p{L}])(?:[Aa]o|[Àà]) ${USER}(?![\\p{L}])${NOT_NAMED}`, 'gu'), to: 'a você', capital: 'A você' },
  { pattern: new RegExp(`(?<![\\p{L}])[Pp]el[oa] ${USER}(?![\\p{L}])${NOT_NAMED}`, 'gu'), to: 'por você', capital: 'Por você' },
];

/**
 * Quando o texto é escrito ao próprio usuário, converte referências a ele em terceira pessoa para a segunda
 * ("com o usuário" para "com você", "o teste do usuário" para "o seu teste", "conta dele" para "sua conta").
 * Só atua em formas conhecidas e lista cada troca; "usuário" seguido de nome próprio nunca é convertido.
 */
export function toRecipientVoice(text: string): VoiceResult {
  const changes: VoiceChange[] = [];
  const note = (from: string, to: string): string => {
    changes.push({ from, to });
    return to;
  };
  let out = text;
  for (const { pattern, to, capital } of RULES_PERSON) {
    out = out.replace(pattern, (m) => note(m, m.charAt(0) === m.charAt(0).toUpperCase() ? capital : to));
  }

  // "o teste do usuário" e "teste do usuário"
  const ofUser = new RegExp(`(?<![\\p{L}])(?:([oOaA]|[oO]s|[aA]s) )?(\\p{L}+) d[oa]s? ${USER}(?![\\p{L}])${NOT_NAMED}`, 'gu');
  out = out.replace(ofUser, (m, article: string | undefined, noun: string) => {
    const info = nounOf(noun);
    if (!info) return m;
    const poss = possessiveFor(info);
    return note(m, `${article ? `${article} ` : ''}${poss} ${noun}`);
  });

  // "conta dele", "senha dela"
  out = out.replace(/(?<![\p{L}])(\p{L}+) (?:dele|dela)(?![\p{L}])/giu, (m, noun: string) => {
    const info = nounOf(noun);
    return info ? note(m, `${possessiveFor(info)} ${noun}`) : m;
  });

  // "Aguardando seu teste" para "Aguardamos seu teste"
  out = out.replace(/^([Aa])guardando(?= (?:o |a )?(?:seu|sua|seus|suas)(?![\p{L}]))/u, (m, first: string) => note(m, `${first}guardamos`));
  return { text: out, changes };
}
