import { applyOverlay } from '../config/profile-overlay';
import type { ProfileOverlay } from '../config/profile-overlay';
import type { LibraryModel, ModelLibrary } from '../config/library-schema';
import { applyTaughtStyle } from '../config/taught-style';
import type { BlockRole, Ledger } from '../config/learning-ledger';
import { judgeBlock } from '../domain/block-vetting';
import { COMMUNICATION_TYPES } from '../domain/types';
import type { CommunicationType } from '../domain/types';
import { applyTrainedStyle } from '../config/trained-style';
import type { TrainedStyle } from '../config/trained-style';
import { toEngineText, vetLine } from '../domain/style-train';
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
  /** Estilo treinado em uso (abertura, fecho e rótulos aprovados). */
  trained: TrainedStyle | null;
  signingKeys: readonly string[];
}

/** Com perfil assinado exigido pela organização, saudação, fecho e assinatura são dela: o estilo pessoal não se aplica. */
export const isStyleLocked = (signingKeys: readonly string[]): boolean => signingKeys.length > 0;

/** O perfil que a geração e a triagem usam: base, depois estilo ensinado (se livre), depois camada de equipe (sempre por último). */
export function effectiveProfile({ base, overlay, style, trained, signingKeys }: ProfileSources): LanguageProfile {
  const locked = isStyleLocked(signingKeys);
  return applyOverlay(applyTaughtStyle(applyTrainedStyle(base, locked ? null : trained), locked ? null : style), overlay);
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
  /** Estilo treinado em uso: o que passou nas regras em vigor. */
  trained: TrainedStyle | null;
  /** Itens do estilo treinado que deixaram de passar, com o motivo. Continuam guardados. */
  trainedOut: string[];
  /** Registro do que foi aprendido (null se nunca houve). */
  ledger: Ledger | null;
  /** Trechos do registro que não estão em uso, com o motivo. Continuam guardados; o analista decide esquecer. */
  blocksNotInUse: BlockNotInUse[];
}

/** Trecho aprendido guardado que não está em uso: fora das regras ("out") ou ainda sem repetição suficiente ("waiting"). */
export interface BlockNotInUse {
  type: CommunicationType;
  role: BlockRole;
  text: string;
  count: number;
  state: 'out' | 'waiting';
  reasons: string[];
}

/** Chave estável de um trecho: tipo, papel e texto. */
export const blockKey = (type: CommunicationType, role: BlockRole, text: string): string => `${type}|${role}|${text}`;

export interface StoredContent {
  library: LibraryLoad;
  taught: readonly LibraryModel[];
  style: TaughtStyle | null;
  trained?: TrainedStyle | null;
  ledger?: Ledger | null;
}

export const EMPTY_CONTENT: AnalystContent = {
  library: null, libraryNote: null, taught: [], taughtOut: [], style: null, styleOff: null, trained: null, trainedOut: [], ledger: null,
  blocksNotInUse: [],
};

const sentence = (text: string): string => (/[.!?]$/u.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** Decide, com as regras em vigor, o que do conteúdo guardado está em uso. Pura: não lê nem grava nada. */
export function triageContent(stored: StoredContent, sources: Omit<ProfileSources, 'style' | 'trained'>): AnalystContent {
  // 1. O estilo vem primeiro, contra as regras (base e camada): ele só muda saudação, fecho e assinatura.
  let styleOff: string | null = null;
  if (stored.style) {
    const { greeting, closing, signature } = stored.style;
    const vetting = vetStyle({ greeting, closing, signature }, applyOverlay(sources.base, sources.overlay));
    if (!vetting.ok) styleOff = vetting.reasons.slice(0, 2).map(sentence).join(' ');
  }

  // 1b. O estilo treinado é triado item a item contra as mesmas regras.
  const rules = applyOverlay(sources.base, sources.overlay);
  const trainedOut: string[] = [];
  let trained: TrainedStyle | null = null;
  if (stored.trained) {
    const keep: TrainedStyle = { version: 1 };
    const check = (label: string, text: string, engine: boolean): boolean => {
      const reasons = vetLine(text, rules);
      if (engine && !toEngineText(text)) reasons.push('usa um campo que a geração não conhece');
      if (reasons.length === 0) return true;
      trainedOut.push(`${label} "${text}": ${reasons[0]}.`);
      return false;
    };
    for (const kind of ['openings', 'closings'] as const) {
      for (const [type, text] of Object.entries(stored.trained[kind] ?? {})) {
        if (check(`${kind === 'openings' ? 'Abertura' : 'Fecho'} de ${type}`, text, false)) keep[kind] = { ...keep[kind], [type]: text };
      }
    }
    for (const [key, text] of Object.entries(stored.trained.labels ?? {})) {
      if (check('Rótulo', text, false)) keep.labels = { ...keep.labels, [key]: text };
    }
    trained = keep.openings || keep.closings || keep.labels ? keep : null;
  }

  // 2. O perfil efetivo é o da geração, com o estilo só se estiver em uso.
  const effective = effectiveProfile({ ...sources, style: styleOff ? null : stored.style, trained });

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

  // 5. Trechos aprendidos: com fato de chamado ou fora das regras ficam fora de uso; com uma ocorrência só, aguardam repetição.
  const blocksNotInUse: BlockNotInUse[] = [];
  for (const type of COMMUNICATION_TYPES) {
    for (const block of stored.ledger?.byType[type]?.blocks ?? []) {
      const verdict = judgeBlock(block, type, effective);
      if (verdict.state !== 'ok') blocksNotInUse.push({ type, role: block.role, text: block.text, count: block.count, state: verdict.state, reasons: verdict.reasons });
    }
  }

  return { library, libraryNote, taught, taughtOut, style: stored.style, styleOff, trained, trainedOut, ledger: stored.ledger ?? null, blocksNotInUse };
}

/** Lê o que está guardado e aplica a triagem. */
export async function loadAnalystContent(store: AppStorage, sources: Omit<ProfileSources, 'style' | 'trained'>): Promise<AnalystContent> {
  const [library, taught, style, trained, ledger] = await Promise.all([
    store.loadLibraryChecked(sources.signingKeys), store.loadTaught(), store.loadTaughtStyle(), store.loadTrained(), store.loadLedger(),
  ]);
  return triageContent({ library, taught, style, trained, ledger }, sources);
}
