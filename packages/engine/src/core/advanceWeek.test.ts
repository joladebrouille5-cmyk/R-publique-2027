import type { Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { WEEKLY_STEPS } from './advanceWeek';
import { PLAYER_ACTOR_ID } from './createGame';
import { EngineInputError } from './errors';
import {
  advance,
  deepFreeze,
  newGame,
  playerChange,
  playerResources,
  QUIET,
  RULESET,
  withEvents,
  withResources,
} from './testing';

const own = (result: ReturnType<typeof advance>) =>
  result.report.actions.filter((a) => a.actorId === PLAYER_ACTOR_ID);

describe('cycle hebdomadaire', () => {
  it('avance d’une semaine exactement', () => {
    const result = advance(newGame());
    expect(result.state.meta.week).toBe(1);
    expect(result.state.meta.date).toBe('2026-10-05');
    expect(result.report).toMatchObject({
      week: 0,
      date: '2026-09-28',
      nextWeek: 1,
      nextDate: '2026-10-05',
    });
  });

  it('exécute les 12 étapes dans l’ordre et déclare les étapes sans moteur', () => {
    const { steps } = advance(newGame()).report;
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(steps.map((s) => s.label)).toEqual(WEEKLY_STEPS.map((s) => s.label));
    expect(steps.filter((s) => !s.active).map((s) => s.step)).toEqual([4, 7]);
    for (const step of steps.filter((s) => !s.active)) expect(step.summary).toMatch(/phase \d/);
  });

  it('ne modifie jamais l’état reçu', () => {
    const state = deepFreeze(newGame());
    expect(() => advance(state, ['meeting', 'collecte'])).not.toThrow();
  });
});

describe('actions et ressources', () => {
  it('débite exactement le coût des actions retenues', () => {
    const state = newGame();
    const result = advance(state, ['meeting', 'interview']);
    const meeting = RULESET.actions.find((a) => a.id === 'meeting')!;
    expect(own(result).map((a) => a.status)).toEqual(['validee', 'validee']);
    expect(playerResources(result.state).budgetCentimes).toBe(
      playerResources(state).budgetCentimes - meeting.cout.budgetCentimes,
    );
    const time = playerChange(result.report, 'tempsHeures')!;
    expect(time.factors.filter((f) => f.source === 'action').map((f) => f.value)).toEqual([-8, -3]);
  });

  it('rejette une action trop chère, avec son motif, sans rien débiter', () => {
    const result = advance(withResources(newGame(), { budgetCentimes: 1000 }), ['meeting']);
    expect(own(result)[0]).toMatchObject({
      status: 'rejetee',
      reason: expect.stringMatching(/^Budget insuffisant/),
    });
    expect(playerResources(result.state).budgetCentimes).toBe(1000);
  });

  it('rejette les actions qui dépassent le temps de la semaine', () => {
    const result = advance(newGame(), ['tournee', 'tournee', 'tournee']);
    expect(own(result).map((a) => a.status)).toEqual(['validee', 'validee', 'rejetee']);
    expect(own(result)[2]!.reason).toMatch(/^Temps insuffisant/);
  });

  it('vérifie les prérequis et rejette les actions inconnues', () => {
    const result = advance(withResources(newGame(), { militants: 10 }), ['meeting', 'inexistante']);
    expect(own(result).map((a) => a.reason)).toEqual([
      'Il faut au moins 50 militants (vous en avez 10).',
      'Action inconnue dans ce jeu de règles.',
    ]);
  });

  it('refuse les actions en mode observateur et au-delà du plafond hebdomadaire', () => {
    expect(() => advance(newGame({ mode: 'observateur' }), ['meeting'])).toThrow(EngineInputError);
    const tooMany = Array.from({ length: RULESET.jeu.actionsMaxParSemaine + 1 }, () => 'interview');
    expect(() => advance(newGame(), tooMany)).toThrow(/Au plus/);
  });

  it('programme les effets différés et les applique à l’entrée de la semaine prévue', () => {
    const delayed = JSON.parse(JSON.stringify(QUIET)) as Ruleset;
    delayed.actions.find((a) => a.id === 'numerique')!.effets[0]!.delaiSemaines = 2;
    const first = advance(newGame({}, delayed), ['numerique'], [], delayed);
    const mine = first.state.scheduled.filter(
      (e) => e.actorId === PLAYER_ACTOR_ID && e.origin.label === 'Campagne numérique ciblée',
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ dueWeek: 2, ressource: 'notoriete' });
    expect(
      playerChange(first.report, 'notoriete')!.factors.some((f) => f.source === 'differe'),
    ).toBe(false);

    const second = advance(first.state, [], [], delayed);
    expect(second.state.scheduled.filter((e) => e.id === mine[0]!.id)).toHaveLength(0);
    const deferred = playerChange(second.report, 'notoriete')!.factors.filter(
      (f) => f.source === 'differe',
    );
    expect(
      deferred.some((f) =>
        /Campagne numérique ciblée \(effet différé de la semaine 0\)/.test(f.label),
      ),
    ).toBe(true);
  });

  it('remet le temps disponible à la capacité hebdomadaire', () => {
    const result = advance(newGame(), ['tournee']);
    expect(playerResources(result.state).tempsHeures).toBe(RULESET.jeu.tempsHebdomadaireHeures);
  });
});

