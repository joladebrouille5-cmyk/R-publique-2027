import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RULESET } from '../core/testing';
import { largestRemainder } from './apportion';
import { distance, softmax, turnout, type Contender } from './model';

const weightsArb = fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), {
  minLength: 1,
  maxLength: 12,
});

describe('répartition au plus fort reste', () => {
  it('répartit exactement le total, chaque part valant son quota arrondi par défaut ou par excès', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50_000_000 }), weightsArb, (total, weights) => {
        const sum = weights.reduce((a, b) => a + b, 0);
        fc.pre(sum > 0);
        const parts = largestRemainder(total, weights);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        parts.forEach((part, i) => {
          const quota = (total * weights[i]!) / sum;
          expect(Number.isInteger(part)).toBe(true);
          expect(part === Math.floor(quota) || part === Math.floor(quota) + 1).toBe(true);
        });
      }),
    );
  });

  it('départage les restes égaux par l’ordre des poids', () => {
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(largestRemainder(0, [1, 2])).toEqual([0, 0]);
  });

  it('refuse un total négatif ou des poids tous nuls', () => {
    expect(() => largestRemainder(-1, [1])).toThrow(RangeError);
    expect(() => largestRemainder(10, [0, 0])).toThrow(/nuls/);
    expect(() => largestRemainder(10, [Number.NaN])).toThrow(RangeError);
  });
});

describe('modèle de choix', () => {
  it('softmax : probabilités dans [0, 1], de somme 1, dans l’ordre des scores', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { minLength: 1, maxLength: 10 }),
        (scores) => {
          const p = softmax(scores);
          expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
          for (const value of p) expect(value).toBeGreaterThanOrEqual(0);
          for (let i = 0; i < scores.length; i++) {
            for (let j = 0; j < scores.length; j++) {
              if (scores[i]! > scores[j]!) expect(p[i]).toBeGreaterThanOrEqual(p[j]!);
            }
          }
        },
      ),
    );
  });

  it('la distance idéologique est symétrique et nulle entre deux positions identiques', () => {
    const a = { economie: -40, societe: 30 };
    const b = { economie: 20, societe: -50 };
    expect(distance(a, a)).toBe(0);
    expect(distance(a, b)).toBe(distance(b, a));
    expect(distance({ economie: 0, societe: 0 }, { economie: 30, societe: 40 })).toBe(0.5);
  });

  it('la participation d’un groupe reste dans les bornes du modèle et croît avec la proximité', () => {
    const { min, max } = RULESET.modele.participation;
    const contender = (economie: number, societe: number): Contender => ({
      id: 'x',
      position: { economie, societe },
      notoriete: 5000,
      popularite: 3000,
      dynamique: 0,
    });
    for (const group of RULESET.electorat.groupes) {
      const near = turnout(
        group,
        [contender(group.position.economie, group.position.societe)],
        RULESET.modele,
      );
      const far = turnout(
        group,
        [contender(-group.position.economie || 100, -group.position.societe || 100)],
        RULESET.modele,
      );
      for (const value of [near, far]) {
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
      expect(near).toBeGreaterThanOrEqual(far);
    }
  });
});
