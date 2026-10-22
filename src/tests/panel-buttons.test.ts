import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles/app.css', 'utf8');

describe('botões dentro de painéis coloridos', () => {
  it('a ação principal mantém o par on-primary/primary e vem depois da regra genérica que herda a cor', () => {
    const generic = css.indexOf('.panel.info button:not(.danger)');
    const primary = css.indexOf('.panel.info button.primary');
    expect(generic).toBeGreaterThan(-1);
    expect(primary).toBeGreaterThan(generic);
    const rule = css.slice(primary, css.indexOf('}', primary));
    expect(rule).toContain('var(--md-sys-color-on-primary)');
    expect(rule).toContain('var(--md-sys-color-primary)');
  });

  it('o rótulo da caixa de seleção tem pelo menos 40 px de altura de toque', () => {
    expect(css).toMatch(/input\[type='checkbox'\] \+ label \{[^}]*min-height: 2\.5rem/);
  });
});
