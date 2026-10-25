import { useId, useRef, useState } from 'react';
import { RECIPIENT_LABELS } from '../../config/fields';
import type { LibraryModel } from '../../config/library-schema';
import type { OutOfUseModel } from '../../application/analyst-content';
import type { TaughtStyle } from '../../config/taught-style';
import { learnStyle, MIN_STYLE_TEXTS, splitTexts, vetStyle } from '../../domain/style-learn';
import type { StyleProposal } from '../../domain/style-learn';
import { buildTaughtModel, prepareTaught, TEACH_NAME_NOTICE } from '../../domain/teach';
import type { TeachDraft } from '../../domain/teach';
import { COMMUNICATION_TYPES, RECIPIENTS } from '../../domain/types';
import type { CommunicationType, LanguageProfile, Recipient } from '../../domain/types';

export interface TeachSeed {
  /** Muda a cada pedido para a tela recomeçar com o novo texto. */
  id: number;
  text: string;
  type: CommunicationType;
  recipient: Recipient;
}

interface Props {
  profile: LanguageProfile;
  models: readonly LibraryModel[];
  /** Modelos guardados que deixaram de passar nas regras em vigor: continuam guardados, fora da busca. */
  outOfUse: readonly OutOfUseModel[];
  /** Texto de partida (por exemplo, a prévia que o analista acabou de ajustar). A tela é recriada quando o id muda. */
  seed: TeachSeed | null;
  now: () => Date;
  onSave: (model: LibraryModel) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRemoveAll: () => Promise<void>;
  onExport: () => void;
  style: TaughtStyle | null;
  /** Motivo de o estilo guardado estar desligado pelas regras em vigor, ou null. */
  styleOff: string | null;
  /** Perfil assinado exigido pela organização: saudação, fecho e assinatura são dela. */
  styleLocked: boolean;
  onSaveStyle: (style: TaughtStyle) => Promise<void>;
  onRemoveStyle: () => Promise<void>;
  onAnnounce: (message: string) => void;
  onEvent?: (key: 'teach.saved' | 'teach.removed') => void;
}

const FIELD_LABEL: Record<string, string> = {
  nome: '{nome}', chamado: '{chamado}', data: '{data}', prazo: '{prazo}', equipe: '{equipe}',
};

/**
 * Tela "Ensinar a extensão". O analista cola um texto que a organização usa, a extensão troca o que varia por campos
 * (mostrando cada troca), o analista confere, edita e só então salva. Nada é guardado sem o clique em "Salvar modelo",
 * e o texto colado some da memória ao sair da tela. Os modelos salvos passam pela triagem de dado sensível.
 */
