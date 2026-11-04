import { describe, expect, it } from 'vitest';
import { DEMO_DEPARTEMENTS as DEPARTEMENTS } from '../test/geo';
import { RULESET } from '../test/utils';
import { BOARD_VIEWBOX, boardShapes } from './geometry';

// Plateau (phase 25) : formes SVG des 101 départements, métropole et encarts d'outre-mer.

describe('formes du plateau', () => {
  const shapes = boardShapes(DEPARTEMENTS);
  const byCode = new Map(shapes.map((s) => [s.code, s]));

  it('dessine les 101 départements du jeu, Corse et outre-mer compris', () => {
    expect(shapes.map((s) => s.code).sort()).toEqual(
      Object.keys(RULESET.parrainages.reservoir.departements).sort(),
    );
    for (const code of ['2A', '2B', '971', '972', '973', '974', '976'])
      expect(byCode.get(code)?.d, code).toMatch(/^M/);
    expect(
      shapes
        .filter((s) => s.zone === 'outre-mer')
        .map((s) => s.code)
        .sort(),
    ).toEqual(['971', '972', '973', '974', '976']);
  });

  it('place la métropole dans son cadre et les DROM en encarts, en dessous', () => {
    const [, , width, height] = BOARD_VIEWBOX;
    for (const shape of shapes) {
      const [x, y] = shape.label;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }
    const metroBottom = Math.max(
      ...shapes.filter((s) => s.zone === 'metropole').map((s) => s.label[1]),
    );
    for (const shape of shapes.filter((s) => s.zone === 'outre-mer'))
      expect(shape.label[1]).toBeGreaterThan(metroBottom);
  });

  it('respecte la géographie : Nord au-dessus des Bouches-du-Rhône, Corse à l’est du Finistère', () => {
    expect(byCode.get('59')!.label[1]).toBeLessThan(byCode.get('13')!.label[1]);
    expect(byCode.get('2A')!.label[0]).toBeGreaterThan(byCode.get('29')!.label[0]);
    expect(byCode.get('2B')!.label[1]).toBeLessThan(byCode.get('2A')!.label[1]);
  });
});
