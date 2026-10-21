import type { GameState } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { newGame, RULESET } from '../core/testing';
import { distribute, summarize } from './distribution';
import { marginOfError, publishPolls } from './polls';

const sum = (values: readonly { value: number }[]) =>
  values.reduce((total, r) => total + r.value, 0);

function pollsOf(state: GameState) {
  const opinion = summarize(distribute(state, RULESET, 1, 'opinion'), state.meta.week, 1)!;
  return { opinion, polls: publishPolls(state, RULESET, 1, opinion.intentions) };
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
