import { applyOverlay } from '../config/profile-overlay';
import type { ProfileOverlay } from '../config/profile-overlay';
import type { LibraryModel, ModelLibrary } from '../config/library-schema';
import { applyTaughtStyle } from '../config/taught-style';
import type { TaughtStyle } from '../config/taught-style';
import { vetLibrary, vetModel } from '../domain/library-vetting';
import { vetStyle } from '../domain/style-learn';
import type { LanguageProfile } from '../domain/types';
import type { AppStorage, LibraryLoad } from '../infrastructure/storage';

/**
 * Conteúdo do analista (biblioteca da instituição, modelos ensinados e estilo ensinado) contra o perfil em vigor.
 * É o único lugar que decide o que está em uso: o boot e cada mudança de perfil ou de camada passam por aqui, com o
 * mesmo perfil efetivo que a geração usa. O que sai de uso continua guardado, com o motivo, para o analista decidir.
 */

export interface ProfileSources {
  base: LanguageProfile;
  overlay: ProfileOverlay | null;
  /** Estilo em uso (null se não houver ou se foi desligado pela triagem). */
  style: TaughtStyle | null;
  signingKeys: readonly string[];
}

/** Com perfil assinado exigido pela organização, saudação, fecho e assinatura são dela: o estilo pessoal não se aplica. */
export const isStyleLocked = (signingKeys: readonly string[]): boolean => signingKeys.length > 0;

/** O perfil que a geração e a triagem usam: base, depois estilo ensinado (se livre), depois camada de equipe (sempre por último). */
export function effectiveProfile({ base, overlay, style, signingKeys }: ProfileSources): LanguageProfile {
  return applyOverlay(applyTaughtStyle(base, isStyleLocked(signingKeys) ? null : style), overlay);
}

export interface OutOfUseModel {
  model: LibraryModel;
  reasons: string[];
}

export interface AnalystContent {
  /** Biblioteca da instituição em uso (tudo ou nada). */
  library: ModelLibrary | null;
  /** Por que a biblioteca guardada não está em uso, se for o caso. */
  libraryNote: string | null;
  /** Modelos ensinados em uso. */
  taught: LibraryModel[];
  /** Modelos ensinados guardados que deixaram de passar nas regras em vigor, com o motivo. Continuam guardados. */
  taughtOut: OutOfUseModel[];
  /** Estilo guardado, esteja ou não em uso. */
  style: TaughtStyle | null;
  /** Por que o estilo guardado está desligado pela triagem (a trava de assinatura não entra aqui), ou null. */
  styleOff: string | null;
}

export interface StoredContent {
  library: LibraryLoad;
  taught: readonly LibraryModel[];
  style: TaughtStyle | null;
}

export const EMPTY_CONTENT: AnalystContent = { library: null, libraryNote: null, taught: [], taughtOut: [], style: null, styleOff: null };

const sentence = (text: string): string => (/[.!?]$/u.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** Decide, com as regras em vigor, o que do conteúdo guardado está em uso. Pura: não lê nem grava nada. */
export function triageContent(stored: StoredContent, sources: Omit<ProfileSources, 'style'>): AnalystContent {
  // 1. O estilo vem primeiro, contra as regras (base e camada): ele só muda saudação, fecho e assinatura.
  let styleOff: string | null = null;
  if (stored.style) {
    const { greeting, closing, signature } = stored.style;
    const vetting = vetStyle({ greeting, closing, signature }, applyOverlay(sources.base, sources.overlay));
    if (!vetting.ok) styleOff = vetting.reasons.slice(0, 2).map(sentence).join(' ');
  }

  // 2. O perfil efetivo é o da geração, com o estilo só se estiver em uso.
  const effective = effectiveProfile({ ...sources, style: styleOff ? null : stored.style });

  // 3. Biblioteca da instituição: tudo ou nada, como na importação.
  let library = stored.library.library;
  let libraryNote: string | null = null;
  if (stored.library.problem === 'signature') {
    libraryNote = 'A biblioteca guardada não está em uso: a assinatura não confere com as chaves da organização. Importe de novo o arquivo assinado.';
  } else if (stored.library.problem === 'invalid') {
    libraryNote = 'A biblioteca guardada não está em uso: o arquivo guardado ficou inválido. Importe de novo.';
  } else if (library) {
    const vetting = vetLibrary(library, effective);
    if (!vetting.ok) {
      library = null;
      libraryNote = `A biblioteca guardada não está em uso: ${vetting.problems.length} modelo(s) não passam mais nas regras atuais (por exemplo "${vetting.problems[0].title}"). Importe uma versão revisada.`;
    }
  }

  // 4. Modelos ensinados: um por vez, porque cada um é uma decisão do analista.
  const taught: LibraryModel[] = [];
  const taughtOut: OutOfUseModel[] = [];
  for (const model of stored.taught) {
    const { reasons } = vetModel(model, effective);
    if (reasons.length === 0) taught.push(model);
    else taughtOut.push({ model, reasons: reasons.slice(0, 2).map(sentence) });
  }

  return { library, libraryNote, taught, taughtOut, style: stored.style, styleOff };
}

/** Lê o que está guardado e aplica a triagem. */
export async function loadAnalystContent(store: AppStorage, sources: Omit<ProfileSources, 'style'>): Promise<AnalystContent> {
  const [library, taught, style] = await Promise.all([store.loadLibraryChecked(sources.signingKeys), store.loadTaught(), store.loadTaughtStyle()]);
  return triageContent({ library, taught, style }, sources);
}
