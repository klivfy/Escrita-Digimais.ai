import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { NOW } from './helpers';
import { MemoryArea } from './memory-storage';

afterEach(() => cleanup());

const REAL_TEXT = [
  'Olá, Carlos Silva,',
  '',
  'Sobre o chamado 123456, precisamos de uma informação para seguir com a análise.',
  'Envie uma captura de tela do erro até 20/10/2026 às 17h.',
  '',
  'Equipe de Service Desk',
].join('\n');

function setup(initial: Record<string, unknown> = {}) {
  const local = new MemoryArea(initial);
  const user = userEvent.setup();
  const copy = vi.fn(async () => true);
  render(<App storage={new AppStorage(local, new MemoryArea())} copy={copy} now={() => NOW} loadUsage={async () => 'optional'} />);
  return { local, user, copy };
}

const openTeach = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: 'Ensinar' }));
const pasteAndPrepare = async (user: ReturnType<typeof userEvent.setup>, text = REAL_TEXT) => {
  fireEvent.change(await screen.findByLabelText('Texto que a organização usa'), { target: { value: text } });
  await user.click(screen.getByRole('button', { name: 'Preparar modelo' }));
};
const taughtInStorage = (local: MemoryArea) => (local.data.taughtModels as { id: string; text: string }[] | undefined) ?? [];

