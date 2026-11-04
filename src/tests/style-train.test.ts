import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { emptyLedger } from '../config/learning-ledger';
import { DEFAULT_OPENINGS } from '../config/templates';
import type { Ledger } from '../config/learning-ledger';
import { matchLabelKey } from '../config/label-synonyms';
import { applyTrainedStyle, sanitizeTrainedStyle } from '../config/trained-style';
import { generate } from '../domain/engine';
import { ingestTexts } from '../domain/style-corpus';
import { composeFromBlocks } from '../domain/style-compose';
import { approveItems, proposeTraining, toEngineText } from '../domain/style-train';
import type { CommunicationType } from '../domain/types';
import { NOW } from './helpers';

const day = new Date('2026-11-04T12:00:00');
const text = (who: string, opening: string, closing = 'Ficamos no aguardo.') =>
  [`Olá, ${who},`, '', opening, '', 'Em aberto: item do chamado.', '', 'Envie uma captura de tela do erro, por favor.', '', closing, 'Time de Suporte'].join('\n');
const OPEN = 'Precisamos de uma informação sua para seguir com o atendimento.';

const learned = (entries: (string | { text: string; type?: CommunicationType })[]): Ledger =>
  ingestTexts(
    emptyLedger('2026-10-01'),
    entries.map((e) => (typeof e === 'string' ? { text: e, type: 'request_information' as const } : { text: e.text, type: e.type ?? 'request_information' })),
    DEFAULT_PROFILE,
    day,
  ).ledger;

describe('matchLabelKey', () => {
  it.each([
    ['Pendência', 'pending'], ['Pendente com', 'depends_on'], ['O que foi feito', 'actions_done'], ['Próximos passos', 'actions_planned'],
    ['Prazo', 'deadline'], ['Motivo do encaminhamento', 'reason'], ['Motivo da solicitação', 'justification'], ['Evidências', 'evidence'],
  ])('"%s" corresponde a %s', (label, key) => expect(matchLabelKey(label)).toBe(key));

  it.each(['Bom dia', 'Sobre o seu chamado', ''])('"%s" não corresponde a nenhum rótulo', (label) => expect(matchLabelKey(label)).toBeUndefined());
});

describe('proposeTraining (opção A)', () => {
  it('propõe abertura, fecho e rótulo que se repetem, com a evidência', () => {
    const ledger = learned([text('Ana', OPEN), text('Beto', OPEN), text('Caio', OPEN), text('Dora', 'Seguimos com a análise.')]);
    const p = proposeTraining(ledger, DEFAULT_PROFILE);
    const byId = Object.fromEntries(p.items.map((i) => [i.id, i]));
    expect(byId['opening:request_information']).toMatchObject({ text: OPEN, count: 3, of: 4 });
    expect(byId['closing:request_information']).toMatchObject({ text: 'Ficamos no aguardo.', count: 4, of: 4 });
    expect(byId['label:pending']).toMatchObject({ text: 'Em aberto', count: 4 });
    expect(p.newSinceLast).toBe(4);
  });

  it('exige 3 textos no tipo e metade de repetição; a tela diz por quê', () => {
    expect(proposeTraining(learned([text('A', OPEN), text('B', OPEN)]), DEFAULT_PROFILE).items).toEqual([]);
    const mixed = learned(['Um começo.', 'Outro começo.', 'Mais um começo.', 'Último começo.'].map((o) => ({ text: text('X', o, 'Fecho único ' + o) })));
    const p = proposeTraining(mixed, DEFAULT_PROFILE);
    expect(p.items.some((i) => i.kind === 'opening' || i.kind === 'closing')).toBe(false);
    expect(p.notes.join(' ')).toMatch(/metade/);
  });

  it('não propõe o que já é o padrão', () => {
    const standard = DEFAULT_OPENINGS.request_information.cordial[0];
    const ledger = learned([text('A', standard), text('B', standard), text('C', standard)]);
    expect(proposeTraining(ledger, DEFAULT_PROFILE).items.some((i) => i.kind === 'opening')).toBe(false);
  });

  it('recusa o que passou a violar as regras em vigor', () => {
    const ledger = learned([text('A', OPEN), text('B', OPEN), text('C', OPEN)]);
    const p = proposeTraining(ledger, { ...DEFAULT_PROFILE, forbiddenTerms: ['atendimento'] });
    expect(p.items.some((i) => i.kind === 'opening')).toBe(false);
    expect(p.notes.join(' ')).toMatch(/não passa nas regras atuais/);
  });

  it('abertura com campo que o motor não conhece fica só para a montagem por trechos', () => {
    expect(toEngineText('Sobre {chamado}, seguimos.')).toBeUndefined();
    expect(toEngineText('Encaminhamos para {equipe}.')).toBe('Encaminhamos para {destination}.');
    const ledger = learned(['Sobre {chamado}, precisamos de dados.', 'Sobre {chamado}, precisamos de dados.', 'Sobre {chamado}, precisamos de dados.'].map((o) => ({ text: text('A', o).replace('Olá, A,', 'Olá, Ana,') })));
    const p = proposeTraining(ledger, DEFAULT_PROFILE);
    expect(p.items.some((i) => i.kind === 'opening')).toBe(false);
  });
});

