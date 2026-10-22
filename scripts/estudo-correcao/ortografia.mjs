// Rodada 1 do estudo de correção: dicionário ortográfico (nspell + dictionary-pt-br) sobre o conjunto fictício.
// Uso: node ortografia.mjs <pasta com node_modules (nspell, dictionary-pt-br)> <gold.json>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const [, , base, goldPath] = process.argv;
const require = createRequire(`${base}/`);
const nspell = require('nspell');
const dict = require('dictionary-pt-br');
const gold = JSON.parse(readFileSync(goldPath, 'utf8'));

const t0 = performance.now();
const m0 = process.memoryUsage().rss;
const spell = nspell(await new Promise((res, rej) => dict((e, d) => (e ? rej(e) : res(d)))));
const loadMs = Math.round(performance.now() - t0);
const memMb = Math.round((process.memoryUsage().rss - m0) / 1e6);

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const tokens = (s) => [...s.matchAll(WORD)].map((m) => ({ w: m[0], i: m.index }));

// Heurísticas para não corrigir o que o dicionário não conhece de propósito: siglas, códigos, produtos, URLs, caminhos.
function ignorable(w, idx, text) {
  if (/\d/.test(w)) return true; // códigos, versões, 2º
  if (/^[\p{Lu}]{2,}$/u.test(w)) return true; // siglas
  if (/[\p{Ll}][\p{Lu}]/u.test(w)) return true; // camelCase (OneDrive, GlobalProtect)
  if (/-/.test(w) && /[\p{Lu}]/u.test(w)) return true; // SRV-FIN01, Wi-Fi
  if (/^[\p{Lu}]/u.test(w) && idx > 0 && !/[.!?]\s*$/.test(text.slice(0, idx))) return true; // nome próprio ou produto no meio da frase
  const before = text.slice(Math.max(0, idx - 3), idx);
  if (/[\\/:@]/.test(before)) return true; // caminho, URL, e-mail
  return false;
}
// Termos do domínio que o dicionário geral não traz (poderiam vir do vocabulário do perfil da organização).
const DOMAIN = new Set(['spooler', 'proxy', 'firewall', 'driver', 'login', 'logs', 'reboot', 'plugin', 'toner', 'notebook', 'desbloqueada', 'resetamos', 'resetadas', 'reiniciados', 'antivírus', 'wi-fi', 'e-mail', 'switch', 'backup', 'token', 'ponto', 'jsilva', 'srv-fin01', 'portal', 'windows', 'outlook', 'teams', 'onedrive', 'defender', 'office', 'edge', 'chrome', 'vpn', 'dns', 'erp', 'ssd']);

function flagged(text, { heur, domain }) {
  const out = [];
  for (const { w, i } of tokens(text)) {
    if (spell.correct(w) || spell.correct(w.toLowerCase())) continue;
    if (heur && ignorable(w, i, text)) continue;
    if (domain && DOMAIN.has(w.toLowerCase())) continue;
    out.push(w);
  }
  return out;
}

const norm = (s) => s.toLowerCase();
const results = {};
for (const e of gold.erros) {
  const a = tokens(e.entrada).map((t) => t.w);
  const b = tokens(e.esperado).map((t) => t.w);
  const changed = a.length === b.length ? a.filter((w, i) => norm(w) !== norm(b[i])).map((w) => ({ w, gold: b[a.indexOf(w)] })) : [];
  const flags = flagged(e.entrada, { heur: true, domain: true }).map(norm);
  const hit = changed.some((c) => flags.includes(norm(c.w)));
  let top1 = false, top3 = false;
  for (const c of changed) {
    if (!flags.includes(norm(c.w))) continue;
    const sug = spell.suggest(c.w).map(norm);
    if (sug[0] === norm(c.gold)) top1 = true;
    if (sug.slice(0, 3).includes(norm(c.gold))) top3 = true;
  }
  const r = (results[e.cat] ??= { n: 0, detectado: 0, sug1: 0, sug3: 0 });
  r.n++; if (hit) r.detectado++; if (top1) r.sug1++; if (top3) r.sug3++;
}

const fp = (opts) => gold.limpos.reduce((acc, t) => acc + flagged(t, opts).length, 0);
const palavrasLimpas = gold.limpos.reduce((acc, t) => acc + tokens(t).length, 0);
const fpFrases = (opts) => gold.limpos.filter((t) => flagged(t, opts).length > 0).length;

console.log(JSON.stringify({
  carga_ms: loadMs, memoria_mb: memMb,
  por_categoria: results,
  falsos_positivos: {
    palavras_nos_limpos: palavrasLimpas,
    sem_heuristica: { palavras: fp({}), frases: fpFrases({}) },
    com_heuristica: { palavras: fp({ heur: true }), frases: fpFrases({ heur: true }) },
    com_heuristica_e_glossario: { palavras: fp({ heur: true, domain: true }), frases: fpFrases({ heur: true, domain: true }) },
  },
  exemplos_fp_com_heuristica_e_glossario: gold.limpos.flatMap((t) => flagged(t, { heur: true, domain: true })),
}, null, 1));
