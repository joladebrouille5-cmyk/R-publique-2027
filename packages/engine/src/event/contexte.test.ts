import {
  EVENT_FAMILIES,
  type GameState,
  type PlannedAction,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, planned, RULESET, sponsorship } from '../core/testing';
import { eventWeights } from './events';

// Événements contextuels (phase 11) : familles, contexte, tirage pondéré sans biais d'ordre,
// fraîcheur. Tous fictifs et étiquetés.

const decisionsOf = (state: GameState) =>
  state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId }));

function week(state: GameState, actions: PlannedAction[], ruleset: Ruleset) {
  return advanceWeek(state, { actions, decisions: decisionsOf(state) }, { ruleset });
}

/** Jeu de règles où seuls les événements listés surviennent, sans délai ni fraîcheur. */
function only(probabilities: Record<string, number>, patch: (r: Ruleset) => void = () => {}) {
  const rules = JSON.parse(JSON.stringify(RULESET)) as Ruleset;
  for (const event of rules.evenements) {
    event.probabiliteHebdomadaire = probabilities[event.id] ?? 0;
    event.delaiMinEntreOccurrences = 0;
  }
  rules.jeu.fraicheurEvenements.facteur = 1;
  patch(rules);
  return rules;
}

const campaignEvents = (report: WeeklyReport) =>
  report.events.filter(
    (e) => e.kind === 'evenement' && RULESET.evenements.some((d) => d.id === e.refId),
  );

/** Campagne jouée : parrainages, puis une action de terrain, de média ou de réseaux par semaine. */
function campaign(seed: string, weeks: number, ruleset: Ruleset = RULESET) {
  let state = newGame({ seed });
  const reports: WeeklyReport[] = [];
  const rotation = ['porte-a-porte', 'meeting', 'interview@france-inter', 'vague-video-courte'];
  for (let w = 0; w < weeks && state.meta.phase === 'campagne'; w++) {
    const actions = [...sponsorship(state), rotation[w % rotation.length]!].map(planned);
    const next = week(state, actions, ruleset);
    reports.push(next.report);
    state = next.state;
  }
  return { state, reports };
}

