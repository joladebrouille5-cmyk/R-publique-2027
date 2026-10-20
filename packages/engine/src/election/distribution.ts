import type { ElectorateGroup, GameState, Opinion, Ruleset, UtilityFactor } from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { largestRemainder } from './apportion';
import { blankRate, softmax, sumFactors, turnout, utilityFactors, type Contender } from './model';

export type Round = 1 | 2;

/** Comportement électoral attendu d'un groupe pour un tour donné (avant tirage des voix). */
export type GroupDistribution = {
  group: ElectorateGroup;
  inscrits: number;
  turnout: number;
  blancs: number;
  nuls: number;
  contenders: Contender[];
  probabilities: number[];
  factors: UtilityFactor[][];
};

/** Candidats en lice : au premier tour tous les candidats, au second les deux qualifiés. */
export function contendersFromState(state: GameState, round: Round): Contender[] {
  const status = round === 1 ? 'candidat' : 'qualifie';
  return Object.values(state.actors)
    .filter((actor) => actor.status === status)
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((actor) => {
      const history = actor.history.popularite;
      const past =
        history.length >= 4
          ? history[history.length - 4]!
          : (history[0] ?? actor.resources.popularite);
      return {
        id: actor.id,
        position: actor.candidate.positionnement,
        notoriete: actor.resources.notoriete,
        popularite: actor.resources.popularite,
        dynamique: actor.resources.popularite - past,
      };
    });
}

/** Facteurs propres au second tour : consignes de vote partielles et débat (§5.3). */
function secondRoundFactors(
  state: GameState,
  ruleset: Ruleset,
  groupId: string,
  contender: Contender,
) {
  const { effetConsigne, effetDebat } = ruleset.modele.secondTour;
  const factors: UtilityFactor[] = [];
  const t1 = state.elections.t1;
  const groupT1 = t1?.groups.find((g) => g.groupId === groupId);
  for (const consigne of state.elections.consignes) {
    if (consigne.toActorId !== contender.id || !groupT1 || groupT1.exprimes === 0) continue;
    const share = (groupT1.voix[consigne.fromActorId] ?? 0) / groupT1.exprimes;
    const from = state.actors[consigne.fromActorId]?.candidate;
    const name = from ? `${from.prenom} ${from.nom}`.trim() : consigne.fromActorId;
    factors.push({ label: `Consigne de vote de ${name}`, value: effetConsigne * share });
  }
  const performance = state.elections.debate?.[contender.id];
  if (performance !== undefined) {
    factors.push({ label: 'Débat d’entre-deux-tours', value: effetDebat * performance });
  }
  return factors;
}

/**
 * Comportement de chaque groupe d'électeurs pour un tour. `purpose` sépare les tirages
 * d'incertitude de l'opinion hebdomadaire de ceux du jour du scrutin.
 */
export function distribute(
  state: GameState,
  ruleset: Ruleset,
  round: Round,
  purpose: 'opinion' | 'scrutin',
): GroupDistribution[] {
  const contenders = contendersFromState(state, round);
  if (contenders.length === 0) return [];
  const model = ruleset.modele;
  const groups = ruleset.electorat.groupes;
  const inscrits = largestRemainder(
    ruleset.electorat.inscrits.valeur,
    groups.map((g) => g.part),
  );
  const week = state.meta.week;
  const differential = round === 2 ? model.secondTour.abstentionDifferentielle : 0;

  return groups.map((group, g) => {
    const factors = contenders.map((contender) => {
      const rng = stream(state.meta.seed, week, purpose, round, group.id, contender.id);
      const alea = (rng.nextFloat() * 2 - 1) * model.alea;
      const extra = round === 2 ? secondRoundFactors(state, ruleset, group.id, contender) : [];
      return utilityFactors(group, contender, model, alea, extra);
    });
    return {
      group,
      inscrits: inscrits[g]!,
      turnout: turnout(group, contenders, model, differential),
      blancs: blankRate(group, contenders, model, round),
      nuls: round === 1 ? model.blancsNuls.nulsT1 : model.blancsNuls.nulsT2,
      contenders,
      probabilities: softmax(factors.map(sumFactors)),
      factors,
    };
  });
}

// `+ 0` ramène −0 à 0 : l'état doit survivre à un aller-retour JSON sans différence.
const round3 = (value: number) => Math.round(value * 1000) / 1000 + 0;

/**
 * Intentions de vote attendues (non publiées) et décomposition moyenne des facteurs de chaque
 * candidat, pondérée par le poids électoral (suffrages exprimés attendus) de chaque groupe.
 */
export function summarize(
  distributions: readonly GroupDistribution[],
  week: number,
  round: Round,
): Opinion | null {
  if (distributions.length === 0) return null;
  const contenders = distributions[0]!.contenders;
  const expressed = distributions.map((d) => d.inscrits * d.turnout * (1 - d.blancs - d.nuls));
  const totalExpressed = expressed.reduce((a, b) => a + b, 0);
  const totalInscrits = distributions.reduce((a, d) => a + d.inscrits, 0);
  const totalVotants = distributions.reduce((a, d) => a + d.inscrits * d.turnout, 0);

  const shares = contenders.map((_, c) =>
    distributions.reduce((sum, d, g) => sum + expressed[g]! * d.probabilities[c]!, 0),
  );
  const values = largestRemainder(10_000, shares);
  const intentions: Record<string, number> = {};
  const breakdown: Record<string, UtilityFactor[]> = {};
  contenders.forEach((contender, c) => {
    intentions[contender.id] = values[c]!;
    const labels = distributions[0]!.factors[c]!.map((f) => f.label);
    const extraLabels = new Set(distributions.flatMap((d) => d.factors[c]!.map((f) => f.label)));
    const allLabels = [...labels, ...[...extraLabels].filter((l) => !labels.includes(l))];
    breakdown[contender.id] = allLabels.map((label) => ({
      label,
      value: round3(
        distributions.reduce(
          (sum, d, g) =>
            sum + expressed[g]! * (d.factors[c]!.find((f) => f.label === label)?.value ?? 0),
          0,
        ) / totalExpressed,
      ),
    }));
  });
  return {
    week,
    round,
    participation: Math.round((totalVotants / totalInscrits) * 10_000),
    intentions,
    breakdown,
  };
}
