import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalProvider } from '../application/provider';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { validateLibrary } from '../config/library-schema';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { MemoryArea } from './memory-storage';
import { NOW } from './helpers';

afterEach(() => cleanup());

const parsed = validateLibrary(JSON.parse(readFileSync('examples/biblioteca-exemplo.json', 'utf8')));
if (!parsed.ok) throw new Error('exemplo inválido');
const LIBRARY = parsed.library;

function setup(prefs: Record<string, unknown> = {}, withLibrary = true) {
  const local = new MemoryArea({ preferences: prefs, ...(withLibrary ? { modelLibrary: LIBRARY } : {}) });
  const copy = vi.fn(async () => true);
  const user = userEvent.setup();
  render(<App storage={new AppStorage(local, new MemoryArea())} copy={copy} now={() => NOW} loadUsage={async () => 'optional'} />);
  return { local, user, copy };
}

const search = () => screen.findByLabelText('Buscar modelo');
const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByText('Buscar um modelo pronto da instituição (opcional)'));
  return search();
};
const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
const preview = () => screen.getByLabelText('Prévia editável') as HTMLTextAreaElement;
const counts = (local: MemoryArea) => (local.data.usageCounters as { counts: Record<string, number> } | undefined)?.counts ?? {};

describe('buscar modelo na tela', () => {
  it('sem biblioteca, a busca não aparece', async () => {
    setup({}, false);
    await screen.findByLabelText('Tipo de comunicação');
    expect(screen.queryByText('Buscar um modelo pronto da instituição (opcional)')).toBeNull();
  });

  it('busca, mostra até 3 opções e escolher leva o texto à prévia editável sem copiar', async () => {
    const { user, copy } = setup();
    const box = await openPicker(user);
    await user.type(box, 'captura da tela do erro');
    const list = await screen.findByRole('list', { name: 'Modelos encontrados' });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items[0].textContent).toMatch(/Pedir captura de tela do erro/);
    await user.click(screen.getByRole('button', { name: 'Usar o modelo: Pedir captura de tela do erro' }));
    expect(preview().value).toContain('envie uma captura de tela com a mensagem completa');
    expect(copy).not.toHaveBeenCalled();
    expect(live()).toMatch(/Modelo "Pedir captura de tela do erro" na prévia\. Revise e edite antes de copiar/);
    expect(preview()).toHaveFocus();
    // O texto é editável como qualquer prévia.
    fireEvent.change(preview(), { target: { value: `${preview().value} Obrigado.` } });
    expect(preview().value).toMatch(/Obrigado\.$/);
  });

  it('com o campo vazio não lista modelo nenhum e orienta a digitar', async () => {
    const { user } = setup();
    await openPicker(user);
    expect(screen.queryByRole('list', { name: 'Modelos encontrados' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Usar o modelo/ })).toBeNull();
    expect(screen.getByText('Digite o que você precisa dizer para buscar.')).toBeInTheDocument();
  });

  it('library.shown conta uma vez por busca: mexer no formulário ou na consulta não recontam, e usar nunca passa de exibir', async () => {
    const { user, local } = setup({ usageCounters: true });
    const box = await openPicker(user);
    await user.type(box, 'captura de tela');
    await waitFor(() => expect(counts(local)['library.shown']).toBe(1));
    // Renderiza o pai de novo e muda a consulta mantendo resultados.
    fireEvent.change(screen.getByLabelText(/Por que a informação é necessária/), { target: { value: 'Erro ao abrir o sistema.' } });
    await user.type(box, ' do erro');
    await new Promise((r) => setTimeout(r, 30));
    expect(counts(local)['library.shown']).toBe(1);
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Pedir captura/ }));
    await waitFor(() => expect(counts(local)['library.used']).toBe(1));
    expect(counts(local)['library.used']).toBeLessThanOrEqual(counts(local)['library.shown']);
    // Nova busca depois de escolher volta a contar.
    await user.click(screen.getByText('Buscar um modelo pronto da instituição (opcional)'));
    await user.type(await search(), 'captura de tela');
    await waitFor(() => expect(counts(local)['library.shown']).toBe(2));
  });

  it('Enter no campo de busca não gera a prévia', async () => {
    const { user } = setup();
    const box = await openPicker(user);
    await user.type(box, 'senha{Enter}');
    expect(screen.queryByLabelText('Prévia editável')).toBeNull();
  });

  it('preenche nome, prazo e equipe com o que foi informado; o resto fica pendente e impede a cópia', async () => {
    const { user, copy } = setup();
    fireEvent.change(await screen.findByLabelText('Tipo de comunicação'), { target: { value: 'redirect_or_escalate' } });
    fireEvent.change(screen.getByLabelText('Destinatário'), { target: { value: 'technical_team' } });
    fireEvent.change(screen.getByLabelText(/Equipe de destino/), { target: { value: 'Infraestrutura' } });
    const box = await openPicker(user);
    await user.type(box, 'encaminhar para outra equipe');
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Encaminhar o chamado a outra equipe/ }));
    expect(preview().value).toBe('Encaminhamos {chamado} para Infraestrutura, pois a análise exige acesso administrativo ao servidor.');
    expect(screen.getByText(/Faltam campos entre chaves: \{chamado\}/)).toBeInTheDocument();
    const copyButton = screen.getByRole('button', { name: 'Copiar texto' });
    expect(copyButton).toBeDisabled();
    expect(live()).toMatch(/Preencha os campos \{chamado\} antes de copiar/);
    fireEvent.change(preview(), { target: { value: preview().value.replace('{chamado}', 'este chamado') } });
    expect(screen.queryByText(/Faltam campos entre chaves/)).toBeNull();
    expect(copyButton).toBeEnabled();
    await user.click(copyButton);
    expect(copy).toHaveBeenCalledWith('Encaminhamos este chamado para Infraestrutura, pois a análise exige acesso administrativo ao servidor.');
  });

  it('a prévia do modelo passa pela revisão e não oferece "outra variação"', async () => {
    const { user } = setup();
    const box = await openPicker(user);
    await user.type(box, 'captura de tela');
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Pedir captura/ }));
    expect(screen.queryByRole('button', { name: 'Outra variação' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Revisar novamente' })).toBeInTheDocument();
    expect(screen.getByText(/Motor biblioteca-de-modelos/)).toBeInTheDocument();
    // Se o analista colar algo que bloqueia a cópia, a revisão normal vale.
    fireEvent.change(preview(), { target: { value: 'Envie sua senha: Teste@12345 para validarmos.' } });
    expect(screen.getByRole('button', { name: 'Copiar texto' })).toBeDisabled();
  });

  it('"Nenhum destes" registra a busca sem modelo e limpa o campo', async () => {
    const { local, user } = setup({ usageCounters: true });
    const box = await openPicker(user);
    await user.type(box, 'assunto que nao existe na biblioteca');
    await user.click(await screen.findByRole('button', { name: 'Nenhum destes' }));
    expect((box as HTMLInputElement).value).toBe('');
    expect(live()).toMatch(/Nenhum modelo escolhido/);
    await waitFor(() => expect(counts(local)['library.none']).toBe(1));
  });

  it('contadores: lista exibida uma vez por busca e modelo usado; nunca o texto', async () => {
    const { local, user } = setup({ usageCounters: true });
    const box = await openPicker(user);
    await user.type(box, 'captura de tela do erro');
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Pedir captura/ }));
    await waitFor(() => expect(counts(local)['library.used']).toBe(1));
    expect(counts(local)['library.shown']).toBe(1);
    expect(JSON.stringify(local.data.usageCounters)).not.toMatch(/captura|erro|modelo/i);
  });

  it('sem os contadores ligados, nada é gravado', async () => {
    const { local, user } = setup();
    const box = await openPicker(user);
    await user.type(box, 'captura de tela');
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Pedir captura/ }));
    expect(local.data.usageCounters).toBeUndefined();
  });

  it('o texto do modelo some com "Limpar tudo" como qualquer prévia', async () => {
    const { user } = setup();
    const box = await openPicker(user);
    await user.type(box, 'captura de tela');
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Pedir captura/ }));
    await user.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    await user.click(screen.getByRole('button', { name: 'Apagar agora' }));
    expect(screen.queryByLabelText('Prévia editável')).toBeNull();
  });

  it('sem violações de acessibilidade (axe) com resultados e com a prévia do modelo', async () => {
    const { user } = setup();
    const box = await openPicker(user);
    await user.type(box, 'captura de tela');
    await screen.findByRole('list', { name: 'Modelos encontrados' });
    const run = () => axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect((await run()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await user.click(screen.getAllByRole('button', { name: /^Usar o modelo:/ })[0]);
    expect((await run()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  it('restaurar o perfil padrão mantém a biblioteca guardada e a busca na tela', async () => {
    const local = new MemoryArea({ languageProfile: { ...DEFAULT_PROFILE, organizationName: 'Org' }, modelLibrary: LIBRARY });
    const user = userEvent.setup();
    render(<App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} loadUsage={async () => 'optional'} />);
    await user.click(await screen.findByRole('button', { name: 'Configurações' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurar perfil padrão' }));
    expect(await screen.findByText(/padrão da extensão/)).toBeInTheDocument();
    expect(local.data.modelLibrary).toEqual(LIBRARY);
    expect(local.data.languageProfile).toBeUndefined();
  });

  it('escolher um modelo enquanto uma geração está em andamento mantém o modelo', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const local = new MemoryArea({ modelLibrary: LIBRARY });
    const user = userEvent.setup();
    const slow = {
      id: new LocalProvider().id,
      kind: new LocalProvider().kind,
      generate: async (request: Parameters<LocalProvider['generate']>[0]) => {
        await gate;
        return new LocalProvider().generate(request);
      },
    };
    render(
      <App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} loadUsage={async () => 'optional'} providerFactory={() => slow} />,
    );
    fireEvent.change(await screen.findByLabelText('Tipo de comunicação'), { target: { value: 'request_information' } });
    fireEvent.change(screen.getByLabelText(/Por que a informação é necessária/), { target: { value: 'Erro ao abrir o sistema.' } });
    fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual mensagem de erro aparece na tela' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    const box = await openPicker(user);
    await user.type(box, 'captura de tela');
    await user.click(await screen.findByRole('button', { name: /Usar o modelo: Pedir captura/ }));
    const chosen = preview().value;
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(preview().value).toBe(chosen);
    expect(screen.getByText(/Motor biblioteca-de-modelos/)).toBeInTheDocument();
  });

  it('biblioteca guardada que não passa mais nas regras atuais não é usada, e a tela diz por quê', async () => {
    const local = new MemoryArea({
      modelLibrary: LIBRARY,
      profileOverlay: { schemaVersion: 1, overlayName: 'Equipe', forbiddenTerms: ['captura'] },
    });
    const user = userEvent.setup();
    render(<App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} loadUsage={async () => 'optional'} />);
    await screen.findByLabelText('Tipo de comunicação');
    await waitFor(() => expect(screen.queryByText('Buscar um modelo pronto da instituição (opcional)')).toBeNull());
    await user.click(await screen.findByRole('button', { name: 'Configurações' }));
    expect(await screen.findByText(/A biblioteca guardada não está em uso: \d+ modelo\(s\) não passam mais nas regras atuais/)).toBeInTheDocument();
    // O arquivo guardado não é apagado: o curador pode revisar e importar de novo.
    expect(local.data.modelLibrary).toEqual(LIBRARY);
  });
});
