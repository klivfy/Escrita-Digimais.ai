import { useCallback, useEffect, useMemo, useState } from 'react';
import { effectiveUsageMode, exportCounters, UsageRecorder } from '../../application/usage-counters';
import type { UsagePolicy } from '../../application/usage-counters';
import type { AppStorage } from '../../infrastructure/storage';
import { downloadJson } from '../download';

/**
 * Contadores de uso opcionais (só números, sem conteúdo): gravação serializada, total mostrado nas configurações,
 * exportação e zeragem. Respeita a política da organização (desligado, opcional ou ligado).
 */
export function useUsageCounters(store: AppStorage, policy: UsagePolicy, userOptIn: boolean) {
  const recorder = useMemo(
    () => new UsageRecorder({ load: () => store.loadCounters(), save: (c) => store.saveCounters(c) }),
    [store],
  );
  const mode = effectiveUsageMode(policy, userOptIn);
  useEffect(() => recorder.setEnabled(mode.enabled), [recorder, mode.enabled]);
  const [total, setTotal] = useState(0);

  const refreshTotal = useCallback(async (): Promise<void> => {
    const snap = await recorder.snapshot();
    setTotal(Object.values(snap.counts).reduce((a, b) => a + b, 0));
  }, [recorder]);

  const exportFile = useCallback(async (): Promise<void> => {
    downloadJson('contadores-de-uso.json', exportCounters(await recorder.snapshot()));
  }, [recorder]);

  const reset = useCallback(async (): Promise<void> => {
    await recorder.snapshot();
    await store.resetCounters();
    setTotal(0);
  }, [recorder, store]);

  return { recorder, mode, total, refreshTotal, exportFile, reset };
}
