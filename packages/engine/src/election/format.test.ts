import { GameStateSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { EngineInputError } from '../core/errors';
import { newGame, playUntil, RULESET } from '../core/testing';

// Phase 20 : format de partie. Complet (par défaut) : campagne puis quinquennat. Court : la partie
// s'arrête au soir de l'élection présidentielle, sans quinquennat.

const elected = (format: 'complet' | 'court') =>
  playUntil(
    newGame({ seed: 'format', format }),
    (s) => s.calendar.blockedBy === 'fin-de-partie' || s.quinquennat !== null,
  ).state;

describe('format de partie (phase 20)', () => {
  it('format complet par défaut : le vainqueur entre à l’Élysée', () => {
    expect(newGame().player.format).toBe('complet');
    const state = elected('complet');
    expect(state.quinquennat).not.toBeNull();
    expect(state.meta.phase).toBe('presidence');
  });

  it('format court : la partie s’arrête au soir de l’élection, sans quinquennat', () => {
    const state = elected('court');
    expect(GameStateSchema.parse(state)).toEqual(state);
    expect(state.quinquennat).toBeNull();
    expect(state.elections.t2 ?? state.elections.t1).not.toBeNull();
    const winner = (state.elections.t2 ?? state.elections.t1)!.winner!;
    expect(state.actors[winner]!.status).toBe('elu');
    expect(state.calendar.blockedBy).toBe('fin-de-partie');
    expect(state.calendar.blockedMessage).toMatch(
      /^Partie terminée \(format court\) : .+ est élu\(e\)/,
    );
    // Plus aucune semaine ne se résout.
    expect(() => advanceWeek(state, { actions: [], decisions: [] }, { ruleset: RULESET })).toThrow(
      EngineInputError,
    );
  });

  it('le format ne change rien à la campagne : mêmes semaines jusqu’à l’élection', () => {
    const until = (format: 'complet' | 'court') =>
      playUntil(newGame({ seed: 'format-egal', format }), (s) => s.meta.week === 20).state;
    const { player: a, ...complet } = until('complet');
    const { player: b, ...court } = until('court');
    expect(court).toEqual(complet);
    expect({ ...a, format: 'court' }).toEqual(b);
  });
});
