import { describe, expect, it } from 'vitest';
import { RULESET } from '../core/testing';
import { playerPlan, runScenario, scenarios, summarize, type GameOutcome } from './equilibrage';

// Phase 24 : banc d'essai d'équilibrage — déterminisme, stratégies et agrégats.

const all = scenarios(RULESET);

describe('banc d’essai d’équilibrage (phase 24)', () => {
  it('donne le même résultat pour la même graine', () => {
    const scenario = all['personnalise-standard-ia']!;
    expect(runScenario(scenario, RULESET, 1)).toEqual(runScenario(scenario, RULESET, 1));
  }, 60_000);

  it('passif ne joue rien ; naïf et IA jouent des actions validées par le moteur', () => {
    const state = all['personnalise-standard-ia']!.create('banc-plan', RULESET);
    expect(playerPlan(state, RULESET, 'passif')).toEqual([]);
    expect(playerPlan(state, RULESET, 'naif').map((a) => a.actionId)).toEqual([
      'elus-locaux',
      'elus-locaux',
      'meeting',
      'interview',
    ]);
    expect(playerPlan(state, RULESET, 'ia').length).toBeGreaterThan(0);
  });

  it('joue une partie courte jusqu’au soir du second tour', () => {
    const [outcome] = runScenario(all['observateur-fictifs']!, RULESET, 1);
    expect(outcome!.winner).not.toBeNull();
    expect(outcome!.qualified).toHaveLength(2);
    expect(outcome!.qualified).toContain(outcome!.winner);
    expect(outcome!.playerRank).toBeNull();
  }, 60_000);

  it('agrège victoires, seconds tours, échecs de parrainages, scores et rang médian', () => {
    const outcomes: GameOutcome[] = [
      {
        seed: 'a',
        winner: 'x',
        qualified: ['x', 'y'],
        t1Shares: { x: 0.3, y: 0.2, joueur: 0.1 },
        sansParrainages: ['z'],
        playerRank: 3,
      },
      {
        seed: 'b',
        winner: 'y',
        qualified: ['x', 'y'],
        t1Shares: { x: 0.25, y: 0.3, joueur: 0.2 },
        sansParrainages: [],
        playerRank: 3,
      },
      {
        seed: 'c',
        winner: 'x',
        qualified: ['joueur', 'x'],
        t1Shares: { x: 0.35, y: 0.1, joueur: 0.3 },
        sansParrainages: ['z'],
        playerRank: 2,
      },
    ];
    const summary = summarize(outcomes);
    expect(summary.parties).toBe(3);
    expect(summary.candidats.x!.victoires).toBeCloseTo(2 / 3);
    expect(summary.candidats.joueur!.secondTour).toBeCloseTo(1 / 3);
    expect(summary.candidats.z!.sansParrainages).toBeCloseTo(2 / 3);
    expect(summary.candidats.y!.scoreMoyenT1).toBeCloseTo(0.2);
    expect(summary.rangMedianJoueur).toBe(3);
  });
});
