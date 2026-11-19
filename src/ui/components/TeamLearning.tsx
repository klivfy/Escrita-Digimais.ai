import { useId, useState } from 'react';
import { LearningCryptoError, MIN_PASSWORD_LENGTH } from '../../application/learning-crypto';
import type { ImportPreview, ImportReport } from '../../application/learning-service';
import { blockKey } from '../../application/analyst-content';
import type { BlockNotInUse } from '../../application/analyst-content';
import { BLOCK_ROLES, ledgerTexts } from '../../config/learning-ledger';
import type { BlockRole, Ledger } from '../../config/learning-ledger';
import type { TrainedStyle } from '../../config/trained-style';
import { MAX_STYLE_TEXTS, splitTexts } from '../../domain/style-learn';
import type { IngestEntry, IngestReport } from '../../domain/style-corpus';
import type { TrainingProposal } from '../../domain/style-train';
import { COMMUNICATION_TYPES } from '../../domain/types';
import type { CommunicationType, LanguageProfile } from '../../domain/types';

interface Props {
  profile: LanguageProfile;
  ledger: Ledger | null;
  trained: TrainedStyle | null;
  /** Itens do estilo treinado que deixaram de passar nas regras em vigor (continuam guardados). */
  trainedOut: readonly string[];
  /** Trechos guardados que não estão em uso (fora das regras ou ainda sem repetição), com o motivo. */
  blocksNotInUse: readonly BlockNotInUse[];
  /** Perfil assinado exigido pela organização: o estilo treinado não se aplica, mas o aprendizado continua acumulando. */
  styleLocked: boolean;
  onIngest: (entries: IngestEntry[]) => Promise<IngestReport>;
  onTrain: () => Promise<TrainingProposal>;
  onApprove: (proposal: TrainingProposal, ids: string[]) => Promise<void>;
  onClearTrained: () => Promise<void>;
  onForget: (type: CommunicationType, role: BlockRole | 'label', text: string) => Promise<void>;
  onResetAll: () => Promise<void>;
  onExport: (password: string) => Promise<void>;
  onInspect: (fileText: string) => void;
  onPreview: (fileText: string, password: string) => Promise<ImportPreview>;
  onAssimilate: (preview: ImportPreview) => Promise<ImportReport>;
  onAnnounce: (message: string) => void;
}

const ROLE_LABEL: Record<BlockRole | 'label', string> = { opening: 'Abertura', request: 'Pedido', closing: 'Fecho', label: 'Rótulo' };
const GENERIC_ERROR = 'Não foi possível concluir. Nada foi alterado.';
const errorText = (e: unknown): string => (e instanceof LearningCryptoError ? e.message : GENERIC_ERROR);

/**
 * Aprendizado contínuo da equipe, todo local: o analista alimenta com textos, treina sob demanda, aprova o que
 * virou estilo, e pode exportar e importar cifrado com senha. Nada sai do navegador sem o arquivo que ele baixa.
 */
