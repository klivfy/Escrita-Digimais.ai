/**
 * Camada 2 da correção: concordância, crase e uso de palavras parecidas, por regras fechadas. Só sugere.
 * Cada regra olha um padrão estreito e frequente (determinante plural com substantivo no singular, verbo no singular
 * logo depois de sujeito plural, "houveram", "fazem" com tempo, crase em locuções, "mais" no lugar de "mas").
 * O substantivo só conta se estiver no léxico de `config/proofread/agreement-lexicon.ts`; fora dele, nada é sugerido.
 * Nomes de pessoa (usuário, técnico, gestor...) ficam sem regra de gênero, porque a troca pode estar no nome e não no artigo.
 */
import { FEMININE_NOUNS, MASCULINE_NOUNS, PERSON_NOUNS } from '../config/proofread/agreement-lexicon';
import type { ProofreadSuggestion } from './proofread';

type Gender = 'm' | 'f';
interface Noun {
  gender: Gender;
  plural: boolean;
  person: boolean;
}
interface Tok {
  w: string;
  s: number;
  e: number;
}

const strip = (s: string): string => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
const WORD = /\p{L}[\p{L}'’-]*/gu;
const tokens = (text: string): Tok[] => [...text.matchAll(WORD)].map((m) => ({ w: m[0], s: m.index, e: m.index + m[0].length }));

function matchCase(original: string, replacement: string): string {
  return /^\p{Lu}/u.test(original) ? replacement.charAt(0).toLocaleUpperCase('pt-BR') + replacement.slice(1) : replacement;
}

function pluralOf(sg: string): string {
  if (/ão$/.test(sg)) return sg.replace(/ão$/, 'ões');
  if (/[rz]$/.test(sg)) return `${sg}es`;
  if (/l$/.test(sg)) return sg.replace(/l$/, 'is');
  if (/m$/.test(sg)) return sg.replace(/m$/, 'ns');
  if (/s$/.test(sg)) return sg;
  return `${sg}s`;
}

const PERSONS = new Set(PERSON_NOUNS.map(strip));
const GENDER = new Map<string, Gender>([...MASCULINE_NOUNS.map((n): [string, Gender] => [strip(n), 'm']), ...FEMININE_NOUNS.map((n): [string, Gender] => [strip(n), 'f'])]);
const SINGULAR_OF = new Map<string, string>();
for (const n of [...MASCULINE_NOUNS, ...FEMININE_NOUNS]) SINGULAR_OF.set(strip(pluralOf(n)), strip(n));

function noun(word: string): Noun | null {
  const k = strip(word);
  const own = GENDER.get(k);
  if (own) return { gender: own, plural: false, person: PERSONS.has(k) };
  const sg = SINGULAR_OF.get(k);
  const g = sg ? GENDER.get(sg) : undefined;
  return sg && g ? { gender: g, plural: true, person: PERSONS.has(sg) } : null;
}

const DETERMINERS: Record<Gender, { sg: string[]; pl: string[] }> = {
  m: { sg: ['o', 'um', 'este', 'esse', 'aquele', 'nosso', 'seu', 'meu'], pl: ['os', 'uns', 'estes', 'esses', 'aqueles', 'nossos', 'seus', 'meus'] },
  f: { sg: ['a', 'uma', 'esta', 'essa', 'aquela', 'nossa', 'sua', 'minha'], pl: ['as', 'umas', 'estas', 'essas', 'aquelas', 'nossas', 'suas', 'minhas'] },
};
const DET_INFO = new Map<string, { gender: Gender; plural: boolean; idx: number }>();
for (const g of ['m', 'f'] as const) {
  for (const n of ['sg', 'pl'] as const) DETERMINERS[g][n].forEach((d, idx) => DET_INFO.set(d, { gender: g, plural: n === 'pl', idx }));
}
const NUMERALS_PL = new Set(['dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'varios', 'varias', 'muitos', 'muitas', 'todos', 'todas']);
const PREP = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'com', 'para', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'sem', 'sobre']);
const COPULA = new Set(['está', 'estão', 'foi', 'foram', 'ficou', 'ficaram', 'estava', 'estavam', 'é', 'são', 'permanece', 'permanecem', 'continua', 'continuam'].map(strip));
const IRREGULAR_PARTICIPLES = new Set(['aberto', 'escrito', 'feito', 'visto', 'posto', 'dito', 'coberto', 'preso', 'quebrado']);
const isAdjective = (w: string): boolean => /(ad|id)(o|a|os|as)$/.test(strip(w)) || IRREGULAR_PARTICIPLES.has(strip(w).replace(/(a|os|as)$/, 'o'));

/** Concorda adjetivo ou particípio. Sem gênero conhecido (nome de pessoa), mantém o gênero que o analista escreveu. */
function adjectiveForm(w: string, gender: Gender | null, plural: boolean): string {
  const stem = w.replace(/(o|a|os|as)$/, '');
  const g = gender ?? (/(a|as)$/.test(w) ? 'f' : 'm');
  return stem + (g === 'm' ? 'o' : 'a') + (plural ? 's' : '');
}

/** Verbos no singular do pretérito ou do presente que têm forma plural conhecida. Lista fechada. */
const VERB_PLURAL: Record<string, string> = {
  relatou: 'relataram', persiste: 'persistem', precisa: 'precisam', indica: 'indicam', foi: 'foram', ficou: 'ficaram',
  está: 'estão', apresentou: 'apresentaram', ocorreu: 'ocorreram', falhou: 'falharam', expirou: 'expiraram',
  travou: 'travaram', afeta: 'afetam', exige: 'exigem', mostra: 'mostram', causou: 'causaram', continua: 'continuam',
  voltou: 'voltaram', deve: 'devem', pode: 'podem', é: 'são', verificou: 'verificaram', concluiu: 'concluíram',
  analisou: 'analisaram', resolveu: 'resolveram', abriu: 'abriram', encerrou: 'encerraram', atualizou: 'atualizaram',
  reiniciou: 'reiniciaram', enviou: 'enviaram', informou: 'informaram', solicitou: 'solicitaram', confirmou: 'confirmaram',
  aprovou: 'aprovaram', liberou: 'liberaram', testou: 'testaram', instalou: 'instalaram', tentou: 'tentaram',
  conseguiu: 'conseguiram', recebeu: 'receberam', chegou: 'chegaram',
};

interface Link {
  idx: number;
  gender: Gender;
  plural: boolean;
  person: boolean;
}

/**
 * Núcleos candidatos imediatamente antes da posição i, do mais próximo ao mais à esquerda. Pula complementos com
 * preposição ("de X") e exige um único espaço entre as palavras (pontuação ou quebra de linha encerram o sintagma).
 * O número vale o do determinante quando ele está no plural ("os relatório" já conta como plural, que a regra N1 corrige).
 */
function chainBefore(t: Tok[], text: string, i: number): Link[] {
  const out: Link[] = [];
  let j = i - 1;
  while (j >= 0 && text.slice(t[j].e, t[j + 1].s) === ' ') {
    const info = noun(t[j].w);
    const prevOk = j >= 1 && text.slice(t[j - 1].e, t[j].s) === ' ';
    const prev = prevOk ? t[j - 1].w.toLowerCase() : '';
    if (info) {
      const det = prevOk ? DET_INFO.get(prev) : undefined;
      const numeral = prevOk && NUMERALS_PL.has(strip(prev));
      out.push({ idx: j, ...info, plural: info.plural || Boolean(det?.plural) || numeral });
    }
    if (PREP.has(strip(prev)) && j >= 2) {
      j -= 2;
      continue;
    }
    break;
  }
  return out;
}

const DAYS = /^(segunda|terca|quarta|quinta|sexta)(-feira)?$|^(sabado|domingo|hoje|ontem|amanha)$/;
const TIME_UNITS = /^(dias|horas|semanas|meses|anos|minutos)$/;
const COUNT_WORDS = /^(um|uma|dois|duas|tres|quatro|cinco|seis|sete|dez|varios|varias)$/;

/** Sugestões de concordância, crase e uso de palavras parecidas. Pode haver pelo menos uma por trecho; sem duplicar posição. */
export function checkAgreement(text: string): ProofreadSuggestion[] {
  const t = tokens(text);
  const out: ProofreadSuggestion[] = [];
  const add = (s: number, e: number, original: string, replacement: string, rule: ProofreadSuggestion['rule'], reason: string): void => {
    out.push({ start: s, end: e, original, replacement, rule, reason });
  };
  for (let i = 0; i < t.length; i++) {
    const w = t[i].w;
    const lw = w.toLowerCase();
    const k = strip(w);
    const next = t[i + 1];
    const nk = next ? strip(next.w) : '';
    const prevK = i > 0 ? strip(t[i - 1].w) : '';
    const gapNext = next ? text.slice(t[i].e, next.s) : '';
    const det = DET_INFO.get(lw);

    // Determinante ou numeral no plural com substantivo no singular.
    if (next && gapNext === ' ' && ((det && det.plural) || NUMERALS_PL.has(k))) {
      const n = noun(next.w);
      if (n && !n.plural) add(next.s, next.e, next.w, matchCase(next.w, pluralOf(next.w.toLowerCase())), 'concordancia', 'O determinante está no plural: o substantivo também vai para o plural.');
    }
    // Gênero do determinante contra o do substantivo (não para nomes de pessoa).
    if (next && gapNext === ' ' && det && !det.plural) {
      const n = noun(next.w);
      if (n && !n.plural && !n.person && n.gender !== det.gender) {
        add(t[i].s, t[i].e, w, matchCase(w, DETERMINERS[n.gender].sg[det.idx]), 'concordancia', 'O determinante precisa concordar em gênero com o substantivo.');
      }
    }
    // Adjetivo ou particípio com o gênero e o número do núcleo.
    if (isAdjective(w) && !noun(w)) {
      const prevIsCopula = i > 0 && COPULA.has(prevK) && text.slice(t[i - 1].e, t[i].s) === ' ';
      const chain = prevIsCopula ? chainBefore(t, text, i - 1) : chainBefore(t, text, i);
      if (chain.length) {
        const reason = 'O adjetivo ou particípio concorda com o substantivo em gênero e número.';
        const formFor = (h: Link): string => adjectiveForm(w, h.person ? null : h.gender, h.plural);
        if (prevIsCopula) {
          const want = formFor(chain[chain.length - 1]);
          if (want.toLowerCase() !== lw) add(t[i].s, t[i].e, w, want, 'concordancia', reason);
        } else if (!chain.some((h) => formFor(h).toLowerCase() === lw)) {
          const head = chain[0];
          const before = t[head.idx - 1];
          // Conservador: substantivo depois de preposição pode ter um núcleo que o léxico não conhece.
          if (!(before && PREP.has(strip(before.w)))) add(t[i].s, t[i].e, w, formFor(head), 'concordancia', reason);
        }
      }
    }
    // Verbo no singular logo depois de núcleo plural, ou de sujeito composto.
    const plural = VERB_PLURAL[lw];
    if (plural) {
      const subject = chainBefore(t, text, i).at(-1);
      const compound = i >= 4 && strip(t[i - 3].w) === 'e' && noun(t[i - 1].w) && !noun(t[i - 1].w)?.plural && DET_INFO.has(strip(t[i - 2].w)) && noun(t[i - 4].w);
      if ((subject && subject.plural) || compound) add(t[i].s, t[i].e, w, matchCase(w, plural), 'concordancia', 'O verbo concorda com o sujeito no plural.');
    }
    if (lw === 'nós' && next && /ou$/.test(next.w) && next.w.length > 4) {
      add(next.s, next.e, next.w, next.w.replace(/ou$/, 'amos'), 'concordancia', 'Com "nós", o verbo fica na primeira pessoa do plural.');
    }
    if (k === 'houveram') add(t[i].s, t[i].e, w, matchCase(w, 'houve'), 'concordancia', 'Haver no sentido de existir fica no singular.');
    if (k === 'fazem' && next && NUMERALS_PL.has(nk) && t[i + 2] && TIME_UNITS.test(strip(t[i + 2].w))) {
      add(t[i].s, t[i].e, w, matchCase(w, 'faz'), 'concordancia', 'Fazer indicando tempo decorrido fica no singular.');
    }
    if (k === 'existe' && next && NUMERALS_PL.has(nk)) add(t[i].s, t[i].e, w, matchCase(w, 'existem'), 'concordancia', 'Existir concorda com o que existe: fica no plural.');

    // Crase e locuções.
    if (lw === 'a' && next) {
      if (nk === 'disposicao') add(t[i].s, t[i].e, w, 'à', 'crase', 'Locução com crase: à disposição.');
      else if ((nk === 'tarde' || nk === 'noite') && DAYS.test(prevK)) add(t[i].s, t[i].e, w, 'à', 'crase', 'Expressão de tempo com crase: à tarde, à noite.');
      else if (nk === 'espera' && /^(fic|estam|estou|estav|estiv|permane)/.test(prevK) && t[i + 2] && /^(de|do|da)$/.test(strip(t[i + 2].w))) add(t[i].s, t[i].e, w, 'à', 'crase', 'Locução com crase: à espera de.');
      else if (nk === 'baixo' && prevK !== 'cima') add(t[i].s, next.e, 'a baixo', 'abaixo', 'crase', 'Abaixo se escreve junto.');
      else if (noun(next.w)?.gender === 'f' && !noun(next.w)?.plural && !PREP.has(prevK) && /^(equipe|infraestrutura|area|diretoria|gerencia|fila)$/.test(nk)) {
        const back = text.slice(Math.max(0, t[i].s - 35), t[i].s).toLowerCase();
        if (/(encaminh\w+|envi\w+|direcion\w+|repass\w+|escal\w+)\b[^.;]*$/.test(back)) add(t[i].s, t[i].e, w, 'à', 'crase', 'Verbo de destino com palavra feminina: crase (à equipe).');
      }
    }
    if (lw === 'à' && next && /^(todos|todas|isso|aquele|aquela)$/.test(nk)) add(t[i].s, t[i].e, w, 'a', 'crase', 'Não há crase antes de palavra no plural, masculina ou pronome.');

    // Palavras parecidas: mas/mais, há/a, porquê, houve/ouve.
    if (lw === 'mais' && i > 0 && text[t[i].s - 2] === ',' && /^(ele|ela|eu|nos|nao|ainda|isso|ja)$/.test(nk)) add(t[i].s, t[i].e, w, 'mas', 'uso', 'Mas, no sentido de oposição, e não mais.');
    if (lw === 'a' && next && COUNT_WORDS.test(nk) && t[i + 2] && TIME_UNITS.test(strip(t[i + 2].w)) && t[i + 3] && !/^(do|da|dos|das|de)$/.test(strip(t[i + 3].w)) && (i === 0 || /[,.;]\s*$/.test(text.slice(0, t[i].s)))) {
      add(t[i].s, t[i].e, w, matchCase(w, 'há'), 'uso', 'Há, no sentido de tempo passado.');
    }
    if (lw === 'porque' && i > 0 && /^(o|um)$/.test(prevK) && next) add(t[i].s, t[i].e, w, 'porquê', 'uso', 'Substantivo ("o porquê") leva acento.');
    if (k === 'ouve' && prevK === 'se' && next && /^(alguma|algum|um|uma|mais|nenhuma|nenhum)$/.test(nk)) add(t[i].s, t[i].e, w, 'houve', 'uso', 'Haver no sentido de existir: houve.');
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(`${x.start}:${x.end}`) ? false : seen.add(`${x.start}:${x.end}`)));
}
