import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFreqIndex } from '../application/proofread-data';
import { checkAgreement } from '../domain/agreement';
import { applySuggestions, proofreadAll } from '../domain/proofread';
import type { FreqIndex } from '../domain/proofread';

interface Gold {
  erros: { cat: string; entrada: string; esperado: string }[];
  limpos: string[];
}
const gold = (f: string): Gold => JSON.parse(readFileSync(`scripts/estudo-correcao/${f}`, 'utf8')) as Gold;

let index: FreqIndex;
beforeAll(async () => {
  index = await loadFreqIndex();
}, 20000);

const fix = (t: string): string => applySuggestions(t, checkAgreement(t));
const quiet = (t: string): void => expect(checkAgreement(t), t).toEqual([]);

describe('camada 2: concordância nominal', () => {
  it('plural do substantivo depois de determinante ou numeral no plural', () => {
    expect(fix('os relatório foram enviados')).toBe('os relatórios foram enviados');
    expect(fix('três chamado foram abertos')).toBe('três chamados foram abertos');
    expect(fix('as configuração estão corretas')).toBe('as configurações estão corretas');
  });

  it('plural de termo de TI em inglês terminado em "ch": switches, nunca "switchs"', () => {
    expect(fix('os switch estão desligados')).toBe('os switches estão desligados');
    expect(fix('três switch foram trocados')).toBe('três switches foram trocados');
    // Já no plural correto, nada a sugerir; e o plural nunca vira "switchs".
    quiet('Os switches da filial foram trocados na quarta-feira.');
    for (const t of ['os switch estão desligados', 'dois switch queimaram']) {
      expect(fix(t), t).not.toContain('switchs');
    }
  });

  it('gênero do determinante, menos em nomes de pessoa', () => {
    expect(fix('o senha expirou')).toBe('a senha expirou');
    expect(fix('nosso equipe verificou')).toBe('nossa equipe verificou');
    quiet('A analista verificou o cabo.');
    quiet('Uma usuária abriu o chamado.');
    expect(checkAgreement('a usuário abriu o chamado')).toEqual([]);
  });

  it('adjetivo e particípio concordam com o núcleo, usando o número do determinante', () => {
    expect(fix('a lentidão foi resolvido')).toBe('a lentidão foi resolvida');
    expect(fix('os arquivos foram restaurada')).toBe('os arquivos foram restaurados');
    expect(fix('as licenças vencida precisam de renovação')).toBe('as licenças vencidas precisam de renovação');
    // "os computador": a regra do plural corrige o substantivo e o particípio já está certo (não vira singular).
    expect(fix('os computador do setor foram atualizados')).toBe('os computadores do setor foram atualizados');
  });

  it('com nome de pessoa só ajusta o número, sem trocar o gênero que o analista escreveu', () => {
    expect(fix('os usuários bloqueada foram avisados')).toBe('os usuários bloqueadas foram avisados');
  });
});

