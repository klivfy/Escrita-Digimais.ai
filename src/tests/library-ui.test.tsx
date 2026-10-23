import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { MemoryArea } from './memory-storage';
import { NOW } from './helpers';

afterEach(() => cleanup());

const EXAMPLE = readFileSync('examples/biblioteca-exemplo.json', 'utf8');
const file = (content: string) => new File([content], 'biblioteca.json', { type: 'application/json' });
const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: 'Configurações' }));

describe('biblioteca de modelos em Configurações', () => {
  it('importa, mostra o resumo, persiste ao reabrir e remove', async () => {
    const local = new MemoryArea();
    const make = () => <App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} />;
    const user = userEvent.setup();
    const view = render(make());
    await open(user);
    expect(screen.getByText('Nenhuma biblioteca importada.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Importar biblioteca de modelos (JSON)'), file(EXAMPLE));
    expect(await screen.findByText('Biblioteca importada e validada.')).toBeInTheDocument();
    expect(screen.getByText(/Biblioteca de exemplo/)).toBeInTheDocument();
    expect(screen.getByText(/versão/, { selector: 'p' }).textContent).toMatch(/2026\.10\.1.*7 modelos/);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/Biblioteca de modelos importada: 7 modelos/);

    view.unmount();
    render(make());
    await open(user);
    expect((await screen.findByText(/versão/, { selector: 'p' })).textContent).toMatch(/7 modelos/);

    await user.click(screen.getByRole('button', { name: 'Remover biblioteca' }));
    expect(await screen.findByText('Nenhuma biblioteca importada.')).toBeInTheDocument();
    expect(local.data.modelLibrary).toBeUndefined();
  });

  it('recusa a biblioteca inteira quando um modelo traz dado sensível e não grava nada', async () => {
    const local = new MemoryArea();
    const user = userEvent.setup();
    render(<App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} />);
    await open(user);
    const bad = JSON.parse(EXAMPLE) as { models: { text: string }[] };
    bad.models[0].text = 'Fale com maria.souza@exemplo.test sobre o acesso.';
    await user.upload(screen.getByLabelText('Importar biblioteca de modelos (JSON)'), file(JSON.stringify(bad)));
    const alert = await screen.findByText(/Importação da biblioteca recusada/);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/dado sensível no texto/, { selector: 'li' })).toBeInTheDocument();
    expect(local.data.modelLibrary).toBeUndefined();
    expect(screen.getByText('Nenhuma biblioteca importada.')).toBeInTheDocument();
  });

  it('com chaves de assinatura na política, recusa arquivo sem assinatura', async () => {
    const local = new MemoryArea();
    const user = userEvent.setup();
    const key = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' + 'A'.repeat(80);
    render(<App storage={new AppStorage(local, new MemoryArea())} loadKeys={async () => [key]} now={() => NOW} />);
    await open(user);
    expect(screen.getByText(/A organização exige biblioteca assinada/)).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Importar biblioteca de modelos (JSON)'), file(EXAMPLE));
    expect(await screen.findByText(/exige biblioteca assinada/, { selector: 'li' })).toBeInTheDocument();
    expect(local.data.modelLibrary).toBeUndefined();
  });

  it('"apagar dados salvos" remove a biblioteca da tela e do armazenamento', async () => {
    const local = new MemoryArea();
    const user = userEvent.setup();
    render(<App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} />);
    await open(user);
    await user.upload(screen.getByLabelText('Importar biblioteca de modelos (JSON)'), file(EXAMPLE));
    await screen.findByText('Biblioteca importada e validada.');
    await user.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    await user.click(screen.getByLabelText(/Apagar também preferências e perfil importado/));
    await user.click(screen.getByRole('button', { name: 'Apagar agora' }));
    expect(local.data.modelLibrary).toBeUndefined();
    expect(await screen.findByText('Nenhuma biblioteca importada.')).toBeInTheDocument();
  });

  it('sem violações de acessibilidade (axe) com a biblioteca importada', async () => {
    const user = userEvent.setup();
    render(<App storage={new AppStorage(new MemoryArea(), new MemoryArea())} now={() => NOW} />);
    await open(user);
    await user.upload(screen.getByLabelText('Importar biblioteca de modelos (JSON)'), file(EXAMPLE));
    await screen.findByText('Biblioteca importada e validada.');
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
