/**
 * Régua de fidelidade: o texto que a extensão estuda, guarda e gera não pode afirmar o que o analista não disse nem
 * carregar fato de um chamado para outro. Os casos vêm da medição de 11/11/2026 (docs/PLANO-FIDELIDADE.md) e usam só
 * dados fictícios.
 *
 * Fase 1 (estudo do texto de referência): testes reais, devem passar.
 * Fases 2 a 5: ficam como `it.fails` (o teste passa enquanto o defeito existe e QUEBRA quando for corrigido, para
 * obrigar a trocar por `it`) ou `it.todo` (a interface ainda não existe).
 */
import { describe, expect, it } from 'vitest';
import { triageContent } from '../application/analyst-content';
import { encryptLearning } from '../application/learning-crypto';
import { LearningService } from '../application/learning-service';
import { AppStorage } from '../infrastructure/storage';
import { MemoryArea } from './memory-storage';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { emptyLedger } from '../config/learning-ledger';
import type { Ledger } from '../config/learning-ledger';
import { applyTrainedStyle } from '../config/trained-style';
import { judgeBlock, MIN_BLOCK_USES, redactionProblems } from '../domain/block-vetting';
import { isOtherPartyAction, isPlannedAction } from '../domain/classify';
import { generate } from '../domain/engine';
import { composeFromBlocks } from '../domain/style-compose';
import { decompose, ingestTexts } from '../domain/style-corpus';
import { greetingBase } from '../domain/style-learn';
import { proposeTraining } from '../domain/style-train';
import { prepareTaught } from '../domain/teach';
import type { CommunicationType, GenerationSettings } from '../domain/types';

const P = DEFAULT_PROFILE;
const NOW = new Date('2026-11-11T12:00:00');
const settings = (type: CommunicationType, extra: Partial<GenerationSettings> = {}): GenerationSettings =>
  ({ type, recipient: 'user', techLevel: 'balanced', formality: 'cordial', length: 'standard', ...extra });
const gen = (type: CommunicationType, context: Record<string, unknown>, extra: Partial<GenerationSettings> = {}, profile = P) =>
  generate({ settings: settings(type, extra), context: context as never }, profile, { now: NOW });

const NOTEBOOK = `Bom dia, Mariana!

Conforme contato telefônico realizado hoje com a Ana Paula da contabilidade, o notebook HP ProBook será trocado na quinta-feira. Precisamos que você faça backup dos arquivos da pasta Documentos.

Qualquer dúvida, estamos à disposição.

Atenciosamente,
João Pereira
Service Desk Digimais`;

const SPORTS = `Olá, Boa tarde,

Informamos que a versão 2/3 do sistema roda 24/7. O time do Flamengo ganhou. Favor enviar o print.

Obrigado`;

const SAP = (name: string): string => `Olá, ${name},

Identificamos que o seu acesso ao SAP foi bloqueado por tentativas inválidas de senha. Poderia confirmar se consegue acessar agora?

Ficamos à disposição.
Equipe de Service Desk`;

const ingest = (texts: string[], type: CommunicationType = 'request_information'): Ledger =>
  ingestTexts(emptyLedger('2026-11-11'), texts.map((text) => ({ text, type })), P, NOW).ledger;

const allBlocks = (ledger: Ledger): string[] => Object.values(ledger.byType).flatMap((t) => t?.blocks.map((b) => b.text) ?? []);

const ledgerWith = (blocks: { role: 'opening' | 'request' | 'closing'; text: string; count: number }[], texts = 5): Ledger => ({
  ...emptyLedger('2026-11-11'), byType: { request_information: { texts, blocks, labels: [] } },
});

