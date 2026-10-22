import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { AUTO_CLEAR_OPTIONS } from '../../application/preferences';
import type { Preferences } from '../../application/preferences';
import type { ProfileOverlay } from '../../config/profile-overlay';
import type { UsagePolicy } from '../../application/usage-counters';
import { FORMALITY_LABELS, LENGTH_LABELS, TECH_LEVEL_LABELS, TEXT_STYLE_LABELS } from '../../config/fields';
import { FORMALITIES, LENGTHS, TECH_LEVELS, TEXT_STYLES } from '../../domain/types';
import type { LanguageProfile } from '../../domain/types';

interface Props {
  prefs: Preferences;
  onPrefs: (patch: Partial<Preferences>) => void;
  profile: LanguageProfile;
  profileSource: 'managed' | 'imported' | 'default';
  onImport: (text: string) => Promise<string[]>;
  onExport: () => void;
  onResetProfile: () => void;
  signingRequired: boolean;
  overlay: ProfileOverlay | null;
  onImportOverlay: (text: string) => Promise<string[]>;
  onRemoveOverlay: () => void;
  usage: { enabled: boolean; locked: boolean; policy: UsagePolicy; total: number };
  learn: { enabled: boolean; locked: boolean; total: number };
  /** Versão instalada, para o analista conferir se a atualização foi aplicada. */
  version: string;
  onResetLearning: () => void;
  onExportLearning: () => void;
  onExportUsage: () => void;
  onResetUsage: () => void;
}

function overlayRules(o: ProfileOverlay): string[] {
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const lines: string[] = [];
  if (o.forbiddenTerms) lines.push(`${plural(o.forbiddenTerms.length, 'termo proibido', 'termos proibidos')}`);
  if (o.preferredTerms) lines.push(`${plural(o.preferredTerms.length, 'termo preferido', 'termos preferidos')}`);
  if (o.requiredTexts) lines.push(`${plural(o.requiredTexts.length, 'texto obrigatório', 'textos obrigatórios')}`);
  if (o.internalDomains) lines.push(`${plural(o.internalDomains.length, 'domínio interno', 'domínios internos')}`);
  if (o.maxLength !== undefined) lines.push(`Tamanho máximo de até ${o.maxLength} caracteres (vale o menor)`);
  const c = o.closureRules;
  if (c?.noResponseEnabled === false) lines.push('Encerramento por ausência de retorno desligado');
  if (c?.minAttempts !== undefined) lines.push(`Pelo menos ${c.minAttempts} tentativas antes de encerrar por ausência de retorno`);
  if (c?.requirePriorNotice === true) lines.push('Aviso prévio obrigatório antes de encerrar por ausência de retorno');
  if (c?.minDaysAfterNotice !== undefined) lines.push(`Pelo menos ${c.minDaysAfterNotice} dias após o aviso prévio`);
  return lines.length > 0 ? lines : ['Nenhuma regra além do nome da equipe'];
}

const SOURCE_LABEL = { managed: 'política da organização', imported: 'arquivo importado', default: 'padrão da extensão' } as const;

