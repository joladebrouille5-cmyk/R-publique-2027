import type { GameState } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { compareStrings } from '../core/ledger';
import { newGame, playUntil, QUIET, RULESET } from '../core/testing';
import { aggregateCounts, checkCounts } from '../territory/aggregate';
import { nationalBaseline } from '../territory/baseline';
import { resolveRound } from './rounds';

const NATIONAL = nationalBaseline(RULESET);

const T1 = RULESET.calendrier.scrutins[0]!;
const T2 = RULESET.calendrier.scrutins[1]!;

const national = (r: ReturnType<typeof resolveRound>) => ({
  inscrits: r.inscrits,
  votants: r.votants,
  blancs: r.blancs,
  nuls: r.nuls,
  exprimes: r.exprimes,
  voix: r.voix,
});

describe('dépouillement d’un tour', () => {
  const state = newGame();
  const result = resolveRound(state, RULESET, T1, 1, NATIONAL);

  it('produit des nombres entiers cohérents ; le national est la somme exacte des groupes', () => {
    expect(checkCounts(national(result))).toEqual([]);
    for (const group of result.groups) expect(checkCounts(group)).toEqual([]);
    expect(national(result)).toEqual(aggregateCounts(result.groups));
    expect(result.inscrits).toBe(RULESET.electorat.inscrits.valeur);
    expect(result.abstentions).toBe(result.inscrits - result.votants);
    expect(result.nature).toBe('simule');
    expect(Object.keys(result.voix).sort()).toEqual(Object.keys(state.actors).sort());
  });

  it('qualifie les deux premiers en l’absence de majorité absolue', () => {
    const ranking = Object.entries(result.voix).sort((a, b) => b[1] - a[1]);
    expect(ranking[0]![1] * 2).toBeLessThanOrEqual(result.exprimes);
    expect(result.winner).toBeNull();
    expect(result.qualified).toEqual(ranking.slice(0, 2).map(([id]) => id));
  });

  it('donne une participation plausible (hypothèse de calibrage, cf. MODELE_DONNEES)', () => {
    const participation = result.votants / result.inscrits;
    expect(participation).toBeGreaterThan(0.6);
    expect(participation).toBeLessThan(0.9);
  });

  it('élit dès le premier tour un candidat à la majorité absolue', () => {
    const alone = JSON.parse(JSON.stringify(state)) as GameState;
    for (const actor of Object.values(alone.actors))
      if (actor.id !== 'joueur') actor.status = 'elimine';
    const single = resolveRound(alone, RULESET, T1, 1, NATIONAL);
    expect(single.winner).toBe('joueur');
    expect(single.voix).toEqual({ joueur: single.exprimes });
  });

  it('ne dépend pas de la difficulté et reste déterministe', () => {
    const expert: GameState = { ...state, meta: { ...state.meta, difficulty: 'expert' } };
    expect(resolveRound(expert, RULESET, T1, 1, NATIONAL)).toEqual(result);
    expect(resolveRound(state, RULESET, T1, 1, NATIONAL)).toEqual(result);
  });
});

describe('second tour', () => {
  const { state } = playUntil(
    newGame({}, QUIET),
    (s) => s.meta.phase === 'entre_deux_tours',
    QUIET,
  );
  const t1 = state.elections.t1!;
  const [a, b] = t1.qualified as [string, string];

  it('oppose les deux qualifiés et désigne le premier en voix', () => {
    expect(state.meta.phase).toBe('entre_deux_tours');
    const result = resolveRound(state, RULESET, T2, 2, NATIONAL);
    expect(Object.keys(result.voix).sort()).toEqual([a, b].sort());
    const [first] = Object.entries(result.voix).sort(
      (x, y) => y[1] - x[1] || compareStrings(x[0], y[0]),
    );
    expect(result.winner).toBe(first![0]);
    expect(checkCounts(national(result))).toEqual([]);
  });

  it('une consigne de vote ne transfère qu’une partie des électeurs du candidat éliminé', () => {
    const eliminated = Object.entries(t1.voix)
      .filter(([id]) => !t1.qualified.includes(id))
      .sort((x, y) => y[1] - x[1])[0]!;
    const without = JSON.parse(JSON.stringify(state)) as GameState;
    without.elections.consignes = [];
    without.pendingDecisions = [];
    const withConsigne = JSON.parse(JSON.stringify(without)) as GameState;
    withConsigne.elections.consignes = [
      { fromActorId: eliminated[0], toActorId: a, automatic: true },
    ];

    const base = resolveRound(without, RULESET, T2, 2, NATIONAL);
    const endorsed = resolveRound(withConsigne, RULESET, T2, 2, NATIONAL);
    const gain = endorsed.voix[a]! - base.voix[a]!;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(eliminated[1]);
  });
});
