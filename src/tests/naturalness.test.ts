import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../domain/engine';
import { assembleDraft, classifyDraft } from '../domain/draft';
import type { DraftAssignment } from '../domain/draft';
import type { GenerationSettings, LanguageProfile, TicketContext } from '../domain/types';
import { DEFAULT_PROFILE } from '../config/language-profile';
import { GOLD_CASES } from './eval/gold-cases';
import { measure } from './eval/naturalness';
import type { GoldCase, Naturalness } from './eval/naturalness';
import { NOW, profileWith, settings } from './helpers';

const DOC = 'docs/AVALIACAO-NATURALIDADE.md';
const LOCAL_IN = 'casos-reais.local.json';
const LOCAL_OUT = 'casos-reais.relatorio.local.md';

function run(c: Pick<GoldCase, 'type' | 'settings' | 'context'>, style: 'natural' | 'structured', profile: LanguageProfile) {
  const s: GenerationSettings = { ...settings(c.type), ...c.settings, style };
  return generate({ settings: s, context: c.context }, profile, { now: NOW });
}

const avg = (xs: number[]): number => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;

function table(rows: { id: string; natural: Naturalness; structured: Naturalness }[]): string {
  const head = '| Caso | F1 natural | F1 estruturada | Rótulos (nat/est) | 3ª pessoa (nat/est) | Palavras/frase (nat/est) | Tamanho vs humano (nat) |\n|---|---|---|---|---|---|---|';
  const lines = rows.map(
    (r) =>
      `| ${r.id} | ${r.natural.f1} | ${r.structured.f1} | ${r.natural.labels}/${r.structured.labels} | ${r.natural.thirdPersonUser}/${r.structured.thirdPersonUser} | ${r.natural.wordsPerSentence}/${r.structured.wordsPerSentence} | ${r.natural.lengthRatio} |`,
  );
  const total = `| **Média** | **${avg(rows.map((r) => r.natural.f1))}** | **${avg(rows.map((r) => r.structured.f1))}** | ${avg(rows.map((r) => r.natural.labels))}/${avg(rows.map((r) => r.structured.labels))} | ${avg(rows.map((r) => r.natural.thirdPersonUser))}/${avg(rows.map((r) => r.structured.thirdPersonUser))} | ${avg(rows.map((r) => r.natural.wordsPerSentence))}/${avg(rows.map((r) => r.structured.wordsPerSentence))} | ${avg(rows.map((r) => r.natural.lengthRatio))} |`;
  return [head, ...lines, total].join('\n');
}

function evaluate(cases: GoldCase[]) {
  return cases.map((c) => {
    const profile = c.profile ? profileWith(c.profile) : DEFAULT_PROFILE;
    const userRecipient = (c.settings.recipient ?? 'user') === 'user';
    const nat = run(c, 'natural', profile);
    const str = run(c, 'structured', profile);
    return {
      c,
      nat,
      str,
      row: { id: c.id, natural: measure(nat.text, c.human, userRecipient), structured: measure(str.text, c.human, userRecipient) },
    };
  });
}

