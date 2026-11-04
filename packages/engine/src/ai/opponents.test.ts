import { DIFFICULTIES, type Actor, type Difficulty } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { validateActions } from '../campaign/actions';
import { advance, newGame, RULESET } from '../core/testing';
import { bestDepartment, planOpponentActions, scoreAction } from './opponents';

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

  it('agit davantage à chaque niveau, de Découverte à Légende', () => {
    const count = (difficulty: Difficulty) =>
      planOpponentActions(newGame({ difficulty }), RULESET).reduce(
        (n, p) => n + p.planned.length,
        0,
      );
    const counts = DIFFICULTIES.map(count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!);
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

describe('implantation des adversaires (phase 25)', () => {
  const departements = RULESET.parrainages.reservoir.departements;
  const terrain = new Set(RULESET.actions.filter((a) => a.cibleFacultative).map((a) => a.id));

  it('vise un département du réservoir, puis un autre une fois celui-ci acquis', () => {
    const state = newGame();
    const first = bestDepartment(state, RULESET, 'adv-rempart');
    expect(first in departements).toBe(true);
    expect(bestDepartment(state, RULESET, 'adv-rempart')).toBe(first);
    state.implantation['adv-rempart']![first] = 100;
    const next = bestDepartment(state, RULESET, 'adv-rempart');
    expect(next).not.toBe(first);
    expect(next in departements).toBe(true);
  });

  it('un candidat de gauche et un candidat de droite nationale ne visent pas les mêmes terres', () => {
    const state = newGame();
    expect(bestDepartment(state, RULESET, 'adv-aurore')).not.toBe(
      bestDepartment(state, RULESET, 'adv-rempart'),
    );
  });

  it('pose ses cartes Terrain sur un département du réservoir', () => {
    let state = newGame({ mode: 'observateur' });
    const placed: string[] = [];
    for (let week = 0; week < 4; week++) {
      for (const plan of planOpponentActions(state, RULESET))
        for (const card of plan.planned)
          if (terrain.has(card.actionId)) {
            expect(card.cible, `${plan.actorId} ${card.actionId}`).toBeDefined();
            expect(card.cible! in departements).toBe(true);
            placed.push(card.cible!);
          }
      state = advance(state).state;
    }
    expect(placed.length).toBeGreaterThan(0);
  });
});
