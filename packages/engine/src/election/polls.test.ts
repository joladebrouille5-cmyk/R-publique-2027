import type { GameState, Poll, Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advance, newGame, QUIET, RULESET } from '../core/testing';
import { distribute, groupShares, summarize } from './distribution';
import { marginOfError, POLL_COMBINED_LABEL, POLL_RESIDUAL_LABEL, publishPolls } from './polls';

const sum = (values: readonly { value: number }[]) =>
  values.reduce((total, r) => total + r.value, 0);

function pollsOf(state: GameState) {
  const distributions = distribute(state, RULESET, 1, 'opinion');
  const opinion = summarize(distributions, state.meta.week, 1)!;
  return {
    opinion,
    polls: publishPolls(state, RULESET, 1, opinion, groupShares(distributions)).polls,
  };
}

describe('sondages simulés', () => {
  const state = newGame();
  const { opinion, polls } = pollsOf(state);

  it('calcule la marge d’erreur à 95 % en centièmes de point', () => {
    expect(marginOfError(0.5, 1000)).toBe(310);
    expect(marginOfError(0.2, 1500)).toBe(202);
  });

  it('publie, selon la périodicité de chaque institut, intentions, hypothèse de second tour et popularité', () => {
    expect(polls.map((p) => p.id)).toEqual([
      'p-0-opinio-intentions_t1',
      'p-0-opinio-hypothese-t2',
      'p-0-opinio-popularite',
    ]);
    const next: GameState = { ...state, meta: { ...state.meta, week: 1, date: '2026-10-05' } };
    expect(pollsOf(next).polls.map((p) => p.instituteId)).toEqual(['civis', 'civis', 'civis']);
  });

  it('affiche une fiche technique complète et étiquetée « sondage »', () => {
    for (const poll of polls) {
      expect(poll).toMatchObject({
        nature: 'sondage',
        sampleSize: 1000,
        fieldStart: '2026-09-28',
        fieldEnd: '2026-09-30',
        publishedAt: '2026-10-02',
        institute: expect.any(String),
        method: expect.any(String),
      });
      expect(poll.limits.length).toBeGreaterThan(0);
      for (const result of poll.results) {
        expect(result.margin).toBe(marginOfError(result.value / 10_000, poll.sampleSize));
      }
    }
  });

  it('des intentions qui totalisent 100 % et restent proches des intentions attendues', () => {
    const [t1, hypothesis] = polls as [(typeof polls)[0], (typeof polls)[0]];
    expect(sum(t1.results)).toBe(10_000);
    expect(t1.results.map((r) => r.actorId).sort()).toEqual(Object.keys(opinion.intentions).sort());
    for (const r of t1.results)
      expect(Math.abs(r.value - opinion.intentions[r.actorId]!)).toBeLessThan(1000);
    expect(hypothesis.kind).toBe('intentions_t2');
    expect(hypothesis.results).toHaveLength(2);
    expect(sum(hypothesis.results)).toBe(10_000);
  });

  it('une cote de popularité distincte des intentions de vote', () => {
    const popularity = polls.find((p) => p.kind === 'popularite')!;
    expect(popularity.results).toHaveLength(Object.keys(state.actors).length);
    for (const r of popularity.results) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(10_000);
    }
    expect(sum(popularity.results)).not.toBe(10_000);
  });

  it('est déterministe et ne modifie pas l’état', () => {
    const before = JSON.stringify(state);
    expect(pollsOf(state).polls).toEqual(polls);
    expect(JSON.stringify(state)).toBe(before);
  });
});

/**
 * Campagne sans action du joueur : vagues d'intentions publiées par chaque institut, telles que
 * les donne le bilan de leur semaine (avec leur décomposition), et état final.
 */
function run(ruleset: Ruleset, weeks: number): { polls: Poll[]; state: GameState } {
  let state = newGame();
  const polls: Poll[] = [];
  for (let week = 0; week < weeks; week++) {
    const pending = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    }));
    const next = advance(state, [], pending, ruleset);
    state = next.state;
    polls.push(...next.report.polls.filter((p) => p.kind === 'intentions_t1'));
  }
  return { polls, state };
}

const campaign = (ruleset: Ruleset, weeks: number) => run(ruleset, weeks).polls;

