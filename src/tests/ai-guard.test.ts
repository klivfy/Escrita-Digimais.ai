import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFreqIndex } from '../application/proofread-data';
import { checkFacts, correctionsFromRewrite, guardCorrections } from '../domain/ai-guard';
import type { ModelCorrection } from '../domain/ai-guard';
import type { FreqIndex } from '../domain/proofread';

let index: FreqIndex;
beforeAll(async () => {
  index = await loadFreqIndex();
}, 20000);

const key = (c: ModelCorrection): string => `${c.start}:${c.end}:${c.replacement.toLowerCase()}`;
const guard = (original: string, corrected: string) => guardCorrections(original, correctionsFromRewrite(original, corrected), index);

describe('correctionsFromRewrite', () => {
  it('alinha palavra a palavra e ignora pontuação e maiúscula', () => {
    const c = correctionsFromRewrite('o usuario nao conseguiu', 'O usuário não conseguiu.');
    expect(c).toEqual([
      { start: 2, end: 9, replacement: 'usuário' },
      { start: 10, end: 13, replacement: 'não' },
    ]);
  });

  it('acréscimo, remoção e troca de várias palavras viram uma correção do trecho', () => {
    expect(correctionsFromRewrite('segue a baixo o resumo', 'segue abaixo o resumo')).toEqual([{ start: 6, end: 13, replacement: 'abaixo' }]);
    expect(correctionsFromRewrite('reiniciamos o servidor', 'reiniciamos o servidor e garantimos a solução')[0].start).toBe(22);
    expect(correctionsFromRewrite('o chamado foi aberto hoje', 'o chamado foi aberto')).toEqual([{ start: 21, end: 25, replacement: '' }]);
  });
});

describe('guardCorrections: só passa correção que não muda o sentido', () => {
  it('aceita acento, flexão e pares fechados', () => {
    const { accepted } = guard('a lentidao persiste e as falhas persiste, mais o erro volta', 'a lentidão persiste e as falhas persistem, mas o erro volta');
    expect(accepted.map((a) => [a.original, a.replacement, a.kind])).toEqual([
      ['lentidao', 'lentidão', 'acento'],
      ['persiste', 'persistem', 'flexao'],
      ['mais', 'mas', 'par'],
    ]);
  });

  it('recusa troca de palavra, de número, de sigla, de nome, acréscimo e remoção', () => {
    const cases: [string, string, string][] = [
      ['a reunião foi remarcada', 'a reunião foi marcada', 'troca de palavra'],
      ['enviamos o formulário à gerência', 'enviamos o formulário à gestão', 'troca de palavra'],
      ['o prazo é 20/10 às 17h', 'o prazo é 21/10 às 17h', 'número, data ou código'],
      ['resetamos a senha no AD', 'resetamos a senha no Active', 'sigla, nome, código ou termo protegido'],
      ['falei com a Maria hoje', 'falei com a Mária hoje', 'sigla, nome, código ou termo protegido'],
      ['reiniciamos o servidor', 'reiniciamos o servidor e garantimos a solução', 'acréscimo de texto'],
      ['o chamado foi aberto hoje', 'o chamado foi aberto', 'remoção de texto'],
    ];
    for (const [a, b, reason] of cases) {
      const r = guard(a, b);
      expect(r.accepted, a).toEqual([]);
      expect(r.rejected.map((x) => x.reason), a).toContain(reason);
    }
  });

  it('nunca acrescenta: a resposta do modelo que foge da tarefa é recusada por inteiro', () => {
    const r = guard('Segue o link do portal.', 'Como uma IA, não posso interagir com links. Posso ajudar com outra coisa?');
    expect(r.accepted).toEqual([]);
  });

  it('com a saída gravada do Phi-4-mini: 0 correção errada, 0 mudança em frase correta, 67 das 93 trocas esperadas', () => {
    const d = JSON.parse(readFileSync('scripts/estudo-ia-aprendizado/saida-phi4mini.json', 'utf8')) as {
      resultados: { cat: string; entrada: string; esperado: string; saida: string }[];
    };
    let expected = 0;
    let right = 0;
    let rawWrong = 0;
    for (const r of d.resultados) {
      const proposed = correctionsFromRewrite(r.entrada, r.saida);
      const { accepted } = guardCorrections(r.entrada, proposed, index);
      if (r.cat === 'limpo') {
        expect(accepted, r.entrada).toEqual([]);
        continue;
      }
      const want = new Set(correctionsFromRewrite(r.entrada, r.esperado).map(key));
      expected += want.size;
      rawWrong += proposed.filter((p) => !want.has(key(p))).length;
      for (const a of accepted) expect(want.has(key(a)), `${r.entrada}: ${a.original} -> ${a.replacement}`).toBe(true);
      right += accepted.length;
    }
    expect(rawWrong).toBeGreaterThan(10); // o modelo sozinho erra; a trava é que segura
    expect(expected).toBe(93);
    expect(right).toBeGreaterThanOrEqual(67);
  });
});

