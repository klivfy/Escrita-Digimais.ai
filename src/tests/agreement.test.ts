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
