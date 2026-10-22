import {
  candidateName,
  type ElectorateGroup,
  type GameState,
  type Opinion,
  type Ruleset,
  type UtilityFactor,
} from '@r2027/shared';
import { credibility, programmeAppeal } from '../campaign/programme';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { largestRemainder } from './apportion';
import { debateVoteFactors } from './debats';
import {
  blankRate,
  distance,
  softmax,
  sumFactors,
  turnout,
  utilityFactors,
  type Contender,
} from './model';

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

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Dynamique de campagne (phase 11) : pente de la popularité, écart entre la moyenne des trois
 * dernières semaines et celle des trois précédentes (au début de la partie, des semaines
 * disponibles). Plus lisse qu'un écart de semaine à semaine : une variation passagère ne fait
 * pas osciller les intentions.
 */
export function momentum(popularity: readonly number[]): number {
  if (popularity.length < 2) return 0;
  const recent = popularity.slice(-3);
  const before = popularity.slice(-6, -3);
  const older = before.length > 0 ? before : popularity.slice(0, 1);
  return Math.round(mean(recent) - mean(older));
}

/** Candidats en lice : au premier tour tous les candidats, au second les deux qualifiés. */
export function contendersFromState(state: GameState, round: Round): Contender[] {
  const status = round === 1 ? 'candidat' : 'qualifie';
  return Object.values(state.actors)
    .filter((actor) => actor.status === status)
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((actor) => ({
      id: actor.id,
      position: actor.candidate.positionnement,
      notoriete: actor.resources.notoriete,
      popularite: actor.resources.popularite,
      dynamique: momentum([...actor.history.popularite, actor.resources.popularite]),
    }));
}

/**
 * Facteurs de campagne (phase 5, §5.1) : attrait du programme pour le groupe, crédibilité du
 * programme, indice médiatique de la semaine passée et soutien des candidats ralliés.
 */
function campaignFactors(
  state: GameState,
  ruleset: Ruleset,
  group: ElectorateGroup,
  contender: Contender,
): UtilityFactor[] {
  const model = ruleset.modele;
  const actor = state.actors[contender.id]!;
  // Le jeu ne prête aucune proposition à une personnalité réelle adverse : ses facteurs
  // « Programme » et « Crédibilité » restent neutres (phase 5 bis).
  const simulatedProgramme = !(actor.candidate.nature === 'reel' && actor.kind === 'adversaire');
  const factors: UtilityFactor[] = [
    {
      label: 'Programme',
      value: simulatedProgramme
        ? model.programme * programmeAppeal(actor.programme, group, ruleset)
        : 0,
    },
    {
      label: 'Crédibilité',
      value: simulatedProgramme
        ? model.credibilite * credibility(actor.programme, ruleset).value
        : 0,
    },
    { label: 'Médias', value: model.medias * (state.medias?.indice[contender.id] ?? 0) },
    ...digitalFactors(ruleset, group, actor.resources),
  ];
  for (const alliance of state.alliances) {
    if (alliance.vers !== contender.id) continue;
    const ally = state.actors[alliance.de];
    if (!ally) continue;
    const weight = ally.resources.popularite / 10_000;
    const closeness = Math.max(0, 1 - distance(group.position, ally.candidate.positionnement));
    factors.push({
      label: `Ralliement de ${candidateName(ally.candidate)}`,
      value: model.alliances * weight * closeness,
    });
  }
  return factors;
}

/**
 * Facteurs des réseaux et nouveaux médias (phase 9, hypothèses du jeu) : écho chez les 18-34 ans,
 * pondéré par groupe d'électeurs autour d'une valeur neutre, et dynamique de campagne (buzz).
 */
export function digitalFactors(
  ruleset: Ruleset,
  group: ElectorateGroup,
  resources: { jeunesse: number; dynamique: number },
): UtilityFactor[] {
  const { modele } = ruleset.numerique;
  return [
    {
      label: 'Écho chez les 18-34 ans',
      value:
        ((modele.jeunesse[group.id] ?? 0) * (resources.jeunesse - modele.referenceJeunesse)) /
        10_000,
    },
    { label: 'Buzz sur les réseaux', value: (modele.elan * resources.dynamique) / 10_000 },
  ];
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

/** Semaines de chocs passés retenues dans l'incertitude persistante de l'opinion. */
const MEMOIRE_INCERTITUDE = 12;

/**
 * Part d'incertitude de l'opinion (phase 11), pour un candidat et chaque groupe d'électeurs :
 * moyenne des chocs des dernières semaines, pondérée par la persistance du jeu de règles et
 * normalisée pour garder l'amplitude d'un choc unique ; elle varie donc peu d'une semaine à
 * l'autre (persistance nulle : tirage indépendant). Un flux par candidat et par semaine tire les
 * chocs de tous les groupes, dans l'ordre du jeu de règles.
 */
function persistentAleas(
  seed: string,
  week: number,
  round: Round,
  contenderId: string,
  groupCount: number,
  model: Ruleset['modele'],
): number[] {
  const rho = model.persistanceIncertitude;
  const sums = new Array<number>(groupCount).fill(0);
  let norm = 0;
  for (let k = 0; k < MEMOIRE_INCERTITUDE && week - k >= 0; k++) {
    const weight = rho ** k;
    if (weight === 0) break;
    const rng = stream(seed, week - k, 'opinion', round, contenderId);
    for (let g = 0; g < groupCount; g++) sums[g]! += weight * (rng.nextFloat() * 2 - 1);
    norm += weight * weight;
  }
  return sums.map((sum) => (model.alea * sum) / Math.sqrt(norm));
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

  // Opinion de la semaine : incertitude persistante (moyenne pondérée des chocs passés) ;
  // jour du scrutin : tirage propre au scrutin.
  const persistent =
    purpose === 'opinion'
      ? contenders.map((c) =>
          persistentAleas(state.meta.seed, week, round, c.id, groups.length, model),
        )
      : null;

  return groups.map((group, g) => {
    const factors = contenders.map((contender, c) => {
      const alea = persistent
        ? persistent[c]![g]!
        : (stream(state.meta.seed, week, purpose, round, group.id, contender.id).nextFloat() * 2 -
            1) *
          model.alea;
      const extra = [
        ...campaignFactors(state, ruleset, group, contender),
        ...(round === 2
          ? secondRoundFactors(state, ruleset, group.id, contender)
          : debateVoteFactors(state, ruleset, contender.id)),
      ];
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

/** Poids électoral (part des suffrages exprimés attendus) et parts des candidats, par groupe. */
export type GroupShares = { poids: number; parts: Record<string, number> }[];

export function groupShares(distributions: readonly GroupDistribution[]): GroupShares {
  const expressed = distributions.map((d) => d.inscrits * d.turnout * (1 - d.blancs - d.nuls));
  const total = expressed.reduce((a, b) => a + b, 0) || 1;
  return distributions.map((d, g) => ({
    poids: expressed[g]! / total,
    parts: Object.fromEntries(d.contenders.map((c, i) => [c.id, d.probabilities[i]!])),
  }));
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
