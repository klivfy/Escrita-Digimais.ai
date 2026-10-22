import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { MemoryArea } from './memory-storage';
import { NOW } from './helpers';

afterEach(() => cleanup());

function setup(initial: Record<string, unknown> = {}) {
  const local = new MemoryArea(initial);
  const storage = new AppStorage(local, new MemoryArea());
  const user = userEvent.setup();
  render(<App storage={storage} copy={vi.fn(async () => true)} now={() => NOW} loadUsage={async () => 'optional'} />);
  return { local, user };
}

const NOTE = 'usuário sem acesso à VPN desde ontem\nresetei a senha no AD\nconexão ok no meu teste\naguardando teste do usuário\nqual cliente de vpn ele usa?\nvou validar amanhã';

async function openDraft(user: ReturnType<typeof userEvent.setup>, note = NOTE) {
  await user.click(screen.getByText('Colar uma anotação livre (opcional)'));
  fireEvent.change(screen.getByLabelText('Anotação livre'), { target: { value: note } });
  await user.click(screen.getByRole('button', { name: 'Dividir em campos' }));
}

const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLTextAreaElement).value;

describe('rascunho livre na interface', () => {
  it('divide, deixa conferir e só então preenche os campos', async () => {
    const { user } = setup();
    fireEvent.change(screen.getByLabelText('Tipo de comunicação'), { target: { value: 'progress_update' } });
    await openDraft(user);
    expect(await screen.findByText(/Confira a divisão \(6 trechos\)/)).toBeTruthy();
    // Antes de confirmar, o formulário continua vazio.
    expect(value(/Contexto do chamado/)).toBe('');
    await user.click(screen.getByRole('button', { name: 'Preencher o formulário' }));
    expect(value(/Contexto do chamado/)).toBe('Usuário sem acesso à VPN desde ontem.');
    expect(value(/Ações realizadas/)).toBe('resetei a senha no AD\nPlanejado: vou validar amanhã');
    expect(value(/Resultado observado/)).toBe('Conexão ok no meu teste.');
    expect(value(/Pendência atual/)).toBe('Aguardando teste do usuário.');
    // A anotação é descartada após aplicar.
    expect((screen.getByLabelText('Anotação livre') as HTMLTextAreaElement).value).toBe('');
  });

  it('o texto gerado a partir do rascunho segue as regras normais (voz da equipe incluída)', async () => {
    const { user } = setup();
    fireEvent.change(screen.getByLabelText('Tipo de comunicação'), { target: { value: 'progress_update' } });
    await openDraft(user);
    await user.click(await screen.findByRole('button', { name: 'Preencher o formulário' }));
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    const preview = (await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement;
    expect(preview.value).toContain('resetamos a senha no AD');
    expect(preview.value).toContain('vamos validar amanhã');
  });

  it('campos que não existem no tipo atual vão para Observações', async () => {
    const { user } = setup(); // solicitar informações: não tem "Pendência atual"
    await openDraft(user, 'cliente sem acesso\naguardando o usuário');
    const select = (await screen.findByLabelText('Campo do trecho 2')) as HTMLSelectElement;
    expect(select.value).toBe('notes');
    expect(within(select).getByRole('option', { name: /Pendência \(indisponível neste tipo\)/ })).toBeTruthy();
  });

  it('nunca sobrescreve um campo que já tem texto', async () => {
    const { user } = setup();
    fireEvent.change(screen.getByLabelText('Tipo de comunicação'), { target: { value: 'progress_update' } });
    fireEvent.change(screen.getByLabelText(/Contexto do chamado/), { target: { value: 'Texto já escrito.' } });
    await openDraft(user, 'usuário sem acesso à VPN');
    await user.click(await screen.findByRole('button', { name: 'Preencher o formulário' }));
    expect(value(/Contexto do chamado/)).toBe('Texto já escrito.\nUsuário sem acesso à VPN.');
  });

  it('dado que bloqueia a geração impede a divisão e não mostra o valor', async () => {
    const { user } = setup();
    await openDraft(user, 'usuário sem acesso\nlogin joao senha: Abc@12345 resetada');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/bloqueia a geração/);
    expect(alert.textContent).not.toContain('Abc@12345');
    expect(screen.queryByText(/Confira a divisão/)).toBeNull();
  });

  it('anotação vazia pede conteúdo', async () => {
    const { user } = setup();
    await openDraft(user, '   ');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Cole ou escreva/);
  });

  it('descartar limpa a anotação e a divisão', async () => {
    const { user } = setup();
    await openDraft(user);
    await user.click(await screen.findByRole('button', { name: 'Descartar a anotação' }));
    expect(screen.queryByText(/Confira a divisão/)).toBeNull();
    expect((screen.getByLabelText('Anotação livre') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('aprendizado com as correções do rascunho', () => {
  async function correctOnce(user: ReturnType<typeof userEvent.setup>) {
    fireEvent.change(screen.getByLabelText('Tipo de comunicação'), { target: { value: 'progress_update' } });
    await openDraft(user, 'usuário sem acesso à VPN\nlogin ok no teste');
    const select = await screen.findByLabelText('Campo do trecho 2');
    fireEvent.change(select, { target: { value: 'action' } });
    await user.click(screen.getByRole('button', { name: 'Preencher o formulário' }));
  }

  it('desligado: corrigir não grava nada', async () => {
    const { local, user } = setup();
    await correctOnce(user);
    expect(local.data.learnedStyle).toBeUndefined();
  });

  it('ligado: grava só a contagem "de campo para campo", nunca o texto', async () => {
    const { local, user } = setup({ preferences: { learnStyle: true } });
    await correctOnce(user);
    await waitFor(() => expect((local.data.learnedStyle as { counts: Record<string, number> }).counts['fix.result.action']).toBe(1));
    expect(JSON.stringify(local.data)).not.toMatch(/VPN|login ok/);
  });

  it('leva o foco para o resultado ao dividir e de volta ao campo ao concluir, e anuncia a divisão', async () => {
    const { user } = setup();
    fireEvent.change(screen.getByLabelText('Tipo de comunicação'), { target: { value: 'progress_update' } });
    await openDraft(user);
    const heading = await screen.findByRole('heading', { name: /Confira a divisão/ });
    expect(document.activeElement).toBe(heading);
    await waitFor(() => expect(screen.getAllByRole('status').some((e) => /dividida em 6 trechos/.test(e.textContent ?? ''))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Preencher o formulário' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Anotação livre'));
  });

  it('descartar devolve o foco ao campo da anotação', async () => {
    const { user } = setup();
    await openDraft(user);
    await user.click(await screen.findByRole('button', { name: 'Descartar a anotação' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Anotação livre'));
  });
});
