import {
  GameStateSchema,
  RESOURCE_BOUNDS,
  type GameState,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { createGame, GameCreationError, PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, playToEnd, QUIET, sponsorship, TEST_CANDIDATE } from '../core/testing';
import { activeConsequences, crisisMultiplier } from './consequences';
import { openQuinquennat } from './government';

// Phase 7 : scénarios de départ, crises de saison, conséquences durables et fragilités.

const RULES = QUIET;

/** Copie du jeu de règles : probabilités des crises imposées (les autres à zéro). */
function withCrises(probabilities: Record<string, number>, base: Ruleset = RULES): Ruleset {
  const copy = JSON.parse(JSON.stringify(base)) as Ruleset;
  for (const crisis of copy.crises) crisis.probabiliteHebdomadaire = probabilities[crisis.id] ?? 0;
  return copy;
}

function play(
  start: GameState,
  weeks: number,
  ruleset: Ruleset,
  choose: (kind: string, eventId: string, fallback: string) => string = (_k, _e, f) => f,
) {
  let state = start;
  const reports: WeeklyReport[] = [];
  for (let i = 0; i < weeks && !state.calendar.blockedBy; i++) {
    const result = advanceWeek(
      state,
      {
        actions: [],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: choose(d.kind, d.eventId, d.defaultOptionId),
        })),
      },
      { ruleset },
    );
    reports.push(result.report);
    state = result.state;
  }
  return { state, reports };
}

/** Présidentielle jouée avec un scénario, puis le joueur déclaré élu (quinquennat ouvert). */
function playerPresident(scenarioId: string, ruleset: Ruleset = RULES): GameState {
  const elected = playToEnd(
    newGame({ seed: `p7-${scenarioId}`, scenarioId }, ruleset),
    ruleset,
    (s) => sponsorship(s, ruleset),
  ).state;
  const state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  state.economie = null;
  state.consequences = [];
  openQuinquennat(state, ruleset, PLAYER_ACTOR_ID);
  return state;
}

describe('scénarios de départ', () => {
  it('le scénario de référence ne change rien ; un scénario inconnu est refusé', () => {
    const base = newGame({ seed: 'scenario' }, RULES);
    expect(base.scenario).toBe('standard');
    expect(newGame({ seed: 'scenario', scenarioId: 'standard' }, RULES)).toEqual(base);
    expect(() =>
      createGame(
        {
          seed: 'x',
          mode: 'candidat_personnalise',
          difficulty: 'standard',
          candidate: TEST_CANDIDATE,
          scenarioId: 'inexistant',
        },
        RULES,
      ),
    ).toThrow(GameCreationError);
  });

  it('applique ses écarts aux moyens de départ, compte de campagne compris', () => {
    const scenario = RULES.scenarios.find((s) => s.id === 'outsider')!;
    const base = newGame({ seed: 'outsider' }, RULES);
    const state = newGame({ seed: 'outsider', scenarioId: 'outsider' }, RULES);
    expect(state.scenario).toBe('outsider');
    const before = base.actors[PLAYER_ACTOR_ID]!.resources;
    const after = state.actors[PLAYER_ACTOR_ID]!.resources;
    const clamp = (key: keyof typeof RESOURCE_BOUNDS, value: number) =>
      Math.min(RESOURCE_BOUNDS[key].max, Math.max(RESOURCE_BOUNDS[key].min, value));
    expect(after.budgetCentimes).toBe(
      clamp('budgetCentimes', before.budgetCentimes + scenario.campagne.joueur.budgetCentimes!),
    );
    expect(after.notoriete).toBe(
      clamp('notoriete', before.notoriete + scenario.campagne.joueur.notoriete!),
    );
    expect(after.militants).toBe(before.militants + scenario.campagne.joueur.militants!);
    const recettes = Object.values(state.actors[PLAYER_ACTOR_ID]!.finances.recettes);
    expect(recettes.reduce((a, b) => a + b, 0)).toBe(after.budgetCentimes);
    // Adversaires inchangés dans ce scénario.
    for (const [id, actor] of Object.entries(state.actors))
      if (id !== PLAYER_ACTOR_ID) expect(actor.resources).toEqual(base.actors[id]!.resources);
  });

  it('ouvre le premier quinquennat sur son choc économique et ses fragilités', () => {
    const scenario = RULES.scenarios.find((s) => s.id === 'tempete-economique')!;
    const start = playerPresident('tempete-economique', withCrises({}));
    const [consequence] = activeConsequences(start, start.meta.week + 1);
    expect(consequence).toMatchObject({
      origine: 'scenario',
      ref: 'tempete-economique',
      libelle: scenario.quinquennat.durable!.libelle,
    });
    const { reports } = play(start, 2, withCrises({}));
    const label = 'Scénario fictif « Tempête économique » : situation de départ (effet différé)';
    // Le choc est programmé pour la semaine qui suit l'ouverture du quinquennat.
    const week = reports.find((r) => r.week === start.meta.week + 1)!;
    for (const shock of scenario.quinquennat.economie) {
      const change = week.economie.find((c) => c.indicateur === shock.indicateur)!;
      expect(change.factors).toContainEqual({ label, value: shock.valeur, source: 'differe' });
    }
    // Probabilité de la crise financière : scénario (1,2) × fragilité (2,5).
    const after = play(start, 1, withCrises({})).state;
    expect(crisisMultiplier(after, RULES, 'crise-financiere')).toBeCloseTo(1.2 * 2.5);
    expect(crisisMultiplier(after, RULES, 'crise-inondations')).toBeCloseTo(1.2);
  });
});

