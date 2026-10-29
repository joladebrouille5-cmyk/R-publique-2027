import {
  candidateName,
  competenceShift,
  filledSeats,
  membersMajority,
  postOfDomain,
  themeSupport,
  type Actor,
  type Alignment,
  type AssemblyGroup,
  type Bill,
  type BillVote,
  type Censure,
  type GameState,
  type GroupVote,
  type OppositionIntervention,
  type Parliament,
  type PendingDecision,
  type Proposal,
  type Reform,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { proximity } from '../ai/relations';
import { proposalsById } from '../campaign/programme';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';
import { applyReformToEconomy, type EconomyBook } from './economy';
import { governmentGroups, memberInCharge, memberTraits, postCompetenceOf } from './members';

// Assemblée nationale (phase 6, P6-04). Composition réelle importée (groupes et sièges, sans
// nom de député) ; tout le reste est simulé : chaque groupe vote en bloc, avec sa discipline,
// selon la proximité entre sa position et celle du texte et sa position à l'égard du
// président ; les concessions élargissent le soutien mais réduisent l'effet de la réforme.
// Règles citées de la Constitution : censure signée par un dixième des membres et adoptée à la
// majorité des membres (art. 49), un engagement de responsabilité hors lois financières par
// session ordinaire, ouverte en octobre (art. 28), dernier mot à l'Assemblée (art. 45). Une
// réforme rejetée ou retirée n'est jamais appliquée ; une réforme adoptée entre en vigueur
// après le délai de sa proposition. Phase 11 : un groupe non allié représenté au gouvernement
// (ouverture) soutient davantage les textes et censure moins ; la compétence du Premier
// ministre réduit la propension à censurer (hypothèses de jeu). Phase 13 : le ministre du
// domaine d'un texte en élargit ou en réduit le soutien selon sa compétence ; des frondeurs des
// groupes qui soutiennent le président votent contre (nombres, jamais de nom) ; aux votes clés,
// le premier groupe d'opposition intervient auprès des groupes non alignés ; la tension
// parlementaire nourrit la censure, renchérit le 49.3 et peut provoquer des motions de censure
// spontanées (art. 49 al. 2).

export const BILL_DECISION_EVENT = 'conduite-texte';
export type BillChoice = 'voter' | 'negocier' | 'frondeurs' | '49-3' | 'retirer';
const CHOICES: readonly BillChoice[] = ['voter', 'negocier', 'frondeurs', '49-3', 'retirer'];
const IN_PROGRESS = new Set(['commission', 'seance', 'navette', 'lecture_definitive']);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const positioned = (g: AssemblyGroup) => ({ id: g.id, candidate: { positionnement: g.position } });

/** Groupes du jeu de règles, dans l'ordre du fichier importé. */
export function assemblyGroups(ruleset: Ruleset): readonly AssemblyGroup[] {
  return ruleset.assemblee.groupes;
}

/** Position d'un groupe à l'égard du président, d'après la proximité de leurs positions. */
/** Président tel que le Parlement le voit : sa position suffit. */
type PresidentPosition = { id: string; candidate: Pick<Actor['candidate'], 'positionnement'> };

export function alignmentOf(
  ruleset: Ruleset,
  group: AssemblyGroup,
  president: PresidentPosition,
): Alignment {
  const p = proximity(president, positioned(group));
  const { seuilSoutien, seuilOpposition } = ruleset.parlement.vote;
  return p >= seuilSoutien ? 'soutien' : p < seuilOpposition ? 'opposition' : 'independant';
}

type Seats = { groupes: Record<string, { sieges: number }> };

/**
 * Parlement au début d'un quinquennat : sièges conservés (ou ceux de la composition importée),
 * alignements recalculés par rapport au nouveau président, aucun texte en cours, ni fronde, ni
 * coalition. La tension est calculée dès que l'état du quinquennat est complet (`updateTension`).
 */
export function openParliament(
  ruleset: Ruleset,
  president: PresidentPosition,
  previous: (Seats & { reformes: readonly Reform[] }) | null,
): Parliament {
  return {
    groupes: Object.fromEntries(
      assemblyGroups(ruleset).map((g) => [
        g.id,
        {
          sieges: previous?.groupes[g.id]?.sieges ?? g.sieges,
          alignement: alignmentOf(ruleset, g, president),
        },
      ]),
    ),
    textes: [],
    reformes: [...(previous?.reformes ?? [])],
    usage49_3: { session: 0, autres: 0 },
    prochainDepot: 0,
    tension: { valeur: 0, facteurs: [], censure: null },
    fronde: {},
    apaisement: 0,
    motions: [],
    motionsSession: { session: 0, nombre: 0 },
    coalition: null,
    echauffement: 0,
    qag: [],
  };
}

// Sièges pourvus et majorité des membres : formules partagées avec l'interface.
export { filledSeats, membersMajority };

/** Session ordinaire (année de son ouverture) d'une date du jeu. */
export function sessionOf(ruleset: Ruleset, iso: string): number {
  const year = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= ruleset.parlement.regles.moisOuvertureSession ? year : year - 1;
}

/** Un engagement de responsabilité sur un texte non financier reste-t-il possible ? */
export function canEngage(state: GameState, ruleset: Ruleset): boolean {
  const usage = state.parlement!.usage49_3;
  const session = sessionOf(ruleset, state.meta.date);
  const used = usage.session === session ? usage.autres : 0;
  return used < ruleset.parlement.regles.autres49_3ParSession;
}

const ALIGNMENT_WEIGHT: Record<Alignment, number> = { soutien: 1, independant: 0, opposition: -1 };

/**
 * Soutien d'un groupe à un texte, avant aléa : proximité entre leurs positions (neutre à la
 * distance `distanceNeutre`), position du groupe à l'égard du président, concessions.
 */
function support(
  ruleset: Ruleset,
  group: AssemblyGroup,
  alignment: Alignment,
  proposal: Proposal,
  concessions: number,
  ministerCompetence: number | null,
): number {
  const v = ruleset.parlement.vote;
  const d = distance(group.position, proposal.position);
  return (
    v.poidsProximite * clamp((v.distanceNeutre - d) / v.distanceNeutre, -1, 1) +
    v.poidsAlignement * ALIGNMENT_WEIGHT[alignment] +
    ruleset.parlement.concessions.soutienParConcession * concessions +
    (ministerCompetence === null ? 0 : themeSupport(ruleset, ministerCompetence))
  );
}

/**
 * Compétence du ministre chargé du domaine d'une proposition sur son poste (expertise comprise ;
 * le Premier ministre si le poste est vacant), ou null si aucun poste ne couvre ce domaine ou si
 * Matignon est vacant.
 */
export function domainCompetence(
  state: GameState,
  ruleset: Ruleset,
  proposal: Proposal,
): number | null {
  const poste = postOfDomain(ruleset, proposal.domaine);
  if (!poste) return null;
  const member = memberInCharge(state, poste);
  return member ? postCompetenceOf(state, ruleset, member, poste) : null;
}

/**
 * Part des députés d'un groupe qui soutient le président tentés de voter contre un texte :
 * fronde de fond du groupe, éloignement du texte, impopularité du président, tension
 * parlementaire, compétence du ministre du domaine, appartenance à une coalition ; réduite
 * après une négociation avec les frondeurs. Hypothèses du jeu de règles ; aucun député nommé.
 */
export function rebelShare(
  state: GameState,
  ruleset: Ruleset,
  group: AssemblyGroup,
  bill: Pick<Bill, 'frondeursNegocies'>,
  proposal: Proposal,
  ministerCompetence: number | null,
): number {
  const parliament = state.parlement!;
  const current = parliament.groupes[group.id];
  if (!current || current.alignement !== 'soutien' || current.sieges === 0) return 0;
  const f = ruleset.parlement.frondeurs;
  const president = state.actors[state.quinquennat!.mandat.presidentId]!;
  const reference = ruleset.jeu.opinion.popularite.reference;
  const share = clamp(
    (parliament.fronde[group.id] ?? 0) / current.sieges +
      f.poidsEloignement *
        Math.max(0, distance(group.position, proposal.position) - f.toleranceDistance) +
      f.poidsImpopularite * Math.max(0, (reference - president.resources.popularite) / reference) +
      (f.poidsTension * parliament.tension.valeur) / 100 -
      (ministerCompetence === null ? 0 : competenceShift(f.poidsMinistre, ministerCompetence)) +
      (parliament.coalition?.groupes.includes(group.id) ? f.coalition : 0),
    0,
    f.partMax,
  );
  return bill.frondeursNegocies ? share * (1 - f.negociation.reduction) : share;
}

/**
 * Vote d'un groupe : en bloc selon sa discipline ; abstention si le soutien est trop faible ;
 * quand la ligne du groupe est favorable, ses frondeurs passent dans les voix contre.
 */
function groupVote(
  ruleset: Ruleset,
  group: AssemblyGroup,
  seats: number,
  value: number,
  rebels: number,
): GroupVote {
  const v = ruleset.parlement.vote;
  const present = Math.round(seats * v.participation);
  const cohesion = group.nonInscrits ? v.cohesionNonInscrits : v.cohesion;
  const bloc = Math.round(present * cohesion);
  const rest = present - bloc;
  if (Math.abs(value) < v.seuilAbstention) {
    const pour = Math.floor(rest / 2);
    return { pour, contre: rest - pour, abstention: bloc, frondeurs: 0 };
  }
  if (value > 0) {
    const frondeurs = Math.min(bloc, Math.round(bloc * rebels));
    return { pour: bloc - frondeurs, contre: rest + frondeurs, abstention: 0, frondeurs };
  }
  return { pour: rest, contre: bloc, abstention: 0, frondeurs: 0 };
}

/**
 * Membres du gouvernement rattachés à chaque groupe non allié du président (ouverture), bornés
 * par le jeu de règles.
 */
export function openness(state: GameState, ruleset: Ruleset): Map<string, number> {
  const { membresMax } = ruleset.quinquennat.equipe.ouverture;
  const counts = new Map<string, number>();
  for (const [groupId, count] of governmentGroups(state, ruleset)) {
    const alignment = state.parlement?.groupes[groupId]?.alignement;
    if (alignment && alignment !== 'soutien') counts.set(groupId, Math.min(count, membresMax));
  }
  return counts;
}

/**
 * Décompte d'un vote sur un texte. `noise` fournit l'aléa de chaque groupe (null : projection
 * du gouvernement, sans aléa). Adopté si les voix pour l'emportent sur les voix contre.
 */
export function tallyVote(
  state: GameState,
  ruleset: Ruleset,
  bill: Bill,
  lecture: BillVote['lecture'],
  noise: ((groupId: string) => number) | null,
  intervention: OppositionIntervention | null = null,
): BillVote {
  const parliament = state.parlement!;
  const proposal = proposalsById(ruleset).get(bill.propositionId)!;
  const parGroupe: Record<string, GroupVote> = {};
  let pour = 0;
  let contre = 0;
  let abstention = 0;
  const competence = domainCompetence(state, ruleset, proposal);
  for (const group of assemblyGroups(ruleset)) {
    const current = parliament.groupes[group.id];
    if (!current || current.sieges === 0) continue;
    const value =
      groupSupport(state, ruleset, bill, group.id) -
      (intervention && current.alignement === 'independant' ? intervention.effet : 0) +
      (noise ? noise(group.id) : 0);
    const rebels = rebelShare(state, ruleset, group, bill, proposal, competence);
    const vote = groupVote(ruleset, group, current.sieges, value, rebels);
    parGroupe[group.id] = vote;
    pour += vote.pour;
    contre += vote.contre;
    abstention += vote.abstention;
  }
  return {
    lecture,
    semaine: state.meta.week,
    parGroupe,
    pour,
    contre,
    abstention,
    adopte: pour > contre,
    intervention,
  };
}

/**
 * Soutien d'un groupe à un texte, avant aléa et intervention de l'opposition : proximité,
 * position à l'égard du président, concessions, compétence du ministre du domaine, ouverture.
 */
export function groupSupport(
  state: GameState,
  ruleset: Ruleset,
  bill: Bill,
  groupId: string,
): number {
  const group = assemblyGroups(ruleset).find((g) => g.id === groupId)!;
  const current = state.parlement!.groupes[groupId]!;
  const proposal = proposalsById(ruleset).get(bill.propositionId)!;
  return (
    support(
      ruleset,
      group,
      current.alignement,
      proposal,
      bill.concessions,
      domainCompetence(state, ruleset, proposal),
    ) +
    ruleset.quinquennat.equipe.ouverture.soutienParMembre *
      (openness(state, ruleset).get(groupId) ?? 0)
  );
}

/** Frondeurs d'un vote (somme des groupes). */
export function rebelsOf(vote: Pick<BillVote, 'parGroupe'>): number {
  return Object.values(vote.parGroupe).reduce((sum, g) => sum + g.frondeurs, 0);
}

/** Vote clé : écart projeté entre pour et contre inférieur à la marge du jeu de règles. */
export function isKeyVote(state: GameState, ruleset: Ruleset, projection: BillVote): boolean {
  return (
    Math.abs(projection.pour - projection.contre) <=
    ruleset.parlement.opposition.margeCle * filledSeats(state.parlement!)
  );
}

/**
 * Intervention du premier groupe d'opposition (le plus nombreux) : menée par le candidat
 * fictif battu le plus proche de sa position s'il en est assez proche, sinon par le groupe
 * lui-même. Aucune personnalité réelle ni aucun député réel n'est mis en scène. Null sans
 * groupe d'opposition.
 */
export function oppositionIntervention(
  state: GameState,
  ruleset: Ruleset,
): OppositionIntervention | null {
  const parliament = state.parlement!;
  const [leader] = assemblyGroups(ruleset)
    .filter((g) => {
      const current = parliament.groupes[g.id];
      return current?.alignement === 'opposition' && current.sieges > 0;
    })
    .sort(
      (a, b) =>
        parliament.groupes[b.id]!.sieges - parliament.groupes[a.id]!.sieges ||
        compareStrings(a.id, b.id),
    );
  if (!leader) return null;
  const { distanceMeneur, effet } = ruleset.parlement.opposition;
  const presidentId = state.quinquennat?.mandat.presidentId;
  const [meneur] = Object.values(state.actors)
    .filter(
      (a) =>
        a.candidate.nature === 'fictif' && a.id !== presidentId && a.id !== state.player.actorId,
    )
    .map((a) => ({ id: a.id, d: distance(a.candidate.positionnement, leader.position) }))
    .filter((c) => c.d <= distanceMeneur)
    .sort((a, b) => a.d - b.d || compareStrings(a.id, b.id));
  return { groupe: leader.id, meneur: meneur?.id ?? null, effet };
}

/**
 * Projection du gouvernement pour un texte (sans aléa) : lors d'un vote clé, elle compte déjà
 * l'intervention de l'opposition auprès des groupes non alignés, celle que subira le vote réel.
 * C'est elle qui décide si l'adoption est assurée, que le président soit le joueur ou l'IA.
 */
export function projectVote(
  state: GameState,
  ruleset: Ruleset,
  bill: Bill,
  lecture: BillVote['lecture'],
): BillVote {
  const base = tallyVote(state, ruleset, bill, lecture, null);
  const intervention = isKeyVote(state, ruleset, base)
    ? oppositionIntervention(state, ruleset)
    : null;
  return intervention ? tallyVote(state, ruleset, bill, lecture, null, intervention) : base;
}

/** Récit de l'intervention de l'opposition (aucun propos rapporté). */
export function interventionLabel(
  state: GameState,
  ruleset: Ruleset,
  intervention: OppositionIntervention,
): string {
  const sigle =
    assemblyGroups(ruleset).find((g) => g.id === intervention.groupe)?.sigle ?? intervention.groupe;
  const leader = intervention.meneur ? state.actors[intervention.meneur] : undefined;
  return leader
    ? `${candidateName(leader.candidate)} (personnage fictif) mène l’offensive de l’opposition (${sigle})`
    : `Le groupe ${sigle} mène l’offensive de l’opposition`;
}

/**
 * Motion de censure en réponse à un engagement de responsabilité : déposée par les groupes
 * d'opposition s'ils réunissent un dixième des membres ; chaque groupe non favorable au
 * président la vote en bloc si son éloignement et l'impopularité du président l'y portent.
 * Null si aucune motion n'est recevable.
 */
export function censureVote(
  state: GameState,
  ruleset: Ruleset,
  noise: ((groupId: string) => number) | null,
  intervention: OppositionIntervention | null = null,
): Censure | null {
  const parliament = state.parlement!;
  const president = state.actors[state.quinquennat!.mandat.presidentId]!;
  const { vote, censure, regles, tension } = ruleset.parlement;
  const opposition = assemblyGroups(ruleset).filter(
    (g) => parliament.groupes[g.id]?.alignement === 'opposition',
  );
  const signatories = opposition.reduce((sum, g) => sum + parliament.groupes[g.id]!.sieges, 0);
  if (signatories < Math.ceil(regles.signaturesCensure * filledSeats(parliament))) return null;
  const reference = ruleset.jeu.opinion.popularite.reference;
  const unpopularity = (reference - president.resources.popularite) / 5_000;
  const { equipe } = ruleset.quinquennat;
  const government = state.quinquennat!.gouvernement;
  const competence = government
    ? equipe.censureCompetence *
      (memberTraits(state, ruleset, government.premierMinistre).competence - 0.5)
    : 0;
  const open = openness(state, ruleset);
  const parGroupe: Record<string, number> = {};
  let pour = 0;
  for (const group of assemblyGroups(ruleset)) {
    const current = parliament.groupes[group.id];
    if (!current || current.sieges === 0 || current.alignement === 'soutien') continue;
    const near = proximity(president, positioned(group));
    const value =
      (vote.seuilOpposition - near) / 50 +
      censure.poidsPopularite * unpopularity -
      competence -
      equipe.ouverture.censureParMembre * (open.get(group.id) ?? 0) +
      (tension.effetCensure * (parliament.tension.valeur - 50)) / 50 +
      (intervention && current.alignement === 'independant' ? intervention.effet : 0) +
      (noise ? noise(group.id) : 0);
    if (value <= 0) continue;
    const cohesion = group.nonInscrits ? vote.cohesionNonInscrits : vote.cohesion;
    const votes = Math.round(Math.round(current.sieges * vote.participation) * cohesion);
    parGroupe[group.id] = votes;
    pour += votes;
  }
  const majorite = membersMajority(parliament);
  return {
    semaine: state.meta.week,
    pour,
    majorite,
    parGroupe,
    adoptee: pour >= majorite,
    intervention,
  };
}

/**
 * Accueil d'une réforme dans l'électorat : moyenne pondérée, sur les groupes d'électeurs, de la
 * proximité entre la mesure et le groupe, avec un supplément pour les publics concernés.
 */
export function reformReception(ruleset: Ruleset, proposal: Proposal): number {
  const bonus = ruleset.parlement.reformes.bonusPublics;
  return ruleset.electorat.groupes.reduce(
    (sum, g) =>
      sum +
      g.part *
        (clamp(1 - distance(g.position, proposal.position), -1, 1) +
          (proposal.publics.includes(g.id) ? bonus : 0)),
    0,
  );
}

/** Part de l'effet d'une réforme conservée après les concessions et la négociation avec les frondeurs. */
export function reformKept(
  ruleset: Ruleset,
  concessions: number,
  frondeursNegocies = false,
): number {
  return Math.max(
    0,
    1 -
      ruleset.parlement.concessions.reductionEffet * concessions -
      (frondeursNegocies ? ruleset.parlement.frondeurs.negociation.reductionEffet : 0),
  );
}

/** Effet sur la popularité du président à l'entrée en vigueur (centièmes de point). */
export function reformEffect(
  ruleset: Ruleset,
  proposal: Proposal,
  concessions: number,
  frondeursNegocies = false,
): number {
  const { effetPopulariteMax, accueilNeutre } = ruleset.parlement.reformes;
  const kept = reformKept(ruleset, concessions, frondeursNegocies);
  return Math.round(
    effetPopulariteMax * clamp(reformReception(ruleset, proposal) - accueilNeutre, -1, 1) * kept,
  );
}

/** Semaines entre l'adoption et l'entrée en vigueur : délai de la proposition (au moins une). */
export function reformDelayWeeks(proposal: Proposal): number {
  return Math.max(1, Math.round((proposal.delaiMois * 52) / 12));
}

/** Choix possibles pour un texte en séance. */
export function billChoices(state: GameState, ruleset: Ruleset, bill: Bill): BillChoice[] {
  const rebels = rebelsOf(projectVote(state, ruleset, bill, 'premiere'));
  return CHOICES.filter(
    (c) =>
      (c !== 'negocier' || bill.concessions < ruleset.parlement.concessions.max) &&
      (c !== 'frondeurs' || (!bill.frondeursNegocies && rebels > 0)) &&
      (c !== '49-3' || canEngage(state, ruleset)),
  );
}

/**
 * Règle de l'IA (même procédure que le joueur) : voter si la projection est favorable ;
 * sinon négocier avec les frondeurs si cela suffit ; sinon négocier avec tous les groupes tant
 * que c'est possible ; sinon engager la responsabilité du gouvernement si la censure échouerait ;
 * sinon retirer le texte.
 */
export function aiBillChoice(state: GameState, ruleset: Ruleset, bill: Bill): BillChoice {
  const choices = billChoices(state, ruleset, bill);
  const projection = projectVote(state, ruleset, bill, 'premiere');
  if (projection.adopte) return 'voter';
  if (
    choices.includes('frondeurs') &&
    projectVote(state, ruleset, { ...bill, frondeursNegocies: true }, 'premiere').adopte
  )
    return 'frondeurs';
  if (choices.includes('negocier')) return 'negocier';
  if (choices.includes('49-3') && !censureVote(state, ruleset, null)?.adoptee) return '49-3';
  return 'retirer';
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Décision du président joueur pour un texte dont l'adoption n'est pas assurée. */
export function billDecision(state: GameState, ruleset: Ruleset, bill: Bill): PendingDecision {
  const proposal = proposalsById(ruleset).get(bill.propositionId)!;
  const projection = projectVote(state, ruleset, bill, 'premiere');
  const censure = censureVote(state, ruleset, null, oppositionIntervention(state, ruleset));
  const { reductionEffet } = ruleset.parlement.concessions;
  const { negociation } = ruleset.parlement.frondeurs;
  const rebels = rebelsOf(projection);
  const tension = state.parlement!.tension.valeur;
  const cost = Math.round(
    ruleset.parlement.censure.coutPopularite49_3 *
      (1 + (ruleset.parlement.tension.majoration49_3 * tension) / 100),
  );
  const descriptions: Record<BillChoice, { libelle: string; description: string }> = {
    voter: {
      libelle: 'Soumettre le texte au vote',
      description:
        'Vote en l’état : le texte est adopté si les voix pour l’emportent ; rejeté, il ne sera jamais appliqué.',
    },
    negocier: {
      libelle: 'Négocier des amendements',
      description: `Concession n° ${bill.concessions + 1} : soutien accru de tous les groupes, effet de la réforme réduit de ${Math.round(reductionEffet * 100)} %. Nouveau passage en séance la semaine suivante.`,
    },
    frondeurs: {
      libelle: 'Négocier avec les frondeurs de la majorité',
      description: `Projection : ${plural(rebels, 'frondeur')} dans les groupes qui vous soutiennent. Des garanties ciblées en retiennent ${Math.round(negociation.reduction * 100)} % ; effet de la réforme réduit de ${Math.round(negociation.reductionEffet * 100)} %. Nouveau passage en séance la semaine suivante.`,
    },
    '49-3': {
      libelle: 'Engager la responsabilité du gouvernement (art. 49 al. 3)',
      description: censure
        ? `Le texte est considéré comme adopté sauf si une motion de censure réunit la majorité des membres (${censure.majorite} voix). Projection de la censure : ${censure.pour} voix. Coût de popularité : ${(cost / 100).toFixed(2).replace('.', ',')} point, majoré par la tension parlementaire (${tension}/100) ; la fronde grossit.`
        : `Le texte est considéré comme adopté : l’opposition ne réunit pas assez de signatures pour une motion de censure. Coût de popularité : ${(cost / 100).toFixed(2).replace('.', ',')} point (tension parlementaire ${tension}/100).`,
    },
    retirer: {
      libelle: 'Retirer le texte',
      description: 'Le texte quitte l’ordre du jour ; la mesure n’est pas appliquée.',
    },
  };
  return {
    id: `t-${state.meta.week}-${bill.id}`,
    kind: 'texte',
    eventId: BILL_DECISION_EVENT,
    actorId: state.quinquennat!.mandat.presidentId,
    createdWeek: state.meta.week,
    label: `Projet de loi « ${proposal.libelle} » : adoption incertaine`,
    description:
      `Projection du gouvernement : ${projection.pour} pour, ${projection.contre} contre` +
      (rebels > 0 ? ` (dont ${plural(rebels, 'frondeur')} de la majorité)` : '') +
      `, ${projection.abstention} abstentions (${filledSeats(state.parlement!)} sièges pourvus). Tension parlementaire : ${tension}/100.` +
      (projection.intervention
        ? ` Vote clé, déjà compté : ${interventionLabel(state, ruleset, projection.intervention)} auprès des groupes non alignés.`
        : ''),
    options: billChoices(state, ruleset, bill).map((c) => ({ id: c, ...descriptions[c] })),
    defaultOptionId: aiBillChoice(state, ruleset, bill),
  };
}

/**
 * Fin de semaine : les décisions en attente sur les textes sont recalculées pour la semaine où
 * le président répondra (projection, tension, session du 49.3, option par défaut). Un
 * gouvernement renversé dans la semaine emporte la décision : le texte attend le suivant.
 */
export function refreshBillDecisions(state: GameState, ruleset: Ruleset): void {
  const parliament = state.parlement;
  if (!parliament || !state.quinquennat) return;
  const governed = state.quinquennat.gouvernement !== null;
  state.pendingDecisions = state.pendingDecisions.flatMap((d) => {
    if (d.kind !== 'texte') return [d];
    const bill = parliament.textes.find((b) => d.id === `t-${d.createdWeek}-${b.id}`);
    return bill && bill.etape === 'seance' && governed ? [billDecision(state, ruleset, bill)] : [];
  });
}

export type ParliamentWeek = {
  events: ReportEvent[];
  /** Le gouvernement est renversé par une motion de censure. */
  censured: boolean;
};

type Context = {
  state: GameState;
  ruleset: Ruleset;
  ledger: Ledger;
  /** Registre de l'économie : coût des réformes, tensions dues au 49.3. */
  economy: EconomyBook | null;
  step: number;
  /** Le joueur préside : il décide de la conduite des textes. */
  playerPresides: boolean;
};

function event(
  state: GameState,
  id: string,
  label: string,
  description: string,
  majeur = false,
): ReportEvent {
  return {
    id: `${id}-${state.meta.week}`,
    kind: 'evenement',
    refId: 'parlement',
    label,
    description,
    nature: 'simule',
    majeur,
    decisionId: null,
  };
}

function describeVote(ruleset: Ruleset, vote: BillVote): string {
  const labels = new Map(assemblyGroups(ruleset).map((g) => [g.id, g.sigle]));
  const parts = Object.entries(vote.parGroupe)
    .map(([id, v]) => `${labels.get(id) ?? id} ${v.pour}/${v.contre}/${v.abstention}`)
    .join(' ; ');
  return `Votes des groupes (pour/contre/abstention), simulés : ${parts}.`;
}

function conclude(
  context: Context,
  bill: Bill,
  etape: 'adopte' | 'rejete' | 'retire',
  motif: string,
) {
  const { state, ruleset } = context;
  bill.etape = etape;
  bill.issue = { semaine: state.meta.week, motif };
  if (etape !== 'adopte') return;
  const proposal = proposalsById(ruleset).get(bill.propositionId)!;
  state.parlement!.reformes.push({
    propositionId: bill.propositionId,
    texteId: bill.id,
    adopteeSemaine: state.meta.week,
    vigueurSemaine: state.meta.week + reformDelayWeeks(proposal),
    concessions: bill.concessions,
    appliquee: false,
  });
}

function interventionEvent(
  state: GameState,
  ruleset: Ruleset,
  id: string,
  intervention: OppositionIntervention,
  target: string,
): ReportEvent {
  return event(
    state,
    `intervention-${id}`,
    `${interventionLabel(state, ruleset, intervention)} ${target}`,
    'Vote clé : intervention simulée auprès des groupes non alignés (aucun propos rapporté).',
  );
}

function vote(
  context: Context,
  bill: Bill,
  lecture: BillVote['lecture'],
  events: ReportEvent[],
): void {
  const { state, ruleset } = context;
  const title = proposalsById(ruleset).get(bill.propositionId)!.libelle;
  const { intervention } = projectVote(state, ruleset, bill, lecture);
  if (intervention)
    events.push(
      interventionEvent(
        state,
        ruleset,
        `${bill.id}-${lecture}`,
        intervention,
        `contre « ${title} »`,
      ),
    );
  const result = tallyVote(
    state,
    ruleset,
    bill,
    lecture,
    (groupId) => {
      const rng = stream(state.meta.seed, state.meta.week, 'vote', bill.id, lecture, groupId);
      return (rng.nextFloat() * 2 - 1) * ruleset.parlement.vote.alea;
    },
    intervention,
  );
  bill.votes.push(result);
  const reading = lecture === 'premiere' ? 'en première lecture' : 'en lecture définitive';
  if (!result.adopte) conclude(context, bill, 'rejete', `rejeté ${reading}`);
  else if (lecture === 'definitive')
    conclude(context, bill, 'adopte', 'adopté en lecture définitive');
  else {
    bill.etape = 'navette';
    bill.echeance = state.meta.week + ruleset.parlement.calendrier.navetteSemaines;
  }
  const rebels = rebelsOf(result);
  events.push(
    event(
      state,
      `vote-${bill.id}-${lecture}`,
      `« ${title} » ${result.adopte ? 'adopté' : 'rejeté'} ${reading} : ${result.pour} pour, ${result.contre} contre`,
      `${result.abstention} abstentions${rebels > 0 ? ` ; ${plural(rebels, 'frondeur')} de la majorité contre le texte` : ''}. ${describeVote(ruleset, result)}`,
    ),
  );
}

/** Coefficient de majoration du coût d'un 49.3 par la tension parlementaire. */
export function engagementFactor(state: GameState, ruleset: Ruleset): number {
  return 1 + (ruleset.parlement.tension.majoration49_3 * state.parlement!.tension.valeur) / 100;
}

function engage(context: Context, bill: Bill, presidentId: string, events: ReportEvent[]): boolean {
  const { state, ruleset, ledger, step } = context;
  const parliament = state.parlement!;
  const session = sessionOf(ruleset, state.meta.date);
  const tension = parliament.tension.valeur;
  const factor = engagementFactor(state, ruleset);
  context.economy?.add(
    'tensions',
    `Recours à l’article 49 alinéa 3 (tension parlementaire ${tension}/100)`,
    ruleset.economie.tensions49_3 * factor,
    'decision',
  );
  parliament.usage49_3 = {
    session,
    autres: (parliament.usage49_3.session === session ? parliament.usage49_3.autres : 0) + 1,
  };
  bill.procedure = '49-3';
  const title = proposalsById(ruleset).get(bill.propositionId)!.libelle;
  ledger.apply(presidentId, 'popularite', [
    {
      label: `Recours à l’article 49 alinéa 3 sur « ${title} » (tension parlementaire ${tension}/100)`,
      value: -Math.round(ruleset.parlement.censure.coutPopularite49_3 * factor),
      source: 'decision',
      step,
    },
  ]);
  // La fronde grossit dans les groupes qui soutiennent le président (nombres, aucun nom).
  for (const [groupId, current] of Object.entries(parliament.groupes)) {
    const raise = Math.round(ruleset.parlement.frondeurs.hausse49_3 * current.sieges);
    if (current.alignement !== 'soutien' || raise === 0) continue;
    parliament.fronde[groupId] = Math.min(
      current.sieges,
      (parliament.fronde[groupId] ?? 0) + raise,
    );
  }
  const intervention = oppositionIntervention(state, ruleset);
  const censure = censureVote(
    state,
    ruleset,
    (groupId) => {
      const rng = stream(state.meta.seed, state.meta.week, 'censure', bill.id, groupId);
      return (rng.nextFloat() * 2 - 1) * ruleset.parlement.vote.alea;
    },
    intervention,
  );
  bill.censure = censure;
  if (censure && intervention)
    events.push(
      interventionEvent(state, ruleset, `censure-${bill.id}`, intervention, 'pour la censure'),
    );
  events.push(
    event(
      state,
      `engagement-${bill.id}`,
      `Le gouvernement engage sa responsabilité sur « ${title} » (49.3)`,
      censure
        ? `Motion de censure déposée : ${censure.pour} voix pour, ${censure.majorite} requises (majorité des membres).`
        : 'Aucune motion de censure recevable (moins d’un dixième des membres dans l’opposition).',
      censure?.adoptee === true,
    ),
  );
  if (censure?.adoptee) {
    ledger.apply(presidentId, 'popularite', [
      {
        label: 'Gouvernement renversé par une motion de censure',
        value: -ruleset.parlement.censure.coutPopulariteCensure,
        source: 'evenement',
        step,
      },
    ]);
    conclude(context, bill, 'rejete', 'gouvernement renversé par une motion de censure');
    return true;
  }
  bill.etape = 'navette';
  bill.echeance = state.meta.week + ruleset.parlement.calendrier.navetteSemaines;
  return false;
}

/** Applique un choix sur un texte en séance ; renvoie vrai si le gouvernement est censuré. */
function applyChoice(
  context: Context,
  bill: Bill,
  choice: BillChoice,
  presidentId: string,
  events: ReportEvent[],
): boolean {
  const { state, ruleset } = context;
  const title = proposalsById(ruleset).get(bill.propositionId)!.libelle;
  switch (choice) {
    case 'voter':
      vote(context, bill, 'premiere', events);
      return false;
    case 'frondeurs':
      bill.frondeursNegocies = true;
      bill.echeance = state.meta.week + 1;
      events.push(
        event(
          state,
          `frondeurs-${bill.id}`,
          `Négociation avec les frondeurs de la majorité sur « ${title} »`,
          'Garanties ciblées aux députés de la majorité tentés de voter contre ; effet de la réforme un peu réduit ; nouveau passage en séance la semaine suivante.',
        ),
      );
      return false;
    case 'negocier':
      bill.concessions += 1;
      bill.echeance = state.meta.week + 1;
      events.push(
        event(
          state,
          `concession-${bill.id}`,
          `Amendements négociés sur « ${title} » (concession n° ${bill.concessions})`,
          'Soutien élargi, effet de la réforme réduit ; nouveau passage en séance la semaine suivante.',
        ),
      );
      return false;
    case '49-3':
      if (!canEngage(state, ruleset)) {
        vote(context, bill, 'premiere', events);
        return false;
      }
      return engage(context, bill, presidentId, events);
    case 'retirer':
      conclude(context, bill, 'retire', 'retiré par le gouvernement');
      events.push(
        event(
          state,
          `retrait-${bill.id}`,
          `Retrait du texte « ${title} »`,
          'La mesure ne sera pas appliquée.',
        ),
      );
      return false;
  }
}

/**
 * Étape 5 du quinquennat : réponses du président aux décisions sur les textes, dépôt du
 * prochain texte de la feuille de route, étapes échues (séance, navette, lecture définitive),
 * puis entrée en vigueur des réformes adoptées. Les textes n'avancent pas tant que Matignon
 * est vacant.
 */
export function advanceParliament(
  context: Context,
  answers: readonly { decision: PendingDecision; optionId: string }[],
): ParliamentWeek {
  const { state, ruleset, ledger, step, playerPresides } = context;
  const parliament = state.parlement!;
  const quinquennat = state.quinquennat!;
  const presidentId = quinquennat.mandat.presidentId;
  const week = state.meta.week;
  const events: ReportEvent[] = [];
  const proposals = proposalsById(ruleset);
  let censured = false;
  const fall = () => {
    censured = true;
  };

  // Entrée en vigueur des réformes adoptées dont le délai est écoulé.
  for (const reform of parliament.reformes) {
    if (reform.appliquee || reform.vigueurSemaine > week) continue;
    reform.appliquee = true;
    const proposal = proposals.get(reform.propositionId)!;
    const negotiated =
      parliament.textes.find((b) => b.id === reform.texteId)?.frondeursNegocies ?? false;
    ledger.apply(presidentId, 'popularite', [
      {
        label: `Entrée en vigueur : ${proposal.libelle}`,
        value: reformEffect(ruleset, proposal, reform.concessions, negotiated),
        source: 'differe',
        step,
      },
    ]);
    if (context.economy) {
      const kept = reformKept(ruleset, reform.concessions, negotiated);
      applyReformToEconomy(state, ruleset, context.economy, proposal, kept);
    }
    events.push(
      event(
        state,
        `vigueur-${reform.texteId}`,
        `Entrée en vigueur : « ${proposal.libelle} »`,
        `Réforme adoptée en semaine ${reform.adopteeSemaine}, appliquée après son délai de mise en œuvre (${proposal.delaiMois} mois).`,
      ),
    );
  }

  // Réponses du président joueur sur les textes en séance.
  for (const answer of answers) {
    const bill = parliament.textes.find(
      (b) => answer.decision.id === `t-${answer.decision.createdWeek}-${b.id}`,
    );
    if (!bill || bill.etape !== 'seance' || censured) continue;
    if (applyChoice(context, bill, answer.optionId as BillChoice, presidentId, events)) fall();
  }

  // Matignon vacant ou Assemblée dissoute : les textes attendent.
  const dissolved = state.legislatives?.prochaine?.motif === 'dissolution';
  if (quinquennat.gouvernement === null || censured || dissolved) return { events, censured };

  // Dépôt du prochain texte de la feuille de route (une fois par quinquennat, dépendances adoptées).
  const { calendrier } = ruleset.parlement;
  const inProgress = parliament.textes.filter((b) => IN_PROGRESS.has(b.etape)).length;
  if (week >= parliament.prochainDepot && inProgress < calendrier.textesSimultanesMax) {
    const adopted = new Set(parliament.reformes.map((r) => r.propositionId));
    const deposited = new Set(parliament.textes.map((b) => b.propositionId));
    const next = quinquennat.feuilleDeRoute.find(
      (id) =>
        !deposited.has(id) &&
        !adopted.has(id) &&
        (proposals.get(id)?.dependances ?? []).every((d) => adopted.has(d)),
    );
    if (next) {
      const bill: Bill = {
        // Identifiant unique sur toute la partie (les réformes adoptées survivent au quinquennat).
        id: `texte-${state.cycle.annee}-${parliament.textes.length + 1}`,
        propositionId: next,
        deposeSemaine: week,
        etape: 'commission',
        echeance: week + calendrier.commissionSemaines,
        concessions: 0,
        procedure: 'ordinaire',
        votes: [],
        censure: null,
        issue: null,
        frondeursNegocies: false,
      };
      parliament.textes.push(bill);
      parliament.prochainDepot = week + calendrier.intervalleDepotSemaines;
      events.push(
        event(
          state,
          `depot-${bill.id}`,
          `Dépôt du projet de loi « ${proposals.get(next)!.libelle} »`,
          `Examen en commission pendant ${plural(calendrier.commissionSemaines, 'semaine')}, puis en séance.`,
        ),
      );
    }
  }

  // Étapes échues, dans l'ordre des textes.
  for (const bill of [...parliament.textes].sort((a, b) => compareStrings(a.id, b.id))) {
    if (censured || !IN_PROGRESS.has(bill.etape) || bill.echeance > week) continue;
    const title = proposals.get(bill.propositionId)!.libelle;
    if (bill.etape === 'commission') bill.etape = 'seance';
    if (bill.etape === 'seance') {
      const projection = projectVote(state, ruleset, bill, 'premiere');
      const comfortable =
        projection.adopte &&
        projection.pour >= projection.contre * (1 + ruleset.parlement.vote.margeConfort);
      if (comfortable) {
        vote(context, bill, 'premiere', events);
      } else if (playerPresides) {
        const decision = billDecision(state, ruleset, bill);
        if (!state.pendingDecisions.some((d) => d.id === decision.id))
          state.pendingDecisions.push(decision);
      } else if (
        applyChoice(context, bill, aiBillChoice(state, ruleset, bill), presidentId, events)
      ) {
        fall();
      }
      continue;
    }
    if (bill.etape === 'navette') {
      const rng = stream(state.meta.seed, week, 'senat', bill.id);
      if (rng.nextFloat() < ruleset.parlement.senat.probabiliteAccord) {
        conclude(context, bill, 'adopte', 'adopté dans les mêmes termes par les deux assemblées');
        events.push(
          event(
            state,
            `senat-${bill.id}`,
            `« ${title} » adopté par le Parlement`,
            'Accord du Sénat (simulé) : le texte est définitivement adopté.',
          ),
        );
      } else {
        bill.etape = 'lecture_definitive';
        bill.echeance = week + calendrier.lectureDefinitiveSemaines;
        events.push(
          event(
            state,
            `senat-${bill.id}`,
            `Désaccord avec le Sénat sur « ${title} »`,
            'Désaccord simulé : l’Assemblée nationale statuera définitivement (art. 45).',
          ),
        );
      }
      continue;
    }
    if (bill.etape === 'lecture_definitive') vote(context, bill, 'definitive', events);
  }
  if (!censured && spontaneousMotion(context, presidentId, events)) fall();
  return { events, censured };
}

/**
 * Motion de censure spontanée (art. 49 al. 2), déposée par l'opposition quand la tension
 * dépasse le seuil du jeu de règles : probabilité croissante avec la tension, délai minimal
 * entre deux motions, signatures d'un dixième des membres, au plus trois motions par session
 * ordinaire (simplification de la limite de signatures par député). Vrai si le gouvernement
 * est renversé.
 */
function spontaneousMotion(context: Context, presidentId: string, events: ReportEvent[]): boolean {
  const { state, ruleset, ledger, step } = context;
  const parliament = state.parlement!;
  const rules = ruleset.parlement.tension;
  const tension = parliament.tension.valeur;
  if (state.quinquennat?.gouvernement === null || tension < rules.seuilMotion) return false;
  const session = sessionOf(ruleset, state.meta.date);
  const used = parliament.motionsSession.session === session ? parliament.motionsSession.nombre : 0;
  if (used >= ruleset.parlement.regles.motionsParSession) return false;
  const last = parliament.motions.at(-1);
  if (last && state.meta.week - last.semaine < rules.delaiMotionSemaines) return false;
  const draw = stream(state.meta.seed, state.meta.week, 'motion-spontanee').nextFloat();
  if (draw >= rules.probabiliteParPoint * (tension - rules.seuilMotion + 1)) return false;
  const intervention = oppositionIntervention(state, ruleset);
  const censure = censureVote(
    state,
    ruleset,
    (groupId) => {
      const rng = stream(state.meta.seed, state.meta.week, 'motion', groupId);
      return (rng.nextFloat() * 2 - 1) * ruleset.parlement.vote.alea;
    },
    intervention,
  );
  if (!censure) return false;
  parliament.motionsSession = { session, nombre: used + 1 };
  parliament.motions.push({
    id: `motion-${state.cycle.annee}-${parliament.motions.length + 1}`,
    ...censure,
  });
  if (intervention)
    events.push(
      interventionEvent(
        state,
        ruleset,
        `motion-${state.meta.week}`,
        intervention,
        'pour la censure',
      ),
    );
  events.push(
    event(
      state,
      'motion-spontanee',
      `Motion de censure déposée par l’opposition (art. 49 al. 2) : ${censure.adoptee ? 'adoptée' : 'rejetée'}`,
      `Tension parlementaire ${tension}/100 : ${censure.pour} voix pour la censure, ${censure.majorite} requises (majorité des membres) ; motion n° ${used + 1} de la session.`,
      censure.adoptee,
    ),
  );
  if (!censure.adoptee) return false;
  ledger.apply(presidentId, 'popularite', [
    {
      label: 'Gouvernement renversé par une motion de censure',
      value: -ruleset.parlement.censure.coutPopulariteCensure,
      source: 'evenement',
      step,
    },
  ]);
  return true;
}
