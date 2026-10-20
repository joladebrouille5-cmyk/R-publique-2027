import { DEFAULT_START_DATE, GameStateSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { createGame, GameCreationError } from './createGame';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './versions';

const base = { seed: 'graine-1', mode: 'candidat_personnalise', difficulty: 'standard' } as const;

describe('createGame', () => {
  it('crée un état initial valide', () => {
    const state = createGame(base);
    expect(GameStateSchema.parse(state)).toEqual(state);
    expect(state.meta).toMatchObject({
      week: 0,
      date: DEFAULT_START_DATE,
      startDate: DEFAULT_START_DATE,
      phase: 'campagne',
      engineVersion: ENGINE_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    });
    expect(state.player).toEqual({ mode: 'candidat_personnalise', actorId: null });
  });

  it('est déterministe : même graine, même état', () => {
    expect(createGame(base)).toEqual(createGame(base));
    expect(createGame(base).rng).not.toEqual(createGame({ ...base, seed: 'graine-2' }).rng);
  });

  it('accepte un départ configurable un lundi de l’automne 2026', () => {
    expect(createGame({ ...base, startDate: '2026-11-02' }).meta.date).toBe('2026-11-02');
  });

  it.each([
    ['2026-09-29', 'pas un lundi'],
    ['2026-08-31', 'avant la fenêtre'],
    ['2027-01-04', 'après la fenêtre'],
    ['2026-02-30', 'date impossible'],
  ])('refuse la date de départ %s (%s)', (startDate) => {
    expect(() => createGame({ ...base, startDate })).toThrow(GameCreationError);
  });

  it('refuse le mode candidat réel tant que les profils sourcés n’existent pas', () => {
    expect(() => createGame({ ...base, mode: 'candidat_reel' })).toThrow(/phase 3/);
  });

  it('accepte le mode observateur', () => {
    expect(createGame({ ...base, mode: 'observateur' }).player.mode).toBe('observateur');
  });
});
