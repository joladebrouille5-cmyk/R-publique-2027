import type { Actor } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { validateActions } from '../campaign/actions';
import { advance, newGame, RULESET } from '../core/testing';
import { planOpponentActions, scoreAction } from './opponents';

describe('IA adverse', () => {
  it('chaque adversaire choisit, dans le même catalogue, des actions qu’il peut payer', () => {
    const state = newGame();
    const plans = planOpponentActions(state, RULESET);
    expect(plans.map((p) => p.actorId)).toEqual(RULESET.candidatsFictifs.map((c) => c.id).sort());
    for (const plan of plans) {
      expect(plan.planned.length).toBeGreaterThan(0);
      expect(plan.planned.length).toBeLessThanOrEqual(RULESET.ia.standard.actionsParSemaine);
      const { outcomes } = validateActions(state, plan.actorId, plan.planned, RULESET);
      expect(outcomes.every((o) => o.status === 'validee')).toBe(true);
    }
  });

  it('agit davantage au niveau expert qu’au niveau accessible', () => {
    const count = (difficulty: 'accessible' | 'expert') =>
      planOpponentActions(newGame({ difficulty }), RULESET).reduce(
        (n, p) => n + p.planned.length,
        0,
      );
    expect(count('expert')).toBeGreaterThan(count('accessible'));
  });

  it('un adversaire prudent évite davantage les actions risquées qu’un adversaire offensif', () => {
    const risky = RULESET.actions.find((a) => a.risque)!;
    const actor = newGame().actors['adv-boussole']!;
    const as = (style: Actor['style']): Actor => ({ ...actor, style, toleranceRisque: 0.3 });
    const budget = actor.resources.budgetCentimes;
    expect(scoreAction(as('prudent'), risky, budget)).toBeLessThan(
      scoreAction(as('offensif'), risky, budget),
    );
  });

  it('les adversaires agissent sans intervention du joueur, y compris en mode observateur', () => {
    const state = newGame({ mode: 'observateur' });
    const { report, state: next } = advance(state);
    const actors = new Set(report.actions.map((a) => a.actorId));
    expect(actors.size).toBe(RULESET.candidatsFictifs.length);
    const spent = report.changes.filter(
      (c) => c.ressource === 'budgetCentimes' && c.factors.some((f) => f.source === 'action'),
    );
    expect(spent.length).toBeGreaterThan(0);
    for (const change of spent)
      expect(next.actors[change.actorId]!.resources.budgetCentimes).toBe(change.after);
  });

  it('est déterministe', () => {
    const state = newGame();
    expect(planOpponentActions(state, RULESET)).toEqual(planOpponentActions(state, RULESET));
  });
});