export function TeamLearning(props: Props) {
  const { profile, ledger, trained, trainedOut, blocksNotInUse, styleLocked, onAnnounce } = props;
  const blockOut = blocksNotInUse.filter((b) => b.state === 'out');
  const blockStatus = new Map(blocksNotInUse.map((b) => [blockKey(b.type, b.role, b.text), b]));
  const id = useId();
  const total = ledger ? ledgerTexts(ledger) : 0;

  const [batch, setBatch] = useState('');
  const [batchType, setBatchType] = useState<CommunicationType>('request_information');
  const [report, setReport] = useState<IngestReport | null>(null);
  const [proposal, setProposal] = useState<TrainingProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [importPw, setImportPw] = useState('');
  const [importError, setImportError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importDone, setImportDone] = useState<ImportReport | null>(null);

  const accumulate = async (): Promise<void> => {
    const texts = splitTexts(batch);
    if (texts.length === 0) return;
    try {
      const result = await props.onIngest(texts.map((text) => ({ text, type: batchType })));
      setReport(result);
      setBatch('');
      setApproved(false);
      onAnnounce(`${result.accepted} texto(s) acumulado(s), ${result.rejected.length} recusado(s).`);
    } catch {
      onAnnounce(GENERIC_ERROR);
    }
  };

  const train = async (): Promise<void> => {
    try {
      const p = await props.onTrain();
      setProposal(p);
      // Rótulos mudam o formato do texto (desligam o estilo natural), então começam desmarcados.
      setChosen(new Set(p.items.filter((i) => i.kind !== 'label').map((i) => i.id)));
      setApproved(false);
      onAnnounce(p.items.length > 0 ? `Treino concluído: ${p.items.length} proposta(s) para revisar.` : 'Treino concluído: nenhuma proposta nova.');
    } catch {
      onAnnounce(GENERIC_ERROR);
    }
  };

  const approve = async (): Promise<void> => {
    if (!proposal) return;
    await props.onApprove(proposal, [...chosen]);
    setApproved(true);
    setProposal(null);
    onAnnounce('Estilo treinado aplicado às próximas prévias.');
  };

  const exportFile = async (): Promise<void> => {
    if (pw !== pw2) {
      setExportMsg({ ok: false, text: 'As duas senhas precisam ser iguais.' });
      return;
    }
    try {
      await props.onExport(pw);
      setExportMsg({ ok: true, text: 'Arquivo cifrado gerado. Compartilhe a senha por outro canal.' });
      setPw('');
      setPw2('');
    } catch (e) {
      setExportMsg({ ok: false, text: errorText(e) });
    }
  };

  const pickFile = async (file: File | undefined): Promise<void> => {
    setPreview(null);
    setImportDone(null);
    setImportError('');
    if (!file) return;
    const text = await file.text();
    try {
      // A versão é conferida logo, antes de pedir a senha.
      props.onInspect(text);
      setFileText(text);
      setFileName(file.name);
    } catch (e) {
      setFileText('');
      setFileName('');
      setImportError(errorText(e));
    }
  };

  const readFile = async (): Promise<void> => {
    try {
      setPreview(await props.onPreview(fileText, importPw));
      setImportError('');
    } catch (e) {
      setPreview(null);
      setImportError(errorText(e));
    } finally {
      setImportPw('');
    }
  };

  const assimilate = async (): Promise<void> => {
    if (!preview) return;
    try {
      const done = await props.onAssimilate(preview);
      setImportDone(done);
      setPreview(null);
      setFileText('');
      setFileName('');
      onAnnounce('Aprendizado importado.');
    } catch (e) {
      setImportError(errorText(e));
    }
  };

  const trainedList: string[] = [];
  for (const [type, t] of Object.entries(trained?.openings ?? {})) trainedList.push(`Abertura de ${profile.categoryNames[type as CommunicationType]}: ${t}`);
  for (const [type, t] of Object.entries(trained?.closings ?? {})) trainedList.push(`Fecho de ${profile.categoryNames[type as CommunicationType]}: ${t}`);
  for (const [key, t] of Object.entries(trained?.labels ?? {})) trainedList.push(`Rótulo (${key}): ${t}`);

  return (
    <section className="stack" aria-label="Aprendizado da equipe">
      <h3>Aprendizado da equipe</h3>
      <p className="subtle">
        Cole textos reais da equipe e a extensão acumula, neste navegador, as aberturas, os pedidos, os fechos e os rótulos que se repetem
        (sem nomes, datas ou números de chamado, que viram campos). Treine quando quiser, aprove o que virou estilo e, se precisar,
        exporte cifrado com senha para um colega que use a mesma versão da extensão. Nada é enviado pela rede.
      </p>

      <p role="status">
        {total === 0 ? 'Nada acumulado ainda.' : `${total} texto(s) acumulado(s) desde ${ledger?.since}.`}
        {proposal === null && ledger && total > 0 && total > ledger.textsAtTraining
          ? ` ${total - ledger.textsAtTraining} texto(s) novo(s) desde o último treino.`
          : ''}
      </p>

      <div className="field">
        <label htmlFor={`${id}-batch`}>Textos da equipe (até {MAX_STYLE_TEXTS}, separados por uma linha com ---)</label>
        <textarea id={`${id}-batch`} rows={7} value={batch} autoComplete="off" spellCheck onChange={(e) => setBatch(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-batch-type`}>Tipo dos textos colados</label>
        <select id={`${id}-batch-type`} value={batchType} onChange={(e) => setBatchType(e.target.value as CommunicationType)}>
          {COMMUNICATION_TYPES.map((t) => <option key={t} value={t}>{profile.categoryNames[t]}</option>)}
        </select>
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={() => void accumulate()} disabled={!batch.trim()}>Acumular textos</button>
      </div>
      {report && (
        <div role="status" className="panel info">
          <p>{report.accepted} texto(s) acumulado(s); {report.blocks} trecho(s) e {report.labels} rótulo(s) registrados; {report.discarded} descartado(s) por não serem redação reaproveitável.</p>
          {report.rejected.length > 0 && (
            <ul>
              {report.rejected.map((r) => <li key={r.index}>Texto {r.index + 1} recusado: {r.reason}.</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="row">
        <button type="button" onClick={() => void train()} disabled={total === 0}>Treinar agora</button>
      </div>
      {proposal && (
        <div className="stack">
          {proposal.items.length === 0 ? (
            <p role="status" className="panel warn">Nenhuma proposta: ainda não há padrão que se repita o bastante.</p>
          ) : (
            <>
              <h4>Propostas para revisar</h4>
              <ul className="list" aria-label="Propostas de estilo">
                {proposal.items.map((item) => (
                  <li key={item.id}>
                    <div className="row">
                      <input
                        id={`${id}-p-${item.id}`}
                        type="checkbox"
                        checked={chosen.has(item.id)}
                        onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(item.id); else n.delete(item.id); return n; })}
                      />
                      <label htmlFor={`${id}-p-${item.id}`}>
                        {item.kind === 'opening' ? 'Abertura' : item.kind === 'closing' ? 'Fecho' : 'Rótulo'}
                        {item.type ? ` de ${profile.categoryNames[item.type]}` : ''}: <strong>{item.text}</strong>
                      </label>
                    </div>
                    <p className="subtle">
                      Aparece em {item.count} de {item.of} textos. Hoje a extensão usa: {item.replaces}
                      {item.kind === 'label' ? ' Marcar rótulos muda o formato dos textos (usa os rótulos em vez do estilo natural).' : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="row">
                <button type="button" className="primary" onClick={() => void approve()} disabled={chosen.size === 0}>Aplicar selecionados</button>
              </div>
            </>
          )}
          {proposal.notes.length > 0 && (
            <details>
              <summary>Por que algo não virou proposta ({proposal.notes.length})</summary>
              <ul>{proposal.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {approved && <p role="status" className="panel ok">Estilo treinado aplicado. As próximas prévias já usam.</p>}

      {styleLocked && (
        <p role="note" className="panel info">
          A organização exige perfil assinado: o estilo treinado fica guardado, mas não é aplicado enquanto essa exigência valer. A montagem por trechos
          e a exportação continuam disponíveis.
        </p>
      )}
      {trainedList.length > 0 && (
        <div className="panel info">
          <p>Estilo treinado em uso:</p>
          <ul>{trainedList.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <div className="row">
            <button type="button" onClick={() => void props.onClearTrained().then(() => onAnnounce('Estilo treinado removido.'))}>Remover estilo treinado</button>
          </div>
        </div>
      )}
      {trainedOut.length > 0 && (
        <div role="status" className="panel warn">
          <p>Fora de uso por não passar mais nas regras atuais (continua guardado):</p>
          <ul>{trainedOut.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {blockOut.length > 0 && (
        <div role="status" className="panel warn">
          <p>Trechos fora de uso por trazerem dado de chamado ou não passarem nas regras atuais (continuam guardados até você esquecer):</p>
          <ul className="list" aria-label="Trechos fora de uso">
            {blockOut.map((b) => (
              <li key={blockKey(b.type, b.role, b.text)}>
                <p><strong>{ROLE_LABEL[b.role]}</strong> em {profile.categoryNames[b.type]}: {b.text} {b.reasons.join(' ')}</p>
                <button type="button" onClick={() => void props.onForget(b.type, b.role, b.text)} aria-label={`Esquecer ${ROLE_LABEL[b.role].toLowerCase()} fora de uso: ${b.text}`}>Esquecer</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ledger && total > 0 && (
        <details>
          <summary>Ver o que foi guardado</summary>
          <p className="subtle">Só redação, já com os dados variáveis trocados por campos. Remova o que não quiser manter.</p>
          {COMMUNICATION_TYPES.filter((t) => ledger.byType[t]).map((type) => {
            const bucket = ledger.byType[type]!;
            return (
              <div key={type} className="stack">
                <h4>{profile.categoryNames[type]} ({bucket.texts} texto(s))</h4>
                <ul className="list" aria-label={`Guardado em ${profile.categoryNames[type]}`}>
                  {BLOCK_ROLES.flatMap((role) => bucket.blocks.filter((b) => b.role === role)).map((b) => (
                    <li key={`${b.role}|${b.text}`}>
                      <p>
                        <strong>{ROLE_LABEL[b.role]}</strong> ({b.count}x): {b.text}
                        {blockStatus.get(blockKey(type, b.role, b.text))?.state === 'waiting' ? ' (aguardando repetição para ser usado)' : ''}
                        {blockStatus.get(blockKey(type, b.role, b.text))?.state === 'out' ? ' (fora de uso)' : ''}
                      </p>
                      <button type="button" onClick={() => void props.onForget(type, b.role, b.text)} aria-label={`Esquecer ${ROLE_LABEL[b.role].toLowerCase()}: ${b.text}`}>Esquecer</button>
                    </li>
                  ))}
                  {bucket.labels.map((l) => (
                    <li key={`label|${l.text}`}>
                      <p><strong>Rótulo</strong> ({l.count}x): {l.text}</p>
                      <button type="button" onClick={() => void props.onForget(type, 'label', l.text)} aria-label={`Esquecer rótulo: ${l.text}`}>Esquecer</button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </details>
      )}

      <h4>Compartilhar com a equipe (cifrado)</h4>
      <p className="subtle">
        O arquivo é cifrado com AES-256-GCM e uma chave derivada da senha (PBKDF2). Leva a versão exata da extensão: só abre em quem usa a mesma versão.
        A senha tem pelo menos {MIN_PASSWORD_LENGTH} caracteres e não é guardada.
      </p>
      <div className="field">
        <label htmlFor={`${id}-pw`}>Senha do arquivo</label>
        <input id={`${id}-pw`} type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-pw2`}>Repita a senha</label>
        <input id={`${id}-pw2`} type="password" value={pw2} autoComplete="new-password" onChange={(e) => setPw2(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" onClick={() => void exportFile()}>Exportar aprendizado cifrado</button>
      </div>
      {exportMsg && (
        <p role={exportMsg.ok ? 'status' : 'alert'} className={exportMsg.ok ? 'panel ok' : 'panel block'}>{exportMsg.text}</p>
      )}

      <div className="field">
        <label htmlFor={`${id}-file`}>Importar aprendizado cifrado (arquivo JSON)</label>
        <input id={`${id}-file`} type="file" accept="application/json,.json" onChange={(e) => void pickFile(e.target.files?.[0])} />
      </div>
      {fileText && !preview && (
        <>
          <p className="subtle">Arquivo {fileName}: versão compatível. Informe a senha para ler.</p>
          <div className="field">
            <label htmlFor={`${id}-ipw`}>Senha do arquivo recebido</label>
            <input id={`${id}-ipw`} type="password" value={importPw} autoComplete="off" onChange={(e) => setImportPw(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" onClick={() => void readFile()} disabled={!importPw}>Ler arquivo</button>
          </div>
        </>
      )}
      {importError && <p role="alert" className="panel block">{importError}</p>}
      {preview && (
        <div role="status" className="panel info">
          <p>
            Arquivo gerado pela extensão {preview.summary.fromVersion} em {preview.summary.createdAt.slice(0, 10)}: {preview.summary.texts} texto(s), {preview.summary.blocks} trecho(s),
            {' '}{preview.summary.trainedItems} item(ns) de estilo treinado e {preview.summary.styleItems} de saudação, fecho ou assinatura.
            {preview.summary.dropped > 0 ? ` ${preview.summary.dropped} item(ns) não passam nas regras atuais e ficam de fora.` : ''}
          </p>
          <p className="subtle">As contagens são somadas às suas. O que você já aprovou não é sobrescrito. Nada foi gravado ainda.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => void assimilate()}>Assimilar</button>
            <button type="button" onClick={() => setPreview(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {importDone && (
        <p role="status" className="panel ok">
          Importado: {importDone.texts} texto(s) somados, {importDone.trainedItems} item(ns) de estilo treinado e {importDone.styleItems} de estilo preenchidos.
        </p>
      )}

      {total > 0 || trained ? (
        <div className="row">
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)}>Apagar todo o aprendizado</button>
          ) : (
            <>
              <button type="button" onClick={() => void props.onResetAll().then(() => { setConfirmReset(false); setReport(null); setProposal(null); onAnnounce('Aprendizado apagado.'); })}>
                Confirmar: apagar o aprendizado
              </button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancelar</button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