describe('aprovação e aplicação no perfil', () => {
  const ledger = learned([text('A', OPEN), text('B', OPEN), text('C', OPEN)]);
  const proposal = proposeTraining(ledger, DEFAULT_PROFILE);

  it('só entra o que o analista aprova, e o aprovado anterior é mantido', () => {
    const first = approveItems(proposal, ['opening:request_information'], null);
    expect(first).toEqual({ version: 1, openings: { request_information: OPEN } });
    const second = approveItems(proposal, ['closing:request_information'], first);
    expect(second?.openings?.request_information).toBe(OPEN);
    expect(second?.closings?.request_information).toBe('Ficamos no aguardo.');
    expect(approveItems(proposal, [], null)).toBeNull();
  });

  it('abertura e fecho aprendidos viram a primeira opção do tipo e as padrão seguem como variação', () => {
    const trained = approveItems(proposal, proposal.items.map((i) => i.id), null);
    const profile = applyTrainedStyle(DEFAULT_PROFILE, trained);
    const ctx = { summary: 'Erro ao abrir a planilha.', questions: ['Qual mensagem de erro aparece na tela?'] };
    const settings = { type: 'request_information' as const, recipient: 'user' as const, techLevel: 'balanced' as const, formality: 'cordial' as const, length: 'standard' as const };
    const v0 = generate({ settings: { ...settings, variant: 0 }, context: ctx }, profile, { now: NOW }).text;
    expect(v0).toContain(OPEN);
    expect(v0).toContain('Ficamos no aguardo.');
    const others = [1, 2, 3, 4].map((variant) => generate({ settings: { ...settings, variant }, context: ctx }, profile, { now: NOW }).text);
    expect(others.some((t) => !t.includes(OPEN))).toBe(true);
    expect(DEFAULT_PROFILE.templates.openings).toBeUndefined();
  });

  it('o estilo treinado não muda alertas nem termos proibidos', () => {
    const trained = approveItems(proposal, proposal.items.map((i) => i.id), null);
    const profile = applyTrainedStyle({ ...DEFAULT_PROFILE, forbiddenTerms: ['planilha'] }, trained);
    expect(profile.forbiddenTerms).toEqual(['planilha']);
    expect(profile.requiredTexts).toEqual(DEFAULT_PROFILE.requiredTexts);
  });

  it('sanitizeTrainedStyle só aceita texto simples e chaves conhecidas', () => {
    expect(sanitizeTrainedStyle({ version: 1, openings: { pending: 'Registramos a pendência neste atendimento.' } })).not.toBeNull();
    expect(sanitizeTrainedStyle({ version: 1, openings: { pending: 'Veja https://x.com agora mesmo.' } })).toBeNull();
    expect(sanitizeTrainedStyle({ version: 1, openings: { pending: 'Sobre {chamado}, seguimos aqui.' } })).toBeNull();
    expect(sanitizeTrainedStyle({ version: 1, openings: { nao_e_tipo: 'Registramos a pendência neste atendimento.' } })).toBeNull();
    expect(sanitizeTrainedStyle({ version: 2, openings: { pending: 'Registramos a pendência neste atendimento.' } })).toBeNull();
    expect(sanitizeTrainedStyle({ version: 1, labels: { pending: 'Pendência', evil: 'x' } })).toEqual({ version: 1, labels: { pending: 'Pendência' } });
  });

  it('rótulo ensinado vale para todos os níveis técnicos', () => {
    const profile = applyTrainedStyle(DEFAULT_PROFILE, { version: 1, labels: { pending: 'Pendência registrada' } });
    expect(profile.templates.labels?.simple?.pending).toBe('Pendência registrada');
    expect(profile.templates.labels?.technical?.pending).toBe('Pendência registrada');
  });
});

