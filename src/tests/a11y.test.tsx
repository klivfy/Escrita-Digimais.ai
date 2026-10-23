import axe from 'axe-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { Popup } from '../ui/Popup';
import { MemoryArea } from './memory-storage';

afterEach(cleanup);

async function violations(node: Element): Promise<string[]> {
  // Contraste é verificado em contrast.test.ts (o jsdom não calcula estilos renderizados).
  const res = await axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

function setup() {
  const user = userEvent.setup();
  const view = render(<App storage={new AppStorage(new MemoryArea(), new MemoryArea())} copy={vi.fn(async () => true)} />);
  return { user, ...view };
}

describe('acessibilidade (axe)', () => {
  it('sentinela: o axe detecta violações neste ambiente', async () => {
    const { container } = render(<div><input type="text" /><button type="button" /></div>);
    expect((await violations(container)).length).toBeGreaterThan(0);
  });

  it('estado inicial', async () => {
    const { container } = setup();
    expect(await violations(container)).toEqual([]);
  });

  it('com prévia, alertas, indicadores e comparação', async () => {
    const { user, container } = setup();
    fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual erro aparece na tela\nPode me dar mais detalhes' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    const preview = await screen.findByLabelText('Prévia editável');
    fireEvent.change(preview, { target: { value: 'Texto alterado.' } });
    await user.click(screen.getByRole('button', { name: 'Comparar com o texto inicial' }));
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    expect(await violations(container)).toEqual([]);
  });

  it('com bloqueio, dados sensíveis e erros de campo', async () => {
    const { user, container } = setup();
    fireEvent.change(screen.getByLabelText(/^Por que a informação é necessária/), { target: { value: 'ana.teste@exemplo.test senha: Abc@12345' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    await screen.findByText(/Geração bloqueada: foram detectadas credenciais/);
    expect(await violations(container)).toEqual([]);
  });

  it('com campos obrigatórios ausentes, configurações e confirmação de limpeza', async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    await user.click(screen.getByRole('button', { name: 'Configurações' }));
    await user.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    expect(await violations(container)).toEqual([]);
  });

  it('todos os tipos de comunicação', async () => {
    const { container } = setup();
    for (const option of Array.from((screen.getByLabelText('Tipo de comunicação') as HTMLSelectElement).options)) {
      fireEvent.change(screen.getByLabelText('Tipo de comunicação'), { target: { value: option.value } });
      expect(await violations(container), option.value).toEqual([]);
    }
  });

  it('popup', async () => {
    const { container } = render(<Popup open={async () => true} />);
    expect(await violations(container)).toEqual([]);
  });

  it('navegação por teclado alcança os controles principais', async () => {
    const { user } = setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Limpar tudo' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Gerar texto' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Revisar texto pronto' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Corrigir texto' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ensinar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Tipo de comunicação')).toHaveFocus();
  });
});
