import type { ReviewFormState } from '../../application/review-form';
import { RECIPIENT_LABELS } from '../../config/fields';
import type { ReviewResult } from '../../domain/review';
import { COMMUNICATION_TYPES, RECIPIENTS } from '../../domain/types';
import type { LanguageProfile } from '../../domain/types';
import { QualityPanel, WarningsList } from './ReviewPanel';

interface Props {
  form: ReviewFormState;
  onChange: (patch: Partial<ReviewFormState>) => void;
  profile: LanguageProfile;
  result: ReviewResult | null;
  problem: string | null;
  onReview: () => void;
  onClear: () => void;
}

/** Revisa um texto que o analista já escreveu. Nunca altera o texto: só alerta e sugere. */
export function ReviewMode({ form, onChange, profile, result, problem, onReview, onClear }: Props) {
  const over = form.text.length > profile.maxLength;
  return (
    <section aria-labelledby="review-mode-title" className="stack">
      <h2 id="review-mode-title">Revisar um texto pronto</h2>
      <p className="subtle">
        Cole um texto que você já escreveu para receber alertas e sugestões pelas regras locais. O texto não é alterado,
        enviado nem salvo.
      </p>
      <form
        className="stack"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          onReview();
        }}
      >
        <div className="row">
          <div className="field">
            <label htmlFor="review-type">Tipo de comunicação</label>
            <select id="review-type" value={form.type} onChange={(e) => onChange({ type: e.target.value as ReviewFormState['type'] })}>
              {COMMUNICATION_TYPES.map((t) => <option key={t} value={t}>{profile.categoryNames[t]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="review-recipient">Destinatário</label>
            <select id="review-recipient" value={form.recipient} onChange={(e) => onChange({ recipient: e.target.value as ReviewFormState['recipient'] })}>
              {RECIPIENTS.map((r) => <option key={r} value={r}>{RECIPIENT_LABELS[r]}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="review-text">Texto a revisar</label>
          <textarea
            id="review-text"
            className="preview"
            rows={12}
            value={form.text}
            autoComplete="off"
            spellCheck
            aria-describedby="review-counter"
            aria-invalid={problem ? true : undefined}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <span id="review-counter" className={`counter${over ? ' over' : ''}`}>
            {form.text.length} / {profile.maxLength} caracteres{over ? ' (acima do limite da organização)' : ''}
          </span>
          {problem && <p role="alert" className="error-text">{problem}</p>}
        </div>

        <details>
          <summary>Contexto opcional (evita alertas indevidos)</summary>
          <div className="stack">
            <p className="subtle">O revisor não vê o chamado. Informe aqui o que já está registrado nele.</p>
            <div className="row">
              <input
                id="review-evidence"
                type="checkbox"
                checked={form.hasEvidence}
                onChange={(e) => onChange({ hasEvidence: e.target.checked })}
              />
              <label htmlFor="review-evidence">Há evidência registrada no chamado (log, captura, teste)</label>
            </div>
            <div className="field">
              <label htmlFor="review-confirmation">Confirmação do usuário</label>
              <select
                id="review-confirmation"
                value={form.userConfirmation}
                onChange={(e) => onChange({ userConfirmation: e.target.value as ReviewFormState['userConfirmation'] })}
              >
                <option value="unknown">Sem confirmação registrada</option>
                <option value="yes">Confirmado pelo usuário</option>
                <option value="no">Usuário informou que não resolveu</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="review-deadline">Prazo já definido (se existir)</label>
              <input
                id="review-deadline"
                type="text"
                value={form.explicitDeadline}
                onChange={(e) => onChange({ explicitDeadline: e.target.value })}
              />
            </div>
          </div>
        </details>

        <div className="row">
          <button type="submit" className="primary">Revisar agora</button>
          <button type="button" onClick={onClear}>Limpar revisão</button>
        </div>
      </form>

      {result && (
        <div className="stack" aria-labelledby="review-result-title" role="region">
          <h3 id="review-result-title">Resultado da revisão</h3>
          {result.blocked && (
            <p role="alert" className="error-text">
              O texto contém algo que não deve seguir como está (credencial, token ou pedido de acesso). Remova antes de usar.
            </p>
          )}
          <p className="subtle">O texto original não foi alterado.</p>
          <WarningsList warnings={result.warnings} />
          <QualityPanel quality={result.quality} />
        </div>
      )}
    </section>
  );
}
