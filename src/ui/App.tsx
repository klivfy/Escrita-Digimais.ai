import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyContent, initialForm, TEXT_FORM_FIELDS, toGenerationInput } from '../application/form';
import type { FormState, TextFormField } from '../application/form';
import { DEFAULT_PREFERENCES } from '../application/preferences';
import { acceptedEvents, draftBias, frequentTypes, preferredIndexes, rankNextSteps, rejectedEvents } from '../application/style-learning';
import { MAX_NEXT_STEPS } from '../config/dialogue';
import { nextStepCandidates } from '../domain/dialogue';
import { generationKeys, timeBucket } from '../application/usage-counters';
import type { UsagePolicy } from '../application/usage-counters';
import type { Preferences } from '../application/preferences';
import { hasReviewContent, initialReviewForm, reviewInputProblem, toReviewContext } from '../application/review-form';
import type { ReviewFormState } from '../application/review-form';
import { createProvider, DISABLED_AI_POLICY, generateWithFallback } from '../application/provider';
import type { AiPolicy, TextGenerationProvider } from '../application/provider';
import {
  FIELD_META, fieldHint, fieldLabel, FORMALITY_LABELS, LENGTH_LABELS, RECIPIENT_LABELS, TECH_LEVEL_LABELS, TEXT_STYLE_LABELS, TYPE_FIELDS,
} from '../config/fields';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { exportProfileJson } from '../config/profile-schema';
import { importProfileText } from '../application/profile-signing';
import { applyOverlay, parseOverlayJson } from '../config/profile-overlay';
import type { ProfileOverlay } from '../config/profile-overlay';
import { reviewText } from '../domain/review';
import type { ReviewResult } from '../domain/review';
import { scanText } from '../domain/sensitive';
import { SUFFICIENCY_MATRIX } from '../domain/sufficiency';
import { COMMUNICATION_TYPES, FORMALITIES, LENGTHS, RECIPIENTS, TECH_LEVELS, TEXT_STYLES } from '../domain/types';
import type {
  CommunicationType, ContextField, GenerationResult, LanguageProfile, QualityScore, SensitiveFinding, Warning,
} from '../domain/types';
import { copyText } from '../infrastructure/clipboard';
import { AppStorage } from '../infrastructure/storage';
import { exportLibraryJson, importLibraryText } from '../application/library-import';
import type { ModelLibrary } from '../config/library-schema';
import { downloadJson } from './download';
import { extensionVersion } from '../infrastructure/extension';
import { loadAiPolicy, loadSigningKeys, loadUsagePolicy } from '../infrastructure/policy';
import { useStyleLearning } from './hooks/useStyleLearning';
import { useUsageCounters } from './hooks/useUsageCounters';
import { fillModel, pendingFields } from '../domain/library-search';
import type { LibraryModel } from '../config/library-schema';
import { ModelPicker } from './components/ModelPicker';
import { DiffView } from './components/DiffView';
import { DraftPanel } from './components/DraftPanel';
import type { DraftFields } from '../domain/draft';
import { FieldControl } from './components/FieldControl';
import type { Requirement } from './components/FieldControl';
import { QualityPanel, WarningsList } from './components/ReviewPanel';
import { ProofreadMode } from './components/ProofreadMode';
import { ReviewMode } from './components/ReviewMode';
import { SensitivePanel } from './components/SensitivePanel';
import { SettingsPanel } from './components/SettingsPanel';

export interface AppProps {
  storage?: AppStorage;
  loadPolicy?: () => Promise<AiPolicy>;
  loadKeys?: () => Promise<string[]>;
  loadUsage?: () => Promise<UsagePolicy>;
  copy?: (text: string) => Promise<boolean>;
  providerFactory?: (policy: AiPolicy) => TextGenerationProvider;
  now?: () => Date;
}

function requirementFor(type: CommunicationType, field: ContextField): Requirement {
  let best: Requirement;
  for (const req of SUFFICIENCY_MATRIX[type]) {
    if (!req.anyOf.includes(field)) continue;
    if (req.level === 'required') return req.anyOf.length === 1 ? 'required' : 'oneOf';
    best = 'recommended';
  }
  return best;
}

const BLOCK_TITLES: Record<NonNullable<GenerationResult['blockReason']>, string> = {
  sensitive_data: 'Geração bloqueada: foram detectadas credenciais, tokens ou chaves.',
  missing_information: 'Faltam informações essenciais. Nada foi inventado.',
  policy: 'Geração bloqueada por regra da organização.',
  inconsistent: 'Geração bloqueada: o contexto é inconsistente com este tipo de texto.',
  unsafe_content: 'Geração bloqueada: o texto pediria algo que não deve ser solicitado.',
  input_too_long: 'Geração bloqueada: conteúdo grande demais.',
};

function missingFieldLabel(field: ContextField | undefined, type: CommunicationType): string {
  return field ? `Ir para o campo ${fieldLabel(field, type)}` : 'Ir para o campo';
}

/** Identifica a prévia que veio da biblioteca de modelos (não do motor): não tem "outra variação". */
const LIBRARY_ENGINE = 'biblioteca-de-modelos';