describe('Ensinar a extensão', () => {
  it('nada é guardado até clicar em Salvar modelo; as trocas por campo aparecem na tela', async () => {
    const { local, user } = setup();
    await openTeach(user);
    await pasteAndPrepare(user);
    const model = (await screen.findByLabelText('Modelo (editável)')) as HTMLTextAreaElement;
    expect(model.value).toContain('Olá, {nome},');
    expect(model.value).toContain('Sobre o {chamado}, precisamos');
    expect(model.value).toContain('até {prazo}.');
    expect(model.value).toContain('Equipe de Service Desk');
    const trocas = screen.getByText(/Trocas feitas por campo/).closest('div') as HTMLElement;
    expect(within(trocas).getByText('Carlos Silva')).toBeInTheDocument();
    expect(within(trocas).getAllByText('{prazo}').length).toBeGreaterThan(0);
    expect(taughtInStorage(local)).toHaveLength(0);
  });

  it('salva só com título, guarda o texto já com campos e nunca o original com nome', async () => {
    const { local, user } = setup({ preferences: { usageCounters: true } });
    await openTeach(user);
    await pasteAndPrepare(user);
    await user.click(await screen.findByRole('button', { name: 'Salvar modelo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/O modelo não foi salvo/);
    expect(taughtInStorage(local)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Título do modelo'), { target: { value: 'Pedir captura do erro' } });
    await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));
    await waitFor(() => expect(taughtInStorage(local)).toHaveLength(1));
    const saved = taughtInStorage(local)[0];
    expect(saved.id).toBe('ensinado-pedir-captura-do-erro');
    expect(saved.text).toContain('{nome}');
    expect(JSON.stringify(local.data.taughtModels)).not.toMatch(/Carlos|123456/);
    expect(screen.getByRole('list', { name: 'Modelos ensinados' })).toHaveTextContent('Pedir captura do erro');
    // O texto colado some da tela depois de salvar.
    expect((screen.getByLabelText('Texto que a organização usa') as HTMLTextAreaElement).value).toBe('');
    await waitFor(() => expect((local.data.usageCounters as { counts: Record<string, number> }).counts['teach.saved']).toBe(1));
  });

  it('recusa salvar texto com dado sensível, com o motivo, e não guarda nada', async () => {
    const { local, user } = setup();
    await openTeach(user);
    await pasteAndPrepare(user, 'Olá, Ana,\nEscreva para fulano@empresa.com.br com a captura.');
    fireEvent.change(await screen.findByLabelText('Título do modelo'), { target: { value: 'Com e-mail' } });
    await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/dado sensível/i);
    expect(taughtInStorage(local)).toHaveLength(0);
  });

  it('remover um modelo e remover todos, com confirmação', async () => {
    const { local, user } = setup();
    await openTeach(user);
    for (const title of ['Primeiro', 'Segundo']) {
      await pasteAndPrepare(user, `Olá, Ana,\nPara analisarmos o caso (${title.length}), envie uma captura de tela do erro.`);
      fireEvent.change(await screen.findByLabelText('Título do modelo'), { target: { value: title } });
      await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));
      await waitFor(() => expect(screen.getByRole('list', { name: 'Modelos ensinados' })).toHaveTextContent(title));
    }
    await user.click(screen.getByRole('button', { name: 'Remover o modelo: Primeiro' }));
    await waitFor(() => expect(taughtInStorage(local).map((m) => m.id)).toEqual(['ensinado-segundo']));
    await user.click(screen.getByRole('button', { name: 'Remover todos' }));
    expect(taughtInStorage(local)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Confirmar: remover todos' }));
    await waitFor(() => expect(taughtInStorage(local)).toHaveLength(0));
  });

  it('o texto ensinado vira sugestão na geração, entra na prévia preenchido e nada é copiado sozinho', async () => {
    const { user, copy } = setup({
      taughtModels: [
        {
          id: 'ensinado-pedir-captura', title: 'Pedir captura do erro', types: ['request_information'], recipients: [],
          text: 'Olá, {nome},\n\nPara seguirmos com a análise do problema de impressão, envie uma captura de tela do erro até {prazo}.\n\nEquipe de Service Desk',
          keywords: [], reviewedAt: '2026-10-23',
        },
      ],
    });
    fireEvent.change(await screen.findByLabelText(/Por que a informação é necessária/), { target: { value: 'Usuário não consegue imprimir e precisa enviar captura do erro de impressão' } });
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/), { target: { value: 'Carlos' } });
    fireEvent.change(screen.getByLabelText(/Prazo \(somente se existir\)/), { target: { value: '20/10/2026 às 17h' } });
    expect(await screen.findByText(/1 parecido com o que você descreveu/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText(/Buscar um modelo pronto da instituição/));
    expect(screen.getByText(/ensinado por você/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar o modelo: Pedir captura do erro' }));
    const preview = screen.getByLabelText('Prévia editável') as HTMLTextAreaElement;
    expect(preview.value).toContain('Olá, Carlos,');
    expect(preview.value).toContain('até 20/10/2026 às 17h.');
    expect(copy).not.toHaveBeenCalled();
  });

  it('"Ensinar este texto à extensão" leva a prévia editada para a tela de ensinar', async () => {
    const { user } = setup();
    fireEvent.change(await screen.findByLabelText(/Por que a informação é necessária/), { target: { value: 'Erro ao abrir o sistema.' } });
    fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual mensagem de erro aparece na tela' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    const preview = (await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement;
    fireEvent.change(preview, { target: { value: 'Olá, Marina,\n\nEnvie a captura de tela do erro, por favor.' } });
    await user.click(screen.getByText('Mais ações'));
    await user.click(screen.getByRole('button', { name: 'Ensinar este texto à extensão' }));
    const model = (await screen.findByLabelText('Modelo (editável)')) as HTMLTextAreaElement;
    expect(model.value).toBe('Olá, {nome},\n\nEnvie a captura de tela do erro, por favor.');
  });

  describe('estilo da organização', () => {
    const post = (greet: string, who: string, body: string) =>
      [`${greet}, ${who},`, '', body, '', 'Ficamos no aguardo.', 'Time de Suporte ao Colaborador'].join('\n');
    const BATCH = [
      post('Bom dia', 'Carlos', 'Precisamos da captura de tela do erro.'),
      post('Bom dia', 'Maria', 'O acesso foi liberado após a aprovação.'),
      post('Bom dia', 'João', 'Seguimos com a análise da lentidão.'),
      post('Boa tarde', 'Ana', 'Aguardamos o retorno com o modelo do equipamento.'),
    ].join('\n---\n');

    const learn = async (user: ReturnType<typeof userEvent.setup>) => {
      await openTeach(user);
      fireEvent.change(await screen.findByLabelText('Textos da organização para aprender o estilo'), { target: { value: BATCH } });
      await user.click(screen.getByRole('button', { name: 'Analisar estilo' }));
    };

    it('propõe saudação, fecho e assinatura com a evidência, salva só com clique e passa a usar nas prévias', async () => {
      const { local, user } = setup();
      await learn(user);
      expect(await screen.findByText(/Usar saudação \(aparece em 3 de 4 textos\)/)).toBeInTheDocument();
      expect(screen.getByText(/Usar assinatura \(aparece em 4 de 4 textos\)/)).toBeInTheDocument();
      expect(local.data.taughtStyle).toBeUndefined();
      await user.click(screen.getByRole('button', { name: 'Salvar estilo' }));
      await waitFor(() => expect(local.data.taughtStyle).toMatchObject({ greeting: 'Bom dia, {nome},', closing: 'Ficamos no aguardo.', signature: 'Time de Suporte ao Colaborador' }));
      expect(JSON.stringify(local.data.taughtStyle)).not.toMatch(/Carlos|Maria|captura/);
      // A tela esquece os textos colados.
      expect((screen.getByLabelText('Textos da organização para aprender o estilo') as HTMLTextAreaElement).value).toBe('');
      // Próxima prévia usa o estilo ensinado.
      await user.click(screen.getByRole('button', { name: 'Gerar texto' }));
      fireEvent.change(await screen.findByLabelText(/Por que a informação é necessária/), { target: { value: 'Erro ao abrir o sistema.' } });
      fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual mensagem de erro aparece na tela' } });
      fireEvent.change(screen.getByLabelText(/Nome de quem recebe/), { target: { value: 'Paula' } });
      await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
      const preview = (await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement;
      expect(preview.value.startsWith('Bom dia, Paula,')).toBe(true);
      expect(preview.value).toContain('Time de Suporte ao Colaborador');
      expect(preview.value).not.toContain('Equipe de Service Desk');
    });

    it('poucos textos ou padrão que não se repete: avisa e não propõe nada', async () => {
      const { user } = setup();
      await openTeach(user);
      fireEvent.change(await screen.findByLabelText('Textos da organização para aprender o estilo'), { target: { value: post('Olá', 'A', 'Um.') } });
      await user.click(screen.getByRole('button', { name: 'Analisar estilo' }));
      expect((await screen.findAllByText(/São necessários pelo menos 3/)).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: 'Salvar estilo' })).toBeNull();
    });

    it('recusa salvar item com dado sensível, com o motivo', async () => {
      const { local, user } = setup();
      await learn(user);
      fireEvent.change(await screen.findByLabelText('Assinatura'), { target: { value: 'Fale com suporte@empresa.com.br' } });
      await user.click(screen.getByRole('button', { name: 'Salvar estilo' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/dado sensível/i);
      expect(local.data.taughtStyle).toBeUndefined();
    });

    it('remover o estilo ensinado volta ao padrão do perfil', async () => {
      const { local, user } = setup({ taughtStyle: { version: 1, signature: 'Time de Suporte ao Colaborador' } });
      await openTeach(user);
      expect(await screen.findByText(/Assinatura:/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remover estilo ensinado' }));
      await waitFor(() => expect(local.data.taughtStyle).toBeUndefined());
    });

    it('com perfil assinado exigido pela organização, o estilo pessoal fica desligado e não se aplica', async () => {
      const local = new MemoryArea({ taughtStyle: { version: 1, signature: 'Time de Suporte ao Colaborador' } });
      const user = userEvent.setup();
      render(
        <App
          storage={new AppStorage(local, new MemoryArea())}
          now={() => NOW}
          loadUsage={async () => 'optional'}
          loadKeys={async () => ['MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEexample']}
        />,
      );
      await openTeach(user);
      expect(await screen.findByText(/A organização controla saudação, fecho e assinatura/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Analisar estilo' })).toBeNull();
    });
  });
});
