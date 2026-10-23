import { DEFAULT_PROFILE } from '../config/language-profile';
import { validateProfile } from '../config/profile-schema';
import { DEFAULT_PREFERENCES, sanitizePreferences } from '../application/preferences';
import type { Preferences } from '../application/preferences';
import type { LanguageProfile } from '../domain/types';
import { sanitizeSigningKeys, verifyProfileSignature } from '../application/profile-signing';
import { validateOverlay } from '../config/profile-overlay';
import type { ProfileOverlay } from '../config/profile-overlay';
import { validateLibrary } from '../config/library-schema';
import type { ModelLibrary } from '../config/library-schema';
import { dayString, emptyCounters, sanitizeCounters } from '../application/usage-counters';
import type { UsageCounters } from '../application/usage-counters';
import { emptyStats, sanitizeStats } from '../application/style-learning';
import type { LearnedStats } from '../application/style-learning';

/** Subconjunto mínimo de chrome.storage.StorageArea, injetável em testes. */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear?(): Promise<void>;
}

export const STORAGE_KEYS = {
  preferences: 'preferences',
  profile: 'languageProfile',
  profileSignature: 'profileSignature',
  overlay: 'profileOverlay',
  usageCounters: 'usageCounters',
  learnedStyle: 'learnedStyle',
  modelLibrary: 'modelLibrary',
  modelLibrarySignature: 'modelLibrarySignature',
} as const;
export const ALLOWED_KEYS: string[] = Object.values(STORAGE_KEYS);

function chromeArea(name: 'local' | 'managed'): StorageArea | null {
  try {
    const area = typeof chrome !== 'undefined' ? chrome.storage?.[name] : undefined;
    return area ? (area as unknown as StorageArea) : null;
  } catch {
    return null;
  }
}

export class AppStorage {
  constructor(
    private readonly local: StorageArea | null = chromeArea('local'),
    private readonly managed: StorageArea | null = chromeArea('managed'),
  ) {}

