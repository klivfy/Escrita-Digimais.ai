/**
 * Decomposição dos textos que o analista ensina e acúmulo do que se repete. Pura e determinística: nada é lido nem
 * gravado aqui. O texto original nunca entra no registro: só trechos de redação com os dados variáveis já trocados por
 * campos, depois da triagem de dado sensível. Texto com dado sensível é recusado inteiro.
 */
import { MAX_BLOCKS_PER_TYPE, MAX_BLOCK_TEXT, MAX_COUNT, MAX_LABELS_PER_TYPE, MIN_BLOCK_TEXT, validBlockText } from '../config/learning-ledger';
import type { Block, BlockRole, Ledger, TypeLedger } from '../config/learning-ledger';
import { CATEGORY_LABELS, scanText } from './sensitive';
import { greetingBase } from './style-learn';
import { prepareTaught } from './teach';
import { vetModel } from './library-vetting';
import type { CommunicationType, LanguageProfile } from './types';

export const MAX_INGEST_TEXT = 4000;
export const MAX_INGEST_TEXTS = 40;

export interface Decomposed {
  greeting?: string;
  signature?: string;
  blocks: { role: BlockRole; text: string }[];
  labels: string[];
}

const LABEL_LINE = /^(\p{Lu}[^:\n]{2,40}):(?:\s|$)/u;
const LIST_LINE = /^(?:\d+[.)]|[-*•])\s/u;
const REQUEST_CUE = /\b(?:envie|enviar|enviem|informe|informar|informem|precisamos|preciso|pedimos|solicitamos|poderia|poderiam|favor|confirme|confirmar|aguardamos|gostar[ií]amos)\b|\?/iu;
const COURTESY_CUE = /(?:agradec|obrigad|dispos|aguard|atenciosamente|cordialmente|abra[çc]o|qualquer d[uú]vida|ficamos|contamos|permanecemos|bom trabalho|boa semana)/iu;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/u;

const isSignatureLine = (line: string): boolean =>
  line.length <= 60 && !/[.!?,:;]$/u.test(line) && !line.includes(':') && /^\p{Lu}/u.test(line) && line.split(/\s+/).length <= 8;
const isCourtesy = (line: string): boolean => line.length <= 120 && COURTESY_CUE.test(line);

export function decompose(raw: string): Decomposed {
  const text = prepareTaught(raw).text;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
  const out: Decomposed = { blocks: [], labels: [] };

  const first = paragraphs[0];
  if (first && first.length === 1 && greetingBase(first[0])) {
    out.greeting = greetingBase(first[0]);
    paragraphs.shift();
  }

  // Assinatura e fecho: até 3 linhas do fim, só se parecerem uma coisa ou outra. Sempre sobra pelo menos uma linha de corpo.
  const flat = paragraphs.flatMap((p, pi) => p.map((line) => ({ line, pi })));
  let signature: string | undefined;
  let closing: string | undefined;
  let cut = flat.length;
  for (let i = flat.length - 1; i >= 1 && flat.length - i <= 3; i--) {
    const { line } = flat[i];
    if (!signature && !closing && isSignatureLine(line)) {
      signature = line;
      cut = i;
    } else if (!closing && isCourtesy(line)) {
      closing = line;
      cut = i;
    } else break;
  }
  if (signature) out.signature = signature;

  const body: string[][] = [];
  let lastParagraph = -1;
  for (const { line, pi } of flat.slice(0, cut)) {
    if (pi !== lastParagraph) {
      body.push([]);
      lastParagraph = pi;
    }
    body[body.length - 1].push(line);
  }

  let openingTaken = false;
  for (const paragraph of body) {
    const labelled = paragraph.some((l) => LABEL_LINE.test(l));
    for (const l of paragraph) {
      const m = LABEL_LINE.exec(l);
      if (m) out.labels.push(m[1].trim());
    }
    // Parágrafo com rótulo ou lista guarda conteúdo do chamado, não redação reaproveitável.
    if (labelled || paragraph.some((l) => LIST_LINE.test(l))) continue;
    const joined = paragraph.join(' ');
    if (!openingTaken) {
      openingTaken = true;
      const [head, ...rest] = joined.split(SENTENCE_SPLIT);
      if (head && head.length >= MIN_BLOCK_TEXT && head.length <= MAX_BLOCK_TEXT && !isCourtesy(head)) out.blocks.push({ role: 'opening', text: head });
      const tail = rest.join(' ');
      if (tail && tail.length <= MAX_BLOCK_TEXT && REQUEST_CUE.test(tail)) out.blocks.push({ role: 'request', text: tail });
      continue;
    }
    if (joined.length <= MAX_BLOCK_TEXT && REQUEST_CUE.test(joined)) out.blocks.push({ role: 'request', text: joined });
  }
  if (closing) out.blocks.push({ role: 'closing', text: closing });
  return out;
}

