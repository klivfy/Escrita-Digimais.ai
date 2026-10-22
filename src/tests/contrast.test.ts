import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Theme = Record<string, string>;
const css = readFileSync('src/ui/styles/tokens.css', 'utf8');
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const contrastStart = css.indexOf('@media (prefers-contrast: more)');
if (darkStart < 0 || contrastStart <= darkStart) throw new Error('tokens.css: blocos @media fora da ordem esperada (escuro, depois contraste alto)');
const parse = (block: string): Theme =>
  Object.fromEntries([...block.matchAll(/--md-sys-color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
const themes: Record<string, Theme> = {
  claro: parse(css.slice(0, darkStart)),
  escuro: parse(css.slice(darkStart, contrastStart)),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

// Pares texto/fundo realmente usados em app.css.
const TEXT_PAIRS: [string, string][] = [
  ['on-surface', 'surface'], ['on-surface', 'surface-container-high'], ['on-surface', 'surface-container'],
  ['on-surface-variant', 'surface'], ['on-surface-variant', 'surface-container'], ['on-surface-variant', 'surface-container-high'],
  ['on-primary', 'primary'], ['on-error', 'error'], ['primary', 'surface'], ['error', 'surface'], ['error', 'surface-container-high'],
  ['on-error-container', 'error-container'], ['on-warning-container', 'warning-container'],
  ['on-success-container', 'success-container'], ['on-primary-container', 'primary-container'],
];
// Contornos de controles, indicador de foco e erro de campo (WCAG 1.4.11).
const COMPONENT_PAIRS: [string, string][] = [
  ['outline', 'surface'], ['primary', 'surface'], ['error', 'surface'], ['outline', 'surface-container-high'],
  // Botão principal sobre o painel informativo ("Preencher o formulário").
  ['primary', 'primary-container'],
];

describe.each(Object.entries(themes))('contraste WCAG 2.1 AA, tema %s', (_name, tokens) => {
  it.each(TEXT_PAIRS)('texto %s sobre %s >= 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(ratio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(COMPONENT_PAIRS)('componente %s sobre %s >= 3:1', (fg, bg) => {
    expect(ratio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('tokens do tema', () => {
  it('contraste alto troca bordas pela cor do texto', () => {
    const block = css.slice(contrastStart);
    expect(block).toMatch(/--md-sys-color-outline:\s*var\(--md-sys-color-on-surface\)/);
    expect(block).toMatch(/--md-sys-color-outline-variant:\s*var\(--md-sys-color-on-surface-variant\)/);
  });
  it('claro e escuro definem os mesmos papéis de cor', () => {
    expect(Object.keys(themes.escuro!).sort()).toEqual(Object.keys(themes.claro!).sort());
  });
});
