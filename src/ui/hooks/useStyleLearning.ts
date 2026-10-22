import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyStats, exportLearning, recordStep, recordUse, StyleLearner } from '../../application/style-learning';
import type { LearnedStats } from '../../application/style-learning';
import type { UsagePolicy } from '../../application/usage-counters';
import type { AppStorage } from '../../infrastructure/storage';
import type { CommunicationType, GenerationResult } from '../../domain/types';
import { downloadJson } from '../download';

/**
 * Aprendizado local de preferência de redação (só contagens inteiras, opt-in, zerável). Desligado quando a política
 * da organização proíbe contadores locais. Guarda também as redações mostradas na última geração e qual geração já
 * foi contada como "mantida", para não contar a mesma cópia duas vezes.
 */
export function useStyleLearning(store: AppStorage, userOptIn: boolean, usagePolicy: UsagePolicy) {
  const enabled = userOptIn && usagePolicy !== 'off';
  const locked = usagePolicy === 'off';
  const learner = useMemo(
    () => new StyleLearner({ load: () => store.loadLearning(), save: (s) => store.saveLearning(s) }),
    [store],
  );
  useEffect(() => learner.setEnabled(enabled), [learner, enabled]);

  const [stats, setStats] = useState<LearnedStats>(emptyStats);
  const shownChoices = useRef<GenerationResult['choices']>(undefined);
  const acceptedAt = useRef(0);

  const remember = useCallback(
    (events: Parameters<StyleLearner['record']>[0]): void => {
      void learner.record(events).then(() => learner.snapshot()).then(setStats);
    },
    [learner],
  );
  const rememberFixes = useCallback(
    (fixes: Parameters<StyleLearner['recordFixes']>[0]): void => {
      void learner.recordFixes(fixes).then(() => learner.snapshot()).then(setStats);
    },
    [learner],
  );
  const reset = useCallback(async (): Promise<void> => {
    await learner.snapshot();
    await store.resetLearning();
    setStats(emptyStats());
  }, [learner, store]);

  /** Redações da geração anterior, para saber o que mudou quando o analista pede outra variação. */
  const previousShown = useCallback((): GenerationResult['choices'] => shownChoices.current, []);
  const setShown = useCallback((choices: GenerationResult['choices']): void => {
    shownChoices.current = choices;
  }, []);
  /** Conta a geração como "mantida" uma única vez, mesmo que o texto seja copiado várias vezes. */
  const acceptOnce = useCallback(
    (generationId: number, events: () => Parameters<StyleLearner['record']>[0]): void => {
      if (acceptedAt.current === generationId) return;
      acceptedAt.current = generationId;
      remember(events());
    },
    [remember],
  );

  /** Texto copiado: conta o tipo uma vez por geração, para a lista de tipos mais usados. */
  const usedAt = useRef(0);
  const rememberUse = useCallback(
    (generationId: number, type: CommunicationType): void => {
      if (usedAt.current === generationId) return;
      usedAt.current = generationId;
      void learner.recordUsage((st) => recordUse(st, type)).then(() => learner.snapshot()).then(setStats);
    },
    [learner],
  );
  /** Próximo passo escolhido depois de copiar um texto do tipo `from`. */
  const rememberStep = useCallback(
    (from: CommunicationType, to: CommunicationType): void => {
      void learner.recordUsage((st) => recordStep(st, from, to)).then(() => learner.snapshot()).then(setStats);
    },
    [learner],
  );

  const exportFile = useCallback(async (): Promise<void> => {
    downloadJson('aprendizado-de-redacao.json', exportLearning(await learner.snapshot()));
  }, [learner]);

  const total = Object.values(stats.counts).reduce((a, b) => a + b, 0);
  return { enabled, locked, stats, setStats, total, previousShown, setShown, acceptOnce, remember, rememberFixes, rememberUse, rememberStep, reset, exportFile };
}