describe('fase 1: o que é dado de chamado não vira redação aprendida', () => {
  it('redactionProblems recusa nome próprio, sistema, número, dia da semana e "hoje"', () => {
    expect(redactionProblems('Falamos com a Ana Paula da contabilidade.')[0]).toContain('"Ana"');
    expect(redactionProblems('O acesso ao SAP foi bloqueado.')[0]).toContain('SAP');
    expect(redactionProblems('Troca do HP ProBook agendada.')).not.toEqual([]);
    expect(redactionProblems('Foram 3 tentativas.')).toContain('contém número, que é dado do chamado');
    expect(redactionProblems('Será trocado na quinta-feira.')).toContain('cita dia da semana ou mês, que é dado do chamado');
    expect(redactionProblems('Conversamos hoje por telefone.')[0]).toContain('hoje');
  });

  it('e aceita redação genérica, com campos, siglas de processo e a expressão “De acordo”', () => {
    for (const ok of [
      'Poderia confirmar se consegue acessar agora?',
      'Ficamos à disposição.',
      'Identificamos que o seu acesso foi bloqueado por tentativas inválidas de senha.',
      'Seu chamado {chamado} foi encaminhado para a equipe de {equipe} em {data}.',
      'Precisamos do seu “De acordo” para prosseguir.',
      'Abrimos o chamado junto à TI dentro do SLA.',
    ]) expect(redactionProblems(ok), ok).toEqual([]);
  });

  it('o nome da organização do perfil é permitido; sem o perfil, é nome próprio', () => {
    expect(redactionProblems('Obrigado por falar com a Digimais.')).not.toEqual([]);
    expect(redactionProblems('Obrigado por falar com a Digimais.', { organizationName: 'Digimais' })).toEqual([]);
  });

  it('o estudo não guarda nome, equipamento nem dia da semana de um chamado', () => {
    const ledger = ingest([NOTEBOOK, NOTEBOOK, SAP('Carlos'), SAP('Ana'), SPORTS]);
    const stored = allBlocks(ledger).join(' | ');
    for (const leak of ['Ana Paula', 'ProBook', 'quinta', 'contabilidade', 'Flamengo', 'SAP', 'hoje']) expect(stored, leak).not.toContain(leak);
    // O que é redação genérica continua sendo aprendido.
    expect(stored).toContain('Poderia confirmar se consegue acessar agora?');
    expect(stored).toContain('Ficamos à disposição.');
  });

  it('o relatório conta o que foi descartado por ser dado de chamado', () => {
    const { report } = ingestTexts(emptyLedger('2026-11-11'), [{ text: NOTEBOOK, type: 'request_information' }], P, NOW);
    expect(report.discarded).toBeGreaterThanOrEqual(1);
  });
});

describe('fase 1: cortesia, pedido e campos', () => {
  it('"Identificamos" e "Verificamos" não são tomados por cortesia', () => {
    const t = 'Olá, Ana,\n\nPara continuarmos, precisamos de algumas informações. Poderia enviar o modelo?\n\nVerificamos o equipamento.';
    expect(decompose(t).blocks.filter((b) => b.role === 'closing')).toEqual([]);
    expect(decompose(SAP('Ana')).blocks.find((b) => b.role === 'closing')?.text).toBe('Ficamos à disposição.');
    expect(decompose(SAP('Ana')).blocks.some((b) => b.role === 'opening' && b.text.startsWith('Identificamos'))).toBe(true);
  });

  it('"dispositivo" não é tomado por "à disposição"', () => {
    const t = 'Olá, Ana,\n\nPrecisamos de uma informação. Poderia enviar o modelo?\n\nReiniciamos o dispositivo.';
    expect(decompose(t).blocks.filter((b) => b.role === 'closing')).toEqual([]);
  });

  it('o pedido guarda só a frase que pede, não o resto do parágrafo', () => {
    const requests = decompose(SPORTS).blocks.filter((b) => b.role === 'request').map((b) => b.text);
    expect(requests).toEqual(['Favor enviar o print.']);
  });

  it('"2/3" e "24/7" não são data; datas reais e prazos continuam virando campo', () => {
    const t = prepareTaught('Olá, Ana,\n\nA versão 2/3 roda 24/7. Reunião em 13/25 não existe. Seu chamado foi aberto em 03/11/2026, visite no dia 10/03 e responda até 12/03.');
    expect(t.text).toContain('versão 2/3 roda 24/7');
    expect(t.text).toContain('em 13/25');
    expect(t.text).toContain('em {data}');
    expect(t.text).toContain('no dia {data}');
    expect(t.text).toContain('até {prazo}');
  });

  it('"time do Flamengo" não é equipe; "equipe de Redes" e "time de Redes" são', () => {
    expect(prepareTaught('Olá, Ana,\n\nO time do Flamengo ganhou.').text).toContain('time do Flamengo');
    expect(prepareTaught('Olá, Ana,\n\nEncaminhado para a equipe de Redes.').text).toContain('equipe de {equipe}');
    expect(prepareTaught('Olá, Ana,\n\nEncaminhado para o time de Redes.').text).toContain('time de {equipe}');
    expect(prepareTaught('Olá, Ana,\n\nEncaminhado para o setor do Financeiro.').text).toContain('setor do {equipe}');
  });

  it('"Olá, Boa tarde," é saudação fixa, não uma pessoa chamada Boa', () => {
    expect(prepareTaught(SPORTS).substitutions.some((s) => s.field === 'nome')).toBe(false);
    expect(greetingBase('Olá, Boa tarde,')).toBe('Olá, Boa tarde,');
    expect(greetingBase('Bom dia, Maria!')).toBe('Bom dia, {nome},');
  });
});

