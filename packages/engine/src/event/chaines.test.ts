import { candidateName, type GameState, type Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, withEvents } from '../core/testing';
import { rivalOf } from './events';

// Événements en chaîne et coups des adversaires (phase 20) : suites programmées dans l'état,
// selon le choix du joueur ; coups simulés du rival le plus proche, effets par le registre.

type Answer = Record<string, string>;

/** Une semaine, en répondant `answers[eventId]` (à défaut, l'option par défaut). */
function week(state: GameState, ruleset: Ruleset, answers: Answer = {}) {
  return advanceWeek(
    state,
    {
      actions: [],
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: answers[d.eventId] ?? d.defaultOptionId,
      })),
    },
    { ruleset },
  );
}

/** Jeu de règles où seuls `probabilities` surviennent, suites certaines et à délai fixe. */
function chained(probabilities: Record<string, number>, delay = 2) {
  const rules = withEvents(probabilities);
  for (const event of rules.evenements)
    for (const follow of event.suites) {
      follow.probabilite = 1;
      follow.delaiSemaines = { min: delay, max: delay };
    }
  return rules;
}

/** Joue jusqu'à ce que `refId` survienne (au plus `max` semaines) ; rend l'état et l'événement. */
function until(state: GameState, ruleset: Ruleset, refId: string, answers: Answer = {}, max = 8) {
  let current = state;
  for (let i = 0; i < max; i++) {
    const next = week(current, ruleset, answers);
    current = next.state;
    const event = next.report.events.find((e) => e.refId === refId);
    if (event) return { state: current, event, report: next.report };
  }
  throw new Error(`${refId} n'est pas survenu en ${max} semaines`);
}

describe('événements en chaîne (phase 20)', () => {
  it('programme la suite propre à l’option choisie, puis la déclenche à l’échéance', () => {
    const rules = chained({ 'rumeur-financement': 1 });
    const fired = until(newGame({ seed: 'chaine-1' }), rules, 'rumeur-financement');
    expect(fired.state.pendingDecisions.map((d) => d.eventId)).toContain('rumeur-financement');
    // Démentir sans détailler : la rumeur repart deux semaines plus tard.
    const answered = week(fired.state, rules, { 'rumeur-financement': 'dementir' }).state;
    expect(answered.suites).toEqual([
      expect.objectContaining({
        evenement: 'rumeur-relancee',
        dueWeek: fired.state.meta.week + 2,
        origine: 'Rumeur sur le financement de votre campagne',
      }),
    ]);
    const follow = until(answered, rules, 'rumeur-relancee');
    expect(follow.event).toMatchObject({
      suiteDe: 'Rumeur sur le financement de votre campagne',
      majeur: true,
      nature: 'fictif',
    });
    // Décision tranchée la semaine suivante ; la suite survient deux semaines après.
    expect(follow.state.meta.week).toBe(fired.state.meta.week + 3);
    expect(follow.state.suites).toEqual([]);
    // L'effet passe par le registre, avec l'événement pour facteur.
    const change = follow.report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    expect(change.factors.some((f) => f.label.startsWith('La rumeur de financement repart'))).toBe(
      true,
    );
  });

  it('mène l’autre option à une autre suite, et jamais à la première', () => {
    const rules = chained({ 'rumeur-financement': 1 });
    const fired = until(newGame({ seed: 'chaine-1' }), rules, 'rumeur-financement');
    const answered = week(fired.state, rules, { 'rumeur-financement': 'transparence' }).state;
    expect(answered.suites.map((s) => s.evenement)).toEqual(['comptes-salues']);
    const follow = until(answered, rules, 'comptes-salues');
    expect(follow.report.events.some((e) => e.refId === 'rumeur-relancee')).toBe(false);
  });

  it('ne tire jamais au hasard un événement de suite', () => {
    // Même certaine, la probabilité d'une suite ne la fait pas survenir seule.
    const rules = withEvents({ 'rumeur-relancee': 1, 'comptes-salues': 1 });
    let state = newGame({ seed: 'chaine-2' });
    for (let i = 0; i < 6; i++) {
      const next = week(state, rules);
      expect(
        next.report.events.filter((e) => ['rumeur-relancee', 'comptes-salues'].includes(e.refId)),
      ).toEqual([]);
      state = next.state;
    }
  });

  it('reporte d’une semaine une suite à décision quand une décision est déjà ouverte', () => {
    const rules = withEvents({});
    const start = newGame({ seed: 'chaine-3' });
    const state: GameState = {
      ...start,
      suites: [
        { id: 's-a', evenement: 'cyberattaque-fuite', dueWeek: 0, origine: 'Site piraté' },
        { id: 's-b', evenement: 'soutien-debauche', dueWeek: 0, origine: 'Départ annoncé' },
      ],
    };
    const first = week(state, rules);
    const events = first.report.events.filter((e) => e.kind === 'evenement');
    expect(events.map((e) => e.refId)).toEqual(['cyberattaque-fuite']);
    expect(first.state.suites).toEqual([
      expect.objectContaining({ id: 's-b', dueWeek: start.meta.week + 1 }),
    ]);
    const second = week(first.state, rules);
    expect(second.report.events.map((e) => e.refId)).toContain('soutien-debauche');
    expect(second.state.suites).toEqual([]);
  });

  it('programme une suite sans choix dès que l’événement survient, de façon déterministe', () => {
    const rules = chained({ 'portrait-presse': 1 }, 1);
    rules.evenements.find((e) => e.id === 'portrait-presse')!.suites = [
      {
        evenement: 'grand-oral-viral',
        choix: null,
        probabilite: 1,
        delaiSemaines: { min: 1, max: 1 },
      },
    ];
    const run = () => {
      const fired = until(newGame({ seed: 'chaine-4' }), rules, 'portrait-presse');
      return { fired, follow: until(fired.state, rules, 'grand-oral-viral') };
    };
    const { fired, follow } = run();
    expect(follow.state.meta.week).toBe(fired.state.meta.week + 1);
    expect(follow.event.suiteDe).toBe('Portrait dans la presse régionale');
    expect(run().follow.state).toEqual(follow.state);
  });

  it('abandonne les suites d’un joueur qui n’est plus en lice', () => {
    const start = newGame({ seed: 'chaine-5' });
    const state: GameState = {
      ...start,
      actors: {
        ...start.actors,
        [PLAYER_ACTOR_ID]: { ...start.actors[PLAYER_ACTOR_ID]!, status: 'retire' },
      },
      suites: [{ id: 's-a', evenement: 'comptes-salues', dueWeek: 3, origine: 'Rumeur' }],
    };
    expect(week(state, withEvents({})).state.suites).toEqual([]);
  });
});

