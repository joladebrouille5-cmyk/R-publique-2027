import {
  addDays,
  type GameState,
  type Opinion,
  type Poll,
  type PollBase,
  type PollContribution,
  type Ruleset,
} from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import type { Rng } from '../core/rng';
import { largestRemainder } from './apportion';
import { distribute, summarize, type GroupShares, type Round } from './distribution';

type Institute = Ruleset['sondages']['instituts'][number];

/** Marge d'erreur à 95 % d'un échantillon aléatoire simple, en centièmes de point. */
export function marginOfError(share: number, sampleSize: number): number {
  return Math.round(1.96 * Math.sqrt((share * (1 - share)) / sampleSize) * 10_000);
}

/** Biais propre à un institut pour un candidat, fixe pour toute la partie (effet maison). */
function houseBias(seed: string, institute: Institute, actorId: string, max: number): number {
  const rng = stream(seed, 0, 'biais-institut', institute.id, actorId);
  return Math.round((rng.nextFloat() * 2 - 1) * max);
}

/** Tirage de `n` réponses selon des parts (somme quelconque > 0). */
function sample(rng: Rng, shares: readonly number[], n: number): number[] {
  const total = shares.reduce((a, b) => a + b, 0);
  const counts = shares.map(() => 0);
  for (let i = 0; i < n; i++) {
    let target = rng.nextFloat() * total;
    let index = 0;
    while (index < shares.length - 1 && target >= shares[index]!) {
      target -= shares[index]!;
      index++;
    }
    counts[index]! += 1;
  }
  return counts;
}

type Result = Poll['results'][number];

/**
 * Intentions mesurées par un institut : tirage de l'échantillon autour des intentions
 * attendues (avec l'effet maison de l'institut), dont seule une part de l'écart est conservée
 * après redressement par quotas (hypothèse du jeu, phase 11).
 */
function intentionsPoll(
  state: GameState,
  ruleset: Ruleset,
  institute: Institute,
  kind: 'intentions_t1' | 'intentions_t2',
  intentions: Record<string, number>,
  rng: Rng,
): Result[] {
  const ids = Object.keys(intentions).sort(compareStrings);
  const biased = ids.map((id) =>
    Math.max(
      1,
      intentions[id]! +
        houseBias(state.meta.seed, institute, `${kind}-${id}`, ruleset.sondages.biaisMaxCentiemes),
    ),
  );
  const counts = sample(rng, biased, institute.taille);
  const expected = biased.reduce((a, b) => a + b, 0);
  const keep = ruleset.sondages.redressement;
  const adjusted = ids.map(
    (_, i) =>
      biased[i]! / expected + keep * (counts[i]! / institute.taille - biased[i]! / expected),
  );
  const values = largestRemainder(10_000, adjusted);
  return ids.map((actorId, i) => ({
    actorId,
    value: values[i]!,
    margin: marginOfError(values[i]! / 10_000, institute.taille),
    variation: null,
    explication: [],
  }));
}

/** Facteurs moyens de chaque candidat (libellé → valeur), d'après la décomposition de l'opinion. */
export function factorTable(opinion: Opinion): PollBase['facteurs'] {
  return Object.fromEntries(
    Object.entries(opinion.breakdown).map(([id, factors]) => [
      id,
      Object.fromEntries(factors.map((f) => [f.label, f.value])),
    ]),
  );
}

/** Libellé du reste d'une décomposition : écart d'échantillon, redressement et arrondis. */
export const POLL_RESIDUAL_LABEL = 'Écart d’échantillon et arrondis';
/** Écart entre la somme des effets de chaque facteur et l'évolution attendue des intentions. */
export const POLL_COMBINED_LABEL = 'Effets combinés des facteurs';
const OTHER_FACTORS_LABEL = 'Autres facteurs';
/** Contributions retenues une à une (les autres sont regroupées), en centièmes de point. */
const MAX_CONTRIBUTIONS = 5;
const MIN_CONTRIBUTION = 5;

