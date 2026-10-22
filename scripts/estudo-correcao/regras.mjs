// Rodada 1 do estudo de correção: regras determinísticas de concordância, crase e homófonos (protótipo).
// Cada regra só SUGERE (devolve edições com posição); nada é aplicado sem ação do analista.
// Uso: node regras.mjs <gold.json> <AMOSTRAS-FORMATO.md>
import { readFileSync } from 'node:fs';
const [, , goldPath, amostrasPath] = process.argv;
const gold = JSON.parse(readFileSync(goldPath, 'utf8'));

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const WORD = /[\p{L}][\p{L}'’-]*/gu;
const toks = (text) => [...text.matchAll(WORD)].map((m) => ({ w: m[0], s: m.index, e: m.index + m[0].length }));

// Léxico de substantivos do domínio (gênero). Plural e singular são reconhecidos por morfologia.
const M = 'usuário técnico analista gestor chamado erro problema acesso arquivo computador notebook equipamento servidor sistema aplicativo programa driver cabo teste retorno envio perfil cadastro e-mail anexo caso incidente serviço prazo horário patrimônio monitor mouse teclado switch roteador firewall proxy log backup relato pedido resultado cliente colaborador setor departamento contrato ramal token certificado navegador pacote instalador antivírus disco link portal print documento relatório fornecedor suporte treinamento resumo texto campo botão menu painel formulário status'.split(' ');
const F = 'impressora senha conta planilha máquina estação conexão rede pasta tela mensagem solicitação permissão atualização instalação configuração licença falha queda lentidão equipe infraestrutura área fila diretoria gerência aprovação validação confirmação informação resposta captura versão política manutenção peça garantia câmera impressão autenticação ocorrência pendência causa solução tarefa reunião sala caixa mídia'.split(' ');
const GENDER = new Map([...M.map((n) => [strip(n), 'm']), ...F.map((n) => [strip(n), 'f'])]);

function plural(sg) {
  if (/ão$/.test(sg)) return sg.replace(/ão$/, 'ões');
  if (/[rz]$/.test(sg)) return `${sg}es`;
  if (/l$/.test(sg)) return sg.replace(/l$/, 'is');
  if (/m$/.test(sg)) return sg.replace(/m$/, 'ns');
  if (/s$/.test(sg)) return sg;
  return `${sg}s`;
}
const PLURAL_OF = new Map();
for (const n of [...M, ...F]) PLURAL_OF.set(strip(plural(n)), strip(n));
function noun(word) {
  const k = strip(word);
  if (GENDER.has(k)) return { gender: GENDER.get(k), plural: false, singular: word };
  if (PLURAL_OF.has(k)) return { gender: GENDER.get(PLURAL_OF.get(k)), plural: true, singular: PLURAL_OF.get(k) };
  return null;
}
const pluralize = (w) => plural(w);

const DET = {
  m: { sg: ['o', 'um', 'este', 'esse', 'aquele', 'nosso', 'seu', 'meu'], pl: ['os', 'uns', 'estes', 'esses', 'aqueles', 'nossos', 'seus', 'meus'] },
  f: { sg: ['a', 'uma', 'esta', 'essa', 'aquela', 'nossa', 'sua', 'minha'], pl: ['as', 'umas', 'estas', 'essas', 'aquelas', 'nossas', 'suas', 'minhas'] },
};
const DET_INFO = new Map();
for (const g of ['m', 'f']) for (const n of ['sg', 'pl']) DET[g][n].forEach((d, i) => DET_INFO.set(d, { gender: g, plural: n === 'pl', idx: i }));
const NUMERALS_PL = new Set(['dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'varios', 'varias', 'muitos', 'muitas', 'todos', 'todas']);
const PREP = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'com', 'para', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'sem', 'sobre']);
const COPULA = new Set(['está', 'estão', 'foi', 'foram', 'ficou', 'ficaram', 'estava', 'estavam', 'é', 'são', 'permanece', 'permanecem', 'continua', 'continuam'].map(strip));
const IRREG_PART = new Set(['aberto', 'escrito', 'feito', 'visto', 'posto', 'dito', 'coberto', 'preso', 'quebrado']);
const isAdj = (w) => /(ad|id)(o|a|os|as)$/.test(strip(w)) || IRREG_PART.has(strip(w).replace(/(a|os|as)$/, 'o'));
function adjForm(w, gender, pl) {
  const stem = w.replace(/(o|a|os|as)$/, '');
  return stem + (gender === 'm' ? 'o' : 'a') + (pl ? 's' : '');
}
const VERB_PL = { relatou: 'relataram', persiste: 'persistem', precisa: 'precisam', indica: 'indicam', foi: 'foram', ficou: 'ficaram', está: 'estão', apresentou: 'apresentaram', ocorreu: 'ocorreram', falhou: 'falharam', expirou: 'expiraram', travou: 'travaram', afeta: 'afetam', exige: 'exigem', mostra: 'mostram', causou: 'causaram', continua: 'continuam', voltou: 'voltaram', deve: 'devem', pode: 'podem', é: 'são' };

/**
 * Candidatos a núcleo do sintagma imediatamente antes da posição i, do mais próximo ao mais à esquerda.
 * Pula complementos introduzidos por preposição ("de X", "em X") e exige apenas um espaço entre as palavras
 * (pontuação ou quebra de linha encerram o sintagma).
 */
function chainBefore(t, text, i) {
  const out = [];
  let j = i - 1;
  while (j >= 0 && text.slice(t[j].e, t[j + 1].s) === ' ') {
    const info = noun(t[j].w);
    const prevOk = j >= 1 && text.slice(t[j - 1].e, t[j].s) === ' ';
    const prev = prevOk ? strip(t[j - 1].w) : '';
    if (info) out.push({ idx: j, ...info });
    if (PREP.has(prev) && j >= 2) { j -= 2; continue; }
    if (!info) break;
    break;
  }
  return out;
}

function suggest(text) {
  const t = toks(text);
  const out = [];
  const add = (s, e, from, to, rule) => out.push({ s, e, from, to, rule });
  for (let i = 0; i < t.length; i++) {
    const w = t[i].w, lw = w.toLowerCase(), k = strip(w);
    const next = t[i + 1], nk = next ? strip(next.w) : '';

    // N1: determinante/numeral no plural + substantivo no singular
    const d = DET_INFO.get(lw);
    if (next && ((d && d.plural) || NUMERALS_PL.has(k))) {
      const n = noun(next.w);
      if (n && !n.plural) add(next.s, next.e, next.w, pluralize(next.w.toLowerCase()), 'N1 plural do substantivo');
    }
    // N3: gênero do determinante x substantivo
    if (next && d && !d.plural) {
      const n = noun(next.w);
      if (n && !n.plural && n.gender !== d.gender) add(t[i].s, t[i].e, w, matchCase(w, DET[n.gender].sg[d.idx]), 'N3 gênero do determinante');
    }
    // N4/N5: adjetivo ou particípio com o gênero e o número do núcleo
    if (isAdj(w) && !noun(w)) {
      const prevIsCopula = t[i - 1] && COPULA.has(strip(t[i - 1].w)) && text.slice(t[i - 1].e, t[i].s) === ' ';
      const chain = prevIsCopula ? chainBefore(t, text, i - 1) : chainBefore(t, text, i);
      if (chain.length) {
        const agrees = (h) => adjForm(w, h.gender, h.plural).toLowerCase() === lw;
        if (prevIsCopula) {
          const subject = chain[chain.length - 1];
          const want = adjForm(w, subject.gender, subject.plural);
          if (want.toLowerCase() !== lw) add(t[i].s, t[i].e, w, want, 'N4 predicativo');
        } else if (!chain.some(agrees) && !(t[chain[0].idx - 1] && PREP.has(strip(t[chain[0].idx - 1].w)))) {
          // conservador: substantivo depois de preposição pode ter um núcleo que o léxico não conhece
          const h = chain[0];
          add(t[i].s, t[i].e, w, adjForm(w, h.gender, h.plural), 'N5 adjetivo ou particípio');
        }
      }
    }
    // V1: verbo na 3a pessoa do singular logo após núcleo plural
    if (VERB_PL[lw]) {
      const chain = chainBefore(t, text, i);
      const subject = chain[chain.length - 1];
      if (subject && subject.plural) add(t[i].s, t[i].e, w, VERB_PL[lw], 'V1 sujeito plural');
      else if (i >= 4 && strip(t[i - 3].w) === 'e' && noun(t[i - 1].w) && !noun(t[i - 1].w).plural && DET_INFO.has(strip(t[i - 2].w)) && noun(t[i - 4].w)) {
        add(t[i].s, t[i].e, w, VERB_PL[lw], 'V1 sujeito composto');
      }
    }
    // nós + 3a pessoa do pretérito
    if (k === 'nos' && lw === 'nós' && next && /ou$/.test(next.w) && next.w.length > 4) add(next.s, next.e, next.w, next.w.replace(/ou$/, 'amos'), 'V1 nós');
    // V2: houveram, V3: fazem + tempo, V4: existe + plural
    if (k === 'houveram') add(t[i].s, t[i].e, w, matchCase(w, 'houve'), 'V2 houve impessoal');
    if (k === 'fazem' && next && (NUMERALS_PL.has(nk) || /^(dois|duas|tres|quatro|cinco|seis|sete|dez)$/.test(nk)) && t[i + 2] && /^(dias|horas|semanas|meses|anos|minutos)$/.test(strip(t[i + 2].w))) add(t[i].s, t[i].e, w, matchCase(w, 'faz'), 'V3 faz tempo');
    if (k === 'existe' && next && (NUMERALS_PL.has(nk) || /^(dois|duas|tres)$/.test(nk))) add(t[i].s, t[i].e, w, matchCase(w, 'existem'), 'V4 existem');
    // C3 e fixos: crase e locuções
    if (lw === 'a' && next && /^(disposicao|noite|tarde|vista|frente)$/.test(nk)) add(t[i].s, t[i].e, w, 'à', 'C3 crase em locução');
    if (lw === 'a' && next && nk === 'baixo' && strip(t[i - 1]?.w ?? '') !== 'cima') add(t[i].s, next.e, 'a baixo', 'abaixo', 'C3 abaixo');
    if (lw === 'à' && next && /^(todos|todas|isso|aquele|aquela)$/.test(nk)) add(t[i].s, t[i].e, w, 'a', 'C2 sem crase');
    // C1: a + substantivo feminino depois de verbo de destino
    if (lw === 'a' && next && noun(next.w)?.gender === 'f' && !noun(next.w).plural && !PREP.has(strip(t[i - 1]?.w ?? ''))) {
      const back = text.slice(Math.max(0, t[i].s - 35), t[i].s).toLowerCase();
      if (/(encaminh\w+|envi\w+|direcion\w+|repass\w+|escal\w+)\b[^.;]*$/.test(back) && !/\b(a|uma)\s*$/.test(back.slice(-3)) && /^(equipe|infraestrutura|area|diretoria|gerencia|fila)$/.test(nk)) add(t[i].s, t[i].e, w, 'à', 'C1 crase após verbo de destino');
    }
    // H1: mas/mais, H2: há tempo, H3: porquê, H4: houve
    if (lw === 'mais' && i > 0 && text[t[i].s - 2] === ',' && next && /^(o|a|os|as|ele|ela|eu|nos|nao|ainda|isso|ja)$/.test(nk)) add(t[i].s, t[i].e, w, 'mas', 'H1 mas');
    if (lw === 'a' && next && /^(um|uma|dois|duas|tres|quatro|cinco|seis|sete|dez|varios|varias)$/.test(nk) && t[i + 2] && /^(dias|horas|semanas|meses|anos|minutos)$/.test(strip(t[i + 2].w)) && t[i + 3] && !/^(do|da|dos|das|de)$/.test(strip(t[i + 3].w)) && (i === 0 || /[,.;]\s*$/.test(text.slice(0, t[i].s)))) add(t[i].s, t[i].e, w, matchCase(w, 'há'), 'H2 há tempo');
    if (k === 'porque' && i > 0 && /^(o|um)$/.test(strip(t[i - 1].w)) && next) add(t[i].s, t[i].e, w, 'porquê', 'H3 porquê');
    if (k === 'ouve' && i > 0 && strip(t[i - 1].w) === 'se' && next && /^(alguma|algum|um|uma|mais|nenhuma|nenhum)$/.test(nk)) add(t[i].s, t[i].e, w, 'houve', 'H4 houve');
  }
  // remove edições sobrepostas
  const seen = new Set();
  return out.filter((x) => (seen.has(`${x.s}:${x.e}`) ? false : seen.add(`${x.s}:${x.e}`)));
}
function matchCase(orig, rep) { return orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep; }
function apply(text, edits) {
  let r = text;
  for (const e of [...edits].sort((a, b) => b.s - a.s)) r = r.slice(0, e.s) + e.to + r.slice(e.e);
  return r;
}

const porCat = {};
const falhas = [];
for (const e of gold.erros) {
  if (e.cat === 'ortografia') continue; // fora do alcance das regras: é do dicionário
  const edits = suggest(e.entrada);
  const out = apply(e.entrada, edits);
  const r = (porCat[e.cat] ??= { n: 0, exato: 0, parcial: 0, nada: 0 });
  r.n++;
  if (out === e.esperado) r.exato++;
  else if (edits.length) { r.parcial++; falhas.push({ cat: e.cat, entrada: e.entrada, obtido: out, esperado: e.esperado, regras: edits.map((x) => x.rule) }); }
  else { r.nada++; falhas.push({ cat: e.cat, entrada: e.entrada, obtido: '(sem sugestão)', esperado: e.esperado }); }
}

const limpos = [...gold.limpos];
const blocks = [...readFileSync(amostrasPath, 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
const fpGold = gold.limpos.map((t) => ({ t, ed: suggest(t) })).filter((x) => x.ed.length);
const fpAmostras = blocks.map((t) => ({ t, ed: suggest(t) })).filter((x) => x.ed.length);

console.log(JSON.stringify({
  regras_por_categoria: porCat,
  limpos_gold: { frases: gold.limpos.length, com_sugestao_indevida: fpGold.length, detalhes: fpGold.map((x) => x.ed.map((y) => `${y.from} -> ${y.to} [${y.rule}]`)) },
  textos_gerados_pelo_produto: { blocos: blocks.length, com_sugestao_indevida: fpAmostras.length, detalhes: fpAmostras.map((x) => x.ed.map((y) => `${y.from} -> ${y.to} [${y.rule}]`)) },
  falhas,
}, null, 1));