describe('camada 2: concordância verbal', () => {
  it('verbo no singular depois de sujeito plural, composto ou "nós"', () => {
    expect(fix('as falhas persiste desde ontem')).toBe('as falhas persistem desde ontem');
    expect(fix('os técnicos precisa de acesso')).toBe('os técnicos precisam de acesso');
    expect(fix('o técnico e o analista verificou o servidor')).toBe('o técnico e o analista verificaram o servidor');
    expect(fix('nós atualizou o driver')).toBe('nós atualizamos o driver');
  });

  it('o verbo ligado por "e" herda o sujeito plural do verbo anterior', () => {
    expect(fix('Os técnicos verificou o cabo e concluiu o teste')).toBe('Os técnicos verificaram o cabo e concluíram o teste');
    // O primeiro verbo já está certo; o segundo, não.
    expect(fix('Os técnicos verificaram o cabo e concluiu o teste')).toBe('Os técnicos verificaram o cabo e concluíram o teste');
    expect(fix('O técnico e o analista verificou o cabo e concluiu o teste')).toBe('O técnico e o analista verificaram o cabo e concluíram o teste');
  });

  it('sem sujeito plural em comum, o verbo depois de "e" não muda', () => {
    quiet('O técnico verificou o cabo e concluiu o teste.');
    quiet('Os técnicos verificaram o cabo e o analista concluiu o teste.');
    quiet('Os técnicos verificaram o cabo e ele concluiu o teste.');
    quiet('Os técnicos verificaram que o cabo falhou e travou.');
    // "Voltou" tem o servidor como sujeito: só verbo de ação de pessoas herda o sujeito do verbo anterior.
    quiet('Os técnicos reiniciaram o servidor e voltou ao normal.');
    quiet('Os técnicos trocaram o cabo e funcionou.');
    quiet('Os técnicos verificaram o cabo. Depois e concluiu o teste.');
  });

  it('"nós" abrindo a oração leva o verbo à primeira pessoa do plural', () => {
    expect(fix('Nós vai resolver o chamado amanhã.')).toBe('Nós vamos resolver o chamado amanhã.');
    expect(fix('Hoje nós precisa de acesso ao servidor.')).toBe('Hoje nós precisamos de acesso ao servidor.');
    expect(fix('Quando nós consegue o acesso, avisamos.')).toBe('Quando nós conseguimos o acesso, avisamos.');
    // Depois de preposição, "nós" não é sujeito: "para nós vai ser complicado" está certo.
    quiet('Para nós vai ser complicado.');
    quiet('Isso para nós é importante.');
    quiet('Entre nós vai haver acordo.');
    quiet('Nós vamos resolver o chamado amanhã.');
  });

  it('"entre eu e você" vira "entre mim e você", sem mexer em "entre eu ir e ele ficar"', () => {
    expect(fix('Entre eu e você, o erro é antigo.')).toBe('Entre mim e você, o erro é antigo.');
    expect(fix('A decisão ficou entre eu ou ela.')).toBe('A decisão ficou entre mim ou ela.');
    quiet('Entre mim e você, o erro é antigo.');
    quiet('Entre eu ir e ele ficar, prefiro ir.');
    quiet('Eu e você abrimos o chamado.');
  });

  it('gerundismo "vou estar enviando" é sugerido como estilo, só com gerúndio regular', () => {
    expect(fix('Vou estar enviando o arquivo hoje.')).toBe('Vou enviar o arquivo hoje.');
    expect(fix('A equipe vai estar verificando o cabo.')).toBe('A equipe vai verificar o cabo.');
    expect(fix('Vamos estar abrindo o chamado.')).toBe('Vamos abrir o chamado.');
    const s = checkAgreement('Vou estar enviando o arquivo hoje.')[0];
    expect(s.rule).toBe('uso');
    expect(s.reason).toMatch(/estilo/);
    quiet('Vou enviar o arquivo hoje.');
    quiet('Estou enviando o arquivo agora.');
    quiet('Vou estar de férias na próxima semana.');
    quiet('Vou estar sendo avaliado amanhã.');
  });

  it('sujeito composto só vale quando o primeiro termo abre a oração', () => {
    // Abre a oração: início da frase, depois de pontuação, de conjunção ou de advérbio de tempo.
    expect(fix('o técnico e o analista verificou o servidor')).toBe('o técnico e o analista verificaram o servidor');
    expect(fix('Ontem o relatório e o arquivo voltou, depois o técnico e o analista confirmou')).toBe(
      'Ontem o relatório e o arquivo voltaram, depois o técnico e o analista confirmaram',
    );
    expect(fix('Confirmamos que o relatório e o arquivo voltou')).toBe('Confirmamos que o relatório e o arquivo voltaram');
    // Depois de um verbo, o primeiro termo é objeto e o sujeito é só o segundo: nenhuma sugestão.
    quiet('Conseguimos reiniciar o serviço e o acesso voltou ao normal.');
    quiet('Reiniciamos o servidor e o acesso voltou.');
    quiet('Atualizamos o driver e o serviço voltou ao normal.');
  });

  it('houveram, fazem com tempo e existe com plural', () => {
    expect(fix('houveram duas quedas')).toBe('houve duas quedas');
    expect(fix('fazem cinco horas que caiu')).toBe('faz cinco horas que caiu');
    expect(fix('existe muitos chamados')).toBe('existem muitos chamados');
    quiet('Eles fazem três chamados por hora.');
    quiet('Existem duas opções.');
  });

  it('não mexe em verbo cujo sujeito é singular, mesmo com plural no complemento', () => {
    quiet('O chamado dos usuários resolveu o problema.');
    quiet('A equipe de redes e a de infraestrutura analisaram o caso.');
  });
});

