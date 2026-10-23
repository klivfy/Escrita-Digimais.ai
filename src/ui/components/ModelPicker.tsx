import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LibraryModel, ModelLibrary } from '../../config/library-schema';
import { buildSearchIndex, countEligible, searchModels } from '../../domain/library-search';
import { TAUGHT_ID_PREFIX } from '../../domain/teach';
import type { CommunicationType, Recipient } from '../../domain/types';

interface Props {
  library: ModelLibrary;
  type: CommunicationType;
  typeName: string;
  recipient: Recipient;
  /** O que o analista já descreveu no formulário. Com o campo de busca vazio, alimenta as sugestões. */
  contextQuery?: string;
  onPick: (model: LibraryModel) => void;
  /** Contadores de uso (sem conteúdo): lista exibida, "nenhum destes". O uso do modelo é contado por quem o insere. */
  onEvent: (key: 'library.shown' | 'library.none') => void;
  onAnnounce: (message: string) => void;
}

const SNIPPET = 110;
const SUGGEST_MIN_CHARS = 12;
const SUGGEST_MIN_SCORE = 0.2;
const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > SNIPPET ? `${flat.slice(0, SNIPPET).trimEnd()}…` : flat;
};

/**
 * Busca de modelo da biblioteca da instituição. Mostra até 3 opções e "Nenhum destes"; nunca escolhe sozinha, e escolher
 * só leva o texto para a prévia editável (a cópia continua dependendo do analista).
 */
export function ModelPicker({ library, type, typeName, recipient, contextQuery = '', onPick, onEvent, onAnnounce }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [anyType, setAnyType] = useState(false);
  const shownRef = useRef(false);
  // Depois de escolher ou dizer "nenhum", as sugestões somem até o analista mudar o que descreveu.
  const [dismissedFor, setDismissedFor] = useState('');
  // O pai passa uma função nova a cada render; guardar a mais recente evita que o efeito rode de novo por causa dela.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const index = useMemo(() => buildSearchIndex(library.models), [library]);
  const typed = useMemo(() => searchModels(index, query, { type, recipient, anyType, limit: 3 }), [index, query, type, recipient, anyType]);
  // Sem nada digitado na busca, sugere os parecidos com o que o analista descreveu no formulário (nunca escolhe sozinha).
  const suggestible = contextQuery.trim().length >= SUGGEST_MIN_CHARS;
  const suggested = useMemo(
    () => (suggestible && dismissedFor !== contextQuery ? searchModels(index, contextQuery, { type, recipient, limit: 3, minScore: SUGGEST_MIN_SCORE }) : []),
    [index, contextQuery, suggestible, dismissedFor, type, recipient],
  );
  const available = useMemo(() => countEligible(index, { type, recipient, anyType }), [index, type, recipient, anyType]);
  const typing = query.trim().length > 0;
  const hits = typing ? typed : suggested;
  const searching = typing || suggested.length > 0;
  const hasHits = hits.length > 0;

  // Conta uma vez por "busca" (do primeiro resultado exibido até escolher, dizer "nenhum" ou limpar o campo).
  // Só depende de haver resultado, e não da lista nem do pai: mudar o formulário ou a consulta sem mudar isso não recontam.
  useEffect(() => {
    if (searching && hasHits && !shownRef.current) {
      shownRef.current = true;
      onEventRef.current('library.shown');
    }
    if (!searching) shownRef.current = false;
  }, [searching, hasHits]);

  const none = (): void => {
    onEventRef.current('library.none');
    shownRef.current = false;
    setDismissedFor(contextQuery);
    setQuery('');
    onAnnounce('Nenhum modelo escolhido. Preencha o formulário normalmente.');
  };

  const pick = (model: LibraryModel): void => {
    shownRef.current = false;
    setDismissedFor(contextQuery);
    setQuery('');
    onPick(model);
  };

  const status = searching
    ? hits.length === 0
      ? 'Nenhum modelo parecido encontrado.'
      : typing
        ? `${hits.length} ${hits.length === 1 ? 'modelo encontrado' : 'modelos encontrados'}.`
        : `${hits.length} ${hits.length === 1 ? 'modelo parecido' : 'modelos parecidos'} com o que você descreveu no formulário.`
    : available === 0
      ? `Não há modelos para "${typeName}" neste destinatário.`
      : 'Digite o que você precisa dizer para buscar.';

  return (
    <details>
      <summary>
        Buscar um modelo pronto da instituição (opcional)
        {!typing && suggested.length > 0 ? ` · ${suggested.length} ${suggested.length === 1 ? 'parecido' : 'parecidos'} com o que você descreveu` : ''}
      </summary>
      <div className="stack">
        <p className="subtle">
          Escolher um modelo coloca o texto na prévia, onde você pode editar antes de copiar. Nada é copiado nem preenchido sozinho.
        </p>
        <div className="field">
          <label htmlFor={`${id}-q`}>Buscar modelo</label>
          <input
            id={`${id}-q`}
            type="text"
            value={query}
            autoComplete="off"
            spellCheck
            aria-describedby={`${id}-status`}
            onChange={(e) => setQuery(e.target.value)}
            // O campo fica dentro do formulário de geração: Enter não pode gerar a prévia.
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
          />
          <span id={`${id}-status`} className="subtle" role="status">{status}</span>
        </div>
        <div className="row">
          <input id={`${id}-any`} type="checkbox" checked={anyType} onChange={(e) => setAnyType(e.target.checked)} />
          <label htmlFor={`${id}-any`}>Buscar em todos os tipos de comunicação</label>
        </div>
        {hits.length > 0 && (
          <ol className="list" aria-label="Modelos encontrados">
            {hits.map(({ model }) => (
              <li key={model.id}>
                <p>
                  <strong>{model.title}</strong>
                  {model.id.startsWith(TAUGHT_ID_PREFIX) ? <span className="subtle"> · ensinado por você</span> : null}
                </p>
                <p className="subtle">{snippet(model.text)}</p>
                <div className="row">
                  <button type="button" onClick={() => pick(model)} aria-label={`Usar o modelo: ${model.title}`}>Usar este modelo</button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {searching && (
          <div className="row">
            <button type="button" onClick={none}>Nenhum destes</button>
          </div>
        )}
      </div>
    </details>
  );
}
