import type { Actor, GameState } from './game';
import type { DistrictOutcome, LegislativeOutcome } from './legislatives-etat';
import type { Position } from './politics';
import type { ActionDefinition, Ruleset } from './ruleset';

// Règles du mandat partagées par le moteur et l'interface (phase 13) : effets thématiques des
// ministres, disponibilité des actions du chef de l'État, groupe de l'Assemblée du joueur et
// regroupement des résultats des législatives par département. Fonctions pures : l'interface
// les emploie pour afficher exactement ce que le moteur applique, sans rien simuler.

type Theme = Ruleset['quinquennat']['equipe']['themes'][number];

/** Thème (domaines, indicateurs) d'un poste du gouvernement, s'il en a un. */
export function themeOfPost(ruleset: Ruleset, posteId: string): Theme | undefined {
  return ruleset.quinquennat.equipe.themes.find((t) => t.posteId === posteId);
}

/** Poste du gouvernement dont relève un domaine du programme, ou null. */
export function postOfDomain(ruleset: Ruleset, domaine: string): string | null {
  return (
    ruleset.quinquennat.equipe.themes.find((t) => t.domaines.includes(domaine))?.posteId ?? null
  );
}

/** Effet d'une compétence (0 à 1) : poids × (compétence − 0,5) ; positif au-dessus de 0,5. */
export function competenceShift(weight: number, competence: number): number {
  return weight * (competence - 0.5);
}

/** Soutien supplémentaire des groupes aux textes du domaine d'un ministre de cette compétence. */
export function themeSupport(ruleset: Ruleset, competence: number): number {
  return competenceShift(ruleset.quinquennat.equipe.soutienTheme, competence);
}

/** Coefficient des effets d'une action du président liée au poste d'un ministre de cette compétence. */
export function actionCompetenceFactor(ruleset: Ruleset, competence: number): number {
  return Math.max(0, 1 + competenceShift(ruleset.quinquennat.equipe.actionPoste, competence));
}

/** Effet hebdomadaire d'un ministre sur chacun des indicateurs de son poste (centièmes, arrondis). */
export function themeIndicatorEffects(
  ruleset: Ruleset,
  posteId: string,
  competence: number,
): { indicateur: Theme['indicateurs'][number]['indicateur']; valeur: number }[] {
  return (themeOfPost(ruleset, posteId)?.indicateurs ?? [])
    .map((i) => ({
      indicateur: i.indicateur,
      valeur: Math.round(competenceShift(i.parSemaine, competence)) + 0,
    }))
    .filter((e) => e.valeur !== 0);
}

type Seats = { groupes: Record<string, { sieges: number }> };

/** Sièges pourvus de l'Assemblée. */
export function filledSeats(parliament: Seats): number {
  return Object.values(parliament.groupes).reduce((sum, g) => sum + g.sieges, 0);
}

/** Majorité des membres composant l'Assemblée (sièges pourvus) : 289 quand les 577 le sont. */
export function membersMajority(parliament: Seats): number {
  return Math.floor(filledSeats(parliament) / 2) + 1;
}

/** Sièges des groupes qui soutiennent le président. */
export function supportSeats(parliament: {
  groupes: Record<string, { sieges: number; alignement: string }>;
}): number {
  return Object.values(parliament.groupes)
    .filter((g) => g.alignement === 'soutien')
    .reduce((sum, g) => sum + g.sieges, 0);
}

/** Fenêtre (semaines) pendant laquelle une crise justifie un sommet de crise. */
export const RECENT_CRISIS_WEEKS = 4;

/** Une crise est-elle survenue dans les quatre dernières semaines (sommet de crise) ? */
export function recentCrisis(state: Pick<GameState, 'eventHistory' | 'meta'>): boolean {
  return Object.entries(state.eventHistory).some(
    ([id, h]) => id.startsWith('crise-') && state.meta.week - h.lastWeek <= RECENT_CRISIS_WEEKS,
  );
}

/** Motif d'indisponibilité d'une action du président (délai, condition), ou null. */
export function presidentialActionBlocked(
  state: Pick<GameState, 'eventHistory' | 'meta' | 'quinquennat'>,
  definition: Pick<ActionDefinition, 'delaiSemaines' | 'condition' | 'id'>,
): string | null {
  const last = state.quinquennat?.usages[definition.id];
  if (definition.delaiSemaines !== undefined && last !== undefined) {
    const left = definition.delaiSemaines - (state.meta.week - last);
    if (left > 0)
      return `Encore ${left} semaine(s) avant de pouvoir renouveler cette action (une fois toutes les ${definition.delaiSemaines} semaines au plus).`;
  }
  if (definition.condition === 'crise-recente' && !recentCrisis(state))
    return `Aucune crise dans les ${RECENT_CRISIS_WEEKS} dernières semaines : un sommet de crise n’a pas lieu d’être.`;
  return null;
}

/** Distance entre deux positions : même calcul (et même arrondi) que le moteur électoral. */
const distanceOf = (a: Position, b: Position) =>
  Math.hypot(a.economie - b.economie, a.societe - b.societe) / 100;

/** Groupe de l'Assemblée le plus proche d'une position (le plus nombreux à égalité). */
export function closestGroup(ruleset: Ruleset, position: Position): string | null {
  const groups = ruleset.assemblee.groupes.filter((g) => !g.nonInscrits);
  let best: (typeof groups)[number] | undefined;
  let bestDistance = Infinity;
  for (const group of groups) {
    const d = distanceOf(group.position, position);
    if (
      d < bestDistance - 1e-9 ||
      (Math.abs(d - bestDistance) <= 1e-9 && group.sieges > (best?.sieges ?? -1))
    ) {
      best = group;
      bestDistance = d;
    }
  }
  return best?.id ?? null;
}

