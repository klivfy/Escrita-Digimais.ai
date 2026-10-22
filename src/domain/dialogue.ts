import { DIALOGUE_NEXT } from '../config/dialogue';
import type { CommunicationType } from './types';

/** Próximos passos possíveis depois de um tipo, sem os tipos que a organização desativou. Ordem padrão da configuração. */
export function nextStepCandidates(from: CommunicationType, disabled: ReadonlySet<CommunicationType> = new Set()): CommunicationType[] {
  return DIALOGUE_NEXT[from].filter((t) => t !== from && !disabled.has(t));
}

/** Reordena os candidatos pela contagem (maior primeiro). Empate mantém a ordem padrão. */
export function rankByCount<T extends string>(candidates: readonly T[], count: (item: T) => number): T[] {
  return candidates
    .map((item, i) => ({ item, i, n: count(item) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.item);
}
