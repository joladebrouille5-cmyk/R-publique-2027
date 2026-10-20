import { addDays, type GameState, type Poll, type Ruleset } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import type { Rng } from '../core/rng';
import { largestRemainder } from './apportion';
import { distribute, summarize, type Round } from './distribution';

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

function intentionsPoll(
  state: GameState,
  ruleset: Ruleset,
  institute: Institute,
  kind: 'intentions_t1' | 'intentions_t2',
  intentions: Record<string, number>,
  rng: Rng,
): Poll['results'] {
  const ids = Object.keys(intentions).sort(compareStrings);
  const biased = ids.map((id) =>
    Math.max(
      1,
      intentions[id]! +
        houseBias(state.meta.seed, institute, `${kind}-${id}`, ruleset.sondages.biaisMaxCentiemes),
    ),
  );
  const counts = sample(rng, biased, institute.taille);
  const values = largestRemainder(10_000, counts);
  return ids.map((actorId, i) => ({
    actorId,
    value: values[i]!,
    margin: marginOfError(values[i]! / 10_000, institute.taille),
  }));
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
 */
export function publishPolls(
  state: GameState,
  ruleset: Ruleset,
  round: Round,
  intentions: Record<string, number>,
): Poll[] {
  const week = state.meta.week;
  const monday = state.meta.date;
  const polls: Poll[] = [];
  const institutes = [...ruleset.sondages.instituts].sort((a, b) => compareStrings(a.id, b.id));

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
    const results = intentionsPoll(state, ruleset, institute, kind, intentions, rng);
    polls.push({ ...base, id: `p-${week}-${institute.id}-${kind}`, kind, results });

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
          results: intentionsPoll(
            state,
            ruleset,
            institute,
            'intentions_t2',
            hypothesis.intentions,
            rng,
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
        const value = Math.round((favorable * 10_000) / institute.taille);
        return {
          actorId: actor.id,
          value,
          margin: marginOfError(value / 10_000, institute.taille),
        };
      });
    if (popularity.length) {
      polls.push({
        ...base,
        id: `p-${week}-${institute.id}-popularite`,
        kind: 'popularite',
        results: popularity,
      });
    }
  }
  return polls;
}
