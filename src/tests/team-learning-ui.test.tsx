import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStorage } from '../infrastructure/storage';
import { App } from '../ui/App';
import { NOW } from './helpers';
import { MemoryArea } from './memory-storage';

const downloads = vi.hoisted(() => [] as { filename: string; text: string }[]);
vi.mock('../ui/download', () => ({ downloadJson: (filename: string, text: string) => void downloads.push({ filename, text }) }));

const PASSWORD = 'uma-senha-bem-longa-123';
const OPEN = 'Precisamos de uma informação sua para seguir com o atendimento.';
const post = (who: string) =>
  [`Olá, ${who},`, '', OPEN, '', 'Em aberto: item do chamado.', '', 'Envie uma captura de tela do erro, por favor.', '', 'Ficamos no aguardo.', 'Time de Suporte'].join('\n');
const BATCH = ['Ana', 'Beto', 'Caio'].map(post).join('\n---\n');

const setVersion = (version: string) => vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version }) } });
beforeEach(() => {
  downloads.length = 0;
  setVersion('1.0.0.3');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(initial: Record<string, unknown> = {}) {
  const local = new MemoryArea(initial);
  const user = userEvent.setup();
  render(<App storage={new AppStorage(local, new MemoryArea())} now={() => NOW} loadUsage={async () => 'optional'} />);
  return { local, user };
}
const openTeach = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: 'Ensinar' }));
const learn = async (user: ReturnType<typeof userEvent.setup>, text = BATCH) => {
  await openTeach(user);
  fireEvent.change(await screen.findByLabelText(/Textos da equipe/), { target: { value: text } });
  await user.click(screen.getByRole('button', { name: 'Acumular textos' }));
};
const ledgerOf = (local: MemoryArea) => local.data.learningLedger as { byType: Record<string, { texts: number; blocks: { role: string; text: string; count: number }[] }> } | undefined;

describe('aprendizado da equipe na tela', () => {
  it('acumula o lote, guarda só redação com campos e mostra o que foi guardado, com como esquecer', async () => {
    const { local, user } = setup();
    await learn(user);
    expect(await screen.findByText(/3 texto\(s\) acumulado\(s\); \d+ trecho\(s\)/)).toBeInTheDocument();
    expect(ledgerOf(local)?.byType.request_information.texts).toBe(3);
    expect(JSON.stringify(local.data)).not.toMatch(/Ana|Beto|Caio/);
    await user.click(screen.getByText('Ver o que foi guardado'));
    await user.click(screen.getByRole('button', { name: 'Esquecer fecho: Ficamos no aguardo.' }));
    await waitFor(() => expect(ledgerOf(local)?.byType.request_information.blocks.some((b) => b.role === 'closing')).toBe(false));
  });

  it('recusa texto com dado sensível, dizendo o motivo, e não acumula', async () => {
    const { local, user } = setup();
    await learn(user, 'Olá, Ana,\n\nEscreva para ana@empresa.com.br.\n\nObrigado.');
    expect(await screen.findByText(/Texto 1 recusado: dado sensível/)).toBeInTheDocument();
    expect(ledgerOf(local)).toBeUndefined();
  });

  it('treinar sob demanda propõe com evidência, só aplica o que for marcado e a próxima prévia usa o estilo', async () => {
    const { local, user } = setup();
    await learn(user);
    await user.click(await screen.findByRole('button', { name: 'Treinar agora' }));
    expect((await screen.findAllByText(/Aparece em 3 de 3 textos/)).length).toBeGreaterThan(1);
    expect(local.data.trainedStyle).toBeUndefined();
    // O rótulo começa desmarcado, porque muda o formato dos textos.
    expect(screen.getByRole('checkbox', { name: /Rótulo/ })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Aplicar selecionados' }));
    await waitFor(() => expect(local.data.trainedStyle).toMatchObject({ openings: { request_information: OPEN }, closings: { request_information: 'Ficamos no aguardo.' } }));
    expect((local.data.trainedStyle as { labels?: unknown }).labels).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Gerar texto' }));
    fireEvent.change(await screen.findByLabelText(/Por que a informação é necessária/), { target: { value: 'Erro ao abrir o sistema.' } });
    fireEvent.change(screen.getByLabelText(/Perguntas ao destinatário/), { target: { value: 'Qual mensagem de erro aparece na tela' } });
    await user.click(screen.getByRole('button', { name: 'Gerar prévia' }));
    const preview = (await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement;
    expect(preview.value).toContain(OPEN);
    expect(preview.value).toContain('Ficamos no aguardo.');
  });

  it('"Montar com o jeito da equipe" aparece quando há trechos do tipo, monta a prévia e diz de onde veio cada parte', async () => {
    const { user } = setup({
      learningLedger: {
        version: 1, since: '2026-11-01', updatedAt: '2026-11-04', textsAtTraining: 0,
        byType: {
          request_information: {
            texts: 3,
            blocks: [
              { role: 'opening', text: OPEN, count: 3 },
              { role: 'opening', text: 'Seguimos com a análise do seu caso.', count: 1 },
              { role: 'request', text: 'Envie uma captura de tela do erro, por favor.', count: 2 },
              { role: 'closing', text: 'Ficamos no aguardo.', count: 3 },
            ],
            labels: [],
          },
        },
      },
    });
    const button = await screen.findByRole('button', { name: 'Montar com o jeito da equipe' });
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/), { target: { value: 'Paula' } });
    await user.click(button);
    const preview = (await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement;
    expect(preview.value.startsWith('Olá, Paula,')).toBe(true);
    expect(preview.value).toContain(OPEN);
    expect(preview.value).toContain('Envie uma captura de tela do erro, por favor.');
    expect(preview.value).toContain('Ficamos no aguardo.\nEquipe de Service Desk');
    expect(screen.getByText(/Abertura: ensinado, visto em 3 texto\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Saudação: do perfil/)).toBeInTheDocument();
    expect(screen.getByText(/Motor estilo-da-equipe/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Outra variação' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Outra combinação' }));
    expect(((await screen.findByLabelText('Prévia editável')) as HTMLTextAreaElement).value).toContain('Seguimos com a análise do seu caso.');
  });

  it('sem trechos do tipo escolhido, o botão não aparece', async () => {
    setup({ learningLedger: { version: 1, since: '2026-11-01', updatedAt: '2026-11-04', textsAtTraining: 0, byType: { pending: { texts: 1, blocks: [], labels: [] } } } });
    await screen.findByLabelText('Tipo de comunicação');
    expect(screen.queryByRole('button', { name: 'Montar com o jeito da equipe' })).toBeNull();
  });
});