describe('camada 2: crase e palavras parecidas', () => {
  it('crase em locuções e com verbo de destino', () => {
    expect(fix('o chamado foi encaminhado a infraestrutura')).toBe('o chamado foi encaminhado à infraestrutura');
    expect(fix('estamos a disposição')).toBe('estamos à disposição');
    expect(fix('ficamos a espera do retorno')).toBe('ficamos à espera do retorno');
    expect(fix('segue a baixo o resumo')).toBe('segue abaixo o resumo');
    expect(fix('avisamos à todos')).toBe('avisamos a todos');
    expect(fix('na quinta-feira a tarde')).toBe('na quinta-feira à tarde');
  });

  it('não põe crase em "a tarde" ou "a noite" que são sujeito ou vêm de preposição', () => {
    quiet('A tarde foi tranquila.');
    quiet('Durante a tarde, o suporte acompanhou a fila.');
    quiet('A falha ocorreu de manhã e a noite não teve queda.');
    quiet('Chegamos à tarde.');
  });

  it('há, mas, porquê e houve só em padrões estreitos', () => {
    expect(fix('A dois dias o acesso caiu')).toBe('Há dois dias o acesso caiu');
    expect(fix('tentamos, mais ele não voltou')).toBe('tentamos, mas ele não voltou');
    expect(fix('ninguém sabe o porque do erro')).toBe('ninguém sabe o porquê do erro');
    expect(fix('se ouve alguma mudança')).toBe('se houve alguma mudança');
    quiet('Volta daqui a dois dias para a troca.');
    quiet('Enviamos o relatório mais o anexo.');
    quiet('Não sabemos por que cai, porque os logs estão vazios.');
    quiet('Não sei o porquê da queda.');
  });
});

describe('camada 2: contrato de sugestão', () => {
  it('cada sugestão traz posição, trecho, troca, regra e motivo, sem alterar o texto', () => {
    const text = 'houveram falhas';
    const [s] = checkAgreement(text);
    expect(s).toMatchObject({ start: 0, end: 8, original: 'houveram', replacement: 'houve', rule: 'concordancia' });
    expect(s.reason.length).toBeGreaterThan(10);
    expect(text).toBe('houveram falhas');
  });

  it('proofreadAll junta as camadas, em ordem, e as palavras ignoradas valem para as duas', () => {
    const t = 'os usuario nao relatou lentidão e houveram falhas';
    const all = proofreadAll(t, index);
    expect(all.map((s) => s.original)).toEqual(['usuario', 'nao', 'houveram']);
    expect(all.map((s) => s.rule)).toEqual(['acento', 'acento', 'concordancia']);
    expect(proofreadAll(t, index, { ignore: new Set(['houveram']) }).map((s) => s.original)).toEqual(['usuario', 'nao']);
  });

  it('se ortografia e regra se tocam, vale a ortografia', () => {
    const t = 'houverão falhas';
    expect(proofreadAll(t, index).every((s, i, a) => a.every((o, j) => i === j || s.end <= o.start || o.end <= s.start))).toBe(true);
  });
});