describe('checkFacts: reescrita só passa se mantiver os fatos', () => {
  const SOURCE = 'Para continuarmos a análise, precisamos de algumas informações.\n\nResumo da situação: Erro ao abrir a planilha de custos no SAP.\n\n1. Qual mensagem de erro aparece na tela?\n2. O erro ocorre com outros arquivos?\n\nPrazo para retorno: 20/10/2026 às 17h.\n\nPor segurança, não envie senhas neste chamado.';

  it('aceita uma reescrita fiel', () => {
    const ok = 'Para seguirmos com a análise do erro ao abrir a planilha de custos no SAP, precisamos de duas informações:\n1. Qual mensagem de erro aparece na tela?\n2. O erro ocorre com outros arquivos?\nResponda até 20/10/2026 às 17h. Por segurança, não envie senhas neste chamado.';
    expect(checkFacts(SOURCE, ok)).toEqual([]);
  });

  it('aponta data trocada, sigla perdida, pergunta a menos e aviso de segurança retirado', () => {
    const bad = 'Precisamos saber qual mensagem de erro aparece na tela ao abrir a planilha de custos. Responda até 21/10/2026 às 17h.';
    const kinds = checkFacts(SOURCE, bad).map((p) => `${p.kind}:${p.detail}`);
    expect(kinds).toEqual(expect.arrayContaining(['fato_novo:21/10/2026', 'fato_removido:20/10/2026', 'fato_removido:sap', 'negacao:negação acrescentada ou retirada']));
    expect(kinds.some((k) => k.startsWith('perguntas'))).toBe(true);
  });

  it('aponta compromisso, aprovação e solução afirmados pela reescrita', () => {
    const src = 'Solicitamos a sua manifestação sobre a instalação do software. Gostaríamos de confirmar se a situação foi resolvida.';
    const kinds = (t: string) => checkFacts(src, t).map((p) => p.kind);
    expect(kinds('Nós concordamos com a instalação do software. Gostaríamos de confirmar se a situação foi resolvida.')).toContain('aprovacao');
    expect(kinds('Solicitamos a sua manifestação sobre a instalação do software. A situação foi resolvida.')).toContain('solucao_afirmada');
    expect(kinds('Solicitamos a sua manifestação sobre a instalação, que faremos amanhã. Gostaríamos de confirmar se a situação foi resolvida.')).toContain('compromisso');
    // "foi resolvida" dentro da pergunta não é afirmação
    expect(kinds(src)).toEqual([]);
  });

  it('com as reescritas gravadas no estudo (rodada 2), barra as violações que a leitura humana encontrou', () => {
    const rw = JSON.parse(readFileSync('scripts/estudo-ia/saidas-rodada2.json', 'utf8')) as Record<string, { results: { draft: string; rewrite: string }[] }>;
    // Corpo do texto do motor: sem a saudação (primeira linha) e sem o fecho (depois da última linha em branco).
    const body = (t: string): string => {
      const lines = t.trim().split('\n');
      return lines.slice(1, lines.lastIndexOf('')).join('\n');
    };
    const problems = (model: string, i: number) => checkFacts(body(rw[model].results[i].draft), rw[model].results[i].rewrite).map((p) => p.kind);
    expect(problems('HuggingFaceTB/SmolLM3-3B', 1)).toContain('solucao_afirmada'); // "A situação está resolvida"
    expect(problems('HuggingFaceTB/SmolLM3-3B', 5)).toContain('compromisso'); // "informaremos a razão"
    expect(problems('Qwen/Qwen3-1.7B', 1)).toContain('solucao_afirmada'); // "foi resolvida" onde só se pede confirmação
    expect(problems('Qwen/Qwen3-1.7B', 5)).toContain('aprovacao'); // "Nós concordamos com a instalação"
    expect(problems('Qwen/Qwen3-1.7B', 0)).toContain('compromisso'); // "vamos validar" sumiu
    expect(problems('Qwen/Qwen3-4B', 3)).toContain('negacao'); // "ainda não enviou", sem esse dado
    expect(problems('Qwen/Qwen3-4B', 4)).toContain('fato_novo'); // "2º andar" vazado do exemplo
    // Reescritas fiéis passam.
    expect(problems('Qwen/Qwen3-4B', 6)).toEqual([]);
    expect(problems('Qwen/Qwen3-1.7B', 6)).toEqual([]);
  });
});
