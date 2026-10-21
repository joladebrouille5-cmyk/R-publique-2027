import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aggregateCounts, aggregateHierarchy, checkCounts, type VoteCounts } from './aggregate';

const countsArb: fc.Arbitrary<VoteCounts> = fc
  .record({
    abstentions: fc.nat(5000),
    blancs: fc.nat(200),
    nuls: fc.nat(100),
    a: fc.nat(3000),
    b: fc.nat(3000),
  })
  .map(({ abstentions, blancs, nuls, a, b }) => {
    const exprimes = a + b;
    const votants = exprimes + blancs + nuls;
    return { inscrits: votants + abstentions, votants, blancs, nuls, exprimes, voix: { a, b } };
  });

// Communes → départements → régions → national ; codes toujours en chaînes (2A, 2B, 01…).
const PARENTS: Record<string, string | null> = {
  '2A004': '2A',
  '2B033': '2B',
  '01053': '01',
  '01004': '01',
  '2A': '94',
  '2B': '94',
  '01': '84',
  '94': 'FR',
  '84': 'FR',
  FR: null,
};

describe('agrégation territoriale', () => {
  it('chaque niveau est la somme exacte de ses enfants', () => {
    fc.assert(
      fc.property(fc.array(countsArb, { minLength: 4, maxLength: 4 }), (values) => {
        const leaves = new Map(
          ['2A004', '2B033', '01053', '01004'].map((code, i) => [code, values[i]!]),
        );
        const levels = aggregateHierarchy(leaves, (code) => PARENTS[code] ?? null);
        expect(levels.get('01')).toEqual(aggregateCounts([values[2]!, values[3]!]));
        expect(levels.get('94')).toEqual(aggregateCounts([levels.get('2A')!, levels.get('2B')!]));
        expect(levels.get('FR')).toEqual(aggregateCounts(values));
        for (const counts of levels.values()) expect(checkCounts(counts)).toEqual([]);
      }),
    );
  });

  it('refuse une hiérarchie où un territoire apparaît à deux niveaux', () => {
    const leaf: VoteCounts = {
      inscrits: 10,
      votants: 5,
      blancs: 0,
      nuls: 0,
      exprimes: 5,
      voix: { a: 5 },
    };
    const parents: Record<string, string | null> = { c1: 'd', c2: 'r', d: 'r', r: null };
    expect(() =>
      aggregateHierarchy(
        new Map([
          ['c1', leaf],
          ['c2', leaf],
        ]),
        (code) => parents[code] ?? null,
      ),
    ).toThrow(/plusieurs niveaux/);
  });

  it('détecte les résultats incohérents', () => {
    const ok: VoteCounts = {
      inscrits: 100,
      votants: 60,
      blancs: 2,
      nuls: 1,
      exprimes: 57,
      voix: { a: 30, b: 27 },
    };
    expect(checkCounts(ok)).toEqual([]);
    expect(checkCounts({ ...ok, voix: { a: 30, b: 26 } })).toContain('Σ voix ≠ exprimés');
    expect(checkCounts({ ...ok, votants: 61 })).toContain('votants ≠ blancs + nuls + exprimés');
    expect(checkCounts({ ...ok, votants: 160, exprimes: 157, voix: { a: 130, b: 27 } })).toContain(
      'plus de votants que d’inscrits',
    );
    expect(checkCounts({ ...ok, blancs: -1, exprimes: 60, voix: { a: 33, b: 27 } })).toContain(
      'valeur négative ou non entière',
    );
  });
});