/** Aucun fait nouveau : ni événement, ni action des adversaires (ni du joueur). */
const STILL: Ruleset = {
  ...QUIET,
  ia: {
    ...QUIET.ia,
    accessible: { ...QUIET.ia.accessible, actionsParSemaine: 0 },
    standard: { ...QUIET.ia.standard, actionsParSemaine: 0 },
    expert: { ...QUIET.ia.expert, actionsParSemaine: 0 },
  },
};
/** Ancien comportement (phases 3 à 10) : tirage brut, incertitude redessinée chaque semaine. */
const RAW: Ruleset = {
  ...STILL,
  modele: { ...STILL.modele, persistanceIncertitude: 0 },
  sondages: { ...STILL.sondages, redressement: 1 },
};

/** Écart moyen (en centièmes de point) d'une vague à la suivante du même institut. */
function meanSwing(polls: readonly Poll[]): number {
  const swings: number[] = [];
  for (const poll of polls)
    for (const r of poll.results) if (r.variation !== null) swings.push(Math.abs(r.variation));
  return swings.reduce((a, b) => a + b, 0) / swings.length;
}

describe('sondages stables et expliqués (phase 11)', () => {
  const { polls, state } = run(QUIET, 16);

  it('donne la variation de chaque candidat depuis la vague précédente de l’institut', () => {
    const byInstitute = new Map<string, Poll[]>();
    for (const poll of polls)
      byInstitute.set(poll.instituteId, [...(byInstitute.get(poll.instituteId) ?? []), poll]);
    for (const waves of byInstitute.values()) {
      expect(waves.length).toBeGreaterThan(3);
      expect(waves[0]!.results.every((r) => r.variation === null)).toBe(true);
      for (let i = 1; i < waves.length; i++)
        for (const r of waves[i]!.results) {
          const before = waves[i - 1]!.results.find((b) => b.actorId === r.actorId)!;
          expect(r.variation).toBe(r.value - before.value);
        }
    }
  });

  it('décompose chaque variation par facteur, la somme valant exactement la variation', () => {
    let explained = 0;
    let named = 0;
    let combined = 0;
    for (const poll of polls)
      for (const r of poll.results) {
        if (r.variation === null) continue;
        expect(r.explication.reduce((sum, c) => sum + c.valeur, 0)).toBe(r.variation);
        // Le reste, propre à l'échantillon (redressé), reste faible.
        const residual = r.explication.find((c) => c.label === POLL_RESIDUAL_LABEL)?.valeur ?? 0;
        expect(Math.abs(residual)).toBeLessThanOrEqual(150);
        if (r.explication.some((c) => c.label !== POLL_RESIDUAL_LABEL)) explained += 1;
        for (const c of r.explication)
          if (c.label === POLL_COMBINED_LABEL) combined += Math.abs(c.valeur);
          else if (c.label !== POLL_RESIDUAL_LABEL) named += Math.abs(c.valeur);
      }
    expect(explained).toBeGreaterThan(20);
    // Effets calculés groupe d'électeurs par groupe : les facteurs nommés expliquent l'essentiel.
    expect(combined).toBeLessThan(named * 0.25);
  });

  it('ne garde dans l’état que la décomposition de la dernière vague de chaque institut', () => {
    const latest = new Map(state.polls.map((p) => [p.instituteId, p.week]));
    const first = new Map([...polls].reverse().map((p) => [p.instituteId, p.id]));
    for (const poll of state.polls) {
      const explained = poll.results.some((r) => r.explication.length > 0);
      if (poll.week !== latest.get(poll.instituteId)) expect(explained).toBe(false);
      // La variation, elle, reste sur chaque vague (sauf la première de l'institut).
      if (poll.kind === 'intentions_t1' && poll.id !== first.get(poll.instituteId))
        expect(poll.results.every((r) => r.variation !== null)).toBe(true);
    }
    const last = state.polls.filter((p) => p.kind === 'intentions_t1').at(-1)!;
    expect(last).toEqual(polls.at(-1));
  });

  it('ne fait plus le yoyo : sans fait nouveau, des vagues stables', () => {
    const still = campaign(STILL, 16);
    const stable = meanSwing(still);
    const raw = meanSwing(campaign(RAW, 16));
    expect(stable).toBeLessThan(raw * 0.5);
    for (const poll of still)
      for (const r of poll.results)
        if (r.variation !== null) expect(Math.abs(r.variation)).toBeLessThanOrEqual(150);
  });
});
