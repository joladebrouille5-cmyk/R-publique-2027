import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Phase 22 : jetons sémantiques d'encre. Leur contraste (WCAG 2.1, texte courant ≥ 4,5:1) est
// vérifié sur les surfaces du jeu, de jour et de nuit, d'après les valeurs écrites dans index.css.

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');

/** Valeur d'une variable dans un bloc (premier bloc dont le sélecteur commence par `selector`). */
function tokenIn(block: string, name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(block);
  if (!match) throw new Error(`jeton --color-${name} introuvable`);
  return match[1]!;
}

function blockOf(selector: string): string {
  const start = CSS.indexOf(selector);
  if (start < 0) throw new Error(`bloc ${selector} introuvable`);
  return CSS.slice(start, CSS.indexOf('}', start));
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** Rapport de contraste WCAG entre deux couleurs opaques. */
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('jetons d’encre (phase 22)', () => {
  const day = blockOf('@theme');
  const night = blockOf('html.dark {');
  const inks = ['encre', 'encre-2', 'encre-3'] as const;

  it('se lisent de jour sur le papier et sur la feuille', () => {
    for (const ink of inks)
      for (const surface of [tokenIn(day, 'papier'), tokenIn(day, 'feuille')])
        expect(ratio(tokenIn(day, ink), surface), `${ink} sur ${surface}`).toBeGreaterThanOrEqual(
          4.5,
        );
  });

  it('se lisent de nuit sur le fond et sur la feuille', () => {
    for (const ink of inks)
      for (const surface of [tokenIn(day, 'slate-950'), tokenIn(night, 'feuille')])
        expect(ratio(tokenIn(night, ink), surface), `${ink} sur ${surface}`).toBeGreaterThanOrEqual(
          4.5,
        );
  });

  it('hiérarchisent l’encre : principale plus contrastée que la secondaire', () => {
    const paper = tokenIn(day, 'papier');
    expect(ratio(tokenIn(day, 'encre'), paper)).toBeGreaterThan(
      ratio(tokenIn(day, 'encre-2'), paper),
    );
  });
});
