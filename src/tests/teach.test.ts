import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { buildTaughtModel, prepareTaught, TAUGHT_ID_PREFIX } from '../domain/teach';

const NOW = new Date('2026-10-23T12:00:00');
const build = (over: Partial<Parameters<typeof buildTaughtModel>[0]> = {}, ids: string[] = []) =>
  buildTaughtModel(
    { title: 'Pedir captura', text: 'Para analisarmos o problema, envie uma captura de tela do erro.', type: 'request_information', recipient: 'user', ...over },
    ids,
    DEFAULT_PROFILE,
    NOW,
  );

describe('prepareTaught: o que vira campo', () => {
  it('troca o nome da saudação e mostra a troca', () => {
    const d = prepareTaught('Olá, Carlos Silva,\n\nSeguimos com a análise.');
    expect(d.text).toBe('Olá, {nome},\n\nSeguimos com a análise.');
    expect(d.substitutions).toEqual([{ field: 'nome', original: 'Carlos Silva' }]);
  });

  it.each(['Prezado Roberto,', 'Bom dia, Maria!', 'Oi Ana,'])('reconhece a saudação "%s"', (g) => {
    expect(prepareTaught(`${g}\nTexto.`).text).toMatch(/^.*\{nome\}/);
  });

  it.each(['Prezado senhor,', 'Olá, equipe,', 'Bom dia, pessoal!', 'Olá,', 'Prezado(a),', 'Bom dia'])('não troca "%s"', (g) => {
    expect(prepareTaught(`${g}\nTexto.`).text).not.toContain('{nome}');
  });

  it('troca número de chamado em duas formas', () => {
    const d = prepareTaught('Sobre o chamado 123456 e também INC0012345, seguimos.');
    expect(d.text).toBe('Sobre o {chamado} e também {chamado}, seguimos.');
    expect(d.substitutions.map((s) => s.field)).toEqual(['chamado', 'chamado']);
  });

  it('separa prazo (depois de "até" ou "prazo") de data comum', () => {
    const d = prepareTaught('Responda até 20/10/2026 às 17h. Abrimos o chamado em 15/10.');
    expect(d.text).toBe('Responda até {prazo}. Abrimos o {chamado} em {data}.'.replace('{chamado}', 'chamado'));
    expect(d.substitutions.map((s) => s.field)).toEqual(['prazo', 'data']);
  });

  it('troca o nome da equipe de destino, mas não a assinatura "Equipe de ..."', () => {
    const d = prepareTaught('Encaminhamos para a equipe de Infraestrutura.\n\nEquipe de Service Desk');
    expect(d.text).toBe('Encaminhamos para a equipe de {equipe}.\n\nEquipe de Service Desk');
  });

  it('texto sem nada variável volta igual e sem trocas', () => {
    const t = 'Para analisarmos o problema, envie uma captura de tela do erro.';
    expect(prepareTaught(t)).toEqual({ text: t, substitutions: [] });
  });

  it('unifica quebras de linha e aparas', () => {
    expect(prepareTaught('  linha 1\r\nlinha 2  ').text).toBe('linha 1\nlinha 2');
  });
});

describe('buildTaughtModel: o que pode ser guardado', () => {
  it('monta o modelo com id próprio, tipo, destinatário e data', () => {
    const r = build();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model).toMatchObject({
      id: `${TAUGHT_ID_PREFIX}pedir-captura`, types: ['request_information'], recipients: ['user'], keywords: [], reviewedAt: '2026-10-23',
    });
  });

  it('"qualquer destinatário" guarda lista vazia e id repetido ganha sufixo', () => {
    const r = build({ recipient: 'any' }, [`${TAUGHT_ID_PREFIX}pedir-captura`]);
    expect(r.ok && r.model.recipients).toEqual([]);
    expect(r.ok && r.model.id).toBe(`${TAUGHT_ID_PREFIX}pedir-captura-2`);
  });

  it('recusa título vazio e texto vazio', () => {
    expect(build({ title: ' ' })).toMatchObject({ ok: false });
    expect(build({ text: ' ' })).toMatchObject({ ok: false });
  });

  it.each([
    ['e-mail', 'Escreva para fulano@empresa.com.br com a captura.'],
    ['credencial', 'Sua senha: Teste@12345 foi redefinida.'],
    ['link', 'Acesse https://exemplo.com para continuar.'],
    ['solução afirmada', 'Problema resolvido, pode fechar o chamado.'],
  ])('recusa %s', (_n, text) => {
    const r = build({ text });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it('recusa campo que não existe e chaves soltas', () => {
    expect(build({ text: 'Olá, {apelido}, tudo bem?' }).ok).toBe(false);
    expect(build({ text: 'Olá, {nome, tudo bem?' }).ok).toBe(false);
  });

  it('aceita os campos da lista fechada', () => {
    expect(build({ text: 'Olá, {nome}. Encaminhamos {chamado} para {equipe} até {prazo}.' }).ok).toBe(true);
  });

  it('respeita o limite de modelos ensinados', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `${TAUGHT_ID_PREFIX}m${i}`);
    expect(build({}, ids).ok).toBe(false);
  });
});
