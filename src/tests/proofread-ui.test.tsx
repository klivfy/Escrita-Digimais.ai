import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { MemoryArea } from './memory-storage';
import { NOW } from './helpers';

afterEach(() => cleanup());

function setup() {
  const storage = new AppStorage(new MemoryArea(), new MemoryArea());
  const user = userEvent.setup();
  const copy = vi.fn(async () => true);
  render(<App storage={storage} copy={copy} now={() => NOW} />);
  return { user, copy };
}

const SAMPLE = 'o usuario nao consegue abrir a planilha, foi necessario reiniciar';
const field = () => screen.getByLabelText('Texto a corrigir') as HTMLTextAreaElement;
const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

async function openAndVerify(user: ReturnType<typeof userEvent.setup>, text = SAMPLE) {
  await user.click(screen.getByRole('button', { name: 'Corrigir ortografia' }));
  fireEvent.change(field(), { target: { value: text } });
  await user.click(screen.getByRole('button', { name: 'Verificar texto' }));
  await screen.findByRole('heading', { name: /^Sugestões \(/ }, { timeout: 15000 });
}

describe('camada 0: corretor do navegador', () => {
  it('os campos de texto pedem a verificação do navegador em português', () => {
    for (const file of ['sidepanel.html', 'popup.html']) expect(readFileSync(file, 'utf8')).toMatch(/<html lang="pt-BR">/);
    setup();
    expect(document.querySelectorAll('textarea[spellcheck="true"]').length).toBeGreaterThan(3);
    for (const t of document.querySelectorAll('textarea')) expect(t.getAttribute('spellcheck'), t.id).toBe('true');
  });
});

describe('modo Corrigir ortografia', () => {
  it('lista as sugestões sem alterar o texto', async () => {
    const { user } = setup();
    await openAndVerify(user);
    expect(screen.getByRole('heading', { name: 'Sugestões (3)' })).toBeTruthy();
    expect(field().value).toBe(SAMPLE);
    expect(screen.getByRole('button', { name: 'Aceitar: trocar usuario por usuário' })).toBeTruthy();
    expect(live()).toMatch(/3 sugestões encontradas/);
  });

  it('aceita uma sugestão por ação explícita, atualiza a lista e permite desfazer', async () => {
    const { user } = setup();
    await openAndVerify(user);
    await user.click(screen.getByRole('button', { name: 'Aceitar: trocar nao por não' }));
    expect(field().value).toBe('o usuario não consegue abrir a planilha, foi necessario reiniciar');
    expect(screen.getByRole('heading', { name: 'Sugestões (2)' })).toBeTruthy();
    expect(live()).toMatch(/Trocado nao por não\. 2 sugestões restantes/);
    await user.click(screen.getByRole('button', { name: 'Desfazer a última alteração' }));
    expect(field().value).toBe(SAMPLE);
  });

  it('o foco segue para a próxima sugestão depois de aceitar e vai ao título quando acabam', async () => {
    const { user } = setup();
    await openAndVerify(user, 'nao foi possivel');
    await user.click(screen.getByRole('button', { name: /Aceitar: trocar nao/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Aceitar: trocar possivel/ })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /Aceitar: trocar possivel/ }));
    expect(field().value).toBe('não foi possível');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nenhuma sugestão' })).toHaveFocus());
  });

  it('aceita todas de uma vez e anuncia a contagem', async () => {
    const { user } = setup();
    await openAndVerify(user);
    await user.click(screen.getByRole('button', { name: 'Aceitar todas (3)' }));
    expect(field().value).toBe('o usuário não consegue abrir a planilha, foi necessário reiniciar');
    expect(live()).toMatch(/3 trocas aplicadas\. Nenhuma sugestão restante/);
  });

  it('ignorar vale só para a palavra e só até a próxima verificação', async () => {
    const { user } = setup();
    await openAndVerify(user);
    await user.click(screen.getByRole('button', { name: 'Ignorar a palavra usuario' }));
    expect(screen.getByRole('heading', { name: 'Sugestões (2)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceitar: trocar usuario por usuário' })).toBeNull();
    expect(field().value).toBe(SAMPLE);
    await user.click(screen.getByRole('button', { name: 'Verificar texto' }));
    expect(await screen.findByRole('heading', { name: 'Sugestões (3)' })).toBeTruthy();
  });

  it('editar o texto deixa o resultado desatualizado em vez de aplicar sugestão antiga', async () => {
    const { user } = setup();
    await openAndVerify(user);
    fireEvent.change(field(), { target: { value: `${SAMPLE} hoje` } });
    expect(screen.queryByRole('heading', { name: /^Sugestões/ })).toBeNull();
    expect(screen.getByText(/O texto mudou desde a última verificação/)).toBeTruthy();
  });

  it('texto sem erro devolve uma resposta honesta, e texto vazio pede o texto', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Corrigir ortografia' }));
    await user.click(screen.getByRole('button', { name: 'Verificar texto' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Cole ou digite o texto/);
    fireEvent.change(field(), { target: { value: 'O acesso foi liberado e o usuário já consegue entrar.' } });
    await user.click(screen.getByRole('button', { name: 'Verificar texto' }));
    expect(await screen.findByRole('heading', { name: 'Nenhuma sugestão' }, { timeout: 15000 })).toBeTruthy();
    expect(screen.getByText(/Isso não garante que o texto esteja correto/)).toBeTruthy();
  });

  it('copia o texto corrigido com aviso para leitores de tela', async () => {
    const { user, copy } = setup();
    await openAndVerify(user, 'nao foi possivel');
    await user.click(screen.getByRole('button', { name: 'Aceitar todas (2)' }));
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    expect(copy).toHaveBeenCalledWith('não foi possível');
    expect(live()).toMatch(/Texto copiado/);
  });

  it('mostra erro claro quando a lista não carrega', async () => {
    const { ProofreadMode } = await import('../ui/components/ProofreadMode');
    const user = userEvent.setup();
    render(<ProofreadMode text="nao" onChange={() => {}} onClear={() => {}} onCopy={async () => {}} onAnnounce={() => {}} loadIndex={() => Promise.reject(new Error('x'))} />);
    await user.click(screen.getByRole('button', { name: 'Verificar texto' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não foi possível carregar a lista/);
  });

  it('"Limpar tudo" apaga o texto e "Desfazer limpeza" o devolve', async () => {
    const { user } = setup();
    await openAndVerify(user);
    await user.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    await user.click(screen.getByRole('button', { name: 'Apagar agora' }));
    expect(field().value).toBe('');
    expect(screen.queryByRole('heading', { name: /^Sugestões/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Desfazer limpeza' }));
    expect(field().value).toBe(SAMPLE);
  });

  it('não grava o texto em armazenamento nenhum', async () => {
    const local = new MemoryArea();
    const session = new MemoryArea();
    const storage = new AppStorage(local, session);
    const user = userEvent.setup();
    render(<App storage={storage} copy={vi.fn(async () => true)} now={() => NOW} />);
    await openAndVerify(user);
    await user.click(screen.getByRole('button', { name: 'Aceitar todas (3)' }));
    expect(JSON.stringify([local.data, session.data])).not.toMatch(/planilha|usu[aá]rio|consegue/);
  });

  it('sem violações de acessibilidade (axe) com o resultado na tela', async () => {
    const { user } = setup();
    await openAndVerify(user);
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
