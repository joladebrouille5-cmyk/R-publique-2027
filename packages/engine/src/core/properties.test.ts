import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { RESOURCE_BOUNDS, type Difficulty, type GameState, type WeeklyReport } from '@r2027/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from './advanceWeek';
import { createGame } from './createGame';
import { planned } from './testing';

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const ACTION_IDS = [
  ...ruleset.actions.map((a) =>
    a.cible === 'departement'
      ? `${a.id}@01`
      : a.cible === 'media'
        ? `${a.id}@le-monde`
        : a.cible === 'emission'
          ? `${a.id}@emi-c-politique`
          : a.id,
  ),
  'action-inconnue',
];
// Chaque propriété simule des centaines de semaines : délai adapté à la taille du moteur.
const HEAVY = { timeout: 60_000 };

const seedArb = fc.stringMatching(/^[a-z0-9-]{1,16}$/);
const difficultyArb = fc.constantFrom<Difficulty>('accessible', 'standard', 'expert');
const weekPlanArb = fc.record({
  actions: fc.array(fc.constantFrom(...ACTION_IDS), { maxLength: 6 }),
  choice: fc.nat({ max: 5 }),
});
const planArb = fc.array(weekPlanArb, { minLength: 1, maxLength: 12 });

type Plan = { actions: string[]; choice: number }[];

/** Joue une partie ; `roundTrip` simule une sauvegarde puis une reprise à chaque semaine. */
function play(seed: string, difficulty: Difficulty, plan: Plan, roundTrip = false) {
  let state: GameState = createGame(
    {
      seed,
      mode: 'candidat_personnalise',
      difficulty,
      candidate: { nom: 'Propriété', parti: 'Parti', positionnement: { economie: 0, societe: 0 } },
    },
    ruleset,
  );
  const reports: WeeklyReport[] = [];
  const states: GameState[] = [state];
  for (const week of plan) {
    if (state.calendar.blockedBy) break;
    const decisions = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.options[week.choice % d.options.length]!.id,
    }));
    const actions = week.actions.map(planned);
    const result = advanceWeek(state, { actions, decisions }, { ruleset });
    state = roundTrip ? (JSON.parse(JSON.stringify(result.state)) as GameState) : result.state;
    reports.push(result.report);
    states.push(state);
  }
  return { state, reports, states };
}

describe('propriétés du moteur (fast-check)', () => {
  it('déterminisme : même graine et mêmes actions ⇒ même partie', HEAVY, () => {
    fc.assert(
      fc.property(seedArb, difficultyArb, planArb, (seed, difficulty, plan) => {
        expect(play(seed, difficulty, plan)).toEqual(play(seed, difficulty, plan));
      }),
      { numRuns: 60 },
    );
  });

  it('une sauvegarde puis une reprise à chaque semaine ne change rien', HEAVY, () => {
    fc.assert(
      fc.property(seedArb, difficultyArb, planArb, (seed, difficulty, plan) => {
        expect(play(seed, difficulty, plan, true).state).toEqual(
          play(seed, difficulty, plan).state,
        );
      }),
      { numRuns: 40 },
    );
  });

  it('comptabilité exacte, ressources bornées et bilan cohérent avec l’état', HEAVY, () => {
    fc.assert(
      fc.property(seedArb, difficultyArb, planArb, (seed, difficulty, plan) => {
        const { reports, states } = play(seed, difficulty, plan);
        reports.forEach((report, i) => {
          const before = states[i]!;
          const after = states[i + 1]!;
          expect(after.meta.week).toBe(before.meta.week + 1);
          for (const change of report.changes) {
            const sum = change.factors.reduce((total, factor) => total + factor.value, 0);
            expect(change.before + sum).toBe(change.after);
            expect(before.actors[change.actorId]!.resources[change.ressource]).toBe(change.before);
            expect(after.actors[change.actorId]!.resources[change.ressource]).toBe(change.after);
          }
          for (const actor of Object.values(after.actors)) {
            for (const [key, value] of Object.entries(actor.resources)) {
              const { min, max } = RESOURCE_BOUNDS[key as keyof typeof RESOURCE_BOUNDS];
              expect(Number.isInteger(value) && value >= min && value <= max).toBe(true);
            }
          }
          // Les ressources non mentionnées dans le bilan n'ont pas bougé.
          for (const [actorId, actor] of Object.entries(after.actors)) {
            for (const [key, value] of Object.entries(actor.resources)) {
              const reported = report.changes.some(
                (c) => c.actorId === actorId && c.ressource === key,
              );
              if (!reported) {
                expect(before.actors[actorId]!.resources[key as keyof typeof actor.resources]).toBe(
                  value,
                );
              }
            }
          }
        });
      }),
      { numRuns: 60 },
    );
  });

  it(
    'une action rejetée ne coûte rien et une action retenue coûte exactement son prix',
    HEAVY,
    () => {
      fc.assert(
        fc.property(seedArb, difficultyArb, weekPlanArb, (seed, difficulty, week) => {
          const { reports } = play(seed, difficulty, [week]);
          const report = reports[0]!;
          const budget = report.changes.find(
            (c) => c.actorId === 'joueur' && c.ressource === 'budgetCentimes',
          );
          const costFactors = (budget?.factors ?? []).filter(
            (f) => f.source === 'action' && f.step === 2,
          );
          const expected = report.actions
            .filter((a) => a.actorId === 'joueur' && a.status === 'validee')
            .map((a) => -a.cost.budgetCentimes)
            .filter((v) => v !== 0);
          expect(costFactors.map((f) => f.value)).toEqual(expected);
        }),
        { numRuns: 80 },
      );
    },
  );
});
