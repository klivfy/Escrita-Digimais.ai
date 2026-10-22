import { useEffect, useRef, useState } from 'react';
import { loadFreqIndex } from '../../application/proofread-data';
import { applySuggestion, applySuggestions, proofreadAll, SPELLING_RULES } from '../../domain/proofread';
import type { FreqIndex, ProofreadSuggestion } from '../../domain/proofread';

interface Props {
  text: string;
  onChange: (text: string) => void;
  onClear: () => void;
  onCopy: (text: string) => Promise<void>;
  onAnnounce: (message: string) => void;
  /** Carrega a lista de palavras. Padrão: a lista do pacote. Existe para os testes. */
  loadIndex?: () => Promise<FreqIndex>;
}

const RULE_LABEL = { acento: 'Acento', grafia: 'Grafia', concordancia: 'Concordância', crase: 'Crase', uso: 'Uso da palavra' } as const;
const CONTEXT_CHARS = 24;

function contextOf(text: string, s: ProofreadSuggestion): string {
  const before = text.slice(Math.max(0, s.start - CONTEXT_CHARS), s.start).replace(/\s+/g, ' ');
  const after = text.slice(s.end, s.end + CONTEXT_CHARS).replace(/\s+/g, ' ');
  return `${s.start > CONTEXT_CHARS ? '…' : ''}${before}${s.original}${after}${s.end + CONTEXT_CHARS < text.length ? '…' : ''}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Corrige acento e grafia de palavras comuns. Só sugere: cada troca exige uma ação do analista, e a anterior pode ser
 * desfeita. O texto vive apenas em memória (no App) e some com "Limpar tudo" ou por inatividade.
 */
export function ProofreadMode({ text, onChange, onClear, onCopy, onAnnounce, loadIndex = loadFreqIndex }: Props) {
  const [checked, setChecked] = useState<{ text: string; suggestions: ProofreadSuggestion[] } | null>(null);
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [previous, setPrevious] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(false);
  const indexRef = useRef<FreqIndex | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const focusAt = useRef<number | null>(null);

  // O resultado só vale para o texto que foi verificado. Qualquer edição o deixa desatualizado.
  const shown = text ? checked : null;
  const current = shown && shown.text === text ? shown.suggestions : null;
  const stale = shown !== null && shown.text !== text;

  // Depois de aceitar ou ignorar, o botão acionado sai da tela: o foco vai para a próxima sugestão (ou para o título).
  useEffect(() => {
    if (focusAt.current === null) return;
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('li button:first-of-type');
    const target = focusAt.current >= 0 && items && items.length ? items[Math.min(focusAt.current, items.length - 1)] : headingRef.current;
    focusAt.current = null;
    target?.focus();
  }, [checked]);

  const run = (value: string, skip: ReadonlySet<string>, index: FreqIndex): ProofreadSuggestion[] => {
    const suggestions = proofreadAll(value, index, { ignore: skip });
    setChecked({ text: value, suggestions });
    return suggestions;
  };

  const verify = async (): Promise<void> => {
    if (!text.trim()) {
      setProblem('Cole ou digite o texto a verificar.');
      setChecked(null);
      onAnnounce('Cole ou digite o texto a verificar.');
      return;
    }
    setProblem('');
    setLoading(true);
    try {
      indexRef.current ??= await loadIndex();
    } catch {
      setLoading(false);
      setProblem('Não foi possível carregar a lista de palavras. Feche e abra o painel e tente de novo.');
      onAnnounce('Não foi possível carregar a lista de palavras.');
      return;
    }
    setLoading(false);
    setIgnored(new Set());
    const found = run(text, new Set(), indexRef.current);
    focusAt.current = -1;
    onAnnounce(found.length ? `${plural(found.length, 'sugestão encontrada', 'sugestões encontradas')}. Confira cada uma antes de aceitar.` : 'Nenhuma sugestão.');
  };

  const accept = (index: number): void => {
    if (!current || !indexRef.current) return;
    const s = current[index];
    const next = applySuggestion(text, s);
    setPrevious(text);
    onChange(next);
    const rest = run(next, ignored, indexRef.current);
    focusAt.current = index;
    onAnnounce(`Trocado ${s.original} por ${s.replacement}. ${rest.length ? plural(rest.length, 'sugestão restante', 'sugestões restantes') : 'Nenhuma sugestão restante'}.`);
  };

  // Só acento e grafia entram em "aceitar todas": concordância, crase e uso de palavra pedem conferência uma a uma.
  const spelling = current?.filter((s) => SPELLING_RULES.has(s.rule)) ?? [];
  const acceptSpelling = (): void => {
    if (!spelling.length || !indexRef.current) return;
    const next = applySuggestions(text, spelling);
    setPrevious(text);
    onChange(next);
    const rest = run(next, ignored, indexRef.current);
    focusAt.current = 0;
    onAnnounce(`${plural(spelling.length, 'troca aplicada', 'trocas aplicadas')}. ${rest.length ? plural(rest.length, 'sugestão restante', 'sugestões restantes') : 'Nenhuma sugestão restante'}.`);
  };

  const ignore = (index: number): void => {
    if (!current || !indexRef.current) return;
    const word = current[index].original.toLocaleLowerCase('pt-BR');
    const skip = new Set(ignored).add(word);
    setIgnored(skip);
    run(text, skip, indexRef.current);
    focusAt.current = index;
    onAnnounce(`Palavra ${current[index].original} ignorada nesta sessão.`);
  };

  const undo = (): void => {
    if (previous === null) return;
    onChange(previous);
    setPrevious(null);
    onAnnounce('Última alteração desfeita. Verifique de novo para ver as sugestões.');
  };

  return (
    <section aria-labelledby="proofread-mode-title" className="stack">
      <h2 id="proofread-mode-title">Corrigir texto</h2>
      <p className="subtle">
        Encontra acento ausente, palavras comuns escritas errado e erros frequentes de concordância, crase e uso de
        palavras parecidas (mas e mais, há e a). Não é uma revisão gramatical completa e deixa passar erros. Nada é
        trocado sem a sua ação, e o texto não é enviado nem salvo.
      </p>
      <form
        className="stack"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <div className="field">
          <label htmlFor="proofread-text">Texto a corrigir</label>
          <textarea
            id="proofread-text"
            className="preview"
            rows={12}
            value={text}
            autoComplete="off"
            spellCheck
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'proofread-problem' : undefined}
            onChange={(e) => {
              onChange(e.target.value);
              setPrevious(null);
              setProblem('');
            }}
          />
          {problem && <p id="proofread-problem" role="alert" className="error-text">{problem}</p>}
        </div>
        <div className="row">
          <button type="submit" className="primary" disabled={loading}>{loading ? 'Carregando a lista de palavras' : 'Verificar texto'}</button>
          <button
            type="button"
            onClick={() => {
              setChecked(null);
              setPrevious(null);
              setProblem('');
              setIgnored(new Set());
              onClear();
            }}
          >
            Limpar texto
          </button>
        </div>
      </form>

      {stale && <p className="subtle" role="note">O texto mudou desde a última verificação. Verifique de novo para ver as sugestões.</p>}

      {current && (
        <div className="stack" role="region" aria-labelledby="proofread-result-title">
          <h3 id="proofread-result-title" ref={headingRef} tabIndex={-1}>
            {current.length ? `Sugestões (${current.length})` : 'Nenhuma sugestão'}
          </h3>
          {current.length === 0 ? (
            <p className="panel ok" role="status">
              Não encontrei nada pelas regras desta tela. Isso não garante que o texto esteja correto.
            </p>
          ) : (
            <>
              <p className="subtle">Cada troca só acontece quando você aceita; confira o motivo antes. Palavras ignoradas valem só até a próxima verificação.</p>
              <ol className="list" ref={listRef}>
                {current.map((s, i) => (
                  <li key={`${s.start}-${s.original}`}>
                    <p>
                      Trocar <mark>{s.original}</mark> por <strong>{s.replacement}</strong>
                      {' '}
                      <span className="tag info">{RULE_LABEL[s.rule]}</span>
                    </p>
                    <p className="subtle">{s.reason}</p>
                    <p className="subtle"><code className="ctx">{contextOf(text, s)}</code></p>
                    <div className="row">
                      <button type="button" onClick={() => accept(i)} aria-label={`Aceitar: trocar ${s.original} por ${s.replacement}`}>Aceitar</button>
                      <button type="button" onClick={() => ignore(i)} aria-label={`Ignorar a palavra ${s.original}`}>Ignorar</button>
                    </div>
                  </li>
                ))}
              </ol>
              {spelling.length > 1 && (
                <div className="row">
                  <button type="button" onClick={acceptSpelling}>Aceitar acentos e grafia ({spelling.length})</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(previous !== null || text.trim()) && (
        <div className="row">
          {previous !== null && <button type="button" onClick={undo}>Desfazer a última alteração</button>}
          {text.trim() && <button type="button" onClick={() => void onCopy(text)}>Copiar texto</button>}
        </div>
      )}
    </section>
  );
}
