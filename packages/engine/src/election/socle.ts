import { duelAverage, pollAverage, type GameState, type Ruleset, type Socle } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { distribute, summarize } from './distribution';
import { round4 } from './socleFactors';

const clamp = (value: number) => Math.min(20, Math.max(-20, value));

export { socleFactors, socleLabel } from './socleFactors';

/**
 * Socle électoral « Sondages actuels » (phase 24). À la création d'une partie avec des
 * personnalités réelles, un décalage d'utilité par personnalité est calibré pour que les
 * intentions simulées de la semaine 0 collent à la moyenne des sondages publiés (premier tour)
 * et aux duels sourcés (second tour). Même formule pour toutes les personnalités, joueur
 * compris ; le socle s'érode ensuite chaque semaine et ne vaut que pour le cycle 2027. Seul le
 * point de départ vient des sondages : toute la suite est simulée.
 */

/** Candidats en lice qui sont des personnalités réelles : identifiant d'acteur → personnalité. */
function realCandidates(state: GameState): [string, string][] {
  return Object.values(state.actors)
    .filter(
      (a) => a.status === 'candidat' && a.candidate.nature === 'reel' && a.candidate.personnaliteId,
    )
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((a) => [a.id, a.candidate.personnaliteId!]);
}

/** Intentions simulées du premier tour de la semaine courante, avec le socle fourni. */
function simulateT1(state: GameState, ruleset: Ruleset, socle: Socle) {
  const probe = { ...state, socle };
  return summarize(distribute(probe, ruleset, 1, 'opinion'), state.meta.week, 1)!.intentions;
}

/** Part du premier finaliste dans un second tour hypothétique entre `a` et `b`. */
function simulateDuel(state: GameState, ruleset: Ruleset, socle: Socle, a: string, b: string) {
  const actors = Object.fromEntries(
    Object.entries(state.actors).map(([id, actor]) => [
      id,
      actor.status === 'candidat'
        ? { ...actor, status: id === a || id === b ? 'qualifie' : 'elimine' }
        : actor,
    ]),
  ) as GameState['actors'];
  const probe = { ...state, actors, socle };
  const opinion = summarize(distribute(probe, ruleset, 2, 'opinion'), state.meta.week, 2)!;
  const sa = opinion.intentions[a] ?? 0;
  const sb = opinion.intentions[b] ?? 0;
  return (sa * 10_000) / (sa + sb || 1);
}

/**
 * Calibre le socle d'une partie : premier tour par ajustement itératif (décalage += ln(cible /
 * simulé), parts relatives au total des personnalités réelles), puis second tour sur les duels
 * sourcés de chaque paire en lice. Arrêt à la tolérance du jeu de règles ou au nombre
 * d'itérations. Une personnalité sans duel sourcé n'a pas de socle au second tour.
 */
export function calibrateSocle(state: GameState, ruleset: Ruleset): Socle {
  const params = ruleset.departSondages;
  const polls = ruleset.sondagesReels;
  const reals = realCandidates(state);
  const average = pollAverage(
    polls,
    reals.map(([, p]) => p),
    params.socleMinimal,
  );
  const socle: Socle = { date: average.date, t1: {}, t2: {} };
  if (reals.length < 2) return socle;
  for (const [actorId] of reals) socle.t1[actorId] = 0;

  for (let it = 0; it < params.iterations; it++) {
    const sim = simulateT1(state, ruleset, socle);
    const total = reals.reduce((s, [id]) => s + (sim[id] ?? 0), 0) || 1;
    let worst = 0;
    for (const [actorId, personaliteId] of reals) {
      const target = average.cibles[personaliteId]!.valeur;
      const share = ((sim[actorId] ?? 0) * 10_000) / total;
      worst = Math.max(worst, Math.abs(share - target));
      socle.t1[actorId] = clamp(
        socle.t1[actorId]! + Math.log(Math.max(target, 1) / Math.max(share, 1)),
      );
    }
    if (worst <= params.tolerance) break;
  }

  const pairs: { a: string; b: string; target: number }[] = [];
  for (let i = 0; i < reals.length; i++) {
    for (let j = i + 1; j < reals.length; j++) {
      const [a, pa] = reals[i]!;
      const [b, pb] = reals[j]!;
      const target = duelAverage(polls, pa, pb);
      if (target !== null) pairs.push({ a, b, target });
    }
  }
  for (const { a, b } of pairs) {
    socle.t2[a] = 0;
    socle.t2[b] = 0;
  }
  for (let it = 0; pairs.length > 0 && it < params.iterations; it++) {
    const step: Record<string, number[]> = {};
    let worst = 0;
    for (const { a, b, target } of pairs) {
      const share = simulateDuel(state, ruleset, socle, a, b);
      worst = Math.max(worst, Math.abs(share - target));
      // Écart en logit partagé entre les deux finalistes.
      const gap =
        Math.log(target / (10_000 - target)) - Math.log(share / Math.max(10_000 - share, 1));
      (step[a] ??= []).push(gap / 2);
      (step[b] ??= []).push(-gap / 2);
    }
    if (worst <= params.tolerance) break;
    for (const [id, steps] of Object.entries(step)) {
      socle.t2[id] = clamp(socle.t2[id]! + steps.reduce((x, y) => x + y, 0) / steps.length);
    }
  }

  for (const key of ['t1', 't2'] as const) {
    socle[key] = Object.fromEntries(Object.entries(socle[key]).map(([id, v]) => [id, round4(v)]));
  }
  return socle;
}