describe('événements contextuels (phase 11)', () => {
  it('une quarantaine d’événements fictifs, répartis en familles', () => {
    expect(RULESET.evenements.length).toBeGreaterThanOrEqual(40);
    for (const family of EVENT_FAMILIES)
      expect(RULESET.evenements.filter((e) => e.famille === family).length).toBeGreaterThan(5);
    expect(RULESET.evenements.every((e) => e.nature === 'fictif')).toBe(true);
  });

  it('varie d’une semaine à l’autre sur une campagne simulée, de façon déterministe', () => {
    const runs = ['variete-1', 'variete-2'].map((seed) => campaign(seed, 26));
    const events = runs.flatMap((r) => r.reports.flatMap(campaignEvents));
    const weeks = runs.reduce((n, r) => n + r.reports.length, 0);
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.refId, (counts.get(e.refId) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(5);
    const families = new Set(
      events.map((e) => RULESET.evenements.find((d) => d.id === e.refId)!.famille),
    );
    expect(families.size).toBe(EVENT_FAMILIES.length);
    // Rythme : moins d'un événement par semaine en moyenne, mais des semaines bien remplies.
    expect(events.length / weeks).toBeGreaterThan(0.4);
    expect(events.length / weeks).toBeLessThan(1.2);
    for (const r of runs)
      for (const report of r.reports) {
        const week = campaignEvents(report);
        expect(new Set(week.map((e) => e.refId)).size).toBe(week.length);
        expect(week.every((e) => e.nature === 'fictif')).toBe(true);
        // Somme des facteurs = variation, pour chaque ressource modifiée.
        for (const change of report.changes)
          expect(change.factors.reduce((s, f) => s + f.value, 0)).toBe(
            change.after - change.before,
          );
      }
    const again = campaign('variete-1', 26);
    expect(again.reports.flatMap(campaignEvents)).toEqual(runs[0]!.reports.flatMap(campaignEvents));
  });

  it('tire au prorata des probabilités, sans favoriser l’ordre des identifiants', () => {
    // Deux événements de familles différentes, même probabilité, un seul par semaine.
    const rules = only({ 'bus-en-panne': 0.5, 'portrait-presse': 0.5 }, (r) => {
      r.jeu.evenementsMaxParSemaine = 1;
    });
    let bus = 0;
    let portrait = 0;
    for (let i = 0; i < 160; i++) {
      const { report } = week(newGame({ seed: `ordre-${i}` }, rules), [], rules);
      for (const e of report.events) {
        if (e.refId === 'bus-en-panne') bus += 1;
        if (e.refId === 'portrait-presse') portrait += 1;
      }
    }
    // P(au moins un) = 0,75 ; chacun ≈ 0,375 (l'ordre alphabétique donnerait 0,5 contre 0,25).
    expect(bus + portrait).toBeGreaterThan(100);
    expect(bus / (bus + portrait)).toBeGreaterThan(0.38);
    expect(bus / (bus + portrait)).toBeLessThan(0.62);
  });

  it('fraîcheur : une famille vue récemment pèse moins ; jamais deux de la même famille', () => {
    const state = newGame({ seed: 'fraicheur' });
    state.meta.week = 6;
    const weightOf = (s: GameState, id: string) =>
      eventWeights(s, RULESET, PLAYER_ACTOR_ID).find((c) => c.event.id === id)?.weight;
    const fresh = weightOf(state, 'bus-en-panne')!;
    const seen = JSON.parse(JSON.stringify(state)) as GameState;
    seen.eventHistory['intemperies'] = { count: 1, lastWeek: 5 };
    expect(weightOf(seen, 'bus-en-panne')).toBeCloseTo(
      fresh * RULESET.jeu.fraicheurEvenements.facteur,
    );
    // Deux événements certains de la même famille : un seul survient.
    const rules = only({ 'bus-en-panne': 1, intemperies: 1 });
    const { report } = week(newGame({ seed: 'famille' }, rules), [], rules);
    expect(campaignEvents(report)).toHaveLength(1);
  });

  it('contexte : après un meeting, selon le rang, dans les dernières semaines', () => {
    const rules = only({ 'salle-comble': 1 });
    const start = newGame({ seed: 'contexte' }, rules);
    start.actors[PLAYER_ACTOR_ID]!.resources.popularite = 3_000;
    const ids = (r: WeeklyReport) => campaignEvents(r).map((e) => e.refId);
    expect(ids(week(start, [planned('meeting')], rules).report)).toEqual(['salle-comble']);
    expect(ids(week(start, [planned('porte-a-porte')], rules).report)).toEqual([]);

    const ranked = only({ 'favori-cible': 1 });
    const state = week(newGame({ seed: 'rang' }, ranked), [], ranked).state;
    const lead = JSON.parse(JSON.stringify(state)) as GameState;
    const trail = JSON.parse(JSON.stringify(state)) as GameState;
    for (const id of Object.keys(state.opinion!.intentions)) {
      lead.opinion!.intentions[id] = id === PLAYER_ACTOR_ID ? 4_000 : 500;
      trail.opinion!.intentions[id] = id === PLAYER_ACTOR_ID ? 100 : 1_000;
    }
    expect(ids(week(lead, [], ranked).report)).toEqual(['favori-cible']);
    expect(ids(week(trail, [], ranked).report)).toEqual([]);

    const late = only({ 'bataille-procurations': 1 });
    const early = newGame({ seed: 'calendrier' }, late);
    early.actors[PLAYER_ACTOR_ID]!.resources.militants = 500;
    expect(ids(week(early, [], late).report)).toEqual([]);
    const eve = JSON.parse(JSON.stringify(early)) as GameState;
    eve.meta.date = '2027-03-29';
    expect(eve.meta.date < RULESET.calendrier.scrutins[0]!.date).toBe(true);
    expect(ids(week(eve, [], late).report)).toEqual(['bataille-procurations']);
  });

  it('fait divers local : dans un département où le candidat a fait campagne', () => {
    const rules = only({ 'fermeture-usine': 1 });
    // Candidat sans aucun soutien local (ni promesse initiale du parti) : pas de fait divers.
    const start = newGame({ seed: 'local' }, rules);
    Object.assign(start.actors[PLAYER_ACTOR_ID]!.parrainages, {
      promesses: {},
      intentions: {},
      validees: {},
    });
    expect(campaignEvents(week(start, [], rules).report)).toEqual([]);
    const after = week(start, [planned('elus-locaux@80')], rules);
    const [event] = campaignEvents(after.report);
    expect(event?.label).toBe('Fermeture d’usine annoncée — Somme (80)');
    expect(after.state.pendingDecisions.at(-1)?.label).toBe(event!.label);
    expect(event!.label).not.toContain('{');
  });
});