describe('composeFromBlocks (opção B)', () => {
  const ledger = learned([
    text('A', OPEN), text('B', OPEN), text('C', 'Seguimos com a análise do seu caso.'),
  ]);
  const base = { ledger, type: 'request_information' as const, recipient: 'user' as const, formality: 'cordial' as const, profile: DEFAULT_PROFILE, query: '', values: { nome: 'Paula' } };

  it('monta saudação com o nome, abertura, pedido, fecho e assinatura, dizendo de onde veio cada parte', () => {
    const c = composeFromBlocks(base);
    expect(c).not.toBeNull();
    expect(c!.text.startsWith('Olá, Paula,\n\n')).toBe(true);
    expect(c!.text).toContain(OPEN);
    expect(c!.text).toContain('Envie uma captura de tela do erro, por favor.');
    expect(c!.text.endsWith('Ficamos no aguardo.\nEquipe de Service Desk')).toBe(true);
    expect(c!.parts.map((p) => `${p.role}:${p.origin}`)).toEqual(['greeting:perfil', 'opening:ensinado', 'request:ensinado', 'closing:ensinado', 'signature:perfil']);
    expect(c!.parts.find((p) => p.role === 'opening')?.count).toBe(2);
  });

  it('escolhe o trecho mais parecido com o que foi descrito e troca de combinação com a variante', () => {
    expect(composeFromBlocks({ ...base, query: 'seguimos análise do caso' })!.text).toContain('Seguimos com a análise do seu caso.');
    expect(composeFromBlocks({ ...base, query: '' })!.text).toContain(OPEN);
    const v1 = composeFromBlocks({ ...base, variant: 1 })!;
    expect(v1.text).toContain('Seguimos com a análise do seu caso.');
    expect(v1.options).toBeGreaterThan(1);
  });

  it('campos sem valor continuam entre chaves, para o analista preencher', () => {
    const l = learned([text('A', 'Encaminhamos {chamado} para a equipe.'), text('B', 'Encaminhamos {chamado} para a equipe.'), text('C', 'Encaminhamos {chamado} para a equipe.')].map((t) => t.replace(/Olá, \w,/, 'Olá, Ana,')));
    const c = composeFromBlocks({ ...base, ledger: l });
    expect(c!.text).toContain('Encaminhamos {chamado} para a equipe.');
  });

  it('sem trechos do tipo não há montagem; trechos que deixaram de passar são ignorados', () => {
    expect(composeFromBlocks({ ...base, type: 'pending' })).toBeNull();
    expect(composeFromBlocks({ ...base, usable: () => false })).toBeNull();
    const only = composeFromBlocks({ ...base, usable: (b) => b.role !== 'closing' });
    expect(only!.parts.find((p) => p.role === 'closing')?.origin).toBe('perfil');
  });
});