describe('camada 2: medida contra os três conjuntos do estudo (camadas 1 e 2 juntas)', () => {
  const sets = ['gold.json', 'gold-novo.json', 'gold-3.json'].map(gold);

  it('0 sugestões nas frases corretas dos três conjuntos e nos textos gerados pelo produto', () => {
    for (const g of sets) for (const t of g.limpos) expect(proofreadAll(t, index), t).toEqual([]);
    const blocks = [...readFileSync('docs/AMOSTRAS-FORMATO.md', 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
    for (const b of blocks) expect(proofreadAll(b, index), b).toEqual([]);
  });

  it('nunca piora um texto com erro: o resultado é o esperado ou o texto original', () => {
    let exact = 0;
    let total = 0;
    for (const g of sets) {
      for (const e of g.erros.filter((x) => x.cat !== 'ortografia')) {
        total++;
        const out = applySuggestions(e.entrada, proofreadAll(e.entrada, index));
        if (out === e.esperado) exact++;
        else expect(out, e.entrada).toBe(e.entrada);
      }
    }
    // Medido: 30 de 32 (calibração), 16 de 20 (validação, depois dos ajustes) e 30 de 32 (conjunto novo).
    expect(total).toBe(84);
    expect(exact).toBeGreaterThanOrEqual(76);
  });
});

describe('camada 2: conjunto de regressão 4 (autor único, escrito com as regras à vista)', () => {
  const g = gold('gold-4.json');
  const covered = g.erros.filter((e) => e.cat !== 'fora');
  const outside = g.erros.filter((e) => e.cat === 'fora');
  const result = (entrada: string): string => applySuggestions(entrada, proofreadAll(entrada, index));
  /** A sugestão caminha para o esperado: toda palavra da troca aparece no texto esperado. */
  const towardExpected = (replacement: string, expected: string): boolean =>
    replacement.toLowerCase().split(/\s+/).every((w) => expected.toLowerCase().includes(w));

  it('0 sugestões nas frases corretas', () => {
    expect(g.limpos.length).toBeGreaterThanOrEqual(50);
    for (const t of g.limpos) expect(proofreadAll(t, index), t).toEqual([]);
  });

  it('nos erros cobertos o resultado é o esperado ou o texto original, nunca outra coisa', () => {
    for (const e of covered) {
      const out = result(e.entrada);
      if (out !== e.esperado) expect([e.esperado, e.entrada], e.entrada).toContain(out);
    }
  });

  it('acerto exato nos erros cobertos: pelo menos 80% e pelo menos 45 de 47 (medido)', () => {
    const exact = covered.filter((e) => result(e.entrada) === e.esperado).length;
    expect(covered.length).toBe(47);
    expect(exact / covered.length).toBeGreaterThanOrEqual(0.8);
    expect(exact).toBeGreaterThanOrEqual(45);
  });

  it('limites conhecidos dentro do desenho: continuam sem sugestão (se um for corrigido, atualize este teste e o estudo)', () => {
    // "seguimos a espera": o verbo seguir não está na lista da regra de crase. "mais o": o artigo ficou de fora de propósito (", mais o anexo" pode ser soma).
    for (const t of ['Seguimos a espera de retorno do fornecedor.', 'O teste funcionou, mais o erro voltou depois.']) expect(result(t), t).toBe(t);
  });

  it('fora do desenho: o que a camada toca caminha para o esperado; o resto fica como está', () => {
    let untouched = 0;
    for (const e of outside) {
      const sug = proofreadAll(e.entrada, index);
      for (const s of sug) expect(towardExpected(s.replacement, e.esperado), `${e.entrada}: ${s.original} -> ${s.replacement}`).toBe(true);
      if (applySuggestions(e.entrada, sug) === e.entrada) untouched++;
    }
    // Medido: 4 de 5 sem sugestão (esta/está, bakcup, pendrive, "a maioria ... relataram") e 1 parcial ("os switch queimou": corrige só o plural).
    expect(untouched).toBe(4);
  });
});