describe('crises de saison', () => {
  it('une canicule ne survient qu’en juin, juillet ou août', () => {
    const certain = withCrises({ 'crise-canicule': 1 });
    const { reports } = play(playerPresident('standard'), 70, certain, (kind, _e, fallback) =>
      kind === 'crise' ? fallback : fallback,
    );
    const months = reports
      .filter((r) => r.events.some((e) => e.refId === 'crise-canicule'))
      .map((r) => Number(r.date.slice(5, 7)));
    expect(months.length).toBeGreaterThan(0);
    for (const month of months) expect([6, 7, 8]).toContain(month);
  });
});

describe('conséquences durables', () => {
  const certain = withCrises({ 'crise-cyberattaque': 1 });
  const start = play(playerPresident('standard'), 1, certain).state;
  // Semaine de la crise, puis réponse du joueur : « Minimiser l'incident ».
  const crisis = play(start, 1, certain);
  const answered = play(crisis.state, 1, withCrises({}), (kind, _e, fallback) =>
    kind === 'crise' ? 'minimiser' : fallback,
  );

  it('un choix laisse une fragilité qui rend la même crise plus probable', () => {
    const consequence = answered.state.consequences.find((c) => c.origine === 'decision')!;
    const definition = RULES.crises
      .find((c) => c.id === 'crise-cyberattaque')!
      .choix.find((c) => c.id === 'minimiser')!.durable!;
    expect(consequence).toMatchObject({
      libelle: definition.libelle,
      ref: 'crise-cyberattaque/minimiser',
      debut: crisis.state.meta.week + 1,
      fin: crisis.state.meta.week + definition.semaines,
    });
    const later = play(answered.state, 1, withCrises({})).state;
    expect(crisisMultiplier(later, RULES, 'crise-cyberattaque')).toBe(3);
    expect(GameStateSchema.safeParse(later).error).toBeUndefined();
  });

  it('un effet hebdomadaire passe par les registres jusqu’à sa dernière semaine', () => {
    const rules = withCrises({ 'crise-financiere': 1 });
    const begin = play(playerPresident('standard'), 1, rules).state;
    const { state, reports } = play(begin, 60, withCrises({ 'crise-financiere': 1 }));
    const sequel = state.consequences.find((c) => c.ref === 'crise-financiere')!;
    expect(sequel.fin - sequel.debut + 1).toBe(52);
    const marked = reports.filter((r) =>
      r.economie.some((c) =>
        c.factors.some(
          (f) => f.source === 'durable' && f.label.includes('Séquelles de la tempête financière'),
        ),
      ),
    );
    expect(marked.map((r) => r.week)).toEqual(
      Array.from({ length: 52 }, (_, i) => sequel.debut + i),
    );
    for (const report of reports) {
      for (const change of report.economie)
        expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
          change.after - change.before,
        );
      for (const change of report.changes)
        expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
          change.after - change.before,
        );
    }
  });

  it('est déterministe', () => {
    const again = play(
      play(play(playerPresident('standard'), 1, certain).state, 1, certain).state,
      1,
      withCrises({}),
      (kind, _e, fallback) => (kind === 'crise' ? 'minimiser' : fallback),
    );
    expect(again.state).toEqual(answered.state);
  });
});

describe('événements de campagne', () => {
  it('un scénario agité multiplie la fréquence des événements', () => {
    const rules = JSON.parse(JSON.stringify(RULES)) as Ruleset;
    for (const event of rules.evenements) event.probabiliteHebdomadaire = 0;
    rules.evenements.find((e) => e.id === 'intemperies')!.probabiliteHebdomadaire = 0.2;
    rules.scenarios.find((s) => s.id === 'colere-sociale')!.campagne.evenements = 5;
    const count = (scenarioId: string) =>
      play(newGame({ seed: 'frequence', scenarioId }, rules), 12, rules).reports.filter((r) =>
        r.events.some((e) => e.refId === 'intemperies'),
      ).length;
    // Probabilité 0,2 × 5 = 1, sous réserve du délai de 8 semaines entre deux occurrences.
    expect(count('colere-sociale')).toBe(2);
    expect(count('standard')).toBeLessThan(2);
  });
});
