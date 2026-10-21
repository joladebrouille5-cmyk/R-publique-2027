import {
  daysFromCivil,
  GameStateSchema,
  isoWeekday,
  parseIsoDate,
  type GameState,
  type WeeklyReport,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, playToEnd, QUIET, sponsorship } from '../core/testing';
import { openQuinquennat, presidentOf } from './government';
import {
  blocOfNuance,
  dissolutionBlocked,
  firstRound,
  secondRound,
  thirdTuesdayOfJune,
} from './legislatives';

// Phase 6 (P6-07) : législatives sur les 577 circonscriptions, dissolution.

const RULES = QUIET;
const { premierTourInscrits, qualificationInscrits } = RULES.legislatives.regles;

const elected = playToEnd(newGame({ seed: 'legislatives' }, RULES), RULES, (s) =>
  sponsorship(s, RULES),
).state;

function step(state: GameState, actions: { actionId: string }[] = []) {
  return advanceWeek(
    state,
    {
      actions,
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
    },
    { ruleset: RULES },
  );
}

/** Le joueur déclaré élu, gouvernement nommé (semaine qui suit l'investiture). */
function playerInOffice(): GameState {
  let state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors[PLAYER_ACTOR_ID]!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULES, PLAYER_ACTOR_ID);
  while (!state.quinquennat!.gouvernement) state = step(state).state;
  return state;
}

describe('législatives de 2024 (données réelles)', () => {
  it('reprennent les 577 circonscriptions, dont 76 élus au premier tour, sans nom de candidat', () => {
    const districts = RULES.legislatives2024.circonscriptions;
    expect(districts).toHaveLength(577);
    expect(districts.filter((d) => d.elu.tour === 1)).toHaveLength(76);
    for (const d of districts) {
      const votes = Object.values(d.voix).reduce((a, b) => a + b, 0);
      expect(votes + d.ecart).toBe(d.exprimes);
      expect(d.exprimes).toBeLessThanOrEqual(d.votants);
      expect(d.votants).toBeLessThanOrEqual(d.inscrits);
    }
    const nuances = blocOfNuance(RULES);
    for (const d of districts)
      for (const n of Object.keys(d.voix)) expect(nuances.has(n)).toBe(true);
    expect(JSON.stringify(RULES.legislatives2024)).not.toMatch(/"(nom|prenom)"/i);
  });

  it('calculent la fin des pouvoirs au troisième mardi de juin', () => {
    expect(thirdTuesdayOfJune(2022)).toBe('2022-06-21');
    expect(thirdTuesdayOfJune(2029)).toBe('2029-06-19');
    expect(elected.legislatives).toMatchObject({
      finLegislature: '2029-06-19',
      prochaine: { motif: 'fin-de-legislature', t1: '2029-06-10', t2: '2029-06-17' },
      derniere: { motif: 'reelles-2024', t2: '2024-07-07' },
    });
  });
});

describe('législatives simulées', () => {
  const president = presidentOf(elected);
  const round1 = firstRound(elected, RULES, president);
  const outcomes = secondRound(RULES, round1);

  it('attribuent exactement 577 sièges, un par circonscription', () => {
    expect(outcomes).toHaveLength(577);
    expect(outcomes.every((d) => d.elu !== null)).toBe(true);
    expect(new Set(outcomes.map((d) => d.code)).size).toBe(577);
  });

  it('donnent des résultats cohérents : voix ≤ exprimés ≤ votants ≤ inscrits', () => {
    for (const d of outcomes) {
      for (const round of [d.t1, d.t2]) {
        if (!round) continue;
        expect(Object.values(round.voix).reduce((a, b) => a + b, 0)).toBe(round.exprimes);
        for (const v of Object.values(round.voix)) expect(v).toBeLessThanOrEqual(round.exprimes);
        expect(round.exprimes).toBeLessThanOrEqual(round.votants);
        expect(round.votants).toBeLessThanOrEqual(d.inscrits);
      }
    }
  });

  it('appliquent les seuils : majorité absolue et quart des inscrits, puis 12,5 % des inscrits', () => {
    for (const d of outcomes) {
      if (d.tour === 1) {
        const v = d.t1.voix[d.elu!]!;
        expect(2 * v).toBeGreaterThan(d.t1.exprimes);
        expect(v).toBeGreaterThanOrEqual(Math.ceil(premierTourInscrits * d.inscrits));
        continue;
      }
      const qualified = Object.keys(d.t2!.voix);
      const above = Object.entries(d.t1.voix).filter(
        ([, v]) => v >= qualificationInscrits * d.inscrits,
      );
      if (above.length >= 2) expect(qualified.sort()).toEqual(above.map(([b]) => b).sort());
      else expect(qualified).toHaveLength(2);
      expect(qualified).toContain(d.elu);
    }
  });

  it('sont déterministes', () => {
    expect(secondRound(RULES, firstRound(elected, RULES, president))).toEqual(outcomes);
  });
});

