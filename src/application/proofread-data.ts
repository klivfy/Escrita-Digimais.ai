import { buildFreqIndex } from '../domain/proofread';
import type { FreqIndex } from '../domain/proofread';

let loading: Promise<FreqIndex> | null = null;

/**
 * Carrega a lista de frequência só quando alguém usa a correção (cerca de 1 MB; fica em um trecho separado do pacote).
 * `fetch` é proibido no projeto: o arquivo entra por `import()` dinâmico e é resolvido no build.
 */
export function loadFreqIndex(): Promise<FreqIndex> {
  loading ??= import('../config/proofread/freq-pt.json').then((m) => buildFreqIndex(m.default.grupos));
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