  async loadPreferences(): Promise<Preferences> {
    if (!this.local) return { ...DEFAULT_PREFERENCES };
    try {
      const data = await this.local.get(STORAGE_KEYS.preferences);
      return sanitizePreferences(data[STORAGE_KEYS.preferences]);
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  /** Persiste apenas o que passa pela allowlist de preferências. */
  async savePreferences(prefs: Partial<Preferences>): Promise<Preferences> {
    const clean = sanitizePreferences({ ...(await this.loadPreferences()), ...prefs });
    await this.local?.set({ [STORAGE_KEYS.preferences]: clean });
    return clean;
  }

  /**
   * Precedência: política gerenciada, perfil importado, padrão. Tudo é revalidado. Com chaves de assinatura
   * configuradas, o perfil importado só vale se a assinatura guardada ainda verificar (falha fechada).
   */
  async loadProfile(signingKeys: readonly string[] = []): Promise<{ profile: LanguageProfile; source: 'managed' | 'imported' | 'default' }> {
    try {
      const managed = await this.managed?.get('languageProfile');
      const json = managed?.languageProfile;
      if (typeof json === 'string' && json.trim()) {
        const result = validateProfile(JSON.parse(json));
        if (result.ok) return { profile: result.profile, source: 'managed' };
      }
    } catch {
      /* política ausente ou inválida: segue para o próximo nível */
    }
    try {
      const data = await this.local?.get(STORAGE_KEYS.profile);
      const stored = data?.[STORAGE_KEYS.profile];
      if (stored) {
        const result = validateProfile(stored);
        if (result.ok && (await this.signatureAccepted(result.profile, signingKeys))) {
          return { profile: result.profile, source: 'imported' };
        }
      }
    } catch {
      /* ignora */
    }
    return { profile: structuredClone(DEFAULT_PROFILE), source: 'default' };
  }

  private async signatureAccepted(profile: LanguageProfile, signingKeys: readonly string[]): Promise<boolean> {
    if (sanitizeSigningKeys([...signingKeys]).length === 0) return true;
    const data = await this.local?.get(STORAGE_KEYS.profileSignature);
    const signature = data?.[STORAGE_KEYS.profileSignature];
    return typeof signature === 'string' && verifyProfileSignature(profile, signature, signingKeys);
  }

  async saveProfile(profile: LanguageProfile, signature?: string): Promise<void> {
    const check = validateProfile(profile);
    if (!check.ok) throw new Error('Perfil inválido.');
    await this.local?.set({
      [STORAGE_KEYS.profile]: check.profile,
      ...(signature ? { [STORAGE_KEYS.profileSignature]: signature } : {}),
    });
    if (!signature) await this.local?.remove(STORAGE_KEYS.profileSignature);
  }

  /** Camada de equipe (somente restritiva). Sempre revalidada na leitura e na gravação. */
  async loadOverlay(): Promise<ProfileOverlay | null> {
    try {
      const data = await this.local?.get(STORAGE_KEYS.overlay);
      const stored = data?.[STORAGE_KEYS.overlay];
      if (!stored) return null;
      const result = validateOverlay(stored);
      return result.ok ? result.overlay : null;
    } catch {
      return null;
    }
  }

  async saveOverlay(overlay: ProfileOverlay): Promise<void> {
    const check = validateOverlay(overlay);
    if (!check.ok) throw new Error('Camada inválida.');
    await this.local?.set({ [STORAGE_KEYS.overlay]: check.overlay });
  }

  async removeOverlay(): Promise<void> {
    await this.local?.remove(STORAGE_KEYS.overlay);
  }

  /**
   * Biblioteca de modelos de texto da instituição. Sempre revalidada na leitura. Com chaves de assinatura configuradas,
   * só vale se a assinatura guardada ainda verificar (falha fechada), como no perfil importado.
   */
  async loadLibrary(signingKeys: readonly string[] = []): Promise<ModelLibrary | null> {
    try {
      const data = await this.local?.get([STORAGE_KEYS.modelLibrary, STORAGE_KEYS.modelLibrarySignature]);
      const stored = data?.[STORAGE_KEYS.modelLibrary];
      if (!stored) return null;
      const result = validateLibrary(stored);
      if (!result.ok) return null;
      if (sanitizeSigningKeys([...signingKeys]).length > 0) {
        const signature = data?.[STORAGE_KEYS.modelLibrarySignature];
        if (typeof signature !== 'string' || !(await verifyProfileSignature(result.library, signature, signingKeys))) return null;
      }
      return result.library;
    } catch {
      return null;
    }
  }

  async saveLibrary(library: ModelLibrary, signature?: string): Promise<void> {
    const check = validateLibrary(library);
    if (!check.ok) throw new Error('Biblioteca inválida.');
    await this.local?.set({
      [STORAGE_KEYS.modelLibrary]: check.library,
      ...(signature ? { [STORAGE_KEYS.modelLibrarySignature]: signature } : {}),
    });
    if (!signature) await this.local?.remove(STORAGE_KEYS.modelLibrarySignature);
  }

  async removeLibrary(): Promise<void> {
    await this.local?.remove([STORAGE_KEYS.modelLibrary, STORAGE_KEYS.modelLibrarySignature]);
  }

  /** Contadores agregados (sem conteúdo). Sempre sanitizados na leitura e na gravação. */
  async loadCounters(now: Date = new Date()): Promise<UsageCounters> {
    const today = dayString(now);
    if (!this.local) return emptyCounters(today);
    try {
      const data = await this.local.get(STORAGE_KEYS.usageCounters);
      return sanitizeCounters(data[STORAGE_KEYS.usageCounters], today);
    } catch {
      return emptyCounters(today);
    }
  }

  async saveCounters(counters: UsageCounters): Promise<void> {
    await this.local?.set({ [STORAGE_KEYS.usageCounters]: sanitizeCounters(counters, counters.since) });
  }

  async resetCounters(): Promise<void> {
    await this.local?.remove(STORAGE_KEYS.usageCounters);
  }

  /** Preferências de redação aprendidas (só índices em chaves fechadas). Sempre sanitizadas. */
  async loadLearning(): Promise<LearnedStats> {
    if (!this.local) return emptyStats();
    try {
      const data = await this.local.get(STORAGE_KEYS.learnedStyle);
      return sanitizeStats(data[STORAGE_KEYS.learnedStyle]);
    } catch {
      return emptyStats();
    }
  }

  async saveLearning(stats: LearnedStats): Promise<void> {
    await this.local?.set({ [STORAGE_KEYS.learnedStyle]: sanitizeStats(stats) });
  }

  async resetLearning(): Promise<void> {
    await this.local?.remove(STORAGE_KEYS.learnedStyle);
  }

  async clearAll(): Promise<void> {
    await this.local?.remove(ALLOWED_KEYS);
  }
}
