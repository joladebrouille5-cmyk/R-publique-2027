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

describe('identité « Feutrine » (phase 25)', () => {
  const day = blockOf('@theme');
  const night = blockOf('html.dark {');
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  it('charge Bricolage Grotesque, police d’affichage', () => {
    expect(CSS).toContain("@import '@fontsource-variable/bricolage-grotesque/standard.css'");
    expect(CSS).toMatch(/--font-display:\s*'Bricolage Grotesque Variable'/);
  });

  it('texte clair sur la feutrine, encre sur le carton, de jour comme de nuit', () => {
    for (const block of [day, night]) {
      for (const felt of ['feutrine', 'feutrine-2'])
        for (const ink of ['craie', 'craie-2'])
          expect(
            ratio(tokenIn(day, ink), tokenIn(block, felt)),
            `${ink} sur ${felt}`,
          ).toBeGreaterThanOrEqual(4.5);
      for (const ink of ['encre-carton', 'encre-carton-2'])
        expect(
          ratio(tokenIn(block, ink), tokenIn(block, 'carton')),
          `${ink} sur carton`,
        ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('une seule teinte du crème à l’orange brûlé, chaque palier lisible avec son texte', () => {
    const steps = [0, 1, 2, 3, 4].map((i) => tokenIn(day, `implantation-${i}`));
    for (let i = 1; i < steps.length; i++)
      expect(luminance(steps[i]!), `palier ${i}`).toBeLessThan(luminance(steps[i - 1]!));
    for (const step of steps) {
      const [r, g, b] = channels(step);
      expect(r).toBeGreaterThanOrEqual(g!);
      expect(r).toBeGreaterThanOrEqual(b!);
    }
    steps.forEach((step, i) =>
      expect(
        ratio(step, tokenIn(day, `sur-implantation-${i}`)),
        `texte sur le palier ${i}`,
      ).toBeGreaterThanOrEqual(4.5),
    );
    expect(ratio(steps[0]!, steps[4]!)).toBeGreaterThanOrEqual(3);
  });

  it('bords, pions et plateau : au moins 3:1', () => {
    for (const block of [day, night]) {
      expect(ratio(tokenIn(day, 'or'), tokenIn(block, 'feutrine'))).toBeGreaterThanOrEqual(3);
      expect(ratio(tokenIn(block, 'carton'), tokenIn(block, 'feutrine'))).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(tokenIn(day, 'trait'), tokenIn(day, 'carton'))).toBeGreaterThanOrEqual(3);
    expect(ratio(tokenIn(day, 'trait'), tokenIn(day, 'implantation-0'))).toBeGreaterThanOrEqual(3);
    expect(ratio(tokenIn(day, 'sur-or'), tokenIn(day, 'or'))).toBeGreaterThanOrEqual(4.5);
  });

  it('bandeaux de famille en couleurs franches, texte blanc lisible', () => {
    for (const famille of ['terrain', 'medias', 'numerique', 'organisation'])
      expect(ratio(tokenIn(day, `famille-${famille}`), '#ffffff'), famille).toBeGreaterThanOrEqual(
        4.5,
      );
  });
});
