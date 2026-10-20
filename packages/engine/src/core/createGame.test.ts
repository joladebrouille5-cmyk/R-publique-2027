import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { DEFAULT_START_DATE, GameStateSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { createGame, GameCreationError, PLAYER_ACTOR_ID } from './createGame';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './versions';

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const base = { seed: 'graine-1', mode: 'candidat_personnalise', difficulty: 'standard' } as const;

describe('createGame', () => {
  it('crée un état initial valide', () => {
    const state = createGame(base, ruleset);
    expect(GameStateSchema.parse(state)).toEqual(state);
    expect(state.meta).toMatchObject({
      week: 0,
      date: DEFAULT_START_DATE,
      startDate: DEFAULT_START_DATE,
      phase: 'campagne',
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    });
    expect(state.player).toEqual({ mode: 'candidat_personnalise', actorId: PLAYER_ACTOR_ID });
  });

  it('attribue les ressources de départ selon la difficulté', () => {
    const resources = (difficulty: 'accessible' | 'standard' | 'expert') =>
      createGame({ ...base, difficulty }, ruleset).actors[PLAYER_ACTOR_ID]!.resources;
    expect(resources('standard')).toEqual({
      ...ruleset.jeu.ressourcesInitiales.standard,
      tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
    });
    expect(resources('accessible').budgetCentimes).toBeGreaterThan(
      resources('expert').budgetCentimes,
    );
  });

  it('est déterministe : même entrée, même état', () => {
    expect(createGame(base, ruleset)).toEqual(createGame(base, ruleset));
  });

  it('accepte un départ configurable un lundi de l’automne 2026', () => {
    expect(createGame({ ...base, startDate: '2026-11-02' }, ruleset).meta.date).toBe('2026-11-02');
  });

  it.each([
    ['2026-09-29', 'pas un lundi'],
    ['2026-08-31', 'avant la fenêtre'],
    ['2027-01-04', 'après la fenêtre'],
    ['2026-02-30', 'date impossible'],
  ])('refuse la date de départ %s (%s)', (startDate) => {
    expect(() => createGame({ ...base, startDate }, ruleset)).toThrow(GameCreationError);
  });

  it('refuse le mode candidat réel tant que les profils sourcés n’existent pas', () => {
    expect(() => createGame({ ...base, mode: 'candidat_reel' }, ruleset)).toThrow(/phase 3/);
  });

  it('crée une partie sans acteur en mode observateur', () => {
    const state = createGame({ ...base, mode: 'observateur' }, ruleset);
    expect(state.player).toEqual({ mode: 'observateur', actorId: null });
    expect(state.actors).toEqual({});
  });
});