describe('fase 1: uma ocorrência só não vira estilo', () => {
  it('judgeBlock: ok com repetição, aguardando com uma ocorrência, fora de uso com fato de chamado', () => {
    const generic = { role: 'request' as const, text: 'Poderia confirmar se consegue acessar agora?' };
    expect(judgeBlock({ ...generic, count: MIN_BLOCK_USES }, 'request_information', P).state).toBe('ok');
    expect(judgeBlock({ ...generic, count: 1 }, 'request_information', P)).toMatchObject({ state: 'waiting' });
    const named = judgeBlock({ role: 'opening', text: 'Falamos com a Ana Paula da contabilidade.', count: 9 }, 'request_information', P);
    expect(named.state).toBe('out');
  });

  it('a montagem ignora trecho de uma ocorrência e trecho com nome, mesmo sem o filtro da triagem', () => {
    const only = ledgerWith([
      { role: 'opening', text: 'Falamos com a Ana Paula da contabilidade.', count: 9 },
      { role: 'request', text: 'Poderia confirmar se consegue acessar agora?', count: 1 },
    ]);
    const base = { type: 'request_information' as const, recipient: 'user' as const, formality: 'cordial' as const, profile: P, query: '', values: {} };
    expect(composeFromBlocks({ ...base, ledger: only })).toBeNull();
    const ok = composeFromBlocks({ ...base, ledger: ledgerWith([{ role: 'request', text: 'Poderia confirmar se consegue acessar agora?', count: 2 }]) });
    expect(ok?.text).toContain('Poderia confirmar se consegue acessar agora?');
  });

  it('o treino não propõe abertura nem fecho com fato de chamado, mesmo que se repita', () => {
    const l = ledgerWith([
      { role: 'opening', text: 'Falamos com a Ana Paula da contabilidade.', count: 5 },
      { role: 'closing', text: 'Abraços da Mariana.', count: 5 },
    ]);
    expect(proposeTraining(l, P).items).toEqual([]);
  });
});

