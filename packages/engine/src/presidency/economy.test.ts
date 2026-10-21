import {
  ECONOMIC_INDICATORS,
  INDICATOR_BOUNDS,
  type GameState,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { proposalsById } from '../campaign/programme';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { EngineInputError } from '../core/errors';
import { newGame, playToEnd, QUIET, sponsorship } from '../core/testing';
import { EconomyBook, openEconomy, scheduleEconomy, shareOfGdp } from './economy';
import { openQuinquennat } from './government';

// Phase 6 (P6-05 et P6-06) : économie sourcée, modèle de jeu, crises fictives.

const RULES = QUIET;

/** Ruleset sans crise (dynamique pure), ou avec une seule crise certaine. */
function withCrises(probabilities: Record<string, number>): Ruleset {
  const copy = JSON.parse(JSON.stringify(RULES)) as Ruleset;
  for (const crisis of copy.crises) crisis.probabiliteHebdomadaire = probabilities[crisis.id] ?? 0;
  return copy;
}
const CALM = withCrises({});

const elected = playToEnd(newGame({ seed: 'economie' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;

function playerElected(programme: string[] = []): GameState {
  const state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.actors[PLAYER_ACTOR_ID]!.programme.propositions = programme;
  state.quinquennat = null;
  state.economie = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  return state;
}

function play(
  start: GameState,
  weeks: number,
  ruleset: Ruleset,
  choose: (kind: string, fallback: string) => string = (_k, f) => f,
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
          optionId: choose(d.kind, d.defaultOptionId),
        })),
      },
      { ruleset },
    );
    reports.push(result.report);
    state = result.state;
  }
  return { state, reports };
}

describe('économie du quinquennat', () => {
  it('part des valeurs de l’Insee du jeu de règles et des conventions déclarées', () => {
    const economy = elected.economie!;
    const real = RULES.economieReelle.indicateurs;
    expect(economy.indicateurs).toMatchObject({
      croissance: real.croissance.valeur,
      inflation: real.inflation.valeur,
      chomage: real.chomage.valeur,
      deficit: real.deficit.valeur,
      dette: real.dette.valeur,
      confiance: real.confiance.valeur,
      pouvoirAchat: RULES.economie.depart.pouvoirAchat,
      tensions: RULES.economie.depart.tensions,
    });
    expect(economy.historique).toHaveLength(1);
    expect(openEconomy(RULES, 0).soldeStructurel).toBe(
      real.deficit.valeur -
        RULES.economie.sensibilites.deficitCroissance *
          (real.croissance.valeur - RULES.economie.cibles.croissancePotentielle),
    );
  });

  it('chaque variation est la somme exacte de ses facteurs ; les indicateurs restent bornés', () => {
    const { state, reports } = play(elected, 200, RULES);
    for (const report of reports)
      for (const change of report.economie) {
        expect(change.factors.reduce((sum, f) => sum + f.value, 0)).toBe(
          change.after - change.before,
        );
        const { min, max } = INDICATOR_BOUNDS[change.indicateur];
        expect(change.after).toBeGreaterThanOrEqual(min);
        expect(change.after).toBeLessThanOrEqual(max);
      }
    for (const indicator of ECONOMIC_INDICATORS) {
      const value = state.economie!.indicateurs[indicator]!;
      expect(value).toBeGreaterThanOrEqual(INDICATOR_BOUNDS[indicator].min);
      expect(value).toBeLessThanOrEqual(INDICATOR_BOUNDS[indicator].max);
    }
    expect(state.economie!.historique.length).toBe(201);
  });

  it('est déterministe : même graine, même trajectoire', () => {
    const a = play(elected, 60, RULES).state.economie;
    const b = play(elected, 60, RULES).state.economie;
    expect(a).toEqual(b);
  });

  it('écrête aux bornes du jeu et journalise l’écrêtement', () => {
    const economy = openEconomy(RULES, 0);
    economy.indicateurs.chomage = INDICATOR_BOUNDS.chomage.max - 10;
    const book = new EconomyBook(economy);
    expect(book.add('chomage', 'Choc de test', 100, 'crise')).toBe(10);
    expect(book.list()[0]!.factors).toEqual([
      { label: 'Choc de test', value: 100, source: 'crise' },
      { label: 'Plafond du jeu atteint', value: -90, source: 'limite' },
    ]);
  });

  it('applique un effet différé à sa semaine, et seulement à elle', () => {
    const start = JSON.parse(JSON.stringify(elected)) as GameState;
    scheduleEconomy(start, 'tensions', 1_234, 3, 'Effet de test');
    const { reports } = play(start, 5, CALM);
    const weeks = reports
      .filter((r) =>
        r.economie.some((c) => c.factors.some((f) => f.label === 'Effet de test (effet différé)')),
      )
      .map((r) => r.week);
    expect(weeks).toEqual([start.meta.week + 3]);
  });

  it('une réforme en vigueur pèse sur le solde structurel et donne une impulsion à la croissance', () => {
    const programme = [
      'eco-simplification-pme',
      'pa-prime-partage-valeur',
      'immi-integration-langue',
    ];
    const { state, reports } = play(playerElected(programme), 160, CALM, (kind, fallback) =>
      kind === 'texte' ? 'negocier' : fallback,
    );
    const applied = state.parlement!.reformes.filter((r) => r.appliquee);
    const proposals = proposalsById(RULES);
    const costly = applied.find((r) => proposals.get(r.propositionId)!.coutMillionsEuros !== 0);
    expect(costly).toBeDefined();
    const proposal = proposals.get(costly!.propositionId)!;
    const report = reports.find((r) => r.week === costly!.vigueurSemaine)!;
    const impulse = report.economie
      .find((c) => c.indicateur === 'croissance')!
      .factors.find((f) => f.label === `Impulsion budgétaire : ${proposal.libelle}`)!;
    const kept = 1 - RULES.parlement.concessions.reductionEffet * costly!.concessions;
    expect(impulse).toMatchObject({ source: 'reforme' });
    expect(impulse.value).toBe(
      Math.round(
        RULES.economie.sensibilites.multiplicateur *
          shareOfGdp(RULES, proposal.coutMillionsEuros) *
          kept,
      ),
    );
  });
});