describe('naturalidade medida contra um conjunto de referência fictício', () => {
  const results = evaluate(GOLD_CASES);

  it('todos os casos geram texto sem bloqueio nem alerta novo de segurança', () => {
    for (const r of results) {
      expect(r.nat.blocked, r.c.id).toBe(false);
      expect(r.nat.warnings.filter((w) => w.severity === 'block' || w.code.startsWith('sensitive_')), r.c.id).toEqual([]);
    }
  });

  it('o estilo Natural não regride em nenhuma medida mecânica em relação ao Estruturado', () => {
    for (const r of results) {
      expect(r.row.natural.thirdPersonUser, r.c.id).toBeLessThanOrEqual(r.row.structured.thirdPersonUser);
      expect(r.row.natural.firstPersonSingular, r.c.id).toBeLessThanOrEqual(r.row.structured.firstPersonSingular);
      expect(r.row.natural.firstPersonSingular, r.c.id).toBe(0);
    }
    expect(avg(results.map((r) => r.row.natural.f1))).toBeGreaterThanOrEqual(avg(results.map((r) => r.row.structured.f1)));
  });

  it('piso de qualidade (sobe quando a prosa melhora; não pode cair)', () => {
    expect(avg(results.map((r) => r.row.natural.f1))).toBeGreaterThanOrEqual(0.55);
    expect(avg(results.map((r) => r.row.natural.thirdPersonUser))).toBeLessThanOrEqual(0.2);
  });

  it('o documento versionado está em dia com a medida', () => {
    const rows = results.map((r) => r.row);
    const detail = results
      .map((r) => `### ${r.c.id}\n\nGerado (Natural):\n\n\`\`\`text\n${r.nat.text}\n\`\`\`\n\nTexto humano de referência:\n\n\`\`\`text\n${r.c.human}\n\`\`\``)
      .join('\n\n');
    const fresh = `# Avaliação de naturalidade

Gerado por \`src/tests/naturalness.test.ts\` (rode \`UPDATE_NATURALNESS=1 npx vitest run src/tests/naturalness.test.ts\` para atualizar). Casos 100% fictícios; os textos humanos foram escritos pelo assistente, não por analistas. **Este é um piso mecânico, não a opinião de quem escreve chamados.**

## O que se mede
- **F1**: sobreposição de palavras com o texto humano (0 a 1). Mede vocabulário, não qualidade.
- **Rótulos**: quantos "Rótulo: valor" aparecem. Quanto menos, menos cara de formulário.
- **3ª pessoa**: "o usuário", "dele", "dela" em texto escrito ao próprio usuário.
- **Palavras por frase** e **tamanho** em relação ao texto humano.

## Resultado

${table(rows)}

## Casos reais (fora do repositório)
O repositório é público: **nunca** commite chamados reais. Para medir com casos reais, crie na raiz do projeto o arquivo \`${LOCAL_IN}\` (ignorado pelo Git) e rode \`CASOS_REAIS=1 npx vitest run src/tests/naturalness.test.ts\`. Será criado \`${LOCAL_OUT}\` (também ignorado) com texto gerado e texto humano lado a lado.

Formato do arquivo (uma lista; troque nomes, matrículas e hosts por exemplos):

\`\`\`json
[
  {
    "id": "caso-1",
    "tipo": "progress_update",
    "destinatario": "user",
    "nivel": "simple",
    "formalidade": "cordial",
    "anotacao": "usuário sem acesso à VPN\\nresetei a senha\\nconexão ok no meu teste\\naguardando teste do usuário",
    "nome": "Maria",
    "texto_humano": "Olá, Maria, ..."
  }
]
\`\`\`

A anotação passa pelo rascunho livre (a mesma divisão que a tela faz) antes de gerar o texto, então o relatório também mostra como o classificador dividiu cada trecho.

## Detalhe dos casos

${detail}
`;
    if (process.env.UPDATE_NATURALNESS === '1') writeFileSync(DOC, fresh);
    expect(readFileSync(DOC, 'utf8')).toBe(fresh);
  });
});

interface LocalCase {
  id: string;
  tipo: GoldCase['type'];
  destinatario?: GenerationSettings['recipient'];
  nivel?: GenerationSettings['techLevel'];
  formalidade?: GenerationSettings['formality'];
  anotacao: string;
  nome?: string;
  texto_humano: string;
}

const TARGET_FIELD: Record<string, keyof TicketContext> = {
  summary: 'summary', observedResult: 'observedResult', pendingItem: 'pendingItem', expectedAction: 'expectedAction', notes: 'notes',
};

describe.skipIf(process.env.CASOS_REAIS !== '1' || !existsSync(LOCAL_IN))('casos reais locais (nunca versionados)', () => {
  it('gera o relatório lado a lado em ' + LOCAL_OUT, () => {
    const cases = JSON.parse(readFileSync(LOCAL_IN, 'utf8')) as LocalCase[];
    const parts: string[] = ['# Relatório local (não versionar)\n'];
    const rows: { id: string; natural: Naturalness; structured: Naturalness }[] = [];
    for (const lc of cases) {
      const segs = classifyDraft(lc.anotacao);
      const items: DraftAssignment[] = segs.map((s) => ({ text: s.text, target: s.predicted, planned: s.planned }));
      const fields = assembleDraft(items);
      const context: TicketContext = { requesterName: lc.nome };
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'actions' || k === 'questions') (context as Record<string, unknown>)[k] = v.split('\n');
        else if (k in TARGET_FIELD) (context as Record<string, unknown>)[k] = v;
      }
      const gold: GoldCase = {
        id: lc.id,
        type: lc.tipo,
        settings: { recipient: lc.destinatario ?? 'user', techLevel: lc.nivel ?? 'simple', formality: lc.formalidade ?? 'cordial' },
        context,
        human: lc.texto_humano,
      };
      const [r] = evaluate([gold]);
      if (!r) continue;
      rows.push(r.row);
      parts.push(`## ${lc.id}\n\nDivisão da anotação:\n${segs.map((s) => `- [${s.predicted}${s.planned ? ', planejada' : ''}, confiança ${s.confidence}] ${s.text}`).join('\n')}\n\nGerado (Natural):\n\n\`\`\`text\n${r.nat.text}\n\`\`\`\n\nTexto humano:\n\n\`\`\`text\n${lc.texto_humano}\n\`\`\`\n\nAlertas: ${r.nat.warnings.map((w) => w.code).join(', ') || 'nenhum'}${r.nat.blocked ? ` (bloqueado: ${r.nat.blockReason})` : ''}\n`);
    }
    parts.splice(1, 0, `${table(rows)}\n`);
    writeFileSync(LOCAL_OUT, parts.join('\n'));
    expect(rows.length).toBe(cases.length);
  });
});