describe('dissolution', () => {
  it('provoque des élections 20 jours plus tard, puis une nouvelle Assemblée de 577 sièges', () => {
    const start = playerInOffice();
    expect(dissolutionBlocked(start, RULES)).toBeNull();
    const { state, report, majorEvent } = step(start, [{ actionId: 'dissolution' }]);
    expect(majorEvent).toBe(true);
    expect(report.events.some((e) => e.label === 'Dissolution de l’Assemblée nationale')).toBe(
      true,
    );
    const prochaine = state.legislatives!.prochaine!;
    expect(prochaine.motif).toBe('dissolution');
    const day = (iso: string) => daysFromCivil(parseIsoDate(iso)!);
    expect(day(prochaine.t1) - day(start.meta.date)).toBeGreaterThanOrEqual(20);
    expect(day(prochaine.t2) - day(start.meta.date)).toBeLessThanOrEqual(40);
    expect(isoWeekday(parseIsoDate(prochaine.t1)!)).toBe(7);
    expect(dissolutionBlocked(state, RULES)).toMatch(/déjà en cours/);

    let current = state;
    const reports: WeeklyReport[] = [];
    for (let i = 0; i < 6 && !current.legislatives!.derniere.motif.startsWith('dissolution'); i++) {
      const result = step(current);
      reports.push(result.report);
      current = result.state;
      // Chaque état intermédiaire (premier tour dépouillé compris) reste sauvegardable.
      expect(GameStateSchema.safeParse(current).error).toBeUndefined();
    }
    const rounds = reports.filter((r) => r.legislatives).map((r) => r.legislatives!.tour);
    expect(rounds).toEqual([1, 2]);
    const derniere = current.legislatives!.derniere;
    expect(derniere).toMatchObject({ motif: 'dissolution', t1: prochaine.t1, t2: prochaine.t2 });
    expect(Object.values(derniere.siegesParBloc).reduce((a, b) => a + b, 0)).toBe(577);
    expect(Object.values(current.parlement!.groupes).reduce((sum, g) => sum + g.sieges, 0)).toBe(
      577,
    );
    expect(derniere.circonscriptions).toHaveLength(577);
    expect(current.quinquennat!.anciensGouvernements.at(-1)!.motif).toBe('élections législatives');
    expect(current.pendingDecisions.map((d) => d.kind)).toContain('gouvernement');
    // Nouvelle législature de cinq ans ; pas de nouvelle dissolution dans l'année.
    expect(current.legislatives!.finLegislature).toBe(
      thirdTuesdayOfJune(Number(prochaine.t2.slice(0, 4)) + 5),
    );
    expect(dissolutionBlocked(current, RULES)).toMatch(/Pas de nouvelle dissolution dans l’année/);
    const rejected = step(current, [{ actionId: 'dissolution' }]).report.actions[0]!;
    expect(rejected).toMatchObject({ status: 'rejetee' });
  });

  it('suspend les travaux parlementaires jusqu’à l’élection de la nouvelle Assemblée', () => {
    const start = playerInOffice();
    const dissolved = step(start, [{ actionId: 'dissolution' }]).state;
    const after = step(step(dissolved).state).state;
    expect(after.parlement!.textes).toEqual(dissolved.parlement!.textes);
  });
});

describe('fin de législature', () => {
  it('tient les législatives de juin 2029 pendant le quinquennat du président IA', () => {
    let state = elected;
    const reports: WeeklyReport[] = [];
    while (state.meta.date < '2029-06-25' && !state.calendar.blockedBy) {
      const result = step(state);
      reports.push(result.report);
      state = result.state;
    }
    const derniere = state.legislatives!.derniere;
    expect(derniere).toMatchObject({
      motif: 'fin-de-legislature',
      t1: '2029-06-10',
      t2: '2029-06-17',
    });
    expect(state.legislatives!.finLegislature).toBe('2034-06-20');
    expect(Object.values(state.parlement!.groupes).reduce((s, g) => s + g.sieges, 0)).toBe(577);
    expect(reports.filter((r) => r.legislatives?.tour === 2).length).toBeGreaterThanOrEqual(1);
  });
});