export interface IngestEntry {
  text: string;
  type: CommunicationType;
}

export interface IngestReport {
  /** Textos que passaram pela triagem e entraram na contagem. */
  accepted: number;
  /** Textos recusados inteiros, com o motivo. */
  rejected: { index: number; reason: string }[];
  /** Trechos novos ou reforçados no registro. */
  blocks: number;
  labels: number;
  /** Trechos descartados por não serem redação reaproveitável (dado sensível, prazo concreto, solução afirmada...). */
  discarded: number;
}

const dayOf = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

function bump<T extends { count: number }>(list: T[], find: (x: T) => boolean, make: () => T): void {
  const hit = list.find(find);
  if (hit) hit.count = Math.min(MAX_COUNT, hit.count + 1);
  else list.push(make());
}

/** Menor contagem sai primeiro quando passa do limite; empate, o mais antigo. */
function prune<T extends { count: number }>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const keep = new Set(list.map((x, i) => ({ x, i })).sort((a, b) => b.x.count - a.x.count || b.i - a.i).slice(0, max).map((o) => o.i));
  return list.filter((_, i) => keep.has(i));
}

export function ingestTexts(ledger: Ledger, entries: readonly IngestEntry[], profile: LanguageProfile, now: Date): { ledger: Ledger; report: IngestReport } {
  const next: Ledger = structuredClone(ledger);
  const report: IngestReport = { accepted: 0, rejected: [], blocks: 0, labels: 0, discarded: 0 };
  entries.slice(0, MAX_INGEST_TEXTS).forEach((entry, index) => {
    const raw = entry.text.trim();
    if (!raw) return;
    if (raw.length > MAX_INGEST_TEXT) {
      report.rejected.push({ index, reason: `passa de ${MAX_INGEST_TEXT} caracteres` });
      return;
    }
    const findings = scanText(raw, { internalDomains: profile.internalDomains });
    if (findings.length > 0) {
      report.rejected.push({ index, reason: `dado sensível (${CATEGORY_LABELS[findings[0].category]}): remova do texto antes de ensinar` });
      return;
    }
    const type = entry.type;
    const bucket: TypeLedger = (next.byType[type] ??= { texts: 0, blocks: [], labels: [] });
    bucket.texts = Math.min(MAX_COUNT, bucket.texts + 1);
    report.accepted += 1;
    const seen = new Set<string>();
    const parts = decompose(raw);
    for (const b of parts.blocks) {
      const key = `${b.role}|${b.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reasons = validBlockText(b.text) ? vetModel({ id: 'bloco', title: 'Bloco', types: [type], recipients: [], text: b.text, keywords: [], reviewedAt: '' }, profile).reasons : ['formato'];
      if (reasons.length > 0) {
        report.discarded += 1;
        continue;
      }
      bump<Block>(bucket.blocks, (x) => x.role === b.role && x.text === b.text, () => ({ role: b.role, text: b.text, count: 1 }));
      report.blocks += 1;
    }
    for (const label of new Set(parts.labels)) {
      if (!validBlockText(label, 3) || scanText(label, { internalDomains: profile.internalDomains }).length > 0) {
        report.discarded += 1;
        continue;
      }
      bump(bucket.labels, (x) => x.text === label, () => ({ text: label, count: 1 }));
      report.labels += 1;
    }
    bucket.blocks = prune(bucket.blocks, MAX_BLOCKS_PER_TYPE);
    bucket.labels = prune(bucket.labels, MAX_LABELS_PER_TYPE);
  });
  if (report.accepted > 0) {
    if (Object.values(ledger.byType).every((t) => !t || t.texts === 0)) next.since = dayOf(now);
    next.updatedAt = dayOf(now);
  }
  return { ledger: next, report };
}
