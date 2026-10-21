import { describe, expect, it } from 'vitest';
import { createRng, deriveRngState, seedSfc32 } from './rng';

// Vecteurs produits par l'implémentation C de référence : scripts/sfc32-reference.c
const REFERENCE = [
  {
    seed: [0, 1, 2],
    warm: [3490869379, 430605426, 3510069306, 13],
    outputs: [
      3921474818, 1956182856, 3568291541, 21179437, 4071806733, 1723130490, 3005248831, 1793462341,
    ],
    after: [2997588499, 3113909646, 2125680348, 21],
  },
  {
    seed: [0xdeadbeef, 0x12345678, 0xcafebabe],
    warm: [3204235484, 2771777892, 4120942830, 13],
    outputs: [
      1681046093, 1208796164, 898700381, 1205528281, 2393902360, 1571440515, 2098230414, 3006862281,
    ],
    after: [3133592180, 1567321199, 2318615423, 21],
  },
  {
    seed: [0xffffffff, 0xffffffff, 0xffffffff],
    warm: [2017658756, 2255617882, 3986274255, 13],
    outputs: [
      4273276651, 3768204794, 412274996, 163292757, 66647681, 4198423949, 1356320052, 1806129180,
    ],
    after: [1557783773, 3118585280, 1672313662, 21],
  },
] as const;

describe('sfc32', () => {
  it.each(REFERENCE)('reproduit la référence C pour la graine $seed', (vector) => {
    const [a, b, c] = vector.seed;
    const initial = seedSfc32(a, b, c);
    expect(initial.state).toEqual(vector.warm);
    const rng = createRng(initial);
    expect(Array.from({ length: 8 }, () => rng.nextUint32())).toEqual(vector.outputs);
    expect(rng.snapshot().state).toEqual(vector.after);
  });

  it('reprend exactement depuis un instantané', () => {
    const rng = createRng(deriveRngState('graine-test'));
    rng.nextUint32();
    const resumed = createRng(rng.snapshot());
    expect(Array.from({ length: 100 }, () => resumed.nextUint32())).toEqual(
      Array.from({ length: 100 }, () => rng.nextUint32()),
    );
  });

  it("ne modifie pas l'état qui lui est fourni", () => {
    const state = deriveRngState('immuable');
    const copy = { ...state, state: [...state.state] };
    createRng(state).nextUint32();
    expect(state).toEqual(copy);
  });

  it('dérive des flux distincts et stables', () => {
    expect(deriveRngState('abc', 'semaine-1')).toEqual(deriveRngState('abc', 'semaine-1'));
    expect(deriveRngState('abc', 'semaine-1')).not.toEqual(deriveRngState('abc', 'semaine-2'));
    expect(deriveRngState('abc', 'a', 'b')).not.toEqual(deriveRngState('abc', 'ab'));
    expect(deriveRngState('abc')).not.toEqual(deriveRngState('abd'));
  });

  it('produit des réels dans [0, 1) et des entiers sans débordement', () => {
    const rng = createRng(deriveRngState('bornes'));
    for (let i = 0; i < 10_000; i++) {
      const x = rng.nextFloat();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.nextInt(7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });

  it('répartit nextInt de façon uniforme (khi-deux borné)', () => {
    const rng = createRng(deriveRngState('uniformite'));
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) buckets[rng.nextInt(10)]!++;
    const expected = draws / 10;
    const chi2 = buckets.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    // Seuil à 99,9 % pour 9 degrés de liberté : 27,88.
    expect(chi2).toBeLessThan(27.88);
  });
});
