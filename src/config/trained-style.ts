import { COMMUNICATION_TYPES, FORMALITIES } from '../domain/types';
import type { CommunicationType, LabelKey, LanguageProfile } from '../domain/types';
import { DEFAULT_OPENINGS, DEFAULT_TYPE_CLOSINGS } from './templates';
import { LABEL_SYNONYMS } from './label-synonyms';
import { MAX_BLOCK_TEXT } from './learning-ledger';

/**
 * O que o analista aprovou depois de treinar: abertura e fecho por tipo e rótulos de seção. Aplicado por cima do perfil
 * (ver applyTrainedStyle); nunca altera alertas, termos proibidos, textos obrigatórios nem política.
 */
export interface TrainedStyle {
  version: 1;
  openings?: Partial<Record<CommunicationType, string>>;
  closings?: Partial<Record<CommunicationType, string>>;
  labels?: Partial<Record<LabelKey, string>>;
}

// O motor só conhece {destination} e {organization} nas aberturas e fechos; qualquer outra chave é recusada.
const ENGINE_VARS = new Set(['destination', 'organization']);
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001F\u007F<>]|https?:\/\/|www\./iu;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function phrase(value: unknown, min: number, allowVars: boolean): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length < min || text.length > MAX_BLOCK_TEXT || text !== value || BAD.test(text)) return undefined;
  const rest = text.replace(/\{(\w+)\}/g, (whole, name: string) => (allowVars && ENGINE_VARS.has(name) ? '' : whole));
  return /[{}]/.test(rest) ? undefined : text;
}

/** Forma segura vinda do armazenamento ou de arquivo: só as chaves conhecidas, textos simples; null se nada sobra. */
export function sanitizeTrainedStyle(raw: unknown): TrainedStyle | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const out: TrainedStyle = { version: 1 };
  for (const kind of ['openings', 'closings'] as const) {
    const src = raw[kind];
    if (!isObject(src)) continue;
    const map: Partial<Record<CommunicationType, string>> = {};
    for (const type of COMMUNICATION_TYPES) {
      const text = phrase(src[type], 8, true);
      if (text) map[type] = text;
    }
    if (Object.keys(map).length > 0) out[kind] = map;
  }
  if (isObject(raw.labels)) {
    const labels: Partial<Record<LabelKey, string>> = {};
    for (const key of Object.keys(LABEL_SYNONYMS) as LabelKey[]) {
      const text = phrase(raw.labels[key], 3, false);
      if (text && text.length <= 60) labels[key] = text;
    }
    if (Object.keys(labels).length > 0) out.labels = labels;
  }
  return out.openings || out.closings || out.labels ? out : null;
}

/** Chaves do motor que um texto pode usar (para quem monta a proposta saber se serve para abertura e fecho). */
export const usesOnlyEngineVars = (text: string): boolean => phrase(text, 1, true) !== undefined;

/**
 * Perfil com o estilo treinado por cima. A abertura e o fecho aprendidos passam a ser a primeira opção do tipo (as
 * redações padrão continuam como "outra variação"). Rótulos aprendidos valem para todos os níveis técnicos e, como
 * a extensão já faz com rótulos próprios da organização, desligam o estilo natural.
 */
export function applyTrainedStyle(profile: LanguageProfile, trained: TrainedStyle | null): LanguageProfile {
  if (!trained) return profile;
  const next = structuredClone(profile);
  next.templates = next.templates ?? {};
  const put = (kind: 'openings' | 'typeClosings', defaults: typeof DEFAULT_OPENINGS, map: Partial<Record<CommunicationType, string>> | undefined): void => {
    if (!map) return;
    const table = (next.templates[kind] ??= {});
    for (const [type, text] of Object.entries(map) as [CommunicationType, string][]) {
      const byFormality = (table[type] ??= {});
      for (const f of FORMALITIES) {
        const current = byFormality[f] ?? defaults[type][f];
        byFormality[f] = [text, ...current.filter((c) => c !== text)];
      }
    }
  };
  put('openings', DEFAULT_OPENINGS, trained.openings);
  put('typeClosings', DEFAULT_TYPE_CLOSINGS, trained.closings);
  if (trained.labels) {
    const labels = (next.templates.labels ??= {});
    for (const level of ['simple', 'balanced', 'technical'] as const) {
      labels[level] = { ...(labels[level] ?? {}), ...trained.labels };
    }
  }
  return next;
}
