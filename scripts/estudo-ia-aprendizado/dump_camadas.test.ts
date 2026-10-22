// Gera saida-camadas.json com as sugestões das camadas 1 e 2 para os três conjuntos e para os textos do produto.
// Uso: npx vitest run --config scripts/estudo-ia-aprendizado/vitest.estudo.config.ts (fora da suíte padrão de src/tests)
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { loadFreqIndex } from '../../src/application/proofread-data';
import { proofreadAll } from '../../src/domain/proofread';

it('gera saida-camadas.json', async () => {
  const index = await loadFreqIndex();
  const out: Record<string, unknown>[] = [];
  for (const f of ['gold.json', 'gold-novo.json', 'gold-3.json']) {
    const g = JSON.parse(readFileSync(`scripts/estudo-correcao/${f}`, 'utf8')) as { erros: { cat: string; entrada: string; esperado: string }[]; limpos: string[] };
    for (const e of g.erros) out.push({ f, cat: e.cat, entrada: e.entrada, esperado: e.esperado, sug: proofreadAll(e.entrada, index) });
    for (const t of g.limpos) out.push({ f, cat: 'limpo', entrada: t, esperado: t, sug: proofreadAll(t, index) });
  }
  const blocks = [...readFileSync('docs/AMOSTRAS-FORMATO.md', 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const b of blocks) out.push({ f: 'amostras', cat: 'produto', entrada: b, esperado: b, sug: proofreadAll(b, index) });
  writeFileSync('scripts/estudo-ia-aprendizado/saida-camadas.json', JSON.stringify(out));
}, 30000);
