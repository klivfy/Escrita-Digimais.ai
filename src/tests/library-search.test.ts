import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../config/library-schema';
import type { LibraryModel } from '../config/library-schema';
import { buildSearchIndex, fillModel, pendingFields, searchModels } from '../domain/library-search';

interface Conjunto { modelos: Record<string, string>; consultas: Record<string, string[]>; fora: string[] }
const set = JSON.parse(readFileSync('scripts/estudo-ensino/conjunto.json', 'utf8')) as Conjunto;
const asModels = (): LibraryModel[] =>
  Object.entries(set.modelos).map(([id, text]) => ({
    id: id.replace(/_/g, '-'), title: id, types: ['request_information'], recipients: [], text, keywords: [], reviewedAt: '',
  }));

describe('busca de modelos por semelhança', () => {
  const models = asModels();
  const index = buildSearchIndex(models);
  const rank = (q: string) => searchModels(index, q, { anyType: true, limit: 16, minScore: 0 }).map((h) => h.model.id);

  it('repete a medida do estudo: modelo certo entre os 3 primeiros em pelo menos 95% e em 1º em pelo menos 85%', () => {
    let total = 0;
    let top1 = 0;
    let top3 = 0;
    for (const [id, queries] of Object.entries(set.consultas)) {
      for (const q of queries) {
        const r = rank(q);
        const want = id.replace(/_/g, '-');
        total++;
        if (r[0] === want) top1++;
        if (r.slice(0, 3).includes(want)) top3++;
      }
    }
    expect(total).toBe(64);
    // No Python (scikit-learn): 91% e 98%. A versão em TypeScript segue o mesmo método.
    expect(top1 / total).toBeGreaterThanOrEqual(0.85);
    expect(top3 / total).toBeGreaterThanOrEqual(0.95);
  });

  it('consulta sem relação com os modelos pontua bem abaixo de uma consulta real', () => {
    // Nenhum limiar separa por completo o que está fora da biblioteca (ver o estudo): por isso existe "Nenhum destes".
    const nonsense = searchModels(index, 'xyzzy qwerty', { anyType: true, minScore: 0 })[0]?.score ?? 0;
    const real = searchModels(index, 'pedir print do erro com a mensagem', { anyType: true, minScore: 0 })[0]?.score ?? 0;
    expect(nonsense).toBeLessThan(real / 2);
  });

  it('devolve no máximo 3 por padrão, em ordem de semelhança', () => {
    const hits = searchModels(index, 'usuario nao respondeu', { anyType: true });
    expect(hits.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });

  it('consulta vazia lista os primeiros modelos elegíveis, sem pontuação', () => {
    const hits = searchModels(index, '   ', { anyType: true });
    expect(hits.map((h) => h.model.id)).toEqual(models.slice(0, 3).map((m) => m.id));
    expect(hits.every((h) => h.score === 0)).toBe(true);
  });

  it('filtra por tipo e destinatário, e "todos os tipos" ignora o tipo', () => {
    const lib = validateLibrary({
      schemaVersion: 1, libraryName: 'T', libraryVersion: '1',
      models: [
        { id: 'a', title: 'Pedir print', types: ['request_information'], text: 'Envie uma captura de tela do erro.' },
        { id: 'b', title: 'Pedir print ao gestor', types: ['manager_approval'], recipients: ['manager'], text: 'Envie uma captura de tela do erro para aprovação.' },
      ],
    });
    if (!lib.ok) throw new Error('inválida');
    const idx = buildSearchIndex(lib.library.models);
    expect(searchModels(idx, 'captura de tela', { type: 'request_information', recipient: 'user' }).map((h) => h.model.id)).toEqual(['a']);
    expect(searchModels(idx, 'captura de tela', { type: 'manager_approval', recipient: 'user' })).toEqual([]);
    expect(searchModels(idx, 'captura de tela', { type: 'manager_approval', recipient: 'manager' }).map((h) => h.model.id)).toEqual(['b']);
    expect(searchModels(idx, 'captura de tela', { type: 'pending', anyType: true, recipient: 'manager' }).map((h) => h.model.id).sort()).toEqual(['a', 'b']);
  });

  it('título e palavras-chave ajudam consultas curtas', () => {
    const lib = validateLibrary({
      schemaVersion: 1, libraryName: 'T', libraryVersion: '1',
      models: [
        { id: 'a', title: 'Senha redefinida', keywords: ['reset'], types: ['progress_update'], text: 'Use a senha temporária e troque no primeiro acesso.' },
        { id: 'b', title: 'Orientar a reiniciar', types: ['progress_update'], text: 'Reinicie o computador e conecte novamente.' },
      ],
    });
    if (!lib.ok) throw new Error('inválida');
    const idx = buildSearchIndex(lib.library.models);
    expect(searchModels(idx, 'reset', { type: 'progress_update' })[0]?.model.id).toBe('a');
  });
});

describe('campos entre chaves', () => {
  it('preenche só o que o analista informou e deixa o resto pendente', () => {
    const text = 'Olá, {nome}. Sobre {chamado}: responda até {prazo}, equipe {equipe}.';
    const filled = fillModel(text, { nome: ' Maria ', prazo: '', equipe: 'Redes' });
    expect(filled).toBe('Olá, Maria. Sobre {chamado}: responda até {prazo}, equipe Redes.');
    expect(pendingFields(filled)).toEqual(['chamado', 'prazo']);
  });

  it('não aceita valor com quebra de linha ou chaves (nada de injetar outro campo)', () => {
    expect(fillModel('Olá {nome}.', { nome: 'Maria\nJoão' })).toBe('Olá {nome}.');
    expect(fillModel('Olá {nome}.', { nome: '{chamado}' })).toBe('Olá {nome}.');
  });

  it('só reconhece os campos da lista fechada', () => {
    expect(pendingFields('use {nome}, {telefone} e {data}')).toEqual(['nome', 'data']);
    expect(pendingFields('sem campos')).toEqual([]);
  });
});