describe('coups des adversaires (phase 20)', () => {
  it('nomme le rival le plus proche et lui applique ses effets par le registre', () => {
    const rules = withEvents({ 'diner-levee-fonds': 1 });
    const start = newGame({ seed: 'coup-1' });
    const fired = until(start, rules, 'diner-levee-fonds');
    const rival = fired.event.adversaire!;
    expect(rival).toBeDefined();
    expect(rival).not.toBe(PLAYER_ACTOR_ID);
    const name = candidateName(fired.state.actors[rival]!.candidate);
    expect(fired.event.label).toBe(`Grand dîner de levée de fonds pour ${name}`);
    expect(fired.event.description).toMatch(/Coup simulé par le jeu : aucun propos/);
    // Le rival encaisse les fonds, le joueur mobilise ses militants : deux lignes du registre.
    const gain = fired.report.changes.find(
      (c) => c.actorId === rival && c.ressource === 'budgetCentimes',
    )!;
    expect(gain.factors.some((f) => f.label.startsWith(fired.event.label) && f.value > 0)).toBe(
      true,
    );
    const militants = fired.report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'militants',
    )!;
    expect(militants.factors.some((f) => f.label.startsWith(fired.event.label))).toBe(true);
  });

  it('choisit le rival le plus proche dans les intentions, à défaut le plus connu', () => {
    const start = newGame({ seed: 'coup-2' });
    const opponents = Object.values(start.actors).filter((a) => a.id !== PLAYER_ACTOR_ID);
    const known = [...opponents].sort(
      (a, b) => b.resources.notoriete - a.resources.notoriete || a.id.localeCompare(b.id),
    )[0]!;
    expect(rivalOf({ ...start, opinion: null } as GameState, PLAYER_ACTOR_ID)).toBe(known.id);
    const [a, b] = opponents;
    const intentions = Object.fromEntries(opponents.map((o) => [o.id, 0.01]));
    const withPolls = {
      ...start,
      opinion: {
        ...start.opinion!,
        intentions: { ...intentions, [PLAYER_ACTOR_ID]: 0.12, [a!.id]: 0.3, [b!.id]: 0.13 },
      },
    } as GameState;
    expect(rivalOf(withPolls, PLAYER_ACTOR_ID)).toBe(b!.id);
  });

  it('ne survient pas sans rival en lice', () => {
    const start = newGame({ seed: 'coup-3' });
    const actors = Object.fromEntries(
      Object.entries(start.actors).map(([id, actor]) => [
        id,
        id === PLAYER_ACTOR_ID ? actor : { ...actor, status: 'retire' as const },
      ]),
    );
    const rules = withEvents({ 'diner-levee-fonds': 1, 'tractage-adverse': 1 });
    const next = week({ ...start, actors }, rules);
    expect(next.report.events.filter((e) => e.adversaire)).toEqual([]);
  });
});
