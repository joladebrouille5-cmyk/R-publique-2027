import {
  addDays,
  daysFromCivil,
  formatIsoDate,
  isoWeekday,
  parseIsoDate,
  type Actor,
  type DistrictOutcome,
  type GameState,
  type LegislativeOutcome,
  type LegislativesState,
  type Parliament,
  type Position,
  type ReportEvent,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { largestRemainder } from '../election/apportion';
import { distance } from '../election/model';
import { daysBetween, weekReaches } from './dates';
import { alignmentOf, membersMajority } from './parliament';

// Législatives (phase 6, P6-07). Base : résultats de 2024 par circonscription (ministère de
// l'Intérieur), voix regroupées par bloc. Simulation (hypothèses du jeu de règles) : un
// candidat par bloc et par circonscription ; voix de 2024 modulées par l'écart national de
// chaque bloc (élan présidentiel, popularité du président, aléa) et un aléa local ; élu au
// premier tour avec la majorité absolue des exprimés et au moins 25 % des inscrits ; second tour
// ouvert aux blocs ayant réuni 12,5 % des inscrits (sinon les deux premiers), avec des reports
// selon la proximité des blocs ; 577 sièges, répartis ensuite entre les groupes de chaque bloc.

type Votes = Record<string, number>;
const POPULARITY_EFFECT_MAX = 0.1;

export function blocIds(ruleset: Ruleset): string[] {
  return ruleset.legislatives.blocs.map((b) => b.id);
}

export function blocOfNuance(ruleset: Ruleset): Map<string, string> {
  return new Map(
    ruleset.legislatives.blocs.flatMap((b) => b.nuances.map((n) => [n, b.id] as const)),
  );
}

export function blocOfGroup(ruleset: Ruleset): Map<string, string> {
  return new Map(
    ruleset.legislatives.blocs.flatMap((b) => b.groupes.map((g) => [g, b.id] as const)),
  );
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

/** Bloc le plus proche du président (son camp). */
export function presidentBloc(ruleset: Ruleset, president: Actor): string {
  const positions = blocPositions(ruleset);
  return [...positions.entries()].sort(
    (a, b) =>
      distance(president.candidate.positionnement, a[1]) -
        distance(president.candidate.positionnement, b[1]) || compareStrings(a[0], b[0]),
  )[0]![0];
}

/** Voix de 2024 au premier tour, par bloc, dans chaque circonscription. */
function baseVotes(
  ruleset: Ruleset,
): { code: string; inscrits: number; votants: number; voix: Votes }[] {
  const nuances = blocOfNuance(ruleset);
  return ruleset.legislatives2024.circonscriptions.map((d) => {
    const voix: Votes = {};
    for (const [nuance, n] of Object.entries(d.voix)) {
      const bloc = nuances.get(nuance)!;
      voix[bloc] = (voix[bloc] ?? 0) + n;
    }
    return { code: d.code, inscrits: d.inscrits, votants: d.votants, voix };
  });
}

function nationalShares(ruleset: Ruleset): Votes {
  const totals: Votes = {};
  for (const d of baseVotes(ruleset))
    for (const [bloc, n] of Object.entries(d.voix)) totals[bloc] = (totals[bloc] ?? 0) + n;
  return totals;
}

/** Troisième mardi de juin d'une année (fin des pouvoirs de l'Assemblée). */
export function thirdTuesdayOfJune(year: number): string {
  const first = { year, month: 6, day: 1 };
  const weekday = isoWeekday(first);
  const day = 1 + ((2 - weekday + 7) % 7) + 14;
  return formatIsoDate({ year, month: 6, day });
}

/** Élections de fin de législature : second tour le dimanche qui précède la fin des pouvoirs. */
function endOfTermElections(finLegislature: string) {
  const t2 = addDays(finLegislature, -2);
  return { motif: 'fin-de-legislature' as const, t1: addDays(t2, -7), t2 };
}

function seatsByGroup(parliament: Parliament): Record<string, number> {
  return Object.fromEntries(Object.entries(parliament.groupes).map(([id, g]) => [id, g.sieges]));
}

function cohabitation(parliament: Parliament): boolean {
  const opposition = Object.values(parliament.groupes)
    .filter((g) => g.alignement === 'opposition')
    .reduce((sum, g) => sum + g.sieges, 0);
  return opposition >= membersMajority(parliament);
}

/**
 * Législatives au début du premier quinquennat : celles de 2024 (réelles) comme dernières
 * élections, celles de la fin de la législature comme prochaines.
 */
export function openLegislatives(ruleset: Ruleset, parliament: Parliament): LegislativesState {
  const groups = blocOfGroup(ruleset);
  const siegesParBloc: Record<string, number> = Object.fromEntries(
    blocIds(ruleset).map((b) => [b, 0]),
  );
  for (const [id, g] of Object.entries(parliament.groupes))
    siegesParBloc[groups.get(id)!] = (siegesParBloc[groups.get(id)!] ?? 0) + g.sieges;
  const { echeance, finLegislature } = ruleset.legislatives;
  return {
    derniere: {
      motif: 'reelles-2024',
      t1: ruleset.legislatives2024.election.t1,
      t2: ruleset.legislatives2024.election.t2,
      siegesParBloc,
      siegesParGroupe: seatsByGroup(parliament),
      voixT1: nationalShares(ruleset),
      cohabitation: cohabitation(parliament),
      circonscriptions: [],
    },
    prochaine: { motif: 'fin-de-legislature', t1: echeance.t1, t2: echeance.t2 },
    finLegislature: finLegislature.date,
    premierTour: null,
  };
}

/** Motif d'impossibilité de dissoudre, ou null si la dissolution est possible. */
export function dissolutionBlocked(state: GameState, ruleset: Ruleset): string | null {
  const legislatives = state.legislatives;
  if (!legislatives) return 'Aucune Assemblée à dissoudre.';
  if (legislatives.prochaine?.motif === 'dissolution' || legislatives.premierTour)
    return 'Des élections législatives sont déjà en cours.';
  const allowed = addDays(legislatives.derniere.t2, ruleset.legislatives.regles.moratoireJours);
  if (state.meta.date < allowed)
    return `Pas de nouvelle dissolution dans l’année qui suit les élections du ${legislatives.derniere.t2} (possible à partir du ${allowed}).`;
  return null;
}

/** Dissolution : élections générales 20 jours plus tard (un dimanche), second tour une semaine après. */
export function dissolve(state: GameState, ruleset: Ruleset): ReportEvent {
  const { delaiMinJours } = ruleset.legislatives.regles;
  let t1 = addDays(state.meta.date, delaiMinJours);
  while (isoWeekday(parseIsoDate(t1)!) !== 7) t1 = addDays(t1, 1);
  state.legislatives!.prochaine = { motif: 'dissolution', t1, t2: addDays(t1, 7) };
  return {
    id: `dissolution-${state.meta.week}`,
    kind: 'evenement',
    refId: 'legislatives',
    label: 'Dissolution de l’Assemblée nationale',
    description: `Élections législatives anticipées : premier tour le ${t1}, second tour le ${addDays(t1, 7)} (Constitution, art. 12). Les travaux parlementaires sont suspendus d’ici là.`,
    nature: 'simule',
    majeur: true,
    decisionId: null,
  };
}

/** Parts nationales visées pour chaque bloc (somme 1). */
export function nationalTargets(state: GameState, ruleset: Ruleset, president: Actor): Votes {
  const model = ruleset.legislatives.modele;
  const base = nationalShares(ruleset);
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  const shares: Votes = Object.fromEntries(Object.entries(base).map(([b, n]) => [b, n / total]));
  const camp = presidentBloc(ruleset, president);
  const weeks = Math.max(0, daysBetween(state.quinquennat!.mandat.debut, state.meta.date) / 7);
  const elan = model.elanPresidentiel * Math.max(0, 1 - weeks / model.elanSemaines);
  const reference = ruleset.jeu.opinion.popularite.reference;
  const popularity = Math.max(
    -POPULARITY_EFFECT_MAX,
    Math.min(
      POPULARITY_EFFECT_MAX,
      (model.effetPopularite * (president.resources.popularite - reference)) / 10_000,
    ),
  );
  const delta = elan + popularity;
  const rest = 1 - shares[camp]!;
  const rng = stream(state.meta.seed, state.meta.week, 'legislatives', 'national');
  const target: Votes = {};
  for (const bloc of blocIds(ruleset)) {
    const share = shares[bloc] ?? 0;
    const shifted = bloc === camp ? share + delta : share - (rest > 0 ? (delta * share) / rest : 0);
    target[bloc] = Math.max(0.002, shifted + (rng.nextFloat() * 2 - 1) * model.aleaNational);
  }
  const sum = Object.values(target).reduce((a, b) => a + b, 0);
  for (const bloc of Object.keys(target)) target[bloc] = target[bloc]! / sum;
  // Rapport entre la part visée et celle de 2024, appliqué aux voix de chaque circonscription.
  return Object.fromEntries(
    Object.entries(target).map(([b, t]) => [b, shares[b] ? t / shares[b]! : 0]),
  );
}

const ordered = (ruleset: Ruleset, votes: Votes) =>
  blocIds(ruleset)
    .filter((b) => (votes[b] ?? 0) > 0)
    .sort(
      (a, b) => votes[b]! - votes[a]! || blocIds(ruleset).indexOf(a) - blocIds(ruleset).indexOf(b),
    );

/** Premier tour dans chaque circonscription. */
export function firstRound(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
): DistrictOutcome[] {
  const ratios = nationalTargets(state, ruleset, president);
  const { aleaLocal } = ruleset.legislatives.modele;
  const { premierTourInscrits } = ruleset.legislatives.regles;
  return baseVotes(ruleset).map((d) => {
    const rng = stream(state.meta.seed, state.meta.week, 'legislatives', d.code);
    const exprimes = Object.values(d.voix).reduce((a, b) => a + b, 0);
    const blocs = blocIds(ruleset).filter((b) => (d.voix[b] ?? 0) > 0);
    const weights = blocs.map(
      (b) => d.voix[b]! * ratios[b]! * (1 + (rng.nextFloat() * 2 - 1) * aleaLocal),
    );
    const shares = largestRemainder(exprimes, weights);
    const voix: Votes = Object.fromEntries(blocs.map((b, i) => [b, shares[i]!]));
    const [leader] = ordered(ruleset, voix);
    const elected =
      leader !== undefined &&
      voix[leader]! * 2 > exprimes &&
      voix[leader]! >= Math.ceil(premierTourInscrits * d.inscrits);
    return {
      code: d.code,
      inscrits: d.inscrits,
      t1: { votants: Math.min(d.inscrits, Math.max(d.votants, exprimes)), exprimes, voix },
      t2: null,
      elu: elected ? leader! : null,
      tour: 1,
    };
  });
}

/** Second tour là où personne n'a été élu au premier. */
export function secondRound(
  ruleset: Ruleset,
  round1: readonly DistrictOutcome[],
): DistrictOutcome[] {
  const positions = blocPositions(ruleset);
  const { qualificationInscrits } = ruleset.legislatives.regles;
  const { reportMax, distanceReport, blancsNulsT2 } = ruleset.legislatives.modele;
  return round1.map((d) => {
    if (d.elu) return d;
    const ranking = ordered(ruleset, d.t1.voix);
    let qualified = ranking.filter((b) => d.t1.voix[b]! >= qualificationInscrits * d.inscrits);
    if (qualified.length < 2) qualified = ranking.slice(0, 2);
    const voix: Votes = Object.fromEntries(qualified.map((b) => [b, d.t1.voix[b]!]));
    for (const eliminated of ranking.filter((b) => !qualified.includes(b))) {
      const weights = qualified.map((q) =>
        Math.max(0, 1 - distance(positions.get(eliminated)!, positions.get(q)!) / distanceReport),
      );
      const total = weights.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      qualified.forEach((q, i) => {
        voix[q] = voix[q]! + Math.floor((reportMax * d.t1.voix[eliminated]! * weights[i]!) / total);
      });
    }
    const exprimes = Object.values(voix).reduce((a, b) => a + b, 0);
    const votants = Math.min(d.inscrits, Math.round(exprimes / (1 - blancsNulsT2)));
    const winner = [...qualified].sort(
      (a, b) => voix[b]! - voix[a]! || d.t1.voix[b]! - d.t1.voix[a]!,
    )[0]!;
    return { ...d, t2: { votants, exprimes, voix }, elu: winner, tour: 2 };
  });
}

/**
 * Nouvelle Assemblée : sièges des blocs, puis de leurs groupes au prorata de leurs sièges avant
 * l'élection (au plus fort reste) ; alignements recalculés à l'égard du président.
 */
function recompose(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  outcomes: DistrictOutcome[],
) {
  const parliament = state.parlement!;
  const siegesParBloc: Record<string, number> = Object.fromEntries(
    blocIds(ruleset).map((b) => [b, 0]),
  );
  for (const d of outcomes) siegesParBloc[d.elu!] = siegesParBloc[d.elu!]! + 1;
  const groups = ruleset.assemblee.groupes;
  for (const bloc of ruleset.legislatives.blocs) {
    const members = bloc.groupes.filter((g) => parliament.groupes[g]);
    const current = members.map((g) => parliament.groupes[g]!.sieges);
    const weights = current.some((n) => n > 0) ? current : current.map((_, i) => (i === 0 ? 1 : 0));
    const seats = largestRemainder(siegesParBloc[bloc.id]!, weights);
    members.forEach((g, i) => {
      parliament.groupes[g]!.sieges = seats[i]!;
    });
  }
  for (const g of groups)
    if (parliament.groupes[g.id])
      parliament.groupes[g.id]!.alignement = alignmentOf(ruleset, g, president);
  const voixT1: Votes = {};
  for (const d of outcomes)
    for (const [b, n] of Object.entries(d.t1.voix)) voixT1[b] = (voixT1[b] ?? 0) + n;
  return { siegesParBloc, voixT1 };
}

export type LegislativeWeek = {
  report: WeeklyReport['legislatives'];
  events: ReportEvent[];
  /** Nouvelle Assemblée élue cette semaine (le gouvernement doit être renouvelé). */
  newAssembly: boolean;
};

/** Étape 8 du quinquennat : premier ou second tour des législatives tombant cette semaine. */
export function legislativeWeek(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
): LegislativeWeek {
  const legislatives = state.legislatives;
  const none = { report: null, events: [], newAssembly: false };
  if (!legislatives?.prochaine) return none;
  const { prochaine } = legislatives;
  const label = prochaine.motif === 'dissolution' ? 'anticipées' : 'de fin de législature';
  if (!legislatives.premierTour && weekReaches(state.meta.date, prochaine.t1)) {
    const round1 = firstRound(state, ruleset, president);
    legislatives.premierTour = round1;
    const elected = round1.filter((d) => d.elu).length;
    return {
      report: { tour: 1, date: prochaine.t1, elus: elected, siegesParBloc: null },
      events: [
        {
          id: `legislatives-t1-${state.meta.week}`,
          kind: 'evenement',
          refId: 'legislatives',
          label: `Législatives ${label} : premier tour, ${elected} élu(s)`,
          description:
            'Résultats simulés dans les 577 circonscriptions ; second tour la semaine suivante.',
          nature: 'simule',
          majeur: true,
          decisionId: null,
        },
      ],
      newAssembly: false,
    };
  }
  if (legislatives.premierTour && weekReaches(state.meta.date, prochaine.t2)) {
    const outcomes = secondRound(ruleset, legislatives.premierTour);
    const { siegesParBloc, voixT1 } = recompose(state, ruleset, president, outcomes);
    const outcome: LegislativeOutcome = {
      motif: prochaine.motif,
      t1: prochaine.t1,
      t2: prochaine.t2,
      siegesParBloc,
      siegesParGroupe: seatsByGroup(state.parlement!),
      voixT1,
      cohabitation: cohabitation(state.parlement!),
      circonscriptions: outcomes,
    };
    const finLegislature = thirdTuesdayOfJune(
      Number(prochaine.t2.slice(0, 4)) + ruleset.legislatives.regles.dureeAnnees,
    );
    state.legislatives = {
      derniere: outcome,
      prochaine: endOfTermElections(finLegislature),
      finLegislature,
      premierTour: null,
    };
    const elected = outcomes.filter((d) => d.tour === 2).length;
    const blocs = ruleset.legislatives.blocs
      .map((b) => `${b.libelle} ${siegesParBloc[b.id]}`)
      .join(' ; ');
    return {
      report: { tour: 2, date: prochaine.t2, elus: elected, siegesParBloc },
      events: [
        {
          id: `legislatives-t2-${state.meta.week}`,
          kind: 'evenement',
          refId: 'legislatives',
          label: `Législatives ${label} : nouvelle Assemblée${outcome.cohabitation ? ' (cohabitation)' : ''}`,
          description: `Sièges simulés : ${blocs}. Le gouvernement remet sa démission ; un Premier ministre doit être nommé.`,
          nature: 'simule',
          majeur: true,
          decisionId: null,
        },
      ],
      newAssembly: true,
    };
  }
  return none;
}

/** Échéances des législatives dans les quatre semaines (bilan et calendrier). */
export function legislativeNotices(state: GameState, ruleset: Ruleset) {
  const prochaine = state.legislatives?.prochaine;
  if (!prochaine) return [];
  const start = daysFromCivil(parseIsoDate(state.meta.date)!);
  const statut =
    prochaine.motif === 'dissolution' ? ('deduit' as const) : ruleset.legislatives.echeance.statut;
  return (
    [
      ['legislatives-t1', 'Premier tour des élections législatives', prochaine.t1],
      ['legislatives-t2', 'Second tour des élections législatives', prochaine.t2],
    ] as const
  )
    .map(([id, label, date]) => ({
      id,
      label,
      date,
      days: daysFromCivil(parseIsoDate(date)!) - start,
    }))
    .filter((n) => n.days >= 0 && n.days < 28)
    .map((n) => ({
      id: n.id,
      kind: 'scrutin' as const,
      label: n.label,
      date: n.date,
      statut,
      inWeeks: Math.floor(n.days / 7),
    }));
}
