import {
  GameStateSchema,
  type GameState,
  type QuinquennatReview,
  type Ruleset,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { concludeDebates, newGame, playToEnd, QUIET, sponsorship } from '../core/testing';
import { distribute } from '../election/distribution';
import { sumFactors } from '../election/model';
import { presidentOf } from './government';
import { RECORD_FACTOR_LABEL, recordFactors, recordScore } from './succession';

// Phase 23 : présidentielle suivante — candidatures, successeur du joueur, poids du bilan.

const RULES = QUIET;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Joue avec les décisions par défaut, sans action, jusqu'à la condition. */
function play(start: GameState, until: (state: GameState) => boolean, ruleset: Ruleset = RULES) {
  let state = start;
  for (let i = 0; i < 400 && !until(state) && !state.calendar.blockedBy; i++) {
    state = concludeDebates(state, ruleset);
    state = advanceWeek(
      state,
      {
        actions: [],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    ).state;
  }
  return state;
}

const elected = playToEnd(newGame({ seed: 'succession' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;
const campaign = play(elected, (s) => s.meta.phase === 'campagne');

/** Bilan minimal : popularité finale, note sur 20 (null : sans objectifs), chômage en centièmes. */
function review(
  popularite: number | null,
  note: number | null,
  chomage: [number, number] | null,
): QuinquennatReview {
  const snapshot = (semaine: number, value: number | undefined) => ({
    semaine,
    date: '2027-05-17',
    popularite,
    indicateurs: value === undefined ? null : { chomage: value },
  });
  return {
    debut: snapshot(33, chomage?.[0]),
    fin: snapshot(294, chomage?.[1]),
    reformes: {
      adoptees: [],
      enVigueur: 0,
      rejetees: 0,
      retirees: 0,
      caducs: 0,
      engagements49_3: 0,
      censures: 0,
    },
    gouvernements: 1,
    legislatives: null,
    consequences: [],
    note: note === null ? null : { valeur: note, mention: 'Mention', objectifs: [] },
  } as QuinquennatReview;
}

describe('poids du bilan sur les intentions (phase 23, §5)', () => {
  it('vaut 0 pour un bilan neutre : popularité au pivot, 10 sur 20, chômage stable', () => {
    expect(recordScore(review(3500, 10, [750, 750]), RULES)).toBe(0);
  });

  it('additionne popularité, note et baisse du chômage', () => {
    // 1,2 × 0,2 + 0,3 × 0,6 + 0,15 × 1 = 0,57
    expect(recordScore(review(5500, 16, [750, 650]), RULES)).toBeCloseTo(0.57, 10);
  });

  it('est borné à ± 0,6', () => {
    expect(recordScore(review(1000, 4, [700, 900]), RULES)).toBe(-0.6);
    expect(recordScore(review(9000, 20, [900, 500]), RULES)).toBe(0.6);
  });

  it('prend 10 sur 20 sans note, le pivot sans popularité, un chômage stable sans économie', () => {
    expect(recordScore(review(3500, null, [750, 750]), RULES)).toBe(0);
    expect(recordScore(review(null, 10, null), RULES)).toBe(0);
    expect(recordScore(review(4500, null, null), RULES)).toBeCloseTo(0.12, 10);
  });

  it('n’ajoute aucun facteur sans succession, ni hors de la campagne qui suit le quinquennat', () => {
    expect(campaign.succession).toBeNull();
    const id = presidentOf(elected).id;
    expect(recordFactors(campaign, id)).toEqual([]);
    const during = clone(elected);
    during.succession = { annee: 2032, choixJoueur: null, annonces: [], bilan: {} };
    during.succession.bilan[id] = { facteur: 0.3, role: 'sortant' };
    expect(recordFactors(during, id)).toEqual([]);
  });

  it('ajoute le facteur « Bilan du quinquennat » au score, somme exacte des facteurs', () => {
    const id = presidentOf(elected).id;
    const state = clone(campaign);
    state.succession = { annee: 2032, choixJoueur: null, annonces: [], bilan: {} };
    state.succession.bilan[id] = { facteur: -0.42, role: 'sortant' };
    expect(GameStateSchema.safeParse(state).error).toBeUndefined();
    expect(recordFactors(state, id)).toEqual([{ label: RECORD_FACTOR_LABEL, value: -0.42 }]);

    const plain = distribute(campaign, RULES, 1, 'opinion');
    const weighed = distribute(state, RULES, 1, 'opinion');
    for (const [g, group] of weighed.entries()) {
      const c = group.contenders.findIndex((x) => x.id === id);
      const factors = group.factors[c]!;
      expect(factors.filter((f) => f.label === RECORD_FACTOR_LABEL)).toEqual([
        { label: RECORD_FACTOR_LABEL, value: -0.42 },
      ]);
      // Seul ce facteur change : le score baisse d'autant, les autres candidats n'en ont pas.
      expect(sumFactors(factors)).toBeCloseTo(sumFactors(plain[g]!.factors[c]!) - 0.42, 10);
      for (const [o, other] of group.factors.entries())
        if (o !== c) expect(other.some((f) => f.label === RECORD_FACTOR_LABEL)).toBe(false);
      expect(group.probabilities[c]!).toBeLessThan(plain[g]!.probabilities[c]!);
    }
  });
});