describe('fase 1: o registro já guardado vai para fora de uso, com o motivo, sem ser apagado', () => {
  const stored = (ledger: Ledger) => ({ library: { library: null }, taught: [], style: null, trained: null, ledger });
  const sources = { base: P, overlay: null, signingKeys: [] as string[] };
  const legacy: Ledger = {
    ...emptyLedger('2026-11-01'),
    byType: {
      request_information: {
        texts: 5,
        blocks: [
          { role: 'opening', text: 'Conforme contato telefônico realizado hoje com a Ana Paula da contabilidade, o notebook HP ProBook será trocado na quinta-feira.', count: 3 },
          { role: 'request', text: 'Poderia confirmar se consegue acessar agora?', count: 1 },
          { role: 'closing', text: 'Ficamos à disposição.', count: 4 },
        ],
        labels: [],
      },
    },
  };

  it('fato de chamado fica fora de uso; uma ocorrência aguarda; o resto segue em uso', () => {
    const c = triageContent(stored(legacy), sources);
    const out = c.blocksNotInUse.find((b) => b.state === 'out');
    expect(out?.text).toContain('Ana Paula');
    expect(out?.reasons.join(' ')).toMatch(/nome próprio|número|dia da semana|hoje/);
    expect(c.blocksNotInUse.find((b) => b.state === 'waiting')?.text).toBe('Poderia confirmar se consegue acessar agora?');
    expect(c.blocksNotInUse.some((b) => b.text === 'Ficamos à disposição.')).toBe(false);
  });

  it('nada é apagado: o registro devolvido é o mesmo que estava guardado', () => {
    expect(triageContent(stored(legacy), sources).ledger).toEqual(legacy);
  });
});

