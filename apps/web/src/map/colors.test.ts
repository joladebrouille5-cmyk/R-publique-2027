import { describe, expect, it } from 'vitest';
import { colorScheme, motifBackground, motifImage } from './colors';
import type { ResultCandidate, TerritoryResult } from './data';

const candidats: ResultCandidate[] = ['A', 'B', 'C', 'D'].map((label) => ({
  key: label,
  label,
  player: false,
}));
const result = (voix: number[]): TerritoryResult => {
  const exprimes = voix.reduce((a, b) => a + b, 0);
  return { inscrits: exprimes, votants: exprimes, blancs: 0, nuls: 0, exprimes, voix };
};
// Ordre national : B, A, C, puis D (« Autre »).
const national = result([30, 40, 20, 10]);

/** Pixels allumés (alpha non nul) d'une tuile. */
const inked = (tile: ReturnType<typeof motifImage>) => {
  const on = new Set<string>();
  for (let y = 0; y < tile.height; y++)
    for (let x = 0; x < tile.width; x++)
      if (tile.data[(y * tile.width + x) * 4 + 3]! > 0) on.add(`${x},${y}`);
  return on;
};

describe('motifs de la carte', () => {
  it('trace des hachures raccordées d’une tuile à l’autre, dans les deux sens', () => {
    const slash = motifImage('hachures', 'light');
    const back = motifImage('hachures-inverses', 'light');
    const cross = motifImage('croisillons', 'dark');
    expect(slash.data).toHaveLength(24 * 24 * 4);
    const s = inked(slash);
    const b = inked(back);
    // « / » : constant le long de x + y ; « \ » : constant le long de x − y.
    expect(s.has('0,0') && s.has('23,1') && !s.has('1,22')).toBe(true);
    expect(b.has('0,0') && b.has('23,23') && !b.has('23,1')).toBe(true);
    // Raccord : la colonne 0 prolonge la colonne 23 (période de 12 pixels).
    for (let y = 0; y < 24; y++) expect(s.has(`0,${y}`)).toBe(s.has(`12,${y}`));
    expect(inked(cross)).toEqual(new Set([...s, ...b]));
    expect(s.size).toBeGreaterThan(0);
    expect(s.size).toBeLessThan((24 * 24) / 2);
  });

  it('donne un motif distinct à chaque couleur du candidat en tête, légende comprise', () => {
    const scheme = colorScheme({ kind: 'vainqueur' }, candidats, national, 'light');
    expect(scheme.legend.map((e) => [e.label, e.motif])).toEqual([
      ['B', 'aucun'],
      ['A', 'hachures'],
      ['C', 'hachures-inverses'],
      ['Autre candidat en tête', 'croisillons'],
    ]);
    expect(scheme.motifOf(result([50, 10, 5, 1]))).toBe('hachures');
    expect(scheme.motifOf(result([1, 2, 3, 40]))).toBe('croisillons');
    expect(scheme.motifOf(undefined)).toBe('aucun');
  });

  it('hachure le camp du second candidat d’un écart, jamais le milieu', () => {
    const scheme = colorScheme({ kind: 'ecart', a: 0, b: 1 }, candidats, national, 'dark');
    expect(scheme.motifOf(result([60, 30, 5, 5]))).toBe('aucun');
    expect(scheme.motifOf(result([30, 60, 5, 5]))).toBe('hachures');
    expect(scheme.motifOf(result([45, 44, 6, 5]))).toBe('aucun');
    expect(scheme.legend.filter((e) => e.motif === 'hachures')).toHaveLength(3);
  });

  it('laisse les dégradés sans motif (ils se lisent par leur clarté)', () => {
    for (const coloring of [{ kind: 'score', candidate: 0 }, { kind: 'participation' }] as const) {
      const scheme = colorScheme(coloring, candidats, national, 'light');
      expect(scheme.motifOf(result([50, 10, 5, 1]))).toBe('aucun');
      expect(scheme.legend.every((e) => e.motif === 'aucun')).toBe(true);
    }
  });

  it('reproduit les motifs en CSS pour la légende', () => {
    expect(motifBackground('aucun', 'light')).toBeUndefined();
    expect(motifBackground('hachures', 'light')).toMatch(/^repeating-linear-gradient\(135deg/);
    expect(motifBackground('hachures-inverses', 'dark')).toMatch(
      /^repeating-linear-gradient\(45deg/,
    );
    expect(motifBackground('croisillons', 'light')?.split('repeating-')).toHaveLength(3);
  });
});
