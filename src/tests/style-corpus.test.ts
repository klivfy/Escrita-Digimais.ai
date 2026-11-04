import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { emptyLedger } from '../config/learning-ledger';
import { decompose, ingestTexts } from '../domain/style-corpus';

const NOW = new Date('2026-11-04T12:00:00');
const TEXT = [
  'Olá, Carlos,',
  '',
  'Para continuarmos a análise, precisamos de algumas informações. Pode nos ajudar?',
  '',
  'Resumo da situação: impressora do financeiro offline.',
  '',
  'Envie uma captura de tela do erro até 20/10/2026 às 17h.',
  '',
  'Ficamos no aguardo.',
  'Time de Suporte ao Colaborador',
].join('\n');

describe('decompose', () => {
  it('separa saudação, abertura, pedido, fecho, assinatura e rótulos', () => {
    const d = decompose(TEXT);
    expect(d.greeting).toBe('Olá, {nome},');
    expect(d.signature).toBe('Time de Suporte ao Colaborador');
    expect(d.labels).toEqual(['Resumo da situação']);
    expect(d.blocks).toEqual([
      { role: 'opening', text: 'Para continuarmos a análise, precisamos de algumas informações.' },
      { role: 'request', text: 'Pode nos ajudar?' },
      { role: 'request', text: 'Envie uma captura de tela do erro até {prazo}.' },
      { role: 'closing', text: 'Ficamos no aguardo.' },
    ]);
  });

  it('parágrafo com rótulo ou lista guarda conteúdo do chamado e não vira bloco', () => {
    const d = decompose('Olá, Ana,\n\nSeguimos com a análise do seu caso.\n\nPendência: troca do cabo.\n\n1. Reiniciar o serviço\n2. Validar o cadastro\n\nObrigado.');
    expect(d.blocks.map((b) => b.text)).toEqual(['Seguimos com a análise do seu caso.', 'Obrigado.']);
  });

  it('última linha que não parece fecho nem assinatura continua no corpo', () => {
    const d = decompose('Olá, Ana,\n\nSeguimos com a análise.\n\nEnvie o arquivo de log, por favor.');
    expect(d.signature).toBeUndefined();
    expect(d.blocks.map((b) => b.role)).toEqual(['opening', 'request']);
    expect(d.blocks.some((b) => b.role === 'closing')).toBe(false);
  });

  it('texto de uma linha só não quebra', () => {
    expect(decompose('Obrigado.').blocks).toEqual([]);
    expect(decompose('').blocks).toEqual([]);
  });
});

describe('ingestTexts', () => {
  const ledger = () => emptyLedger('2026-10-01');

  it('acumula contagens por tipo, sem guardar o texto original', () => {
    const { ledger: l, report } = ingestTexts(ledger(), [
      { text: TEXT, type: 'request_information' },
      { text: TEXT.replace('Carlos', 'Maria'), type: 'request_information' },
    ], DEFAULT_PROFILE, NOW);
    expect(report).toMatchObject({ accepted: 2, rejected: [] });
    const t = l.byType.request_information;
    expect(t?.texts).toBe(2);
    expect(t?.blocks.find((b) => b.role === 'closing')).toEqual({ role: 'closing', text: 'Ficamos no aguardo.', count: 2 });
    expect(t?.labels).toEqual([{ text: 'Resumo da situação', count: 2 }]);
    expect(JSON.stringify(l)).not.toMatch(/Carlos|Maria|impressora|20\/10/);
    expect(l.updatedAt).toBe('2026-11-04');
    expect(l.since).toBe('2026-11-04');
  });

  it('é contínuo: textos novos somam ao que já estava, e o registro anterior não é alterado', () => {
    const first = ingestTexts(ledger(), [{ text: TEXT, type: 'request_information' }], DEFAULT_PROFILE, NOW).ledger;
    const snapshot = JSON.stringify(first);
    const second = ingestTexts(first, [{ text: TEXT, type: 'request_information' }, { text: TEXT, type: 'pending' }], DEFAULT_PROFILE, NOW).ledger;
    expect(JSON.stringify(first)).toBe(snapshot);
    expect(second.byType.request_information?.texts).toBe(2);
    expect(second.byType.pending?.texts).toBe(1);
  });

  it('recusa o texto inteiro quando há dado sensível, dizendo o motivo, e não conta o texto', () => {
    const { ledger: l, report } = ingestTexts(ledger(), [
      { text: 'Olá, Ana,\n\nEscreva para fulano@empresa.com.br com a captura.\n\nObrigado.', type: 'pending' },
      { text: 'Olá, Ana,\n\nSua senha: Teste@12345 foi redefinida.\n\nObrigado.', type: 'pending' },
    ], DEFAULT_PROFILE, NOW);
    expect(report.accepted).toBe(0);
    expect(report.rejected).toHaveLength(2);
    expect(report.rejected[0].reason).toMatch(/dado sensível/);
    expect(l.byType.pending).toBeUndefined();
  });

  it('descarta trecho com solução afirmada ou prazo concreto sem derrubar o resto', () => {
    const { ledger: l, report } = ingestTexts(ledger(), [
      { text: 'Olá, Ana,\n\nO problema foi resolvido definitivamente.\n\nObrigado.', type: 'request_information' },
    ], DEFAULT_PROFILE, NOW);
    expect(report.accepted).toBe(1);
    expect(report.discarded).toBeGreaterThan(0);
    expect(l.byType.request_information?.blocks.map((b) => b.text)).toEqual(['Obrigado.']);
  });

  it('texto grande demais é recusado', () => {
    const { report } = ingestTexts(ledger(), [{ text: 'a'.repeat(4001), type: 'pending' }], DEFAULT_PROFILE, NOW);
    expect(report.rejected[0].reason).toMatch(/4000/);
  });

  it('respeita os limites: poucos blocos ficam com os mais frequentes', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({ text: `Olá, A,\n\nPara a análise ${'x'.repeat(i + 1)} precisamos de dados.\n\nObrigado.`, type: 'pending' as const }));
    let l = ledger();
    for (let r = 0; r < 4; r++) l = ingestTexts(l, entries, DEFAULT_PROFILE, NOW).ledger;
    expect((l.byType.pending?.blocks.length ?? 0)).toBeLessThanOrEqual(80);
    expect(l.byType.pending?.blocks.find((b) => b.text === 'Obrigado.')?.count).toBe(160);
  });
});
