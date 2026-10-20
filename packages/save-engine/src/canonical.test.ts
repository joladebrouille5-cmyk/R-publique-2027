import { createGame } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { describe, expect, it } from 'vitest';
import {
  canonicalStringify,
  hashState,
  snapshotState,
  SnapshotIntegrityError,
  verifySnapshot,
} from './canonical';

const state = createGame(
  { seed: 'sauvegarde', mode: 'observateur', difficulty: 'expert' },
  getRuleset(CURRENT_RULESET_KEY),
);

describe('sérialisation canonique', () => {
  it("ne dépend pas de l'ordre des clés", () => {
    expect(canonicalStringify({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[1,2]},"b":1}',
    );
    expect(canonicalStringify({ a: 1, b: 2 })).toBe(canonicalStringify({ b: 2, a: 1 }));
  });

  it('refuse les valeurs non représentables', () => {
    expect(() => canonicalStringify({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalStringify({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalStringify({ a: Infinity })).toThrow(TypeError);
    expect(() => canonicalStringify({ a: new Map() })).toThrow(TypeError);
    expect(() => canonicalStringify({ a: 1n })).toThrow(TypeError);
  });

  it('normalise -0 et échappe les chaînes', () => {
    expect(canonicalStringify([-0, 'é"\n'])).toBe('[0,"é\\"\\n"]');
  });
});

describe('empreinte et intégrité', () => {
  it('survit à un aller-retour JSON (stockage jsonb) avec la même empreinte', () => {
    const roundTripped = JSON.parse(JSON.stringify(state)) as unknown;
    expect(snapshotState(roundTripped).stateHash).toBe(hashState(state));
  });

  it('détecte une modification', () => {
    const hash = hashState(state);
    const altered = { ...state, meta: { ...state.meta, week: 1 } };
    expect(() => verifySnapshot(altered, hash)).toThrow(SnapshotIntegrityError);
    expect(verifySnapshot(state, hash)).toEqual(state);
  });

  it('refuse un état non conforme au schéma', () => {
    expect(() => snapshotState({ ...state, intrus: true })).toThrow();
  });
});