/** Tempo em que "Desfazer" fica disponível após uma limpeza manual. O conteúdo só vive em memória. */
export const UNDO_CLEAR_MS = 30_000;

interface SavedContent {
  form: FormState;
  result: GenerationResult | null;
  text: string;
  initialText: string;
  review: ReviewFormState;
  reviewResult: ReviewResult | null;
  proofText: string;
}

export function App({ storage, loadPolicy = loadAiPolicy, loadKeys = loadSigningKeys, loadUsage = loadUsagePolicy, copy = copyText, providerFactory = createProvider, now }: AppProps) {
  const store = useMemo(() => storage ?? new AppStorage(), [storage]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [baseProfile, setProfile] = useState<LanguageProfile>(DEFAULT_PROFILE);
  const [overlay, setOverlay] = useState<ProfileOverlay | null>(null);
  const [library, setLibrary] = useState<ModelLibrary | null>(null);
  const profile = useMemo(() => applyOverlay(baseProfile, overlay), [baseProfile, overlay]);
  const [profileSource, setProfileSource] = useState<'managed' | 'imported' | 'default'>('default');
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [policy, setPolicy] = useState<AiPolicy>(DISABLED_AI_POLICY);
  const [signingKeys, setSigningKeys] = useState<string[]>([]);
  const [usagePolicy, setUsagePolicy] = useState<UsagePolicy>('optional');
  const [draftKey, setDraftKey] = useState(0);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [text, setText] = useState('');
  const [initialText, setInitialText] = useState('');
  const [snapshot, setSnapshot] = useState<{ warnings: Warning[]; quality: QualityScore } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState<'none' | 'ok' | 'fail'>('none');
  const [confirmClear, setConfirmClear] = useState(false);
  const [alsoClearStored, setAlsoClearStored] = useState(false);
  // Cada anúncio vira um nó novo na região ao vivo, para que leitores de tela repitam mensagens idênticas.
  const [liveState, setLiveState] = useState({ text: '', n: 0 });
  const setLive = useCallback((text: string) => setLiveState((s) => ({ text, n: s.n + 1 })), []);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ field: TextFormField; previous: string; label: string } | null>(null);
  const [activity, setActivity] = useState(0);
  const [mode, setMode] = useState<'generate' | 'review' | 'proofread'>('generate');
  const [proofText, setProofText] = useState('');
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(initialReviewForm);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewProblem, setReviewProblem] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<SavedContent | null>(null);
  const touched = useRef(new Set<string>());
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  // Tipo do último texto copiado: base do atalho de próximo passo.
  const [copiedType, setCopiedType] = useState<CommunicationType | null>(null);
  const runSeq = useRef(0);
  const generatedAt = useRef(0);
  const usageCounters = useUsageCounters(store, usagePolicy, prefs.usageCounters);
  const { recorder, mode: usage } = usageCounters;
  const learning = useStyleLearning(store, prefs.learnStyle, usagePolicy);
  const { setStats: setLearnedStats } = learning;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const keys = await loadKeys();
      const [p, loaded, pol, ov, usagePol, lib] = await Promise.all([
        store.loadPreferences(), store.loadProfile(keys), loadPolicy(), store.loadOverlay(), loadUsage(), store.loadLibrary(keys),
      ]);
      if (!alive) return;
      setPrefs(p);
      setProfile(loaded.profile);
      setProfileSource(loaded.source);
      setPolicy(pol);
      setSigningKeys(keys);
      setOverlay(ov);
      setLibrary(lib);
      setUsagePolicy(usagePol);
      setLearnedStats(await store.loadLearning());
      setForm((f) => ({ ...f, techLevel: p.techLevel, formality: p.formality, length: p.length, textStyle: p.textStyle }));
    })();
    return () => {
      alive = false;
    };
  }, [store, loadPolicy, loadKeys, loadUsage, setLearnedStats]);

  // Ao abrir a confirmação, o foco vai para ela; ao fechar, volta ao botão que a abriu.
  useEffect(() => {
    if (!confirmClear) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setConfirmClear(false);
      setAlsoClearStored(false);
      clearButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmClear]);

  const closeConfirm = (): void => {
    setConfirmClear(false);
    setAlsoClearStored(false);
    clearButtonRef.current?.focus();
  };


  // Qualquer nova ação do analista descarta a possibilidade de desfazer a limpeza.
  const touch = useCallback(() => {
    setActivity((n) => n + 1);
    setRestorable(null);
  }, []);

  const clearReview = useCallback(() => {
    setReviewForm((r) => ({ ...initialReviewForm(), type: r.type, recipient: r.recipient }));
    setReviewResult(null);
    setReviewProblem(null);
  }, []);

  const clearContent = useCallback(() => {
    setProofText('');
    setDraftKey((k) => k + 1);
    setForm((f) => ({ ...f, ...emptyContent(), variant: 0 }));
    setResult(null);
    setText('');
    setInitialText('');
    setSnapshot(null);
    setShowDiff(false);
    setCopied('none');
    setUndo(null);
    clearReview();
  }, [clearReview]);

  // Limpeza por inatividade (configurável). O estado vive só em memória.
  useEffect(() => {
    if (!prefs.autoClearMinutes) return;
    const id = window.setTimeout(() => {
      clearContent();
      setRestorable(null);
      setLive('Conteúdo limpo por inatividade.');
    }, prefs.autoClearMinutes * 60_000);
    return () => window.clearTimeout(id);
  }, [activity, prefs.autoClearMinutes, clearContent, setLive]);

  // O conteúdo guardado para "Desfazer" expira sozinho.
  useEffect(() => {
    if (!restorable) return;
    const id = window.setTimeout(() => setRestorable(null), UNDO_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [restorable]);

  /** Limpeza pedida pelo analista: guarda o conteúdo em memória por pouco tempo para permitir desfazer. */
  /**
   * Limpeza pedida pelo analista. O escopo "review" limpa só o modo de revisão e preserva o formulário de geração.
   * Em ambos os casos o conteúdo anterior fica em memória por 30 segundos para "Desfazer limpeza".
   */
  const manualClear = useCallback(
    (scope: 'all' | 'review' | 'proofread' = 'all') => {
      const reviewHasContent = hasReviewContent(reviewForm) || Boolean(reviewResult);
      const proofHasContent = Boolean(proofText.trim());
      const hasContent =
        scope === 'review' ? reviewHasContent
          : scope === 'proofread' ? proofHasContent
            : reviewHasContent || proofHasContent || Boolean(result) || TEXT_FORM_FIELDS.some((f) => form[f].trim());
      if (!hasContent) {
        if (scope === 'all') clearContent();
        setLive('Não há conteúdo para limpar.');
        return;
      }
      const saved: SavedContent = { form, result, text, initialText, review: reviewForm, reviewResult, proofText };
      if (scope === 'review') clearReview();
      else if (scope === 'proofread') setProofText('');
      else clearContent();
      setRestorable(saved);
      setLive('Conteúdo limpo. É possível desfazer por 30 segundos.');
    },
    [form, result, text, initialText, reviewForm, reviewResult, proofText, clearContent, clearReview, setLive],
  );

  const onRestore = (): void => {
    if (!restorable) return;
    setForm(restorable.form);
    setResult(restorable.result);
    setText(restorable.text);
    setInitialText(restorable.initialText);
    setReviewForm(restorable.review);
    setReviewResult(restorable.reviewResult);
    setProofText(restorable.proofText);
    setSnapshot(null);
    setRestorable(null);
    setActivity((n) => n + 1);
    setLive('Conteúdo restaurado.');
  };

  const fields = TYPE_FIELDS[form.type];
  const visible = useMemo(() => new Set<string>([...fields.main, ...fields.advanced]), [fields]);

  const findings = useMemo(() => {
    const all: SensitiveFinding[] = [];
    for (const field of TEXT_FORM_FIELDS) {
      if (!visible.has(field)) continue;
      all.push(...scanText(form[field], { field: field as ContextField, internalDomains: profile.internalDomains }));
    }
    return all;
  }, [form, visible, profile.internalDomains]);

  const values = useMemo(() => {
    const v: Partial<Record<ContextField, string>> = {};
    for (const f of TEXT_FORM_FIELDS) v[f as ContextField] = form[f];
    return v;
  }, [form]);

  const reviewCtx = useMemo(
    () => ({
      type: form.type,
      recipient: form.recipient,
      techLevel: form.techLevel,
      explicitDeadline: form.explicitDeadline.trim() || undefined,
      hasEvidence: form.evidence.trim().length > 0,
      userConfirmation: form.userConfirmation,
      pendingItem: form.pendingItem.trim() || undefined,
    }),
    [form],
  );

  const liveReview = useMemo(
    () => (text ? reviewText(text, reviewCtx, profile) : null),
    [text, reviewCtx, profile],
  );

  const fieldErrors = useMemo(() => {
    const out: Partial<Record<ContextField, string>> = {};
    for (const w of result?.warnings ?? []) {
      if (w.severity === 'block' && w.field && !out[w.field]) out[w.field] = w.suggestion ? `${w.message} ${w.suggestion}` : w.message;
    }
    return out;
  }, [result]);

  const setField = (name: TextFormField, value: string): void => {
    setForm((f) => ({ ...f, [name]: value }));
    touch();
  };

  const setStyle = (name: 'techLevel' | 'formality' | 'length' | 'textStyle', value: string): void => {
    touched.current.add(name);
    setForm((f) => ({ ...f, [name]: value }));
    touch();
  };

  const disabledTypes = useMemo(
    () => new Set<CommunicationType>(profile.closureRules.noResponseEnabled ? [] : ['closure_no_response']),
    [profile.closureRules.noResponseEnabled],
  );
  const nextSteps = copiedType
    ? (learning.enabled ? rankNextSteps(learning.stats, copiedType, nextStepCandidates(copiedType, disabledTypes)) : nextStepCandidates(copiedType, disabledTypes)).slice(0, MAX_NEXT_STEPS)
    : [];
  const frequent = learning.enabled ? frequentTypes(learning.stats, form.type).filter((t) => !disabledTypes.has(t)) : [];

  /** Atalho: troca o tipo mantendo os campos preenchidos, e leva o foco ao seletor de tipo. */
  const switchType = (type: CommunicationType, message: string): void => {
    setType(type);
    setCopied('none');
    setCopiedType(null);
    typeRef.current?.focus();
    setLive(message);
  };

  const onNextStep = (to: CommunicationType): void => {
    if (copiedType) learning.rememberStep(copiedType, to);
    void recorder.record('next_step.used');
    switchType(to, `Tipo alterado para ${profile.categoryNames[to]}. Os campos foram mantidos: revise e gere a prévia.`);
  };

  const onFrequentType = (to: CommunicationType): void => {
    void recorder.record('shortcut.type');
    switchType(to, `Tipo alterado para ${profile.categoryNames[to]}.`);
  };

  /**
   * Leva o texto do modelo escolhido para a prévia editável. Só preenche os campos com o que o analista já informou
   * no formulário (nome, prazo, equipe); os demais ficam entre chaves e impedem a cópia até serem preenchidos.
   */
  const onPickModel = (model: LibraryModel): void => {
    // Uma geração em andamento não pode mais sobrescrever o modelo escolhido.
    runSeq.current += 1;
    const body = fillModel(model.text, { nome: form.requesterName, prazo: form.explicitDeadline, equipe: form.destinationTeam });
    // A revisão usa o tipo do próprio modelo quando ele veio de outro tipo ("Buscar em todos os tipos").
    const modelType = model.types.includes(form.type) ? form.type : model.types[0];
    const review = reviewText(body, { ...reviewCtx, type: modelType }, profile);
    learning.setShown(undefined);
    setResult({
      text: body, warnings: review.warnings, missingInformation: [], missingFields: [], quality: review.quality,
      blocked: false, sensitiveFindings: [], meta: { engine: LIBRARY_ENGINE, profileVersion: profile.profileVersion, templatesVersion: 'n/a' },
    });
    setText(body);
    setInitialText(body);
    setSnapshot(null);
    setShowDiff(false);
    setCopied('none');
    setBusy(false);
    generatedAt.current = Date.now();
    void recorder.record('library.used');
    const missing = pendingFields(body);
    setLive(
      missing.length > 0
        ? `Modelo "${model.title}" na prévia. Preencha os campos ${missing.map((m) => `{${m}}`).join(', ')} antes de copiar.`
        : `Modelo "${model.title}" na prévia. Revise e edite antes de copiar.`,
    );
    touch();
    window.setTimeout(() => previewRef.current?.focus(), 0);
  };

  const setType = (type: CommunicationType): void => {
    setForm((f) => ({ ...f, type, variant: 0 }));
    setResult(null);
    setText('');
    setInitialText('');
    setSnapshot(null);
    touch();
  };

  const setRecipient = (recipient: FormState['recipient']): void => {
    const rp = profile.recipients[recipient];
    setForm((f) => ({
      ...f,
      recipient,
      techLevel: touched.current.has('techLevel') ? f.techLevel : rp.defaultTechLevel,
      formality: touched.current.has('formality') ? f.formality : rp.defaultFormality,
    }));
    touch();
  };

  const run = async (next: FormState, isVariant = false): Promise<void> => {
    setBusy(true);
    setCopied('none');
    const seq = (runSeq.current += 1);
    const provider = providerFactory(policy);
    const input = toGenerationInput(next);
    if (learning.enabled) input.settings.learned = preferredIndexes(learning.stats, next.type, next.formality);
    const outcome = await generateWithFallback(provider, { input, profile, now: now?.() });
    if (seq !== runSeq.current) return;
    const r = outcome.result;
    const before = learning.previousShown();
    if (isVariant && before && r.choices) learning.remember(rejectedEvents(before, r.choices, next.type, next.formality));
    learning.setShown(r.choices);
    setResult(outcome.notice ? { ...r, warnings: [...r.warnings, outcome.notice] } : r);
    setText(r.text);
    setInitialText(r.text);
    setSnapshot(null);
    setShowDiff(false);
    setBusy(false);
    generatedAt.current = Date.now();
    void recorder.record(
      isVariant
        ? ['variant']
        : [...generationKeys(next.type, r.blocked ? r.blockReason : undefined, r.warnings.map((w) => w.code)), ...(r.blocked ? [] : [`recipient.${next.recipient}`])],
    );
    if (r.blocked) setLive('Geração bloqueada. O motivo está na seção de prévia e revisão.');
    else setLive(`Prévia gerada com ${r.warnings.length} alerta(s). Revise antes de copiar.`);
    touch();
  };

  const onGenerate = (): void => void run(form);
  const onVariant = (): void => {
    const next = { ...form, variant: form.variant + 1 };
    setForm(next);
    void run(next, true);
  };

  const onReview = (): void => {
    if (!liveReview) return;
    const inputLevel = (result?.warnings ?? []).filter((w) => w.field && !liveReview.warnings.some((x) => x.code === w.code));
    void recorder.record('review_again');
    setSnapshot({ warnings: [...liveReview.warnings, ...inputLevel], quality: liveReview.quality });
    setLive(`Revisão concluída: ${liveReview.warnings.length} alerta(s) no texto atual.`);
    touch();
  };

  const onCopy = async (): Promise<void> => {
    if (pendingFields(text).length > 0) {
      setLive('Há campos entre chaves sem preencher. Preencha no texto antes de copiar.');
      return;
    }
    const ok = await copy(text);
    setCopied(ok ? 'ok' : 'fail');
    if (ok) void recorder.record(['copy', `time_to_copy.${timeBucket(Date.now() - generatedAt.current)}`]);
    if (ok) {
      learning.rememberUse(generatedAt.current, form.type);
      setCopiedType(form.type);
      if (nextStepCandidates(form.type, disabledTypes).length) void recorder.record('next_step.shown');
    }
    if (ok && result?.choices) {
      const choices = result.choices;
      learning.acceptOnce(generatedAt.current, () => acceptedEvents(choices, form.type, form.formality));
    }
    setLive(ok ? 'Texto copiado.' : 'Não foi possível copiar. Selecione o texto e copie manualmente.');
  };

  const onMask = (f: SensitiveFinding): void => {
    if (!f.field) return;
    const name = f.field as TextFormField;
    const previous = form[name];
    setUndo({ field: name, previous, label: `Trecho substituído em “${fieldLabel(f.field, form.type)}”.` });
    setField(name, previous.slice(0, f.start) + f.placeholder + previous.slice(f.end));
    setLive('Trecho substituído por marcador de omissão.');
  };

  const onUndo = (): void => {
    if (!undo) return;
    setField(undo.field, undo.previous);
    setUndo(null);
    setLive('Alteração desfeita.');
  };

  const onReviewChange = (patch: Partial<ReviewFormState>): void => {
    setReviewForm((r) => ({ ...r, ...patch }));
    // Todo campo alimenta o contexto da revisão: qualquer mudança deixa o resultado exibido desatualizado.
    setReviewResult(null);
    setReviewProblem(null);
    touch();
  };

  const onReviewRun = (): void => {
    const problem = reviewInputProblem(reviewForm);
    setReviewProblem(problem);
    if (problem) {
      setReviewResult(null);
      setLive(problem);
      return;
    }
    const r = reviewText(reviewForm.text, toReviewContext(reviewForm, profile), profile);
    setReviewResult(r);
    setLive(`Revisão concluída: ${r.warnings.length} alerta(s) no texto.`);
    touch();
  };

  const onProofCopy = async (value: string): Promise<void> => {
    const ok = await copy(value);
    setLive(ok ? 'Texto copiado.' : 'Não foi possível copiar. Selecione o texto e copie manualmente.');
  };

  const doClearAll = async (): Promise<void> => {
    if (alsoClearStored) {
      // Apagar os dados armazenados também descarta a cópia em memória: nada pode ser restaurado depois.
      clearContent();
      setRestorable(null);
    } else manualClear('all');
    if (alsoClearStored) {
      await store.clearAll();
      setPrefs(DEFAULT_PREFERENCES);
      setProfile(DEFAULT_PROFILE);
      setProfileSource('default');
      setOverlay(null);
      setLibrary(null);
    }
    setConfirmClear(false);
    setAlsoClearStored(false);
    clearButtonRef.current?.focus();
    if (alsoClearStored) setLive('Conteúdo e dados armazenados apagados.');
  };

  const onPrefs = (patch: Partial<Preferences>): void => {
    setPrefs((p) => ({ ...p, ...patch }));
    void store.savePreferences(patch);
  };

  const onImport = async (json: string): Promise<string[]> => {
    const parsed = await importProfileText(json, signingKeys);
    if (!parsed.ok) return parsed.errors;
    await store.saveProfile(parsed.profile, parsed.signature);
    setProfile(parsed.profile);
    setProfileSource('imported');
    return [];
  };

  const onExport = (): void => {
    const blob = new Blob([exportProfileJson(baseProfile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'perfil-de-linguagem.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportOverlay = async (json: string): Promise<string[]> => {
    const parsed = parseOverlayJson(json);
    if (!parsed.ok) return parsed.errors;
    await store.saveOverlay(parsed.overlay);
    setOverlay(parsed.overlay);
    return [];
  };

  /** Importa a biblioteca de modelos: valida, examina cada modelo com as regras do perfil em vigor e só então guarda. */
  const onImportLibrary = async (json: string): Promise<{ errors: string[]; notices: string[] }> => {
    const parsed = await importLibraryText(json, signingKeys, profile);
    if (!parsed.ok) return { errors: parsed.errors, notices: [] };
    await store.saveLibrary(parsed.library, parsed.signature);
    setLibrary(parsed.library);
    setLive(`Biblioteca de modelos importada: ${parsed.library.models.length} modelos.`);
    return {
      errors: [],
      notices: parsed.notices.slice(0, 20).flatMap((n) => n.reasons.slice(0, 2).map((r) => `Modelo "${n.id}" (${n.title}): ${r}`)),
    };
  };

  const onRemoveLibrary = async (): Promise<void> => {
    await store.removeLibrary();
    setLibrary(null);
    setLive('Biblioteca de modelos removida.');
  };

  const onExportLibrary = (): void => {
    if (library) downloadJson('biblioteca-de-modelos.json', exportLibraryJson(library));
  };

  const onRemoveOverlay = async (): Promise<void> => {
    await store.removeOverlay();
    setOverlay(null);
    setLive('Camada da equipe removida.');
  };

  const applyDraft = (fields: DraftFields): void => {
    const keyOf: Record<keyof DraftFields, TextFormField> = {
      summary: 'summary', actions: 'actions', observedResult: 'observedResult', pendingItem: 'pendingItem',
      expectedAction: 'expectedAction', questions: 'questions', notes: 'notes',
    };
    setForm((f) => {
      const next = { ...f };
      for (const [k, value] of Object.entries(fields) as [keyof DraftFields, string][]) {
        const name = keyOf[k];
        const current = next[name].trim();
        // Nunca sobrescreve: se o campo já tem texto, o novo conteúdo entra depois, em outra linha.
        if (!current) next[name] = value;
        else if (!current.includes(value)) next[name] = `${current}\n${value}`;
      }
      return next;
    });
    touch();
    setLive('Campos preenchidos a partir da anotação. Revise e ajuste antes de gerar.');
  };

  const onResetLearning = async (): Promise<void> => {
    await learning.reset();
    setLive('Preferências de redação zeradas.');
  };

  const onResetUsage = async (): Promise<void> => {
    await usageCounters.reset();
    setLive('Contadores de uso zerados.');
  };

  const onResetProfile = async (): Promise<void> => {
    await store.resetProfile();
    const loaded = await store.loadProfile(signingKeys);
    setProfile(loaded.profile);
    setProfileSource(loaded.source);
  };

  const focusField = (field?: ContextField): void => {
    if (field) document.getElementById(`field-${field}`)?.focus();
  };

  const noResponseOff = form.type === 'closure_no_response' && !profile.closureRules.noResponseEnabled;
  const shownWarnings = snapshot?.warnings ?? result?.warnings ?? [];
  const shownQuality = snapshot?.quality ?? result?.quality;
  const pending = useMemo(() => pendingFields(text), [text]);
  const fromLibrary = result?.meta.engine === LIBRARY_ENGINE;
  const copyBlocked = !text || Boolean(liveReview?.blocked) || pending.length > 0;
  const over = text.length > profile.maxLength;

  const renderField = (name: ContextField) => {
    if (name === 'userConfirmation') {
      return (
        <div className="field" key={name}>
          <label htmlFor="field-userConfirmation">{fieldLabel(name, form.type)}</label>
          <select
            id="field-userConfirmation"
            value={form.userConfirmation}
            onChange={(e) => {
              setForm((f) => ({ ...f, userConfirmation: e.target.value as FormState['userConfirmation'] }));
              touch();
            }}
          >
            <option value="unknown">Sem confirmação registrada</option>
            <option value="yes">Confirmado pelo usuário</option>
            <option value="no">Usuário informou que não resolveu</option>
          </select>
          {fieldErrors.userConfirmation && <p role="alert" className="error-text">{fieldErrors.userConfirmation}</p>}
        </div>
      );
    }
    const key = name as TextFormField;
    return (
      <FieldControl
        key={name}
        name={name}
        label={fieldLabel(name, form.type)}
        hint={fieldHint(name, form.type)}
        meta={FIELD_META[name]}
        value={form[key]}
        onChange={(v) => setField(key, v)}
        error={fieldErrors[name]}
        requirement={requirementFor(form.type, name)}
        warning={findings.some((f) => f.field === name) ? 'Este campo contém possível dado sensível. Veja o painel abaixo.' : undefined}
      />
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Assistente de Textos do Service Desk</h1>
        <div className="row">
          <button type="button" onClick={() => { if (!showSettings) void usageCounters.refreshTotal(); setShowSettings((s) => !s); }} aria-expanded={showSettings}>
            Configurações
          </button>
          <button type="button" className="danger" ref={clearButtonRef} onClick={() => setConfirmClear(true)}>
            Limpar tudo
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" className="visually-hidden">
        <span key={liveState.n}>{liveState.text}</span>
      </div>

      <main>
        <p className="subtle">
          Auxilia a redação. Você revisa e copia o texto; nada é enviado, salvo ou aplicado ao chamado. Não cole senhas,
          tokens ou dados pessoais desnecessários.
        </p>

        <div className="segmented" role="group" aria-label="Modo de uso">
          <button type="button" className={mode === 'generate' ? 'primary' : undefined} aria-pressed={mode === 'generate'} onClick={() => setMode('generate')}>
            Gerar texto
          </button>
          <button type="button" className={mode === 'review' ? 'primary' : undefined} aria-pressed={mode === 'review'} onClick={() => setMode('review')}>
            Revisar texto pronto
          </button>
          <button type="button" className={mode === 'proofread' ? 'primary' : undefined} aria-pressed={mode === 'proofread'} onClick={() => setMode('proofread')}>
            Corrigir texto
          </button>
        </div>

        {restorable && (
          <div role="status" className="panel info">
            <p>Conteúdo limpo. Você pode desfazer por 30 segundos; depois ele é descartado da memória.</p>
            <div className="row">
              <button type="button" onClick={onRestore}>Desfazer limpeza</button>
              <button type="button" onClick={() => setRestorable(null)}>Dispensar</button>
            </div>
          </div>
        )}

        {confirmClear && (
          <section
            ref={confirmRef}
            tabIndex={-1}
            className="panel warn"
            role="alertdialog"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            aria-modal="false"
          >
            <h2 id="confirm-title">Apagar todo o conteúdo?</h2>
            <p id="confirm-desc">O formulário, a prévia e os resultados serão apagados deste painel. Pressione Esc para cancelar.</p>
            <div className="row">
              <input
                id="also-stored"
                type="checkbox"
                checked={alsoClearStored}
                onChange={(e) => setAlsoClearStored(e.target.checked)}
              />
              <label htmlFor="also-stored">Apagar também preferências e perfil importado salvos neste navegador</label>
            </div>
            <div className="row">
              <button type="button" className="danger" onClick={() => void doClearAll()}>Apagar agora</button>
              <button type="button" onClick={closeConfirm}>Cancelar</button>
            </div>
          </section>
        )}

        {showSettings && (
          <SettingsPanel
            prefs={prefs}
            onPrefs={onPrefs}
            profile={profile}
            profileSource={profileSource}
            onImport={onImport}
            onExport={onExport}
            onResetProfile={() => void onResetProfile()}
            signingRequired={signingKeys.length > 0}
            overlay={overlay}
            onImportOverlay={onImportOverlay}
            onRemoveOverlay={() => void onRemoveOverlay()}
            library={library}
            onImportLibrary={onImportLibrary}
            onRemoveLibrary={() => void onRemoveLibrary()}
            onExportLibrary={onExportLibrary}
            usage={{ ...usage, policy: usagePolicy, total: usageCounters.total }}
            learn={{ enabled: learning.enabled, locked: learning.locked, total: learning.total }}
            version={extensionVersion()}
            onResetLearning={() => void onResetLearning()}
            onExportLearning={() => void learning.exportFile()}
            onExportUsage={() => void usageCounters.exportFile()}
            onResetUsage={() => void onResetUsage()}
          />
        )}

        {mode === 'proofread' ? (
          <ProofreadMode
            text={proofText}
            onChange={(v) => { setProofText(v); touch(); }}
            onClear={() => manualClear('proofread')}
            onCopy={onProofCopy}
            onAnnounce={setLive}
            onEvent={(keys) => void recorder.record(keys)}
          />
        ) : mode === 'review' ? (
          <ReviewMode
            form={reviewForm}
            onChange={onReviewChange}
            profile={profile}
            result={reviewResult}
            problem={reviewProblem}
            onReview={onReviewRun}
            onClear={() => manualClear('review')}
          />
        ) : (
        <>
        <form className="stack" autoComplete="off" aria-label="Dados do texto a gerar" onSubmit={(e) => { e.preventDefault(); onGenerate(); }}>
          <h2>1. Tipo de comunicação</h2>
          <div className="field">
            <label htmlFor="type">Tipo de comunicação</label>
            <select id="type" ref={typeRef} value={form.type} onChange={(e) => setType(e.target.value as CommunicationType)}>
              {COMMUNICATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {profile.categoryNames[t]}
                  {t === 'closure_no_response' && !profile.closureRules.noResponseEnabled ? ' (desativado pela organização)' : ''}
                </option>
              ))}
            </select>
          </div>
          {frequent.length > 0 && (
            <div className="row" role="group" aria-label="Tipos que você mais usa">
              <span className="subtle">Mais usados:</span>
              {frequent.map((t) => (
                <button key={t} type="button" onClick={() => onFrequentType(t)}>{profile.categoryNames[t]}</button>
              ))}
            </div>
          )}
          {noResponseOff && (
            <p className="panel info" role="note">
              Este tipo está desativado pela organização. Um administrador pode habilitá-lo no perfil de linguagem
              (closureRules.noResponseEnabled) com o número mínimo de tentativas e o aviso prévio.
            </p>
          )}
          <div className="field">
            <label htmlFor="recipient">Destinatário</label>
            <select id="recipient" value={form.recipient} onChange={(e) => setRecipient(e.target.value as FormState['recipient'])}>
              {RECIPIENTS.map((r) => <option key={r} value={r}>{RECIPIENT_LABELS[r]}</option>)}
            </select>
          </div>

          {library && library.models.length > 0 && (
            <ModelPicker
              library={library}
              type={form.type}
              typeName={profile.categoryNames[form.type]}
              recipient={form.recipient}
              onPick={onPickModel}
              onEvent={(key) => void recorder.record(key)}
              onAnnounce={setLive}
            />
          )}
          <h2>2. Contexto</h2>
          <DraftPanel
            key={draftKey}
            available={new Set<ContextField>([...fields.main, ...fields.advanced])}
            internalDomains={profile.internalDomains}
            bias={learning.enabled ? draftBias(learning.stats) : {}}
            onApply={applyDraft}
            onEvent={(e) => void recorder.record(e)}
            onAnnounce={setLive}
            onFixes={learning.rememberFixes}
          />
          {fields.main.map(renderField)}
          <details>
            <summary>Campos opcionais</summary>
            <div className="stack">{fields.advanced.map(renderField)}</div>
          </details>

          <h2>3. Estilo</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="techLevel">Nível técnico</label>
              <select id="techLevel" value={form.techLevel} onChange={(e) => setStyle('techLevel', e.target.value)}>
                {TECH_LEVELS.map((v) => <option key={v} value={v}>{TECH_LEVEL_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="formality">Grau de formalidade</label>
              <select id="formality" value={form.formality} onChange={(e) => setStyle('formality', e.target.value)}>
                {FORMALITIES.map((v) => <option key={v} value={v}>{FORMALITY_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="length">Tamanho</label>
              <select id="length" value={form.length} onChange={(e) => setStyle('length', e.target.value)}>
                {LENGTHS.map((v) => <option key={v} value={v}>{LENGTH_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="textStyle">Redação</label>
              <select id="textStyle" value={form.textStyle} onChange={(e) => setStyle('textStyle', e.target.value)}>
                {TEXT_STYLES.map((v) => <option key={v} value={v}>{TEXT_STYLE_LABELS[v]}</option>)}
              </select>
            </div>
          </div>

          <SensitivePanel
            type={form.type}
            values={values}
            findings={findings}
            onMask={onMask}
            undoLabel={undo?.label}
            onUndo={onUndo}
          />

          <div className="row">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Gerando…' : 'Gerar prévia'}
            </button>
          </div>
        </form>

        <section aria-labelledby="result-title" className="stack">
          <h2 id="result-title">4. Prévia e revisão</h2>

          {!result && <p className="subtle">Preencha os campos e escolha “Gerar prévia”. A prévia aparecerá aqui, editável.</p>}

          {result?.blocked && (
            <div role="alert" className="panel block">
              <p className="error-text">{result.blockReason ? BLOCK_TITLES[result.blockReason] : 'Geração bloqueada.'}</p>
              {result.missingInformation.length > 0 && (
                <ul>
                  {result.missingInformation.map((q, i) => (
                    <li key={q}>
                      {q}{' '}
                      <button
                        type="button"
                        onClick={() => focusField(result.missingFields[i])}
                        aria-label={missingFieldLabel(result.missingFields[i], form.type)}
                      >
                        Ir para o campo
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && !result.blocked && (
            <div className="stack">
              <div className="field">
                <label htmlFor="preview">Prévia editável</label>
                <textarea
                  id="preview"
                  ref={previewRef}
                  className="preview"
                  rows={14}
                  value={text}
                  autoComplete="off"
                  spellCheck
                  aria-describedby="preview-counter"
                  onChange={(e) => {
                    setText(e.target.value);
                    setSnapshot(null);
                    setCopied('none');
                    touch();
                  }}
                />
                <span id="preview-counter" className={`counter${over ? ' over' : ''}`}>
                  {text.length} / {profile.maxLength} caracteres{over ? ' (acima do limite da organização)' : ''}
                </span>
              </div>
              {pending.length > 0 && (
                <p role="status" className="panel warn">
                  Faltam campos entre chaves: {pending.map((p) => `{${p}}`).join(', ')}. Preencha no texto da prévia para poder copiar.
                </p>
              )}
              {liveReview?.blocked && (
                <p role="alert" className="error-text">
                  O texto atual contém algo que impede a cópia (credencial, token ou pedido de acesso). Remova-o para copiar.
                </p>
              )}
              <div className="row">
                <button type="button" className="primary" onClick={() => void onCopy()} disabled={copyBlocked}>Copiar texto</button>
                <button type="button" onClick={onReview}>Revisar novamente</button>
                {!fromLibrary && <button type="button" onClick={onVariant} disabled={busy}>Outra variação</button>}
              </div>
              <details className="more">
                <summary>Mais ações</summary>
                <div className="row">
                  <button type="button" onClick={() => { setText(initialText); setSnapshot(null); touch(); }}>Restaurar modelo</button>
                  <button type="button" onClick={() => setShowDiff((s) => !s)} aria-pressed={showDiff}>Comparar com o texto inicial</button>
                  <button type="button" onClick={() => manualClear('all')}>Limpar formulário e prévia</button>
                </div>
              </details>
              {copied === 'ok' && (
                <div role="status" className="panel ok">
                  <p>Texto copiado. Deseja limpar o conteúdo agora?</p>
                  <div className="row">
                    <button type="button" onClick={() => manualClear('all')}>Limpar agora</button>
                    <button type="button" onClick={() => setCopied('none')}>Manter</button>
                  </div>
                  {nextSteps.length > 0 && (
                    <div className="stack" role="group" aria-labelledby="next-step-title">
                      <p id="next-step-title" className="subtle">Próximo passo comum neste atendimento (os campos são mantidos):</p>
                      <div className="row">
                        {nextSteps.map((t) => (
                          <button key={t} type="button" onClick={() => onNextStep(t)}>Preparar: {profile.categoryNames[t]}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {copied === 'fail' && <p role="alert" className="error-text">Não foi possível copiar automaticamente. Selecione o texto da prévia e copie manualmente.</p>}
              {showDiff && <DiffView before={initialText} after={text} />}
            </div>
          )}

          {result && (
            <>
              <h3>Alertas</h3>
              <WarningsList warnings={shownWarnings} />
              {shownQuality && !result.blocked && <QualityPanel quality={shownQuality} />}
              <p className="subtle">
                Motor {result.meta.engine}, perfil {result.meta.profileVersion}, templates {result.meta.templatesVersion}.
              </p>
            </>
          )}
        </section>
        </>
        )}
      </main>
    </div>
  );
}