/**
 * Groupe de l'Assemblée d'un candidat : celui de sa personnalité réelle (table de rattachement
 * du jeu), sinon le groupe le plus proche de son positionnement (convention du jeu).
 */
export function groupOfActor(
  ruleset: Ruleset,
  actor: Pick<Actor, 'candidate'>,
): { groupe: string | null; convention: boolean } {
  const personality = actor.candidate.personnaliteId;
  const attached = personality
    ? ruleset.figures.rattachements.find((r) => r.personnaliteId === personality)?.groupe
    : undefined;
  if (attached) return { groupe: attached, convention: false };
  return { groupe: closestGroup(ruleset, actor.candidate.positionnement), convention: true };
}

/** Position d'un bloc : moyenne de celles de ses groupes, pondérée par leurs sièges importés. */
export function blocPositions(ruleset: Ruleset): Map<string, Position> {
  const positions = new Map<string, Position>();
  for (const bloc of ruleset.legislatives.blocs) {
    const groups = ruleset.assemblee.groupes.filter((g) => bloc.groupes.includes(g.id));
    const seats = groups.reduce((sum, g) => sum + g.sieges, 0) || groups.length;
    const weight = (g: (typeof groups)[number]) => (seats === groups.length ? 1 : g.sieges);
    positions.set(bloc.id, {
      economie: Math.round(groups.reduce((s, g) => s + weight(g) * g.position.economie, 0) / seats),
      societe: Math.round(groups.reduce((s, g) => s + weight(g) * g.position.societe, 0) / seats),
    });
  }
  return positions;
}

/** Bloc le plus proche d'une position : le camp d'un candidat aux législatives. */
export function closestBloc(ruleset: Ruleset, position: Position): string {
  const positions = blocPositions(ruleset);
  return [...positions.entries()].sort(
    (a, b) =>
      distanceOf(position, a[1]) - distanceOf(position, b[1]) ||
      (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )[0]![0];
}

/** Code du département d'une circonscription (« 0101 » → « 01 », « 97101 » → « 971 »). */
export function departementOfDistrict(code: string): string {
  return code.slice(0, -2);
}

/** Résultat des législatives regroupé pour un département. */
export type LegislativeDepartment = {
  departement: string;
  circonscriptions: number;
  inscrits: number;
  votants: number;
  exprimes: number;
  /** Voix par bloc au tour choisi. */
  voix: Record<string, number>;
  /** Sièges par bloc (élus au premier tour, puis au second). */
  sieges: Record<string, number>;
};

/**
 * Regroupe des résultats simulés par département : voix du tour choisi (au second tour, celles
 * des circonscriptions où il a eu lieu) et sièges des élus connus.
 */
export function legislativeDepartments(
  districts: readonly DistrictOutcome[],
  tour: 1 | 2,
): Map<string, LegislativeDepartment> {
  const result = new Map<string, LegislativeDepartment>();
  for (const d of districts) {
    const code = departementOfDistrict(d.code);
    const entry = result.get(code) ?? {
      departement: code,
      circonscriptions: 0,
      inscrits: 0,
      votants: 0,
      exprimes: 0,
      voix: {},
      sieges: {},
    };
    entry.circonscriptions += 1;
    const round = tour === 2 ? d.t2 : d.t1;
    if (round) {
      entry.inscrits += d.inscrits;
      entry.votants += round.votants;
      entry.exprimes += round.exprimes;
      for (const [bloc, n] of Object.entries(round.voix))
        entry.voix[bloc] = (entry.voix[bloc] ?? 0) + n;
    }
    if (d.elu && (tour === 2 || d.tour === 1)) entry.sieges[d.elu] = (entry.sieges[d.elu] ?? 0) + 1;
    result.set(code, entry);
  }
  return result;
}

/**
 * Législatives de 2024 (résultats réels du jeu de règles) regroupées par département et par
 * bloc : voix du premier tour et sièges selon la nuance de l'élu.
 */
export function realLegislativeDepartments(ruleset: Ruleset): Map<string, LegislativeDepartment> {
  const blocOf = new Map(
    ruleset.legislatives.blocs.flatMap((b) => b.nuances.map((n) => [n, b.id])),
  );
  const result = new Map<string, LegislativeDepartment>();
  for (const d of ruleset.legislatives2024.circonscriptions) {
    const entry = result.get(d.departement) ?? {
      departement: d.departement,
      circonscriptions: 0,
      inscrits: 0,
      votants: 0,
      exprimes: 0,
      voix: {},
      sieges: {},
    };
    entry.circonscriptions += 1;
    entry.inscrits += d.inscrits;
    entry.votants += d.votants;
    entry.exprimes += d.exprimes;
    for (const [nuance, n] of Object.entries(d.voix)) {
      const bloc = blocOf.get(nuance);
      if (bloc) entry.voix[bloc] = (entry.voix[bloc] ?? 0) + n;
    }
    const elected = blocOf.get(d.elu.nuance);
    if (elected) entry.sieges[elected] = (entry.sieges[elected] ?? 0) + 1;
    result.set(d.departement, entry);
  }
  return result;
}

/** Sièges par bloc d'un résultat de législatives (raccourci d'affichage). */
export function seatsOf(outcome: Pick<LegislativeOutcome, 'siegesParBloc'>, bloc: string): number {
  return outcome.siegesParBloc[bloc] ?? 0;
}