describe('compartilhar cifrado, na tela', () => {
  const exportFrom = async (user: ReturnType<typeof userEvent.setup>) => {
    await learn(user);
    fireEvent.change(await screen.findByLabelText('Senha do arquivo'), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByLabelText('Repita a senha'), { target: { value: PASSWORD } });
    await user.click(screen.getByRole('button', { name: 'Exportar aprendizado cifrado' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    return downloads[0];
  };

  it('exige senha forte e confirmada antes de gerar o arquivo', async () => {
    const { user } = setup();
    await learn(user);
    fireEvent.change(await screen.findByLabelText('Senha do arquivo'), { target: { value: 'curta' } });
    fireEvent.change(screen.getByLabelText('Repita a senha'), { target: { value: 'curta' } });
    await user.click(screen.getByRole('button', { name: 'Exportar aprendizado cifrado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pelo menos 12 caracteres/);
    fireEvent.change(screen.getByLabelText('Senha do arquivo'), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByLabelText('Repita a senha'), { target: { value: `${PASSWORD}x` } });
    await user.click(screen.getByRole('button', { name: 'Exportar aprendizado cifrado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/precisam ser iguais/);
    expect(downloads).toHaveLength(0);
  });

  it('exporta cifrado, e outro analista da mesma versão lê com a senha, vê o resumo e só então assimila', async () => {
    const a = setup();
    const file = await exportFrom(a.user);
    expect(file.filename).toBe('aprendizado-digimais-1.0.0.3-2026-10-15.json');
    expect(file.text).not.toContain('Ficamos no aguardo');
    cleanup();

    const b = setup();
    await openTeach(b.user);
    await b.user.upload(await screen.findByLabelText(/Importar aprendizado cifrado/), new File([file.text], file.filename, { type: 'application/json' }));
    fireEvent.change(await screen.findByLabelText('Senha do arquivo recebido'), { target: { value: PASSWORD } });
    await b.user.click(screen.getByRole('button', { name: 'Ler arquivo' }));
    expect(await screen.findByText(/gerado pela extensão 1\.0\.0\.3.*3 texto\(s\)/)).toBeInTheDocument();
    expect(ledgerOf(b.local)).toBeUndefined();
    await b.user.click(screen.getByRole('button', { name: 'Assimilar' }));
    await waitFor(() => expect(ledgerOf(b.local)?.byType.request_information.texts).toBe(3));
  }, 30000);

  it('senha errada é recusada com mensagem própria e nada é gravado', async () => {
    const a = setup();
    const file = await exportFrom(a.user);
    cleanup();
    const b = setup();
    await openTeach(b.user);
    await b.user.upload(await screen.findByLabelText(/Importar aprendizado cifrado/), new File([file.text], 'x.json', { type: 'application/json' }));
    fireEvent.change(await screen.findByLabelText('Senha do arquivo recebido'), { target: { value: 'outra-senha-longa-456' } });
    await b.user.click(screen.getByRole('button', { name: 'Ler arquivo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta.');
    expect(ledgerOf(b.local)).toBeUndefined();
  }, 30000);

  it('versão diferente da extensão interrompe a importação logo ao escolher o arquivo, antes da senha', async () => {
    const a = setup();
    const file = await exportFrom(a.user);
    cleanup();
    setVersion('1.0.0.4');
    const b = setup();
    await openTeach(b.user);
    await b.user.upload(await screen.findByLabelText(/Importar aprendizado cifrado/), new File([file.text], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Versão incompatível.*1\.0\.0\.3.*1\.0\.0\.4/);
    expect(screen.queryByLabelText('Senha do arquivo recebido')).toBeNull();
    expect(ledgerOf(b.local)).toBeUndefined();
  }, 30000);

  it('arquivo que não é do aprendizado é recusado', async () => {
    const { user } = setup();
    await openTeach(user);
    await user.upload(await screen.findByLabelText(/Importar aprendizado cifrado/), new File(['{"a":1}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não é um arquivo de aprendizado/);
  });

  it('apagar todo o aprendizado pede confirmação e limpa registro e estilo treinado', async () => {
    const { local, user } = setup();
    await learn(user);
    await screen.findByText(/3 texto\(s\) acumulado\(s\); \d+ trecho\(s\)/);
    await user.click(screen.getByRole('button', { name: 'Apagar todo o aprendizado' }));
    expect(ledgerOf(local)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Confirmar: apagar o aprendizado' }));
    await waitFor(() => expect(ledgerOf(local)).toBeUndefined());
  });
});