describe('comptabilité des facteurs', () => {
  it('chaque variation est la somme exacte de ses facteurs, pour toutes les campagnes', () => {
    const result = advance(newGame(), ['meeting', 'collecte', 'recrutement', 'porte-a-porte']);
    expect(result.report.changes.length).toBeGreaterThan(0);
    for (const c of result.report.changes) {
      expect(c.before + c.factors.reduce((sum, f) => sum + f.value, 0)).toBe(c.after);
      expect(result.state.actors[c.actorId]!.resources[c.ressource]).toBe(c.after);
    }
  });

  it('journalise l’écrêtement aux bornes comme un facteur', () => {
    const state = withResources(newGame(), { budgetCentimes: 100, notoriete: 10_000 });
    const notoriete = playerChange(advance(state, ['interview']).report, 'notoriete')!;
    expect(notoriete.after).toBeLessThanOrEqual(10_000);
    expect(notoriete.before + notoriete.factors.reduce((s, f) => s + f.value, 0)).toBe(
      notoriete.after,
    );
  });
});

describe('événements et décisions', () => {
  it('déclenche un événement fictif et exige une décision avant la semaine suivante', () => {
    const rules = withEvents({ 'polemique-reseaux': 1 });
    const first = advance(newGame({ difficulty: 'accessible' }, rules), [], [], rules);
    expect(first.report.events.filter((e) => e.kind === 'evenement')).toMatchObject([
      { refId: 'polemique-reseaux', nature: 'fictif', majeur: false },
    ]);
    const [decision] = first.state.pendingDecisions;
    expect(decision).toMatchObject({
      kind: 'evenement',
      eventId: 'polemique-reseaux',
      defaultOptionId: 'ignorer',
    });

    expect(() => advance(first.state, [], [], rules)).toThrow(/Décision à prendre/);
    expect(() =>
      advance(first.state, [], [{ decisionId: decision!.id, optionId: 'inconnue' }], rules),
    ).toThrow(EngineInputError);
    const second = advance(
      first.state,
      [],
      [{ decisionId: decision!.id, optionId: 'excuses' }],
      rules,
    );
    expect(second.report.decisions).toMatchObject([{ optionId: 'excuses', automatic: false }]);
    expect(second.state.pendingDecisions.filter((d) => d.id === decision!.id)).toHaveLength(0);
    expect(
      playerChange(second.report, 'militants')!.factors.some((f) => f.source === 'decision'),
    ).toBe(true);
  });

  it('respecte le délai minimal entre deux occurrences', () => {
    const rules = withEvents({ 'portrait-presse': 1 });
    let state = newGame({}, rules);
    const weeks: number[] = [];
    for (let i = 0; i < 9; i++) {
      const result = advance(state, [], [], rules);
      if (result.report.events.some((e) => e.refId === 'portrait-presse'))
        weeks.push(result.report.week);
      state = result.state;
    }
    expect(weeks).toEqual([0, 4, 8]);
  });

  it('signale un événement majeur (sauvegarde préalable côté serveur)', () => {
    const rules = withEvents({ 'crise-equipe': 1 });
    expect(advance(newGame({}, rules), [], [], rules).majorEvent).toBe(true);
    expect(advance(newGame(), [], [], QUIET).majorEvent).toBe(false);
  });

  it('limite le nombre d’événements et de décisions par semaine', () => {
    const all = withEvents(Object.fromEntries(RULESET.evenements.map((e) => [e.id, 1])));
    const result = advance(newGame({ difficulty: 'accessible' }, all), [], [], all);
    expect(result.report.events.filter((e) => e.nature === 'fictif').length).toBeLessThanOrEqual(
      all.jeu.evenementsMaxParSemaine,
    );
    expect(result.state.pendingDecisions.length).toBeLessThanOrEqual(1);
  });

  it('applique un effet différé d’événement sur le temps de la semaine suivante', () => {
    const rules = withEvents({ 'greve-transports': 1 });
    const result = advance(newGame({}, rules), [], [], rules);
    expect(playerResources(result.state).tempsHeures).toBe(
      RULESET.jeu.tempsHebdomadaireHeures - 10,
    );
  });

  it('retient l’option par défaut en mode observateur', () => {
    const state = newGame({ mode: 'observateur' });
    state.pendingDecisions.push({
      id: 'd-0-polemique-reseaux',
      kind: 'evenement',
      eventId: 'polemique-reseaux',
      actorId: 'absent',
      createdWeek: 0,
      label: 'Polémique',
      description: 'Test',
      options: [{ id: 'ignorer', libelle: 'Laisser passer', description: 'x' }],
      defaultOptionId: 'ignorer',
    });
    expect(advance(state).report.decisions).toMatchObject([
      { optionId: 'ignorer', automatic: true },
    ]);
  });
});
