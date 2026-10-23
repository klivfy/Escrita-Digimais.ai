// Resume os arquivos "contadores-de-uso.json" exportados pelos participantes do piloto (um arquivo por pessoa).
// Uso: node scripts/analyze-usage.mjs pessoa1.json pessoa2.json ... [--min-geracoes=30] [--min-dias=14]
// Arquivos cujo nome começa com "aprendizado" (exportados em Configurações, "Exportar aprendizado") entram numa seção própria.
// Só lê arquivos locais, não usa rede. Aceita apenas chaves da lista fechada da extensão; o resto é ignorado e contado.
import { readFileSync } from 'node:fs';

// Mesma lista fechada de src/application/usage-counters.ts (o teste analyze-usage.test.ts confere que nenhuma chave falta).
const RULES = 'acento|grafia|concordancia|crase|uso';
const KEY = new RegExp(
  '^(?:(?:generate|blocked|alert)\\.[a-z][a-z0-9_]{1,47}|time_to_copy\\.(?:lt1m|1to3m|3to10m|gt10m)|copy|variant|review_again|draft_split|draft_apply'
  + '|recipient\\.(?:user|manager|technical_team|vendor|other)|proofread\\.run|proofread\\.(?:' + RULES + ')\\.(?:acc|ign)'
  + '|next_step\\.(?:shown|used)|shortcut\\.type|library\\.(?:shown|used|none)|teach\\.(?:saved|removed))$',
);
// Chaves de aprendizado exatamente como a extensão aceita (src/application/style-learning.ts): ponto, escopo e índice
// combinam entre si, e uma correção nunca vai de um campo para ele mesmo.
const TYPES = 'request_information|technical_note|pending|manager_approval|progress_update|solution_confirmation|closure_resolved|closure_no_response|redirect_or_escalate|guided_free_text';
const CLASSES = ['summary', 'action', 'result', 'pending', 'expected', 'question'];
const LEARN_PATTERNS = [
  new RegExp(`^(?:acc|rej)\\.(?:opening|closing)\\.(?:${TYPES})\\.\\d$`),
  /^(?:acc|rej)\.courtesy\.(?:cordial|formal|direct)\.\d$/,
  /^(?:acc|rej)\.lead\.any\.\d$/,
];
export function isLearnKey(key) {
  if (LEARN_PATTERNS.some((re) => re.test(key))) return true;
  if (new RegExp(`^use\\.(?:${TYPES})$`).test(key)) return true;
  const q = new RegExp(`^seq\\.(${TYPES})\\.(${TYPES})$`).exec(key);
  if (q) return q[1] !== q[2];
  const m = /^fix\.([a-z]+)\.([a-z]+)$/.exec(key);
  return Boolean(m) && CLASSES.includes(m[1]) && [...CLASSES, 'ignore'].includes(m[2]) && m[1] !== m[2];
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;

export function readCounts(raw) {
  const counts = {};
  let ignored = 0;
  const source = raw && typeof raw === 'object' && raw.contadores && typeof raw.contadores === 'object' ? raw.contadores : {};
  for (const [k, v] of Object.entries(source)) {
    if (KEY.test(k) && Number.isInteger(v) && v >= 1 && v <= 1_000_000_000) counts[k] = v;
    else ignored += 1;
  }
  return { counts, ignored };
}

const sumPrefix = (counts, prefix) => Object.entries(counts).filter(([k]) => k.startsWith(prefix)).reduce((a, [, v]) => a + v, 0);
const pct = (n, d) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/d');

export function personSummary(name, raw, opts) {
  const { counts, ignored } = readCounts(raw);
  const generated = sumPrefix(counts, 'generate.');
  const blocked = sumPrefix(counts, 'blocked.');
  const since = DAY.test(raw?.desde ?? '') ? raw.desde : null;
  const until = DAY.test(raw?.exportadoEm ?? '') ? raw.exportadoEm : null;
  const days = since && until ? Math.max(0, Math.round((Date.parse(until) - Date.parse(since)) / MS_DAY)) : null;
  const attempts = generated + blocked;
  return {
    name, counts, ignored, generated, blocked, attempts, days,
    meets: attempts >= opts.minGenerations && days !== null && days >= opts.minDays,
  };
}

/** Arquivo de aprendizado: pelo nome ("aprendizado...") ou pelo formato (só chaves de aprendizado), para resistir a renomeações. */
const isLearning = (p) => {
  if (p.name.toLowerCase().startsWith('aprendizado')) return true;
  const keys = p.raw && typeof p.raw === 'object' && p.raw.contadores && typeof p.raw.contadores === 'object' ? Object.keys(p.raw.contadores) : [];
  return keys.length > 0 && keys.every(isLearnKey);
};

/** Soma as contagens de aprendizado (redações mantidas ou trocadas e correções do rascunho livre). */
function learningTotals(files) {
  const total = {};
  let ignored = 0;
  for (const f of files) {
    const source = f.raw && typeof f.raw === 'object' && f.raw.contadores && typeof f.raw.contadores === 'object' ? f.raw.contadores : {};
    for (const [k, v] of Object.entries(source)) {
      if (isLearnKey(k) && Number.isInteger(v) && v >= 1 && v <= 1_000_000_000) total[k] = (total[k] ?? 0) + v;
      else ignored += 1;
    }
  }
  return { total, ignored };
}

export function analyze(allPeople, opts = { minGenerations: 30, minDays: 14 }) {
  const people = allPeople.filter((p) => !isLearning(p));
  const learningFiles = allPeople.filter(isLearning);
  const summaries = people.map((p) => personSummary(p.name, p.raw, opts));
  const total = {};
  for (const s of summaries) for (const [k, v] of Object.entries(s.counts)) total[k] = (total[k] ?? 0) + v;
  const generated = sumPrefix(total, 'generate.');
  const blocked = sumPrefix(total, 'blocked.');
  const attempts = generated + blocked;
  const rows = (prefix) => Object.entries(total).filter(([k]) => k.startsWith(prefix)).sort((a, b) => b[1] - a[1]);
  const lines = [];
  lines.push('# Resumo do piloto', '');
  lines.push(`Arquivos: ${summaries.length}. Critério de corte: pelo menos ${opts.minGenerations} gerações (incluindo bloqueadas) e ${opts.minDays} dias por pessoa.`, '');
  lines.push('| Arquivo | Gerações | Bloqueadas | Dias | Atende ao corte |', '|---|---|---|---|---|');
  for (const s of summaries) {
    lines.push(`| ${s.name} | ${s.generated} | ${s.blocked} | ${s.days ?? 'n/d'} | ${s.meets ? 'sim' : 'não'} |`);
  }
  const ok = summaries.filter((s) => s.meets).length;
  lines.push('', `Atendem ao corte: ${ok} de ${summaries.length}.`);
  const ignored = summaries.reduce((a, s) => a + s.ignored, 0);
  if (ignored > 0) lines.push(`Chaves ignoradas por não pertencerem à lista fechada: ${ignored}.`);
  lines.push('', '## Uso', '');
  lines.push(`- Tentativas de geração: ${attempts} (geradas ${generated}, bloqueadas ${blocked}; taxa de bloqueio ${pct(blocked, attempts)}).`);
  lines.push(`- Cópias por geração: ${pct(total.copy ?? 0, generated)}.`);
  lines.push(`- Outras variações por geração: ${pct(total.variant ?? 0, generated)}.`);
  lines.push(`- Revisões novas por geração: ${pct(total.review_again ?? 0, generated)}.`);
  const split = total.draft_split ?? 0;
  const applied = total.draft_apply ?? 0;
  if (split > 0) lines.push(`- Rascunho livre: ${split} divisões, ${applied} formulários preenchidos (${pct(applied, split)} chegam a preencher).`);
  const runs = total['proofread.run'] ?? 0;
  if (runs > 0) {
    lines.push(`- Corrigir texto: ${runs} verificações.`);
    const ruleRows = RULES.split('|').map((r) => [r, total[`proofread.${r}.acc`] ?? 0, total[`proofread.${r}.ign`] ?? 0]).filter(([, a, i]) => a + i > 0);
    if (ruleRows.length) {
      lines.push('', '| Regra de correção | Aceitas | Ignoradas | Aceite |', '|---|---|---|---|');
      for (const [r, a, i] of ruleRows) lines.push(`| ${r} | ${a} | ${i} | ${pct(a, a + i)} |`);
      lines.push('');
    }
  }
  const shown = total['next_step.shown'] ?? 0;
  if (shown > 0) lines.push(`- Próximo passo: sugerido ${shown} vezes, usado ${total['next_step.used'] ?? 0} (${pct(total['next_step.used'] ?? 0, shown)}; meta de 30%).`);
  const libShown = total['library.shown'] ?? 0;
  if (libShown > 0) {
    const used = total['library.used'] ?? 0;
    const none = total['library.none'] ?? 0;
    lines.push(`- Biblioteca de modelos: lista exibida ${libShown} vezes; modelo usado ${used} (${pct(used, libShown)}); "nenhum destes" ${none} (${pct(none, libShown)}; meta: abaixo de 30%).`);
  }
  if (total['teach.saved'] || total['teach.removed']) lines.push(`- Modelos ensinados: ${total['teach.saved'] ?? 0} salvos, ${total['teach.removed'] ?? 0} removidos.`);
  if (total['shortcut.type']) lines.push(`- Atalho "Mais usados": ${total['shortcut.type']} usos.`);
  const sections = [
    ['Textos gerados por tipo', 'generate.', 20],
    ['Destinatários', 'recipient.', 5],
    ['Bloqueios por motivo', 'blocked.', 20],
    ['Alertas mais frequentes', 'alert.', 10],
    ['Tempo até copiar', 'time_to_copy.', 4],
  ];
  for (const [title, prefix, limit] of sections) {
    const list = rows(prefix).slice(0, limit);
    if (list.length === 0) continue;
    lines.push('', `## ${title}`, '', '| Item | Total |', '|---|---|');
    for (const [k, v] of list) lines.push(`| ${k.slice(prefix.length)} | ${v} |`);
  }
  if (learningFiles.length > 0) {
    const { total: learn, ignored: learnIgnored } = learningTotals(learningFiles);
    const fixes = Object.entries(learn).filter(([k]) => k.startsWith('fix.')).sort((a, b) => b[1] - a[1]);
    const fixTotal = fixes.reduce((a, [, v]) => a + v, 0);
    lines.push('', '## Rascunho livre e aprendizado', '');
    lines.push(`Arquivos de aprendizado: ${learningFiles.length}.`);
    lines.push(`- Correções do analista na divisão do rascunho: ${fixTotal}${applied > 0 ? ` (${(fixTotal / applied).toFixed(1)} por formulário preenchido)` : ''}.`);
    if (learningFiles.length !== people.length) {
      lines.push(`- Atenção: ${learningFiles.length} arquivo(s) de aprendizado para ${people.length} de uso. A razão acima mistura grupos diferentes e é só uma aproximação.`);
    }
    if (fixes.length > 0) {
      lines.push('', '| De | Para | Total |', '|---|---|---|');
      for (const [k, v] of fixes.slice(0, 8)) {
        const [, from, to] = k.split('.');
        lines.push(`| ${from} | ${to} | ${v} |`);
      }
    }
    const kept = Object.entries(learn).filter(([k]) => k.startsWith('acc.')).reduce((a, [, v]) => a + v, 0);
    const swapped = Object.entries(learn).filter(([k]) => k.startsWith('rej.')).reduce((a, [, v]) => a + v, 0);
    lines.push(`- Redações mantidas: ${kept}; trocadas: ${swapped}.`);
    const steps = Object.entries(learn).filter(([k]) => k.startsWith('seq.')).sort((a, b) => b[1] - a[1]);
    if (steps.length > 0) {
      lines.push('', '| Depois de | Próximo passo escolhido | Total |', '|---|---|---|');
      for (const [k, v] of steps.slice(0, 8)) {
        const [, from, to] = k.split('.');
        lines.push(`| ${from} | ${to} | ${v} |`);
      }
    }
    if (learnIgnored > 0) lines.push(`- Chaves ignoradas por não pertencerem à lista fechada: ${learnIgnored}.`);
  }
  lines.push('', '## Leitura', '');
  if (split >= 10 && applied / split < 0.5) {
    lines.push('Menos da metade das divisões do rascunho livre chega a preencher o formulário: o recurso está atrapalhando mais do que ajudando. Reveja o desenho antes de ampliar.', '');
  }
  if (ok === 0) lines.push('Nenhum arquivo atende ao corte: não decida D8 e D9 ainda. Estenda o piloto.');
  else if (ok < summaries.length) lines.push(`Decida D8 e D9 apenas com os ${ok} arquivo(s) que atendem ao corte e registre que os demais foram excluídos.`);
  else lines.push('Todos os arquivos atendem ao corte: há base mínima para decidir D8 e D9.');
  return lines.join('\n') + '\n';
}

function main(argv) {
  const files = argv.filter((a) => !a.startsWith('--'));
  const num = (flag, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${flag}=`));
    const n = hit ? Number(hit.split('=')[1]) : fallback;
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  };
  if (files.length === 0) {
    console.error('Uso: node scripts/analyze-usage.mjs arquivo1.json [arquivo2.json ...] [--min-geracoes=30] [--min-dias=14]');
    return 2;
  }
  const people = [];
  for (const f of files) {
    try {
      people.push({ name: f.split('/').pop(), raw: JSON.parse(readFileSync(f, 'utf8')) });
    } catch (e) {
      console.error(`Não foi possível ler ${f}: ${e instanceof Error ? e.message : 'erro'}`);
      return 1;
    }
  }
  process.stdout.write(analyze(people, { minGenerations: num('min-geracoes', 30), minDays: num('min-dias', 14) }));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