/**
 * Décomposition de la variation d'un candidat depuis la vague précédente de l'institut :
 * pour chaque facteur du modèle, effet au premier ordre de son évolution sur la part du
 * candidat, groupe d'électeurs par groupe (p · (Δf − Σ p·Δf), parts de la semaine, pondérées
 * par les suffrages exprimés attendus) ; puis l'écart entre ces effets et l'évolution des
 * intentions attendues (effets combinés) ; enfin le reste, propre à l'échantillon
 * (redressement, arrondis). La somme vaut la variation.
 */
export function explainVariation(
  base: PollBase,
  opinion: Opinion,
  groups: GroupShares,
  actorId: string,
  variation: number,
): PollContribution[] {
  const now = factorTable(opinion);
  const ids = Object.keys(opinion.intentions);
  const labels = [
    ...new Set(
      ids.flatMap((id) => [...Object.keys(now[id] ?? {}), ...Object.keys(base.facteurs[id] ?? {})]),
    ),
  ];
  const delta = (id: string, label: string) =>
    (now[id]?.[label] ?? 0) - (base.facteurs[id]?.[label] ?? 0);
  const effect = (label: string) =>
    groups.reduce((sum, { poids, parts }) => {
      const mean = ids.reduce((m, id) => m + (parts[id] ?? 0) * delta(id, label), 0);
      return sum + poids * (parts[actorId] ?? 0) * (delta(actorId, label) - mean);
    }, 0);
  const contributions = labels
    .map((label) => ({ label, valeur: Math.round(10_000 * effect(label)) }))
    .filter((c) => Math.abs(c.valeur) >= MIN_CONTRIBUTION)
    .sort((a, b) => Math.abs(b.valeur) - Math.abs(a.valeur) || compareStrings(a.label, b.label));
  const kept = contributions.slice(0, MAX_CONTRIBUTIONS);
  const others = contributions.slice(MAX_CONTRIBUTIONS).reduce((sum, c) => sum + c.valeur, 0);
  if (others !== 0) kept.push({ label: OTHER_FACTORS_LABEL, valeur: others });
  const factorsSum = contributions.reduce((sum, c) => sum + c.valeur, 0);
  const expected =
    opinion.intentions[actorId]! - (base.intentions[actorId] ?? opinion.intentions[actorId]!);
  const combined = expected - factorsSum;
  if (combined !== 0) kept.push({ label: POLL_COMBINED_LABEL, valeur: combined });
  const residual = variation - expected;
  if (residual !== 0) kept.push({ label: POLL_RESIDUAL_LABEL, valeur: residual });
  return kept;
}

/** Vague précédente du même institut et de la même série (identifiant sans la semaine). */
function previousWave(state: GameState, institute: Institute, series: string): Poll | undefined {
  return [...state.polls]
    .reverse()
    .find((p) => p.instituteId === institute.id && p.id.endsWith(`-${institute.id}-${series}`));
}

/** Variation de chaque résultat depuis la vague précédente de la même série (mêmes candidats). */
function withVariation(results: Result[], previous: Poll | undefined): Result[] {
  if (!previous) return results;
  const before = new Map(previous.results.map((r) => [r.actorId, r.value]));
  const sameField =
    previous.results.length === results.length && results.every((r) => before.has(r.actorId));
  if (!sameField) return results;
  return results.map((r) => ({ ...r, variation: r.value - before.get(r.actorId)! }));
}

/**
 * Sondages déjà publiés, quand de nouvelles vagues paraissent : seule la dernière vague de chaque
 * institut garde la décomposition de ses variations (la sauvegarde ne grossit pas d'une
 * explication par vague) ; la variation elle-même reste, et le bilan de la semaine de
 * publication porte la décomposition complète.
 */
export function archivePolls(previous: readonly Poll[], published: readonly Poll[]): Poll[] {
  const renewed = new Set(published.map((p) => p.instituteId));
  return previous.map((poll) =>
    renewed.has(poll.instituteId) && poll.results.some((r) => r.explication.length > 0)
      ? { ...poll, results: poll.results.map((r) => ({ ...r, explication: [] })) }
      : poll,
  );
}

/** Hypothèse de second tour entre deux candidats, avant le premier tour. */
function hypotheticalSecondRound(state: GameState, ruleset: Ruleset, finalists: readonly string[]) {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  for (const actor of Object.values(copy.actors)) {
    if (actor.status !== 'candidat') continue;
    actor.status = finalists.includes(actor.id) ? 'qualifie' : 'elimine';
  }
  return summarize(distribute(copy, ruleset, 2, 'opinion'), state.meta.week, 2);
}

