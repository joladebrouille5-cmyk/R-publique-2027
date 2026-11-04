import { describe, expect, it } from 'vitest';
import { labelledIds, layoutTrend, type TrendSeries } from './pollTrend';

// Phase 22 : géométrie du graphique d'évolution des sondages (fonctions pures). Valeurs en
// centièmes de point (2481 = 24,81 %), comme les sondages servis par l'API.

const BOX = { width: 600, height: 300, padding: { top: 12, right: 120, bottom: 28, left: 40 } };
const serie = (id: string, values: (number | null)[], player = false): TrendSeries => ({
  id,
  label: id,
  color: '#000000',
  player,
  values,
});

describe('géométrie de l’évolution des sondages (phase 22)', () => {
  it('borne l’axe au multiple de 5 points supérieur et le gradue tous les 5 points', () => {
    const layout = layoutTrend([serie('a', [2480, 2300]), serie('b', [1993, 2010])], BOX);
    expect(layout.yMax).toBe(2500);
    expect(layout.ticks).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(layout.yAt(0)).toBe(BOX.height - BOX.padding.bottom);
    expect(layout.yAt(2500)).toBe(BOX.padding.top);
    expect(layout.xAt(0)).toBe(BOX.padding.left);
    expect(layout.xAt(1)).toBe(BOX.width - BOX.padding.right);
  });

  it('interrompt la ligne d’un candidat absent d’une vague, sans point inventé', () => {
    const layout = layoutTrend([serie('a', [1000, 1100, null, 1200, 1300])], BOX);
    const d = layout.paths[0]!.d;
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
  });

  it('écarte les étiquettes de fin de ligne d’au moins 14 px, dans le cadre', () => {
    const layout = layoutTrend(
      [serie('a', [1500, 1500]), serie('b', [1490, 1510]), serie('c', [1500, 1505])],
      BOX,
    );
    const ys = layout.labels.map((l) => l.y).sort((x, y) => x - y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(14);
    for (const label of layout.labels) {
      expect(label.y).toBeGreaterThanOrEqual(BOX.padding.top);
      expect(label.y).toBeLessThanOrEqual(BOX.height - BOX.padding.bottom);
      // Le fil de rappel part du bout de la ligne de la série.
      expect(label.anchorY).toBe(
        layout.yAt(label.id === 'b' ? 1510 : label.id === 'c' ? 1505 : 1500),
      );
    }
  });

  it('n’étiquette que quatre séries : les trois premières et le joueur', () => {
    const series = [
      serie('a', [2000, 2400]),
      serie('b', [2100, 2200]),
      serie('c', [1800, 1900]),
      serie('d', [1500, 1600]),
      serie('e', [900, 1000]),
      serie('joueur', [100, 178], true),
    ];
    expect(labelledIds(series)).toEqual(['joueur', 'a', 'b', 'c']);
    // Joueur en tête : les quatre premiers.
    series[5] = serie('joueur', [2500, 2600], true);
    expect(labelledIds(series)).toEqual(['joueur', 'a', 'b', 'c']);
    expect(
      layoutTrend(series, BOX)
        .labels.map((l) => l.id)
        .sort(),
    ).toEqual(['a', 'b', 'c', 'joueur']);
  });

  it('place une vague unique au milieu', () => {
    const layout = layoutTrend([serie('a', [1000])], BOX);
    expect(layout.xAt(0)).toBe((BOX.padding.left + BOX.width - BOX.padding.right) / 2);
  });
});
