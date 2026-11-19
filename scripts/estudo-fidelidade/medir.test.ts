// Fase 6 do plano de fidelidade: mede o estudo de referência com textos reais anonimizados do Digimais.
// Os textos ficam FORA do repositório; este script só imprime números agregados (nunca o texto).
//
// Uso:
//   FIDELIDADE_TEXTOS=/caminho/fora/do/repo/textos.json \
//   [FIDELIDADE_REVISAO=/caminho/fora/do/repo/revisao.txt] \
//   npx vitest run --config scripts/estudo-fidelidade/vitest.config.ts
//
// textos.json: [{ "tipo": "request_information", "texto": "..." }, ...] (tipos de src/domain/types.ts).
// FIDELIDADE_REVISAO (opcional): grava os trechos guardados, para o analista marcar falso positivo e falso negativo.
// Como esse arquivo deriva dos textos reais, o script recusa gravá-lo dentro do repositório.
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../../src/config/language-profile';
import { emptyLedger, ledgerTexts } from '../../src/config/learning-ledger';
import { judgeBlock, MIN_BLOCK_USES, redactionProblems } from '../../src/domain/block-vetting';
import { ingestTexts } from '../../src/domain/style-corpus';
import { proposeTraining } from '../../src/domain/style-train';
import { COMMUNICATION_TYPES } from '../../src/domain/types';
import type { CommunicationType } from '../../src/domain/types';

const inputPath = process.env.FIDELIDADE_TEXTOS;
const reviewPath = process.env.FIDELIDADE_REVISAO;

interface Entry {
  tipo: CommunicationType;
  texto: string;
}

const insideRepo = (path: string): boolean => {
  const rel = relative(process.cwd(), resolve(path));
  return rel !== '' && !rel.startsWith('..');
};

describe.skipIf(!inputPath)('fase 6: medida com textos reais', () => {
  it('imprime as métricas agregadas do estudo de referência', () => {
    expect(insideRepo(inputPath ?? ''), 'os textos reais devem ficar fora do repositório').toBe(false);
    if (reviewPath) expect(insideRepo(reviewPath), 'o arquivo de revisão deve ficar fora do repositório').toBe(false);

    const entries = JSON.parse(readFileSync(inputPath ?? '', 'utf8')) as Entry[];
    const valid = entries.filter((e) => COMMUNICATION_TYPES.includes(e.tipo) && typeof e.texto === 'string');
    expect(valid.length, 'nenhum texto com tipo válido').toBeGreaterThan(0);

    const { ledger, report } = ingestTexts(emptyLedger('2026-01-01'), valid.map((e) => ({ text: e.texto, type: e.tipo })), DEFAULT_PROFILE, new Date());

    const reasons = new Map<string, number>();
    for (const r of report.rejected) {
      const key = r.reason.replace(/\(.*?\)/, '(...)').replace(/\d+/g, 'N');
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }

    let kept = 0;
    let reusable = 0;
    let leaked = 0;
    const lines: string[] = [];
    const perType: string[] = [];
    for (const type of COMMUNICATION_TYPES) {
      const t = ledger.byType[type];
      if (!t) continue;
      const usable = t.blocks.filter((b) => b.count >= MIN_BLOCK_USES);
      kept += t.blocks.length;
      reusable += usable.length;
      for (const b of t.blocks) {
        // Auditoria: nada do que ficou guardado pode ainda ter fato de chamado.
        if (redactionProblems(b.text, DEFAULT_PROFILE).length > 0 || judgeBlock(b, type, DEFAULT_PROFILE).state === 'out') leaked += 1;
        lines.push(`${type}\t${b.role}\t${b.count}\t${b.text}`);
      }
      perType.push(`  ${type}: ${t.texts} texto(s), ${t.blocks.length} trecho(s) guardado(s), ${usable.length} com ${MIN_BLOCK_USES}+ usos`);
    }

    const proposal = proposeTraining(ledger, DEFAULT_PROFILE);
    const seen = report.blocks + report.discarded;
    const out = [
      '',
      '=== Fase 6: medida com textos reais (agregado, sem texto) ===',
      `Textos lidos: ${valid.length} (${entries.length - valid.length} ignorados por tipo ou formato inválido)`,
      `Aceitos: ${report.accepted} | recusados inteiros: ${report.rejected.length}`,
      ...[...reasons].map(([k, n]) => `  recusa: ${k} x${n}`),
      `Trechos guardados: ${kept} | descartados na triagem: ${report.discarded} | reaproveitáveis (${MIN_BLOCK_USES}+ usos): ${reusable}`,
      `Taxa de descarte: ${seen > 0 ? Math.round((report.discarded / seen) * 100) : 0}%`,
      `Auditoria de vazamento (guardado mas ainda com fato de chamado): ${leaked} (esperado 0)`,
      ...perType,
      `Propostas de treino: ${proposal.items.length} | notas: ${proposal.notes.length} | textos no registro: ${ledgerTexts(ledger)}`,
      '',
    ];
    console.log(out.join('\n'));
    if (reviewPath) writeFileSync(reviewPath, `tipo\tpapel\tusos\ttrecho\n${lines.join('\n')}\n`, 'utf8');

    expect(leaked).toBe(0);
  });
});