describe('crises fictives', () => {
  it('une crise impose une décision au président joueur ; ses effets passent par les registres', () => {
    const certain = withCrises({ 'crise-energie': 1 });
    // Semaine de l'investiture : la crise ne peut survenir qu'une fois le mandat commencé.
    const start = play(playerElected(), 1, certain).state;
    expect(start.eventHistory['crise-energie']).toBeUndefined();
    const { state, reports } = play(start, 1, certain);
    const report = reports[0]!;
    const event = report.events.find((e) => e.refId === 'crise-energie')!;
    expect(event).toMatchObject({ nature: 'fictif', majeur: true });
    const decision = state.pendingDecisions.find((d) => d.kind === 'crise')!;
    expect(decision).toMatchObject({ eventId: 'crise-energie', actorId: PLAYER_ACTOR_ID });
    expect(event.decisionId).toBe(decision.id);
    const inflation = report.economie.find((c) => c.indicateur === 'inflation')!;
    expect(inflation.factors).toContainEqual({
      label: "Flambée des prix de l'énergie",
      value: 80,
      source: 'crise',
    });
    const popularity = report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    expect(
      popularity.factors.some((f) => f.label.startsWith("Flambée des prix de l'énergie")),
    ).toBe(true);
    // Décision obligatoire avant de continuer.
    expect(() => advanceWeek(state, { actions: [], decisions: [] }, { ruleset: certain })).toThrow(
      EngineInputError,
    );
    const answered = advanceWeek(
      state,
      { actions: [], decisions: [{ decisionId: decision.id, optionId: 'bouclier' }] },
      { ruleset: withCrises({}) },
    );
    const label = "Flambée des prix de l'énergie — Bouclier tarifaire";
    const deficit = answered.report.economie.find((c) => c.indicateur === 'deficit')!;
    expect(deficit.factors).toContainEqual({ label, value: -30, source: 'decision' });
    expect(answered.report.decisions[0]).toMatchObject({ optionId: 'bouclier', automatic: false });
    expect(answered.state.eventHistory['crise-energie']).toEqual({
      count: 1,
      lastWeek: start.meta.week,
    });
  });

  it('respecte les conditions et le délai entre deux occurrences', () => {
    const certain = withCrises({ 'crise-greve': 1, 'crise-energie': 1 });
    const { state, reports } = play(elected, 40, certain);
    // Grève : il faut des tensions sociales d'au moins 60 points.
    for (const report of reports.filter((r) => r.events.some((e) => e.refId === 'crise-greve'))) {
      const before = report.economie.find((c) => c.indicateur === 'tensions')?.before;
      expect(before === undefined || before >= 6_000).toBe(true);
    }
    const energy = reports.filter((r) => r.events.some((e) => e.refId === 'crise-energie'));
    expect(energy).toHaveLength(1);
    expect(state.eventHistory['crise-energie']!.count).toBe(1);
  });

  it('le président IA répond aussitôt par le choix par défaut, sans décision en attente', () => {
    const certain = withCrises({ 'crise-inondations': 1 });
    const { state, reports } = play(elected, 6, certain);
    expect(state.pendingDecisions).toEqual([]);
    const report = reports.find((r) => r.events.some((e) => e.refId === 'crise-inondations'))!;
    expect(report.events.find((e) => e.refId === 'crise-inondations')!.description).toMatch(
      /Réponse du président \(IA\) : Fonds de reconstruction\.$/,
    );
    const deficit = report.economie.find((c) => c.indicateur === 'deficit')!;
    expect(deficit.factors).toContainEqual({
      label: 'Inondations exceptionnelles — Fonds de reconstruction',
      value: -20,
      source: 'decision',
    });
    // Effet différé du choix : impulsion à la croissance douze semaines plus tard.
    expect(state.economie!.differes.some((d) => d.semaine === report.week + 12)).toBe(true);
  });
});