export function TeachMode({
  profile, models, outOfUse, seed, now, onSave, onRemove, onRemoveAll, onExport, style, styleOff, styleLocked, onSaveStyle, onRemoveStyle, onAnnounce, onEvent = () => {},
}: Props) {
  const id = useId();
  const prepared = seed ? prepareTaught(seed.text) : null;
  const [pasted, setPasted] = useState(seed?.text ?? '');
  const [type, setType] = useState<CommunicationType>(seed?.type ?? 'request_information');
  const [recipient, setRecipient] = useState<Recipient | 'any'>(seed?.recipient ?? 'any');
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<TeachDraft | null>(prepared);
  const [model, setModel] = useState(prepared?.text ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAll, setConfirmAll] = useState(false);
  const modelRef = useRef<HTMLTextAreaElement>(null);

  // Estilo (saudação, fecho, assinatura) aprendido de vários textos.
  const [styleText, setStyleText] = useState('');
  const [styleScope, setStyleScope] = useState<Recipient | 'any'>('any');
  const [proposal, setProposal] = useState<StyleProposal | null>(null);
  const [values, setValues] = useState({ greeting: '', closing: '', signature: '' });
  const [use, setUse] = useState({ greeting: false, closing: false, signature: false });
  const [styleErrors, setStyleErrors] = useState<string[]>([]);

  const prepare = (): void => {
    const prepared = prepareTaught(pasted);
    setDraft(prepared);
    setModel(prepared.text);
    setErrors([]);
    onAnnounce(
      prepared.substitutions.length > 0
        ? `Modelo preparado com ${prepared.substitutions.length} troca(s) por campo. Confira antes de salvar.`
        : 'Modelo preparado sem trocas. Confira antes de salvar.',
    );
    window.setTimeout(() => modelRef.current?.focus(), 0);
  };

  const save = async (): Promise<void> => {
    const result = buildTaughtModel({ title, text: model, type, recipient }, [...models, ...outOfUse.map((o) => o.model)].map((m) => m.id), profile, now());
    if (!result.ok) {
      setErrors(result.errors.slice(0, 8));
      onAnnounce('O modelo não foi salvo. Corrija os itens indicados.');
      return;
    }
    await onSave(result.model);
    onEvent('teach.saved');
    setPasted('');
    setTitle('');
    setDraft(null);
    setModel('');
    setErrors([]);
    onAnnounce(`Modelo "${result.model.title}" salvo neste navegador.`);
  };

  const analyzeStyle = (): void => {
    const found = learnStyle(splitTexts(styleText));
    setProposal(found);
    setValues({ greeting: found.greeting?.value ?? '', closing: found.closing?.value ?? '', signature: found.signature?.value ?? '' });
    setUse({ greeting: Boolean(found.greeting), closing: Boolean(found.closing), signature: Boolean(found.signature) });
    setStyleErrors([]);
    onAnnounce(
      found.texts < MIN_STYLE_TEXTS
        ? `São necessários pelo menos ${MIN_STYLE_TEXTS} textos.`
        : found.greeting || found.closing || found.signature
          ? 'Estilo analisado. Confira o que será guardado.'
          : 'Nenhum padrão se repetiu nos textos.',
    );
  };

  const saveStyle = async (): Promise<void> => {
    const next = {
      ...(use.greeting && values.greeting.trim() ? { greeting: values.greeting.trim() } : {}),
      ...(use.closing && values.closing.trim() ? { closing: values.closing.trim() } : {}),
      ...(use.signature && values.signature.trim() ? { signature: values.signature.trim() } : {}),
    };
    if (!next.greeting && !next.closing && !next.signature) {
      setStyleErrors(['Marque pelo menos um item para guardar.']);
      return;
    }
    const vetting = vetStyle(next, profile);
    if (!vetting.ok) {
      setStyleErrors(vetting.reasons.slice(0, 6));
      onAnnounce('O estilo não foi salvo. Corrija os itens indicados.');
      return;
    }
    // Itens não marcados continuam como estavam; a saudação nova vale para o destinatário escolhido.
    const merged: TaughtStyle = {
      version: 1,
      ...(style?.greeting ? { greeting: style.greeting } : {}),
      ...(style?.recipients ? { recipients: style.recipients } : {}),
      ...(style?.closing ? { closing: style.closing } : {}),
      ...(style?.signature ? { signature: style.signature } : {}),
      ...next,
      ...(next.greeting ? { recipients: styleScope === 'any' ? undefined : [styleScope] } : {}),
    };
    await onSaveStyle(merged);
    setStyleText('');
    setProposal(null);
    setStyleErrors([]);
    onAnnounce('Estilo salvo neste navegador. As próximas prévias já usam.');
  };

  const discard = (): void => {
    setPasted('');
    setDraft(null);
    setModel('');
    setErrors([]);
  };

  return (
    <section className="stack" aria-label="Ensinar a extensão">
      <h2>Ensinar a extensão</h2>
      <p className="subtle">
        Cole um texto que a organização realmente usa. A extensão troca o que muda de um chamado para outro (nome, número do chamado,
        data, prazo, equipe) por campos, você confere e salva. Depois, ao gerar um texto, ela sugere os modelos mais parecidos
        com o que você descreveu; você escolhe, e nada é copiado sem a sua ação. O modelo salvo fica só neste navegador. O texto colado
        não é guardado até você clicar em Salvar modelo.
      </p>

      <div className="field">
        <label htmlFor={`${id}-text`}>Texto que a organização usa</label>
        <textarea id={`${id}-text`} rows={8} value={pasted} autoComplete="off" spellCheck onChange={(e) => setPasted(e.target.value)} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor={`${id}-type`}>Tipo de comunicação</label>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as CommunicationType)}>
            {COMMUNICATION_TYPES.map((t) => <option key={t} value={t}>{profile.categoryNames[t]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-rcp`}>Destinatário</label>
          <select id={`${id}-rcp`} value={recipient} onChange={(e) => setRecipient(e.target.value as Recipient | 'any')}>
            <option value="any">Qualquer destinatário</option>
            {RECIPIENTS.map((r) => <option key={r} value={r}>{RECIPIENT_LABELS[r]}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={prepare} disabled={!pasted.trim()}>Preparar modelo</button>
        {(pasted || draft) && <button type="button" onClick={discard}>Descartar</button>}
      </div>

      {draft && (
        <div className="stack">
          <h3>Confira o modelo</h3>
          {draft.substitutions.length > 0 ? (
            <div role="status" className="panel info">
              <p>Trocas feitas por campo:</p>
              <ul>
                {draft.substitutions.map((s, i) => (
                  <li key={i}>
                    <strong>{s.original}</strong> virou <strong>{FIELD_LABEL[s.field] ?? `{${s.field}}`}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="subtle">Nenhum trecho variável foi reconhecido. Se houver nome, data ou número de chamado, troque por campo no texto abaixo.</p>
          )}
          <p role="note" className="panel warn">{TEACH_NAME_NOTICE}</p>
          <div className="field">
            <label htmlFor={`${id}-title`}>Título do modelo</label>
            <input id={`${id}-title`} type="text" value={title} maxLength={80} autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-model`}>Modelo (editável)</label>
            <textarea id={`${id}-model`} ref={modelRef} rows={10} value={model} autoComplete="off" spellCheck onChange={(e) => setModel(e.target.value)} />
            <span className="subtle">Campos permitidos: {'{nome}'}, {'{chamado}'}, {'{data}'}, {'{prazo}'}, {'{equipe}'}, {'{sistema}'}, {'{equipamento}'}.</span>
          </div>
          {errors.length > 0 && (
            <div role="alert" className="panel block">
              <p className="error-text">O modelo não foi salvo. Corrija os itens abaixo:</p>
              <ul>{errors.map((er, i) => <li key={i}>{er}</li>)}</ul>
            </div>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={() => void save()}>Salvar modelo</button>
          </div>
        </div>
      )}

      <h3>Ensinar o estilo da organização</h3>
      {styleLocked ? (
        <p role="note" className="panel info">
          A organização controla saudação, fecho e assinatura pelo perfil assinado. O estilo pessoal fica desligado enquanto essa exigência valer.
        </p>
      ) : (
        <div className="stack">
          <p className="subtle">
            Cole de {MIN_STYLE_TEXTS} a 20 textos reais, separados por uma linha com três hifens (---). A extensão procura a saudação, o fecho e a
            assinatura que se repetem em pelo menos metade deles e propõe usar nas próximas prévias. Você confere e edita antes de salvar.
          </p>
          <div className="field">
            <label htmlFor={`${id}-style`}>Textos da organização para aprender o estilo</label>
            <textarea id={`${id}-style`} rows={8} value={styleText} autoComplete="off" spellCheck onChange={(e) => setStyleText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-scope`}>A saudação vale para</label>
            <select id={`${id}-scope`} value={styleScope} onChange={(e) => setStyleScope(e.target.value as Recipient | 'any')}>
              <option value="any">Todos os destinatários</option>
              {RECIPIENTS.map((r) => <option key={r} value={r}>{RECIPIENT_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={analyzeStyle} disabled={!styleText.trim()}>Analisar estilo</button>
          </div>
          {proposal && proposal.texts < MIN_STYLE_TEXTS && (
            <p role="status" className="panel warn">Foram lidos {proposal.texts} texto(s). São necessários pelo menos {MIN_STYLE_TEXTS}.</p>
          )}
          {proposal && proposal.texts >= MIN_STYLE_TEXTS && !proposal.greeting && !proposal.closing && !proposal.signature && (
            <p role="status" className="panel warn">
              Nenhuma saudação, fecho ou assinatura se repetiu em pelo menos metade dos {proposal.texts} textos. Cole mais textos do mesmo padrão.
            </p>
          )}
          {proposal && (proposal.greeting || proposal.closing || proposal.signature) && (
            <div className="stack">
              {([
                ['greeting', 'Saudação', proposal.greeting],
                ['closing', 'Fecho', proposal.closing],
                ['signature', 'Assinatura', proposal.signature],
              ] as const).map(([key, label, item]) =>
                item ? (
                  <div className="field" key={key}>
                    <div className="row">
                      <input
                        id={`${id}-use-${key}`}
                        type="checkbox"
                        checked={use[key]}
                        onChange={(e) => setUse((u) => ({ ...u, [key]: e.target.checked }))}
                      />
                      <label htmlFor={`${id}-use-${key}`}>Usar {label.toLowerCase()} (aparece em {item.count} de {proposal.texts} textos)</label>
                    </div>
                    <label htmlFor={`${id}-val-${key}`}>{label}</label>
                    <input
                      id={`${id}-val-${key}`}
                      type="text"
                      value={values[key]}
                      autoComplete="off"
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    />
                  </div>
                ) : null,
              )}
              {styleErrors.length > 0 && (
                <div role="alert" className="panel block">
                  <p className="error-text">O estilo não foi salvo. Corrija os itens abaixo:</p>
                  <ul>{styleErrors.map((er, i) => <li key={i}>{er}</li>)}</ul>
                </div>
              )}
              <div className="row">
                <button type="button" className="primary" onClick={() => void saveStyle()}>Salvar estilo</button>
              </div>
            </div>
          )}
          {style && (
            <div className="panel info">
              {styleOff ? (
                <p role="status">Estilo desligado: {styleOff} Ele continua guardado.</p>
              ) : (
                <p>Estilo em uso nas prévias:</p>
              )}
              <ul>
                {style.greeting && <li>Saudação: <strong>{style.greeting}</strong>{style.recipients ? ` (${style.recipients.map((r) => RECIPIENT_LABELS[r]).join(', ')})` : ''}</li>}
                {style.closing && <li>Fecho: <strong>{style.closing}</strong></li>}
                {style.signature && <li>Assinatura: <strong>{style.signature}</strong></li>}
              </ul>
              <div className="row">
                <button type="button" onClick={() => void onRemoveStyle().then(() => onAnnounce('Estilo ensinado removido. Voltou o padrão do perfil.'))}>
                  Remover estilo ensinado
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {outOfUse.length > 0 && (
        <div className="stack">
          <h3>Modelos fora de uso ({outOfUse.length})</h3>
          <ul className="list" aria-label="Modelos fora de uso">
            {outOfUse.map(({ model: m, reasons }) => (
              <li key={m.id}>
                <p><strong>{m.title}</strong></p>
                <p role="status" className="panel warn">Fora de uso: {reasons.join(' ')} Remova ou ensine de novo.</p>
                <div className="row">
                  <button
                    type="button"
                    onClick={() => void onRemove(m.id).then(() => { onEvent('teach.removed'); onAnnounce(`Modelo "${m.title}" removido.`); })}
                    aria-label={`Remover o modelo fora de uso: ${m.title}`}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3>Modelos ensinados ({models.length})</h3>
      {models.length === 0 ? (
        <p className="subtle">Nenhum modelo ensinado ainda.</p>
      ) : (
        <>
          <ul className="list" aria-label="Modelos ensinados">
            {models.map((m) => (
              <li key={m.id}>
                <p><strong>{m.title}</strong></p>
                <p className="subtle">
                  {m.types.map((t) => profile.categoryNames[t]).join(', ')}
                  {m.recipients.length > 0 ? ` · ${m.recipients.map((r) => RECIPIENT_LABELS[r]).join(', ')}` : ''}
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={() => void onRemove(m.id).then(() => { onEvent('teach.removed'); onAnnounce(`Modelo "${m.title}" removido.`); })}
                    aria-label={`Remover o modelo: ${m.title}`}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" onClick={onExport}>Exportar modelos ensinados</button>
            {!confirmAll ? (
              <button type="button" onClick={() => setConfirmAll(true)}>Remover todos</button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void onRemoveAll().then(() => { setConfirmAll(false); onAnnounce('Todos os modelos ensinados foram removidos.'); })}
                >
                  Confirmar: remover todos
                </button>
                <button type="button" onClick={() => setConfirmAll(false)}>Cancelar</button>
              </>
            )}
          </div>
          <p className="subtle">
            Para a equipe inteira usar, exporte e entregue o arquivo à TI: ela revisa, assina com o comando sign-library e distribui como
            biblioteca da instituição.
          </p>
        </>
      )}
    </section>
  );
}
