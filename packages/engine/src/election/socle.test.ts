import { duelAverage, GameStateSchema, pollAverage, type GameState } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { createGame, GameCreationError, PLAYER_ACTOR_ID } from '../core/createGame';
import { RULESET as ruleset } from '../core/testing';
import { distribute, summarize } from './distribution';
import { calibrateSocle, socleFactors, socleLabel } from './socle';

// Départ « Sondages actuels » (phase 24) : socle calibré sur les sondages publiés, même formule
// pour toutes les personnalités réelles, joueur compris ; la suite est simulée.

const observe = (seed: string, depart?: 'sondages' | 'equitable') =>
  createGame(
    { seed, mode: 'observateur', difficulty: 'standard', adversaires: 'reels', depart },
    ruleset,
  );

const t1 = (state: GameState) =>
  summarize(distribute(state, ruleset, 1, 'opinion'), state.meta.week, 1)!;

function duel(state: GameState, a: string, b: string) {
  const copy = structuredClone(state);
  for (const actor of Object.values(copy.actors)) {
    if (actor.status === 'candidat')
      actor.status = actor.id === a || actor.id === b ? 'qualifie' : 'elimine';
  }
  const opinion = summarize(distribute(copy, ruleset, 2, 'opinion'), 0, 2)!;
  return (opinion.intentions[a]! * 10_000) / (opinion.intentions[a]! + opinion.intentions[b]!);
}

describe('socle « Sondages actuels »', () => {
  it('par défaut avec des personnalités réelles, intentions de la semaine 0 à ± 2 points de la moyenne', () => {
    const state = observe('socle-1');
    expect(state.player.depart).toBe('sondages');
    expect(GameStateSchema.parse(state)).toEqual(state);
    const ids = Object.keys(state.actors).sort();
    const average = pollAverage(ruleset.sondagesReels, ids, ruleset.departSondages.socleMinimal);
    expect(state.socle!.date).toBe(average.date);
    const opinion = t1(state);
    for (const id of ids) {
      expect(Math.abs(opinion.intentions[id]! - average.cibles[id]!.valeur)).toBeLessThanOrEqual(
        200,
      );
      expect(opinion.breakdown[id]!.map((f) => f.label)).toContain(socleLabel(average.date));
    }
  });

  it('seconds tours de la semaine 0 à ± 4 points des duels sourcés', () => {
    const state = observe('socle-2');
    const ids = Object.keys(state.socle!.t2).sort();
    expect(ids).toContain('reel-le-pen');
    let checked = 0;
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const target = duelAverage(ruleset.sondagesReels, a, b);
        if (target === null) continue;
        expect(Math.abs(duel(state, a, b) - target)).toBeLessThanOrEqual(400);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it('le joueur qui incarne une personnalité reçoit son socle, visible dans « Pourquoi ça bouge ? »', () => {
    let state = createGame(
      {
        seed: 'socle-3',
        mode: 'candidat_reel',
        difficulty: 'standard',
        personnaliteId: 'reel-philippe',
        adversaires: 'reels',
      },
      ruleset,
    );
    expect(state.socle!.t1[PLAYER_ACTOR_ID]).toBeTypeOf('number');
    expect(state.socle!.t2[PLAYER_ACTOR_ID]).toBeTypeOf('number');
    state = advanceWeek(state, { actions: [], decisions: [] }, { ruleset }).state;
    const labels = state.opinion!.breakdown[PLAYER_ACTOR_ID]!.map((f) => f.label);
    expect(labels).toContain(socleLabel(state.socle!.date));
  });

  it('aucun socle avec des adversaires fictifs, ni en départ équitable', () => {
    const fictifs = createGame(
      { seed: 'socle-4', mode: 'observateur', difficulty: 'standard' },
      ruleset,
    );
    expect(fictifs.player.depart).toBe('equitable');
    expect(fictifs.socle).toBeNull();
    expect(() =>
      createGame(
        { seed: 'socle-4', mode: 'observateur', difficulty: 'standard', depart: 'sondages' },
        ruleset,
      ),
    ).toThrow(GameCreationError);
    const equitable = observe('socle-4', 'equitable');
    expect(equitable.socle).toBeNull();
    expect(t1(equitable).breakdown['reel-le-pen']!.map((f) => f.label)).not.toContain(
      socleLabel('2026-10-29'),
    );
  });

  it('s’érode chaque semaine et ne vaut plus pour la présidentielle suivante', () => {
    const state = observe('socle-5');
    const offset = state.socle!.t1['reel-le-pen']!;
    const week10 = { ...state, meta: { ...state.meta, week: 10 } };
    expect(socleFactors(week10, ruleset, 'reel-le-pen', 1)[0]!.value).toBeCloseTo(
      offset * ruleset.departSondages.decroissance ** 10,
      3,
    );
    const next = { ...state, cycle: { ...state.cycle, annee: 2032 } };
    expect(socleFactors(next, ruleset, 'reel-le-pen', 1)).toEqual([]);
    expect(socleFactors(next, ruleset, 'reel-le-pen', 2)).toEqual([]);
  });

  it('est déterministe', () => {
    expect(observe('socle-6').socle).toEqual(observe('socle-6').socle);
    const state = observe('socle-6');
    expect(calibrateSocle({ ...state, socle: null }, ruleset)).toEqual(state.socle);
  });
});
