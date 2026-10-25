import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { applyTaughtStyle, sanitizeTaughtStyle } from '../config/taught-style';
import { generate } from '../domain/engine';
import { greetingBase, learnStyle, splitTexts, vetStyle } from '../domain/style-learn';
import { gen, NOW } from './helpers';

const t = (greeting: string, body: string, closing: string, signature: string): string => [greeting, '', body, '', closing, signature].join('\n');
const TEXTS = [
  t('Bom dia, Carlos,', 'Precisamos da captura de tela do erro.', 'Ficamos no aguardo.', 'Time de Suporte ao Colaborador'),
  t('Bom dia, Maria,', 'O acesso foi liberado após a aprovação.', 'Ficamos no aguardo.', 'Time de Suporte ao Colaborador'),
  t('Bom dia, João,', 'Seguimos com a análise da lentidão.', 'Ficamos no aguardo.', 'Time de Suporte ao Colaborador'),
  t('Boa tarde, Ana,', 'Aguardamos o retorno com o modelo do equipamento.', 'Qualquer dúvida, é só responder.', 'Time de Suporte ao Colaborador'),
];

describe('greetingBase', () => {
  it.each([
    ['Bom dia, Maria!', 'Bom dia, {nome},'], ['Olá, Carlos Silva,', 'Olá, {nome},'], ['Prezado Roberto,', 'Prezado {nome},'], ['Oi', 'Oi,'],
    ['Olá, equipe,', 'Olá, equipe,'], ['Prezados,', 'Prezados,'], ['Olá, senhor Paulo,', 'Olá, senhor Paulo,'],
  ])('"%s" vira "%s"', (line, base) => expect(greetingBase(line)).toBe(base));

  it.each(['Segue o resumo do atendimento de hoje', 'Resumo:', ''])('"%s" não é saudação', (line) => expect(greetingBase(line)).toBeUndefined());
});

