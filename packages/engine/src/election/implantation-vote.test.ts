import { type GameState, type Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, RULESET } from '../core/testing';
import { communeResults } from '../territory/communes';
import { demoBaseline, nationalBaseline } from '../territory/baseline';
import { distribute } from './distribution';
import { implantationFactor, localMultiplier, projectDepartments } from './implantation';
import { resolveRound } from './rounds';

// Implantation et vote (phase 25, hypothèses) : facteur national « Implantation », multiplicateur
// local au dépouillement, projection des intentions par département.

const ruleset = RULESET;
const codes = Object.keys(ruleset.parrainages.reservoir.departements).sort();
const fill = (value: number) => Object.fromEntries(codes.map((c) => [c, value]));
const scrutin = ruleset.calendrier.scrutins[0]!;

const BASE = demoBaseline(
  ruleset,
  [
    { code: '2A004', departement: '2A', region: '94', population: 75_000 },
    { code: '2A006', departement: '2A', region: '94', population: 3_000 },
    { code: '80021', departement: '80', region: '32', population: 133_000 },
    { code: '80001', departement: '80', region: '32', population: 600 },
  ],
  [
    { code: '75', region: '11', population: 2_100_000 },
    { code: '13', region: '93', population: 2_000_000 },
    { code: '48', region: '76', population: 76_000 },
    { code: '23', region: '75', population: 115_000 },
    { code: '59', region: '32', population: 2_600_000 },
    { code: '974', region: '04', population: 880_000 },
  ],
);

const share = (counts: { voix: Record<string, number>; exprimes: number }, id: string) =>
  counts.voix[id]! / counts.exprimes;

describe('facteur « Implantation »', () => {
  it('est nul à l’implantation pivot, négatif en terre inconnue, positif en fief', () => {
    const state = newGame();
    state.implantation[PLAYER_ACTOR_ID] = fill(15);
    const neutral = implantationFactor(state, ruleset, PLAYER_ACTOR_ID);
    expect(neutral.map((f) => f.label)).toEqual(['Implantation']);
    expect(neutral[0]!.value).toBeCloseTo(0, 12);
    state.implantation[PLAYER_ACTOR_ID] = fill(0);
    expect(implantationFactor(state, ruleset, PLAYER_ACTOR_ID)[0]!.value).toBeCloseTo(-0.075, 10);
    state.implantation[PLAYER_ACTOR_ID] = fill(100);
    expect(implantationFactor(state, ruleset, PLAYER_ACTOR_ID)[0]!.value).toBeCloseTo(0.425, 10);
  });

  it('figure dans la décomposition des intentions (« Pourquoi ça bouge ? »)', () => {
    const { state } = advanceWeek(newGame(), { actions: [], decisions: [] }, { ruleset });
    const labels = state.opinion!.breakdown[PLAYER_ACTOR_ID]!.map((f) => f.label);
    expect(labels).toContain('Implantation');
  });
});

describe('multiplicateur local', () => {
  it('vaut 1 à la moyenne du candidat, monte où il est implanté, baisse ailleurs', () => {
    expect(localMultiplier(40, 40, 0.6)).toBeCloseTo(1, 12);
    expect(localMultiplier(100, 0, 0.6)).toBeCloseTo(1.6, 12);
    expect(localMultiplier(0, 100, 0.6)).toBeCloseTo(1 / 1.6, 12);
    expect(localMultiplier(80, 20, 0)).toBe(1);
  });
});

describe('dépouillement territorial', () => {
  const flat = (rules: Ruleset): Ruleset => ({
    ...rules,
    implantation: { ...rules.implantation, alpha: 0 },
  });

  it('un candidat implanté gagne dans son département', () => {
    const state = anchored();
    const local = resolveRound(state, ruleset, scrutin, 1, BASE);
    const without = resolveRound(state, flat(ruleset), scrutin, 1, BASE);
    const dep = (r: typeof local) => r.territoire!.departements['80']!;
    expect(share(dep(local), PLAYER_ACTOR_ID)).toBeGreaterThan(
      share(dep(without), PLAYER_ACTOR_ID) * 1.2,
    );
    expect(share(local.territoire!.departements['75']!, PLAYER_ACTOR_ID)).toBeLessThan(
      share(without.territoire!.departements['75']!, PLAYER_ACTOR_ID),
    );
  });

  it('garde les voix nationales à ± 0,5 point du modèle sans multiplicateur', () => {
    const state = anchored();
    const local = resolveRound(state, ruleset, scrutin, 1, BASE);
    const without = resolveRound(state, flat(ruleset), scrutin, 1, BASE);
    for (const id of local.territoire!.candidats)
      expect(
        Math.abs(local.voix[id]! / local.exprimes - without.voix[id]! / without.exprimes),
        id,
      ).toBeLessThan(0.005);
  });

  it('recalcule le détail communal à l’identique (somme exacte du département)', () => {
    const local = resolveRound(anchored(), ruleset, scrutin, 1, BASE);
    const communes = communeResults(local, BASE, ruleset, '80');
    const total = [...communes.values()].reduce((s, c) => s + c.voix[PLAYER_ACTOR_ID]!, 0);
    expect(total).toBe(local.territoire!.departements['80']!.voix[PLAYER_ACTOR_ID]);
  });

  it('sans base territoriale, le dépouillement national reste celui du modèle', () => {
    const state = anchored();
    const national = nationalBaseline(ruleset);
    expect(resolveRound(state, ruleset, scrutin, 1, national).voix).toEqual(
      resolveRound(state, flat(ruleset), scrutin, 1, national).voix,
    );
  });
});

describe('projection par département', () => {
  it('donne 10 000 par département de la base, de façon déterministe', () => {
    const state = anchored();
    const distributions = distribute(state, ruleset, 1, 'opinion');
    const projection = projectDepartments(state, ruleset, distributions, BASE);
    expect(Object.keys(projection).sort()).toEqual(
      ['13', '23', '2A', '48', '59', '75', '80', '974'].sort(),
    );
    for (const [code, values] of Object.entries(projection))
      expect(
        Object.values(values).reduce((a, b) => a + b, 0),
        code,
      ).toBe(10_000);
    expect(projection['80']![PLAYER_ACTOR_ID]!).toBeGreaterThan(
      projection['75']![PLAYER_ACTOR_ID]!,
    );
    expect(projectDepartments(state, ruleset, distributions, BASE)).toEqual(projection);
  });

  it('est vide avec la base nationale', () => {
    const state = newGame();
    const distributions = distribute(state, ruleset, 1, 'opinion');
    expect(projectDepartments(state, ruleset, distributions, nationalBaseline(ruleset))).toEqual(
      {},
    );
  });

  it('remplit opinion.departements chaque semaine de campagne avec une base territoriale', () => {
    const { state } = advanceWeek(
      anchored(),
      { actions: [], decisions: [] },
      { ruleset, territory: BASE },
    );
    expect(Object.keys(state.opinion!.departements)).toContain('80');
    const national = advanceWeek(anchored(), { actions: [], decisions: [] }, { ruleset }).state;
    expect(national.opinion!.departements).toEqual({});
  });
});

/** Partie au premier tour : le joueur est implanté dans la Somme (80), à 0 ailleurs. */
function anchored(): GameState {
  const state = newGame();
  state.implantation[PLAYER_ACTOR_ID]!['80'] = 100;
  return state;
}
