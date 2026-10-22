import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsagePolicy } from '../application/usage-counters';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { MemoryArea } from './memory-storage';
import { NOW } from './helpers';

afterEach(() => cleanup());

const SEGREDO = 'Texto exclusivo do analista 5K2M';

function setup(initial: Record<string, unknown> = {}, policy: UsagePolicy = 'optional') {
  const local = new MemoryArea(initial);
  const storage = new AppStorage(local, new MemoryArea());
  const user = userEvent.setup();
  render(<App storage={storage} copy={vi.fn(async () => true)} now={() => NOW} loadUsage={async () => policy} />);
  return { local, user };
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/Por que a informação é necessária/), { target: { value: `Erro ao abrir a planilha. ${SEGREDO}` } });
  fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual mensagem de erro aparece na tela\nO erro ocorre com outros arquivos' } });
  await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
  return (await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement;
}

const learned = (local: MemoryArea) => (local.data.learnedStyle as { counts: Record<string, number> } | undefined)?.counts;

describe('aprendizado de redação na interface', () => {
  it('desligado por padrão: copiar e trocar variação não grava nada', async () => {
    const { local, user } = setup();
    await generate(user);
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    await user.click(screen.getByRole('button', { name: 'Outra variação' }));
    expect(local.data.learnedStyle).toBeUndefined();
  });

  it('ligado: copiar registra o que foi mantido, trocar registra o que mudou, sem nenhum texto', async () => {
    const { local, user } = setup({ preferences: { learnStyle: true } });
    await generate(user);
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    await waitFor(() => expect(learned(local)?.['acc.opening.request_information.0']).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Outra variação' }));
    await waitFor(() => expect(learned(local)?.['rej.opening.request_information.0']).toBe(1));
    const raw = JSON.stringify(local.data.learnedStyle);
    expect(raw).not.toContain(SEGREDO);
    expect(raw).not.toMatch(/planilha|erro/i);
    for (const v of Object.values(learned(local) ?? {})) expect(Number.isInteger(v)).toBe(true);
  });

  it('copiar a mesma geração duas vezes conta uma só vez', async () => {
    const { local, user } = setup({ preferences: { learnStyle: true } });
    await generate(user);
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    await waitFor(() => expect(learned(local)?.['acc.opening.request_information.0']).toBe(1));
  });

  it('a preferência aprendida passa a vir primeiro', async () => {
    const counts = { 'acc.opening.request_information.1': 4 };
    const { user } = setup({ preferences: { learnStyle: true }, learnedStyle: { version: 1, counts } });
    const preview = await generate(user);
    expect(preview.value).toContain('Para darmos andamento à análise, precisamos de algumas informações complementares.');
  });

  it('com o aprendizado desligado, a preferência guardada não é aplicada', async () => {
    const counts = { 'acc.opening.request_information.1': 4 };
    const { user } = setup({ learnedStyle: { version: 1, counts } });
    const preview = await generate(user);
    expect(preview.value).toContain('Para continuarmos a análise, precisamos de algumas informações.');
  });

  it('a política "off" da organização desliga o aprendizado e trava a opção', async () => {
    const { local, user } = setup({ preferences: { learnStyle: true } }, 'off');
    await generate(user);
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    expect(local.data.learnedStyle).toBeUndefined();
    await user.click(screen.getByRole('button', { name: /Configurações/ }));
    expect(screen.getByText(/Desligado pela política da organização/)).toBeTruthy();
    expect(screen.queryByLabelText('Aprender com as redações que eu mantenho')).toBeNull();
    expect((screen.getByRole('button', { name: 'Exportar aprendizado' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('zerar aprendizado remove os dados', async () => {
    const counts = { 'acc.opening.request_information.1': 4 };
    const { local, user } = setup({ preferences: { learnStyle: true }, learnedStyle: { version: 1, counts } });
    await user.click(screen.getByRole('button', { name: /Configurações/ }));
    await user.click(screen.getByRole('button', { name: 'Zerar aprendizado' }));
    await waitFor(() => expect(local.data.learnedStyle).toBeUndefined());
    expect(await screen.findByText('Observações registradas: 0')).toBeTruthy();
  });

  it('as configurações oferecem exportar o aprendizado', async () => {
    const { user } = setup({ preferences: { learnStyle: true } });
    await user.click(screen.getByRole('button', { name: /Configurações/ }));
    expect(screen.getByRole('button', { name: 'Exportar aprendizado' })).toBeTruthy();
  });

  it('as configurações mostram a versão instalada quando o navegador a informa', async () => {
    vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '9.8.7.6' }) } });
    try {
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: /Configurações/ }));
      expect(screen.getByTestId('extension-version').textContent).toContain('9.8.7.6');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