export function SettingsPanel({
  prefs, onPrefs, profile, profileSource, onImport, onExport, onResetProfile, signingRequired, overlay, onImportOverlay, onRemoveOverlay,
  usage, learn, version, onResetLearning, onExportLearning, onExportUsage, onResetUsage,
}: Props) {
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [overlayErrors, setOverlayErrors] = useState<string[]>([]);
  const [overlayDone, setOverlayDone] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDone(false);
    const text = await file.text();
    const errs = await onImport(text);
    setErrors(errs);
    setDone(errs.length === 0);
  };

  const onOverlayFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOverlayDone(false);
    const errs = await onImportOverlay(await file.text());
    setOverlayErrors(errs);
    setOverlayDone(errs.length === 0);
  };

  return (
    <section aria-labelledby="settings-title" className="stack">
      <h2 id="settings-title">Configurações</h2>
      <fieldset className="stack">
        <legend className="legend">Preferências de uso</legend>
        <p className="subtle">
          Este navegador guarda apenas preferências, o perfil importado (com a assinatura, se exigida), a camada da equipe
          e os contadores de uso, se ligados. Conteúdo de chamado nunca é guardado.
        </p>
        <div className="field">
          <label htmlFor="pref-tech">Nível técnico padrão</label>
          <select id="pref-tech" value={prefs.techLevel} onChange={(e) => onPrefs({ techLevel: e.target.value as Preferences['techLevel'] })}>
            {TECH_LEVELS.map((v) => <option key={v} value={v}>{TECH_LEVEL_LABELS[v]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pref-formality">Formalidade padrão</label>
          <select id="pref-formality" value={prefs.formality} onChange={(e) => onPrefs({ formality: e.target.value as Preferences['formality'] })}>
            {FORMALITIES.map((v) => <option key={v} value={v}>{FORMALITY_LABELS[v]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pref-length">Tamanho padrão</label>
          <select id="pref-length" value={prefs.length} onChange={(e) => onPrefs({ length: e.target.value as Preferences['length'] })}>
            {LENGTHS.map((v) => <option key={v} value={v}>{LENGTH_LABELS[v]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pref-style">Redação padrão</label>
          <select id="pref-style" value={prefs.textStyle} onChange={(e) => onPrefs({ textStyle: e.target.value as Preferences['textStyle'] })}>
            {TEXT_STYLES.map((v) => <option key={v} value={v}>{TEXT_STYLE_LABELS[v]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pref-clear">Limpar o conteúdo após inatividade</label>
          <select id="pref-clear" value={prefs.autoClearMinutes} onChange={(e) => onPrefs({ autoClearMinutes: Number(e.target.value) })}>
            {AUTO_CLEAR_OPTIONS.map((v) => (
              <option key={v} value={v}>{v === 0 ? 'Desativado' : `${v} minutos`}</option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="stack">
        <legend className="legend">Contadores de uso (opcional)</legend>
        <p className="subtle">
          Guardam apenas números por categoria, como quantos textos de cada tipo e para cada destinatário foram gerados,
          quantos foram bloqueados, em que faixa de tempo o texto foi copiado, quantas sugestões de correção foram aceitas ou
          ignoradas por regra e quantas vezes os atalhos foram usados. Nunca guardam o que você digita, datas de cada uso ou dados de
          chamados. Ficam somente neste navegador e só saem se você exportar o arquivo.
        </p>
        {usage.locked ? (
          <p role="status">
            Contadores {usage.enabled ? 'ligados' : 'desligados'} pela política da organização. Não é possível alterar aqui.
          </p>
        ) : (
          <div className="row">
            <input
              id="pref-usage"
              type="checkbox"
              checked={prefs.usageCounters}
              onChange={(e) => onPrefs({ usageCounters: e.target.checked })}
            />
            <label htmlFor="pref-usage">Registrar contadores de uso neste navegador</label>
          </div>
        )}
        <p className="subtle">Total registrado: {usage.total}</p>
        <div className="row">
          <button type="button" onClick={onExportUsage}>Exportar contadores</button>
          <button type="button" onClick={onResetUsage}>Zerar contadores</button>
        </div>
      </fieldset>

      <fieldset className="stack">
        <legend className="legend">Aprender minhas preferências de redação (opcional)</legend>
        <p className="subtle">
          Quando ligado, a extensão passa a mostrar primeiro as aberturas, fechos e frases de ligação que você mantém e
          a evitar as que você troca. Também aprende com as correções que você faz ao dividir uma anotação livre, com os tipos de texto que você mais copia (atalho "Mais usados") e com o próximo passo que você escolhe depois de copiar. Guarda apenas números (qual das redações prontas foi usada, de qual campo para qual um trecho foi movido, quantas vezes copiou cada tipo e qual passo escolheu depois), nunca o que você
          digita nem o texto gerado. Fica somente neste navegador e você pode zerar a qualquer momento.
        </p>
        {learn.locked ? (
          <p role="status">Desligado pela política da organização. Não é possível alterar aqui.</p>
        ) : (
          <div className="row">
            <input
              id="pref-learn"
              type="checkbox"
              checked={prefs.learnStyle}
              onChange={(e) => onPrefs({ learnStyle: e.target.checked })}
            />
            <label htmlFor="pref-learn">Aprender com as redações que eu mantenho</label>
          </div>
        )}
        <p className="subtle">Observações registradas: {learn.total}</p>
        <div className="row">
          <button type="button" onClick={onExportLearning} disabled={learn.locked}>Exportar aprendizado</button>
          <button type="button" onClick={onResetLearning}>Zerar aprendizado</button>
        </div>
      </fieldset>

      <fieldset className="stack">
        <legend className="legend">Perfil de linguagem</legend>
        <p>
          Versão do perfil <strong>{profile.profileVersion}</strong>
          {profile.organizationName && <> da organização <strong>{profile.organizationName}</strong></>}. Origem: {SOURCE_LABEL[profileSource]}.
        </p>
        <p className="subtle">
          A importação valida o esquema e recusa HTML, links e chaves desconhecidas. Nada é enviado: o arquivo é lido
          apenas neste navegador.
          {signingRequired && ' A organização exige perfil assinado: arquivos sem assinatura válida são recusados.'}
        </p>
        <div className="row">
          {profileSource !== 'managed' && (
            <div className="field">
              <label htmlFor="profile-file">Importar perfil (JSON)</label>
              <input id="profile-file" type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
            </div>
          )}
        </div>
        <div className="row">
          <button type="button" onClick={onExport}>Exportar perfil atual</button>
          {profileSource === 'imported' && <button type="button" onClick={onResetProfile}>Restaurar perfil padrão</button>}
        </div>
        {errors.length > 0 && (
          <div role="alert" className="panel block">
            <p className="error-text">Importação recusada. Corrija os itens abaixo:</p>
            <ul>{errors.map((er, i) => <li key={i}>{er}</li>)}</ul>
          </div>
        )}
        {done && <p role="status" className="panel ok">Perfil importado e validado.</p>}
      </fieldset>

      <fieldset className="stack">
        <legend className="legend">Camada da equipe (opcional)</legend>
        <p className="subtle">
          Acrescenta regras da sua equipe sobre o perfil acima, somente para restringir: termos proibidos e preferidos,
          textos obrigatórios, domínios internos, tamanho máximo menor e regras de encerramento mais rígidas. Não altera
          saudações, assinatura nem modelos, e nunca afrouxa o perfil da organização.
        </p>
        {overlay ? (
          <>
            <p>
              Camada ativa: <strong>{overlay.overlayName}</strong>.
            </p>
            <ul className="subtle" aria-label="Regras acrescentadas pela camada">
              {overlayRules(overlay).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </>
        ) : (
          <p className="subtle">Nenhuma camada ativa.</p>
        )}
        <div className="row">
          <div className="field">
            <label htmlFor="overlay-file">Importar camada da equipe (JSON)</label>
            <input id="overlay-file" type="file" accept="application/json,.json" onChange={(e) => void onOverlayFile(e)} />
          </div>
          {overlay && <button type="button" onClick={onRemoveOverlay}>Remover camada da equipe</button>}
        </div>
        {overlayErrors.length > 0 && (
          <div role="alert" className="panel block">
            <p className="error-text">Importação da camada recusada. Corrija os itens abaixo:</p>
            <ul>{overlayErrors.map((er, i) => <li key={i}>{er}</li>)}</ul>
          </div>
        )}
        {overlayDone && <p role="status" className="panel ok">Camada da equipe importada e validada.</p>}
      </fieldset>
      {version && (
        <p className="subtle" data-testid="extension-version">
          Versão da extensão: <strong>{version}</strong>. Ao instalar uma versão nova, ela substitui esta e mantém as suas preferências.
        </p>
      )}
    </section>
  );
}
