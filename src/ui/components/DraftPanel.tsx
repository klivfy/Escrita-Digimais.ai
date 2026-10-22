import { useEffect, useId, useRef, useState } from 'react';
import { DRAFT_CLASS_LABELS, DRAFT_CLASSES } from '../../config/draft-rules';
import type { DraftClass } from '../../config/draft-rules';
import { assembleDraft, classifyDraft, LOW_CONFIDENCE } from '../../domain/draft';
import type { DraftAssignment, DraftBias, DraftFields, DraftSegment, DraftTarget } from '../../domain/draft';
import { CATEGORY_LABELS, scanText } from '../../domain/sensitive';
import type { ContextField } from '../../domain/types';
import { MAX_TOTAL_CHARS } from '../../config/limits';
import type { FixTarget } from '../../application/style-learning';

/** Em que campo do formulário cada destino cai. */
const TARGET_FIELD: Record<Exclude<DraftTarget, 'ignore'>, ContextField> = {
  summary: 'summary',
  action: 'actions',
  result: 'observedResult',
  pending: 'pendingItem',
  expected: 'expectedAction',
  question: 'questions',
  notes: 'notes',
};

const TARGET_LABEL: Record<DraftTarget, string> = {
  ...DRAFT_CLASS_LABELS,
  notes: 'Observações',
  ignore: 'Descartar este trecho',
};

interface Row {
  seg: DraftSegment;
  target: DraftTarget;
}

interface Props {
  /** Campos exibidos no tipo de texto atual. */
  available: ReadonlySet<ContextField>;
  internalDomains: string[];
  bias: DraftBias;
  onApply: (fields: DraftFields) => void;
  onFixes: (fixes: [DraftClass, FixTarget][]) => void;
  /** Contadores de uso (sem conteúdo): dividiu uma anotação, preencheu o formulário. */
  onEvent: (event: 'draft_split' | 'draft_apply') => void;
  /** Anúncio para leitores de tela, na região ao vivo única do painel. */
  onAnnounce: (message: string) => void;
}

const isAvailable = (t: DraftTarget, available: ReadonlySet<ContextField>): boolean =>
  t === 'ignore' || available.has(TARGET_FIELD[t]);

function initialTarget(seg: DraftSegment, available: ReadonlySet<ContextField>): DraftTarget {
  if (isAvailable(seg.predicted, available)) return seg.predicted;
  return available.has('notes') ? 'notes' : 'ignore';
}

/**
 * Rascunho livre: o analista cola a anotação bruta, confere a divisão sugerida e só então os campos são preenchidos.
 * O texto vive apenas neste componente e é descartado ao aplicar, limpar ou trocar de tela.
 */
export function DraftPanel({ available, internalDomains, bias, onApply, onFixes, onEvent, onAnnounce }: Props) {
  const id = useId();
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const hadRows = useRef(false);

  // O botão que o analista acionou sai da tela: leva o foco para o resultado (ao dividir) ou de volta ao campo (ao concluir).
  useEffect(() => {
    if (rows && !hadRows.current) headingRef.current?.focus();
    if (!rows && hadRows.current) rawRef.current?.focus();
    hadRows.current = rows !== null;
  }, [rows]);

  const divide = (): void => {
    setError('');
    if (!raw.trim()) {
      setError('Cole ou escreva a anotação antes de dividir.');
      return;
    }
    if (raw.length > MAX_TOTAL_CHARS) {
      setError('A anotação é grande demais. Resuma antes de dividir.');
      return;
    }
    const blocking = scanText(raw, { internalDomains }).filter((f) => f.blocking);
    if (blocking.length > 0) {
      const kinds = [...new Set(blocking.map((f) => CATEGORY_LABELS[f.category]))].join(', ');
      setError(`A anotação contém dado que bloqueia a geração (${kinds}). Remova esse trecho antes de dividir.`);
      return;
    }
    const segs = classifyDraft(raw, bias);
    if (segs.length === 0) {
      setError('Não encontrei trechos para dividir. Escreva frases curtas, uma por linha.');
      return;
    }
    onEvent('draft_split');
    onAnnounce(`Anotação dividida em ${segs.length} ${segs.length === 1 ? 'trecho' : 'trechos'}. Confira o campo de cada um e preencha o formulário.`);
    setRows(segs.map((seg) => ({ seg, target: initialTarget(seg, available) })));
  };

  const setTarget = (index: number, target: DraftTarget): void =>
    setRows((rs) => rs?.map((r, i) => (i === index ? { ...r, target } : r)) ?? null);

  const apply = (): void => {
    if (!rows) return;
    const items: DraftAssignment[] = rows.map((r) => ({ text: r.seg.text, target: r.target, planned: r.target === 'action' && r.seg.planned }));
    const fixes: [DraftClass, FixTarget][] = [];
    for (const r of rows) {
      if (r.target !== r.seg.predicted && r.target !== 'notes') fixes.push([r.seg.predicted, r.target]);
    }
    onApply(assembleDraft(items));
    onEvent('draft_apply');
    if (fixes.length > 0) onFixes(fixes);
    setRows(null);
    setRaw('');
  };

  const discard = (): void => {
    onAnnounce('Anotação descartada.');
    setRows(null);
    setRaw('');
    setError('');
  };

  return (
    <details>
      <summary>Colar uma anotação livre (opcional)</summary>
      <div className="stack">
        <p className="subtle">
          Cole a sua anotação como ela está. A extensão sugere em qual campo cada trecho entra, e você confere antes de
          preencher o formulário. Nada é preenchido sem a sua confirmação, e o texto da anotação não é guardado.
        </p>
        <div className="field">
          <label htmlFor={`${id}-raw`}>Anotação livre</label>
          <textarea ref={rawRef} id={`${id}-raw`} rows={5} value={raw} spellCheck onChange={(e) => setRaw(e.target.value)} disabled={rows !== null} />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {rows === null ? (
          <div className="row">
            <button type="button" onClick={divide}>Dividir em campos</button>
          </div>
        ) : (
          <section aria-labelledby={`${id}-title`} className="panel info">
            <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1}>Confira a divisão ({rows.length} trechos)</h3>
            <p className="subtle">
              A sugestão pode errar. Ajuste o campo de cada trecho. Trechos de campos que não existem neste tipo de texto
              vão para Observações ou são descartados.
            </p>
            <ol className="list">
              {rows.map((r, i) => (
                <li key={`${i}-${r.seg.text}`}>
                  <p>
                    {r.seg.text}
                    {r.seg.confidence < LOW_CONFIDENCE && <span className="tag warning"> Revise</span>}
                  </p>
                  <div className="field">
                    <label htmlFor={`${id}-t${i}`}>Campo do trecho {i + 1}</label>
                    <select id={`${id}-t${i}`} value={r.target} onChange={(e) => setTarget(i, e.target.value as DraftTarget)}>
                      {[...DRAFT_CLASSES, 'notes' as const, 'ignore' as const].map((t) => (
                        <option key={t} value={t} disabled={!isAvailable(t, available)}>
                          {TARGET_LABEL[t]}
                          {isAvailable(t, available) ? '' : ' (indisponível neste tipo)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="subtle">{r.seg.planned && r.target === 'action' ? 'Será marcada como planejada. ' : ''}{r.seg.reason}</p>
                </li>
              ))}
            </ol>
            <div className="row">
              <button type="button" className="primary" onClick={apply}>Preencher o formulário</button>
              <button type="button" onClick={discard}>Descartar a anotação</button>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
