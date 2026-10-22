import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFreqIndex } from '../application/proofread-data';
import { applySuggestion, applySuggestions, buildFreqIndex, proofread } from '../domain/proofread';
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

const fix = (t: string): string => applySuggestions(t, proofread(t, index));

describe('lista de frequência', () => {
  it('traz a lista medida no estudo e o formato esperado', () => {
    expect(index.zipf.size).toBe(118326);
    expect(index.zipf.get('não')).toBeGreaterThan(6);
    expect(index.byStripped.get('nao')).toContain('não');
  });

  it('buildFreqIndex lê grupos "zipf x 100 palavras"', () => {
    const small = buildFreqIndex(['500 casa casas', '300 café']);
    expect(small.zipf.get('casa')).toBe(5);
    expect(small.byStripped.get('cafe')).toEqual(['café']);
  });
});

describe('proofread: acento e grafia', () => {
  it('corrige acento ausente e grafia de palavra comum', () => {
    expect(fix('o usuario nao consegue acessar a rede')).toBe('o usuário não consegue acessar a rede');
    expect(fix('a atualizaçao do sistema demorou')).toBe('a atualização do sistema demorou');
    expect(fix('foi necessario trocar o cabo')).toBe('foi necessário trocar o cabo');
  });

  it('informa posição, original, troca e regra, sem alterar o texto de entrada', () => {
    const text = 'Resolvido nao hoje';
    const [s] = proofread(text, index);
    expect(s).toMatchObject({ original: 'nao', replacement: 'não', rule: 'acento', start: 10, end: 13 });
    expect(applySuggestion(text, s)).toBe('Resolvido não hoje');
    expect(text).toBe('Resolvido nao hoje');
  });

  it('preserva a maiúscula inicial', () => {
    expect(fix('Nao foi possivel conectar')).toBe('Não foi possível conectar');
  });

  it('aplicar várias sugestões não desloca as posições', () => {
    const t = 'nao ha relatorio e nao ha atualizaçao';
    expect(fix(t)).toBe('não ha relatório e não ha atualização');
  });

  it('não sinaliza siglas, códigos, caminhos, nomes próprios, números e termos de TI', () => {
    const quiet = [
      'Chamado INC-2026-0451 aberto para a VPN e o AD.',
      'Abra C:\\Usuarios\\jsilva\\Documentos\\relatorio.xlsx e confira.',
      'Falei com a Maria sobre o Outlook e o OneDrive.',
      'O driver do spooler no firewall exige login e proxy.',
      'Valores de 2º trimestre e 17h30 conferidos.',
      'Veja https://portal.exemplo.com.br/chamados e jsilva@exemplo.test.',
    ];
    for (const t of quiet) expect(proofread(t, index), t).toEqual([]);
  });

  it('respeita as palavras ignoradas na sessão', () => {
    const t = 'o usuario nao voltou';
    expect(proofread(t, index, { ignore: new Set(['nao']) }).map((s) => s.original)).toEqual(['usuario']);
  });

  it('palavras válidas no lugar errado ficam fora do alcance (sem sugestão)', () => {
    expect(proofread('o erro persiste, mais já abrimos o chamado', index)).toEqual([]);
  });

  it('texto vazio ou só com espaços não gera sugestões', () => {
    expect(proofread('', index)).toEqual([]);
    expect(proofread('   \n  ', index)).toEqual([]);
  });
});

describe('proofread: medida contra os conjuntos do estudo', () => {
  const sets = [gold('gold.json'), gold('gold-novo.json')];

  it('0 sinalizações indevidas nas frases corretas dos dois conjuntos', () => {
    for (const g of sets) for (const t of g.limpos) expect(proofread(t, index), t).toEqual([]);
  });

  it('0 sinalizações indevidas nos textos gerados pelo produto (docs/AMOSTRAS-FORMATO.md)', () => {
    const blocks = [...readFileSync('docs/AMOSTRAS-FORMATO.md', 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThanOrEqual(10);
    for (const b of blocks) expect(proofread(b, index), b).toEqual([]);
  });

  it('sugere a troca esperada na maior parte dos erros de ortografia', () => {
    const words = (t: string): string[] => t.match(/\p{L}[\p{L}\p{N}_'’-]*/gu) ?? [];
    let expected = 0;
    let hit = 0;
    for (const g of sets) {
      for (const e of g.erros.filter((x) => x.cat === 'ortografia')) {
        const a = words(e.entrada);
        const b = words(e.esperado);
        const sug = proofread(e.entrada, index);
        a.forEach((w, i) => {
          if (w.toLowerCase() === b[i].toLowerCase()) return;
          expected++;
          if (sug.some((s) => s.original === w && s.replacement.toLowerCase() === b[i].toLowerCase())) hit++;
        });
      }
    }
    // Estudo: 18 de 22 (calibração) e 8 de 11 (validação) com a sugestão certa.
    expect(expected).toBeGreaterThanOrEqual(33);
    expect(hit).toBeGreaterThanOrEqual(26);
  });

  it('nunca sugere nada nos erros de concordância e crase (fora do alcance desta camada)', () => {
    for (const g of sets) {
      for (const e of g.erros.filter((x) => x.cat !== 'ortografia')) {
        const out = fix(e.entrada);
        // Pode mexer só se a troca coincidir com o esperado.
        if (out !== e.entrada) expect(out, e.entrada).toBe(e.esperado);
      }
    }
  });
});
