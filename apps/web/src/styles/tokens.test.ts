import { describe, expect, it } from 'vitest';
import css from './globals.css?raw';

function tokensOf(theme: 'dark' | 'light'): Record<string, string> {
  const block =
    css.match(new RegExp(String.raw`:root\[data-theme='${theme}'\]\s*{([^}]*)}`))?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(['dark', 'light'] as const)('tokens %s', (theme) => {
  const t = tokensOf(theme);
  it('define los 8 tokens', () => {
    for (const name of ['bg', 'surface', 'fg', 'muted', 'border', 'accent', 'accent-fg', 'danger'])
      expect(t[name], name).toBeDefined();
  });
  it('cumple AA (4.5:1) en pares de texto', () => {
    expect(ratio(t.fg!, t.bg!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.fg!, t.surface!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.muted!, t.bg!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['accent-fg']!, t.accent!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.danger!, t.bg!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('preferencias de interacción', () => {
  it('incluye foco visible y respeta reduced motion', () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