describe('learnStyle', () => {
  it('encontra saudação, fecho e assinatura que se repetem, com a evidência', () => {
    const p = learnStyle(TEXTS);
    expect(p.texts).toBe(4);
    expect(p.greeting).toEqual({ value: 'Bom dia, {nome},', count: 3 });
    expect(p.closing).toEqual({ value: 'Ficamos no aguardo.', count: 3 });
    expect(p.signature).toEqual({ value: 'Time de Suporte ao Colaborador', count: 4 });
  });

  it('exige ao menos 3 textos e repetição em metade deles', () => {
    expect(learnStyle(TEXTS.slice(0, 2))).toEqual({ texts: 2 });
    const mixed = [
      t('Olá, A,', 'Corpo um.', 'Fecho 1.', 'Assinatura 1'),
      t('Prezado B,', 'Corpo dois.', 'Fecho 2.', 'Assinatura 2'),
      t('Bom dia, C,', 'Corpo três.', 'Fecho 3.', 'Assinatura 3'),
      t('Boa tarde, D,', 'Corpo quatro.', 'Fecho 4.', 'Assinatura 4'),
    ];
    const p = learnStyle(mixed);
    expect(p.greeting ?? p.closing ?? p.signature).toBeUndefined();
  });

  it('o que aparece em um texto só (nome, assunto) nunca vira estilo', () => {
    const p = learnStyle([
      t('Olá, Carlos,', 'Texto A.', 'Obrigado.', 'Equipe X'),
      t('Olá, Maria,', 'Texto B.', 'Obrigado.', 'Equipe X'),
      t('Olá, Ana,', 'Texto C com chamado 123456.', 'Obrigado.', 'Equipe X'),
    ]);
    expect(JSON.stringify(p)).not.toMatch(/Carlos|Maria|Ana|123456/);
  });

  it('separa textos por linha de três hifens e ignora vazios', () => {
    expect(splitTexts('a\n---\n\n---\nb\n----\nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('vetStyle e sanitizeTaughtStyle', () => {
  it('recusa dado sensível, termo proibido, chave, link e quebra de linha', () => {
    expect(vetStyle({ signature: 'Fale com suporte@empresa.com.br' }, DEFAULT_PROFILE).ok).toBe(false);
    expect(vetStyle({ closing: 'Isso é um macete' }, { ...DEFAULT_PROFILE, forbiddenTerms: ['macete'] }).ok).toBe(false);
    expect(vetStyle({ greeting: 'Olá, {apelido},' }, DEFAULT_PROFILE).ok).toBe(false);
    expect(vetStyle({ closing: 'Obrigado, {nome}.' }, DEFAULT_PROFILE).ok).toBe(false);
    expect(vetStyle({ greeting: 'Olá, {nome},' }, DEFAULT_PROFILE).ok).toBe(true);
    expect(vetStyle({ closing: 'Veja https://x.com' }, DEFAULT_PROFILE).ok).toBe(false);
    expect(vetStyle({ greeting: 'Bom dia,' }, DEFAULT_PROFILE).ok).toBe(true);
  });

  it('o armazenamento só devolve as três linhas e destinatários válidos', () => {
    expect(sanitizeTaughtStyle({ version: 1, greeting: 'Bom dia,', evil: '<b>', recipients: ['user', 'xx'] })).toEqual({
      version: 1, greeting: 'Bom dia,', recipients: ['user'],
    });
    expect(sanitizeTaughtStyle({ version: 1, greeting: '<script>', closing: 'a\nb' })).toBeNull();
    expect(sanitizeTaughtStyle({ version: 2, greeting: 'Bom dia,' })).toBeNull();
    expect(sanitizeTaughtStyle('x')).toBeNull();
    expect(sanitizeTaughtStyle({ version: 1, greeting: 'Bom dia, {nome},' })).toEqual({ version: 1, greeting: 'Bom dia, {nome},' });
    expect(sanitizeTaughtStyle({ version: 1, greeting: 'Bom dia, {x},' })).toBeNull();
    expect(sanitizeTaughtStyle({ version: 1, signature: 'Equipe {nome}' })).toBeNull();
  });
});

describe('applyTaughtStyle no motor', () => {
  const style = { version: 1 as const, greeting: 'Bom dia, {nome},', closing: 'Ficamos no aguardo.', signature: 'Time de Suporte ao Colaborador' };
  const ctx = { summary: 'Erro ao abrir a planilha.', questions: ['Qual mensagem de erro aparece na tela?'], requesterName: 'Carlos' };

  it('saudação com nome, fecho e assinatura ensinados saem no texto', () => {
    const profile = applyTaughtStyle(DEFAULT_PROFILE, style);
    const text = gen('request_information', ctx, { variant: 0 }, profile).text;
    expect(text.startsWith('Bom dia, Carlos,')).toBe(true);
    expect(text).not.toContain('{nome}');
    expect(text).toContain('Ficamos no aguardo.');
    expect(text.trimEnd().endsWith('Time de Suporte ao Colaborador')).toBe(true);
    expect(text).not.toContain('Equipe de Service Desk');
  });

  it('sem nome informado a saudação fica sem nome, e o perfil original não é alterado', () => {
    const profile = applyTaughtStyle(DEFAULT_PROFILE, style);
    const text = generate({ settings: { type: 'request_information', recipient: 'user', techLevel: 'balanced', formality: 'cordial', length: 'standard', variant: 0 }, context: { ...ctx, requesterName: '' } }, profile, { now: NOW }).text;
    expect(text.startsWith('Bom dia,\n')).toBe(true);
    expect(DEFAULT_PROFILE.signature).toBe('Equipe de Service Desk');
    expect(DEFAULT_PROFILE.greetings.cordial.user).toBe('Olá,');
  });

  it('estilo estruturado não mostra o marcador do nome', () => {
    const profile = applyTaughtStyle(DEFAULT_PROFILE, style);
    const text = gen('request_information', ctx, { style: 'structured' } as never, profile).text;
    expect(text.startsWith('Bom dia,\n')).toBe(true);
    expect(text).not.toContain('{nome}');
  });

  it('a saudação vale só para o destinatário escolhido', () => {
    const profile = applyTaughtStyle(DEFAULT_PROFILE, { ...style, recipients: ['manager'] });
    expect(profile.greetings.formal.manager).toBe('Bom dia, {nome},');
    expect(profile.greetings.cordial.user).toBe('Olá,');
  });

  it('sem estilo, devolve o mesmo perfil; os alertas e termos proibidos continuam valendo', () => {
    expect(applyTaughtStyle(DEFAULT_PROFILE, null)).toBe(DEFAULT_PROFILE);
    const profile = applyTaughtStyle({ ...DEFAULT_PROFILE, forbiddenTerms: ['aguardo'] }, style);
    expect(profile.forbiddenTerms).toEqual(['aguardo']);
    expect(gen('request_information', ctx, {}, profile).warnings.map((w) => w.code)).toContain('forbidden_term');
  });
});