/**
 * Étape 8 : publication des sondages simulés de la semaine (§5.2). Chaque institut publie
 * à sa périodicité un sondage d'intentions (avec, avant le premier tour, une hypothèse de
 * second tour entre les deux premiers) et une cote de popularité, distincte des intentions.
 * Chaque résultat porte sa variation depuis la vague précédente de l'institut ; celle des
 * intentions est décomposée par facteur (phase 11). Renvoie aussi le nouveau point de
 * comparaison de chaque institut ; l'état reçu n'est pas modifié.
 */
export function publishPolls(
  state: GameState,
  ruleset: Ruleset,
  round: Round,
  opinion: Opinion,
  groups: GroupShares,
): { polls: Poll[]; bases: Record<string, PollBase> } {
  const week = state.meta.week;
  const monday = state.meta.date;
  const intentions = opinion.intentions;
  const polls: Poll[] = [];
  const bases: Record<string, PollBase> = {};
  const institutes = [...ruleset.sondages.instituts].sort((a, b) => compareStrings(a.id, b.id));
  const keep = ruleset.sondages.redressement;

  for (const institute of institutes) {
    if (week < institute.decalage || (week - institute.decalage) % institute.periodicite !== 0)
      continue;
    const base = {
      instituteId: institute.id,
      institute: institute.libelle,
      week,
      fieldStart: monday,
      fieldEnd: addDays(monday, 2),
      publishedAt: addDays(monday, 4),
      sampleSize: institute.taille,
      method: institute.methode,
      limits: ruleset.sondages.limites,
      nature: 'sondage' as const,
    };
    const rng = stream(state.meta.seed, week, 'sondage', institute.id);
    const kind = round === 1 ? 'intentions_t1' : 'intentions_t2';
    const previousBase = state.sondagesBase[institute.id];
    const results = withVariation(
      intentionsPoll(state, ruleset, institute, kind, intentions, rng),
      previousWave(state, institute, kind),
    ).map((r) =>
      r.variation !== null && previousBase?.tour === round
        ? {
            ...r,
            explication: explainVariation(previousBase, opinion, groups, r.actorId, r.variation),
          }
        : r,
    );
    polls.push({ ...base, id: `p-${week}-${institute.id}-${kind}`, kind, results });
    bases[institute.id] = {
      semaine: week,
      tour: round,
      intentions: { ...intentions },
      facteurs: factorTable(opinion),
    };

    if (round === 1 && results.length >= 3) {
      const leaders = [...results]
        .sort((a, b) => b.value - a.value || compareStrings(a.actorId, b.actorId))
        .slice(0, 2)
        .map((r) => r.actorId);
      const hypothesis = hypotheticalSecondRound(state, ruleset, leaders);
      if (hypothesis) {
        polls.push({
          ...base,
          id: `p-${week}-${institute.id}-hypothese-t2`,
          kind: 'intentions_t2',
          results: withVariation(
            intentionsPoll(state, ruleset, institute, 'intentions_t2', hypothesis.intentions, rng),
            previousWave(state, institute, 'hypothese-t2'),
          ),
        });
      }
    }

    const popularity = Object.values(state.actors)
      .filter((a) => a.status !== 'elimine')
      .sort((a, b) => compareStrings(a.id, b.id))
      .map((actor) => {
        const p = actor.resources.popularite / 10_000;
        let favorable = 0;
        for (let i = 0; i < institute.taille; i++) if (rng.nextFloat() < p) favorable++;
        const measured = p + keep * (favorable / institute.taille - p);
        const value = Math.min(10_000, Math.max(0, Math.round(measured * 10_000)));
        return {
          actorId: actor.id,
          value,
          margin: marginOfError(value / 10_000, institute.taille),
          variation: null,
          explication: [],
        };
      });
    if (popularity.length) {
      polls.push({
        ...base,
        id: `p-${week}-${institute.id}-popularite`,
        kind: 'popularite',
        results: withVariation(popularity, previousWave(state, institute, 'popularite')),
      });
    }
  }
  return { polls, bases };
}