describe('fase 1: fato de chamado não sai no arquivo exportado nem entra pelo arquivo importado', () => {
  const PASSWORD = 'uma-senha-bem-longa-123';
  const taintedLedger: Ledger = {
    ...emptyLedger('2026-11-01'),
    byType: {
      request_information: {
        texts: 5,
        blocks: [
          { role: 'opening', text: 'Falamos com a Ana Paula da contabilidade sobre o notebook.', count: 3 },
          { role: 'closing', text: 'Ficamos à disposição.', count: 4 },
        ],
        labels: [],
      },
    },
  };
  const service = () => {
    const store = new AppStorage(new MemoryArea(), new MemoryArea());
    return { store, service: new LearningService(store, () => ({ profile: P, version: '1.0.0.4', now: NOW })) };
  };

  it('a exportação deixa o trecho com nome de terceiro no navegador, sem alterá-lo', async () => {
    const a = service();
    await a.store.saveLedger(taintedLedger);
    const { text: file } = await a.service.exportFile(PASSWORD);
    const b = service();
    const preview = await b.service.previewImport(file, PASSWORD);
    const blocks = preview.ledger?.byType.request_information?.blocks.map((x) => x.text);
    expect(blocks).toEqual(['Ficamos à disposição.']);
    expect(preview.summary.dropped).toBe(0);
    expect((await a.store.loadLedger())?.byType.request_information?.blocks).toHaveLength(2);
  });

  it('a importação recusa o trecho com nome de terceiro vindo de um arquivo antigo e conta como descartado', async () => {
    const file = await encryptLearning({ kind: 'learning', version: 1, ledger: taintedLedger, trained: null, style: null }, PASSWORD, '1.0.0.4', NOW);
    const preview = await service().service.previewImport(file, PASSWORD);
    expect(preview.ledger?.byType.request_information?.blocks.map((x) => x.text)).toEqual(['Ficamos à disposição.']);
    expect(preview.summary.dropped).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Defeitos conhecidos das fases seguintes. Cada `it.fails` passa hoje e quebra quando o defeito for corrigido:
// nesse momento, troque por `it`.
// ---------------------------------------------------------------------------------------------------------------

describe('fase 3: fatos na geração', () => {
  it('ação já feita não vira "próximo passo" por causa de radical solto (agend*, planej*)', () => {
    expect(isPlannedAction('Agendamento removido da fila')).toBe(false);
    expect(isPlannedAction('Verificado o planejamento de capacidade')).toBe(false);
    expect(isPlannedAction('Confirmado que a tarefa agendada rodou')).toBe(false);
  });

  it('o que ainda será feito continua sendo planejado', () => {
    for (const item of ['Vamos agendar a visita', 'Será agendada a troca do cabo', 'Agendada para sexta-feira', 'Planejar a migração da caixa', 'Planejamos trocar o cabo']) {
      expect(isPlannedAction(item), item).toBe(true);
    }
  });

  it('só ação com sujeito de terceiro é reconhecida como de terceiro', () => {
    for (const item of ['Usuário reiniciou o computador', 'Fornecedor trocou o toner', 'O cliente confirmou o horário', 'Toner trocado pelo fornecedor']) {
      expect(isOtherPartyAction(item), item).toBe(true);
    }
    for (const item of ['Resetei a senha do usuário', 'Usuário com acesso validado', 'Validei o cadastro do cliente', 'Reiniciado o serviço']) {
      expect(isOtherPartyAction(item), item).toBe(false);
    }
  });

  it('ação de terceiro não sai em "O que já fizemos"', () => {
    const r = gen('progress_update', { actions: ['Usuário reiniciou o computador', 'Fornecedor trocou o toner'] });
    expect(r.text).not.toMatch(/fizemos[\s\S]*Usuário reiniciou/);
    expect(r.text).not.toMatch(/Até aqui, realizamos|Já realizamos/);
    expect(r.text).toContain('Informado por outras partes');
    expect(r.text).toContain('Usuário reiniciou o computador.');
    expect(r.text).toContain('Fornecedor trocou o toner.');
  });

  it('com ação nossa e de terceiro, cada uma fica no seu lugar e o texto do analista não muda', () => {
    const r = gen('progress_update', { actions: ['limpei o cache do navegador', 'Fornecedor trocou o toner'] });
    const ours = r.text.indexOf('limpamos o cache do navegador');
    const label = r.text.indexOf('Informado por outras partes');
    const theirs = r.text.indexOf('Fornecedor trocou o toner.');
    expect(ours).toBeGreaterThanOrEqual(0);
    expect(label).toBeGreaterThan(ours);
    expect(theirs).toBeGreaterThan(label);
  });
});

describe('fase 4: coerência do texto com o que o analista informou', () => {
  const alerted = (r: ReturnType<typeof gen>): boolean =>
    r.blocked || r.warnings.some((w) => w.severity === 'block' || (w.severity === 'warning' && /continua|persist/i.test(w.message)));

  it('confirmação de solução com resultado negativo é alertada', () => {
    for (const result of ['o erro continua', 'o problema persiste', 'a falha segue', 'continua travando']) {
      expect(alerted(gen('solution_confirmation', { actions: ['limpamos o cache'], observedResult: result })), result).toBe(true);
    }
  });

  it('resultado positivo ou negado não dispara o alerta', () => {
    for (const result of ['o erro não continua', 'Outlook abre normalmente', 'a situação segue normal', 'continua funcionando']) {
      expect(alerted(gen('solution_confirmation', { actions: ['limpamos o cache'], observedResult: result })), result).toBe(false);
    }
  });

  it('o alerta não altera o texto: só avisa', () => {
    const r = gen('solution_confirmation', { actions: ['limpamos o cache'], observedResult: 'o erro continua' });
    expect(r.blocked).toBe(false);
    expect(r.text).toContain('O erro continua.');
  });

  it('encerramento sem confirmação do usuário não afirma "situação solucionada"', () => {
    for (const formality of ['cordial', 'formal', 'direct'] as const) {
      const r = gen('closure_resolved', { actions: ['reinstalado o Office'], observedResult: 'Outlook abre normalmente' }, { formality });
      expect(r.text, formality).not.toMatch(/solucionad/);
    }
  });

  it('com confirmação do usuário registrada, o encerramento afirma a solução', () => {
    const r = gen('closure_resolved', { actions: ['reinstalado o Office'], observedResult: 'Outlook abre normalmente', userConfirmation: 'yes' });
    expect(r.text).toMatch(/solucionad/);
  });

  it('abertura própria definida no perfil é respeitada', () => {
    const profile = { ...P, templates: { ...P.templates, openings: { closure_resolved: { cordial: ['Encerramos este chamado com a solução validada.'] } } } };
    const r = gen('closure_resolved', { actions: ['reinstalado o Office'], observedResult: 'Outlook abre normalmente' }, {}, profile as never);
    expect(r.text).toContain('Encerramos este chamado com a solução validada.');
  });
});

describe('fase 5 (defeito conhecido): acabamento', () => {
  it.fails('fecho treinado não empilha com a cortesia do perfil', () => {
    const trained = { version: 1 as const, closings: { request_information: 'Ficamos à disposição.' } };
    const r = gen('request_information', { summary: 'impressora não imprime', questions: ['qual o modelo'] }, {}, applyTrainedStyle(P, trained));
    expect(r.text.includes('Ficamos à disposição.') && r.text.includes('Agradecemos a colaboração.')).toBe(false);
  });
});

describe('fase 2: montagem por trechos', () => {
  const printer = ledgerWith([
    { role: 'opening', text: 'Seguimos com a análise do problema de impressão.', count: 3 },
    { role: 'request', text: 'Poderia confirmar se a impressora aparece na lista de dispositivos?', count: 2 },
    { role: 'closing', text: 'Ficamos à disposição.', count: 4 },
  ]);
  const base = { ledger: printer, type: 'request_information' as const, recipient: 'user' as const, formality: 'cordial' as const, profile: P, values: {} };

  it('o texto montado inclui, sem alteração, o que o analista digitou no formulário', () => {
    const c = composeFromBlocks({ ...base, query: 'impressora não imprime', typed: ['Qual o modelo da impressora?', 'Aparece alguma mensagem de erro?'] })!;
    expect(c.text).toContain('Qual o modelo da impressora?');
    expect(c.text).toContain('Aparece alguma mensagem de erro?');
    expect(c.parts.filter((p) => p.role === 'informed').every((p) => p.origin === 'formulario')).toBe(true);
  });

  it('sem trecho parecido com o formulário, a abertura padrão do tipo entra no lugar do mais frequente', () => {
    const c = composeFromBlocks({ ...base, ledger: ledgerWith([
      { role: 'opening', text: 'Seguimos com a análise do problema de notebook.', count: 9 },
      { role: 'closing', text: 'Ficamos à disposição.', count: 4 },
    ]), query: 'impressora não imprime', typed: ['Qual o modelo?'] })!;
    expect(c.text).not.toContain('notebook');
    const opening = c.parts.find((p) => p.role === 'opening')!;
    expect(opening.origin).toBe('perfil');
    expect(opening.text).toMatch(/informações|análise/);
  });

  it('pedido de outro assunto não entra: o do formulário toma o lugar', () => {
    const c = composeFromBlocks({ ...base, ledger: ledgerWith([
      { role: 'request', text: 'Poderia confirmar se o notebook liga normalmente?', count: 5 },
      { role: 'closing', text: 'Ficamos à disposição.', count: 4 },
    ]), query: 'impressora não imprime', typed: ['Qual o modelo da impressora?'] })!;
    expect(c.text).not.toContain('notebook');
    expect(c.text).toContain('Qual o modelo da impressora?');
  });

  it('o fecho não depende do assunto', () => {
    const c = composeFromBlocks({ ...base, query: 'impressora não imprime' })!;
    expect(c.parts.find((p) => p.role === 'closing')).toMatchObject({ origin: 'ensinado', text: 'Ficamos à disposição.' });
  });

  it('nenhuma parte ensinada tem menos de MIN_BLOCK_USES ocorrências, então não há o que bloquear na tela', () => {
    const c = composeFromBlocks({ ...base, ledger: ledgerWith([
      { role: 'opening', text: 'Seguimos com a análise do problema de impressão.', count: 1 },
      { role: 'request', text: 'Poderia confirmar se a impressora aparece na lista?', count: 2 },
    ]), query: 'impressora' })!;
    expect(c.parts.filter((p) => p.origin === 'ensinado').every((p) => (p.count ?? 0) >= MIN_BLOCK_USES)).toBe(true);
  });
});
