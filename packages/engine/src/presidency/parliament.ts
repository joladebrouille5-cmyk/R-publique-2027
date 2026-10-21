import {
  type Actor,
  type Alignment,
  type AssemblyGroup,
  type Bill,
  type BillVote,
  type Censure,
  type GameState,
  type GroupVote,
  type Parliament,
  type PendingDecision,
  type Proposal,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { proximity } from '../ai/relations';
import { proposalsById } from '../campaign/programme';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';

// Assemblée nationale (phase 6, P6-04). Composition réelle importée (groupes et sièges, sans
// nom de député) ; tout le reste est simulé : chaque groupe vote en bloc, avec sa discipline,
// selon la proximité entre sa position et celle du texte et sa position à l'égard du
// président ; les concessions élargissent le soutien mais réduisent l'effet de la réforme.
// Règles citées de la Constitution : censure signée par un dixième des membres et adoptée à la
// majorité des membres (art. 49), un engagement de responsabilité hors lois financières par
// session ordinaire, ouverte en octobre (art. 28), dernier mot à l'Assemblée (art. 45). Une
// réforme rejetée ou retirée n'est jamais appliquée ; une réforme adoptée entre en vigueur
// après le délai de sa proposition.

export const BILL_DECISION_EVENT = 'conduite-texte';
export type BillChoice = 'voter' | 'negocier' | '49-3' | 'retirer';
const CHOICES: readonly BillChoice[] = ['voter', 'negocier', '49-3', 'retirer'];
const IN_PROGRESS = new Set(['commission', 'seance', 'navette', 'lecture_definitive']);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const positioned = (g: AssemblyGroup) => ({ id: g.id, candidate: { positionnement: g.position } });

/** Groupes du jeu de règles, dans l'ordre du fichier importé. */
export function assemblyGroups(ruleset: Ruleset): readonly AssemblyGroup[] {
  return ruleset.assemblee.groupes;
}

/** Position d'un groupe à l'égard du président, d'après la proximité de leurs positions. */
export function alignmentOf(ruleset: Ruleset, group: AssemblyGroup, president: Actor): Alignment {
  const p = proximity(president, positioned(group));
  const { seuilSoutien, seuilOpposition } = ruleset.parlement.vote;
  return p >= seuilSoutien ? 'soutien' : p < seuilOpposition ? 'opposition' : 'independant';
}

/**
 * Parlement au début d'un quinquennat : sièges conservés (ou ceux de la composition importée),
 * alignements recalculés par rapport au nouveau président, aucun texte en cours.
 */
export function openParliament(
  ruleset: Ruleset,
  president: Actor,
  previous: Parliament | null,
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
    reformes: previous?.reformes ?? [],
    usage49_3: { session: 0, autres: 0 },
    prochainDepot: 0,
  };
}

export function filledSeats(parliament: Parliament): number {
  return Object.values(parliament.groupes).reduce((sum, g) => sum + g.sieges, 0);
}

/** Majorité des membres composant l'Assemblée (sièges pourvus). */
export function membersMajority(parliament: Parliament): number {
  return Math.floor(filledSeats(parliament) / 2) + 1;
}

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
): number {
  const v = ruleset.parlement.vote;
  const d = distance(group.position, proposal.position);
  return (
    v.poidsProximite * clamp((v.distanceNeutre - d) / v.distanceNeutre, -1, 1) +
    v.poidsAlignement * ALIGNMENT_WEIGHT[alignment] +
    ruleset.parlement.concessions.soutienParConcession * concessions
  );
}

/** Vote d'un groupe : en bloc selon sa discipline ; abstention si le soutien est trop faible. */
function groupVote(
  ruleset: Ruleset,
  group: AssemblyGroup,
  seats: number,
  value: number,
): GroupVote {
  const v = ruleset.parlement.vote;
  const present = Math.round(seats * v.participation);
  const cohesion = group.nonInscrits ? v.cohesionNonInscrits : v.cohesion;
  const bloc = Math.round(present * cohesion);
  const rest = present - bloc;
  if (Math.abs(value) < v.seuilAbstention) {
    const pour = Math.floor(rest / 2);
    return { pour, contre: rest - pour, abstention: bloc };
  }
  return value > 0
    ? { pour: bloc, contre: rest, abstention: 0 }
    : { pour: rest, contre: bloc, abstention: 0 };
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
): BillVote {
  const parliament = state.parlement!;
  const proposal = proposalsById(ruleset).get(bill.propositionId)!;
  const parGroupe: Record<string, GroupVote> = {};
  let pour = 0;
  let contre = 0;
  let abstention = 0;
  for (const group of assemblyGroups(ruleset)) {
    const current = parliament.groupes[group.id];
    if (!current || current.sieges === 0) continue;
    const value =
      support(ruleset, group, current.alignement, proposal, bill.concessions) +
      (noise ? noise(group.id) : 0);
    const vote = groupVote(ruleset, group, current.sieges, value);
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
  };
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
): Censure | null {
  const parliament = state.parlement!;
  const president = state.actors[state.quinquennat!.mandat.presidentId]!;
  const { vote, censure, regles } = ruleset.parlement;
  const opposition = assemblyGroups(ruleset).filter(
    (g) => parliament.groupes[g.id]?.alignement === 'opposition',
  );
  const signatories = opposition.reduce((sum, g) => sum + parliament.groupes[g.id]!.sieges, 0);
  if (signatories < Math.ceil(regles.signaturesCensure * filledSeats(parliament))) return null;
  const reference = ruleset.jeu.opinion.popularite.reference;
  const unpopularity = (reference - president.resources.popularite) / 5_000;
  const parGroupe: Record<string, number> = {};
  let pour = 0;
  for (const group of assemblyGroups(ruleset)) {
    const current = parliament.groupes[group.id];
    if (!current || current.sieges === 0 || current.alignement === 'soutien') continue;
    const near = proximity(president, positioned(group));
    const value =
      (vote.seuilOpposition - near) / 50 +
      censure.poidsPopularite * unpopularity +
      (noise ? noise(group.id) : 0);
    if (value <= 0) continue;
    const cohesion = group.nonInscrits ? vote.cohesionNonInscrits : vote.cohesion;
    const votes = Math.round(Math.round(current.sieges * vote.participation) * cohesion);
    parGroupe[group.id] = votes;
    pour += votes;
  }
  const majorite = membersMajority(parliament);
  return { semaine: state.meta.week, pour, majorite, parGroupe, adoptee: pour >= majorite };
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

/** Effet sur la popularité du président à l'entrée en vigueur (centièmes de point). */
export function reformEffect(ruleset: Ruleset, proposal: Proposal, concessions: number): number {
  const { effetPopulariteMax, accueilNeutre } = ruleset.parlement.reformes;
  const kept = Math.max(0, 1 - ruleset.parlement.concessions.reductionEffet * concessions);
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
  return CHOICES.filter(
    (c) =>
      (c !== 'negocier' || bill.concessions < ruleset.parlement.concessions.max) &&
      (c !== '49-3' || canEngage(state, ruleset)),
  );
}

/**
 * Règle de l'IA (même procédure que le joueur) : voter si la projection est favorable ;
 * sinon négocier tant que c'est possible ; sinon engager la responsabilité du gouvernement si la
 * censure échouerait ; sinon retirer le texte.
 */
export function aiBillChoice(state: GameState, ruleset: Ruleset, bill: Bill): BillChoice {
  const choices = billChoices(state, ruleset, bill);
  const projection = tallyVote(state, ruleset, bill, 'premiere', null);
  if (projection.adopte) return 'voter';
  if (choices.includes('negocier')) return 'negocier';
  if (choices.includes('49-3') && !censureVote(state, ruleset, null)?.adoptee) return '49-3';
  return 'retirer';
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Décision du président joueur pour un texte dont l'adoption n'est pas assurée. */
export function billDecision(state: GameState, ruleset: Ruleset, bill: Bill): PendingDecision {
  const proposal = proposalsById(ruleset).get(bill.propositionId)!;
  const projection = tallyVote(state, ruleset, bill, 'premiere', null);
  const censure = censureVote(state, ruleset, null);
  const { reductionEffet } = ruleset.parlement.concessions;
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
    '49-3': {
      libelle: 'Engager la responsabilité du gouvernement (art. 49 al. 3)',
      description: censure
        ? `Le texte est considéré comme adopté sauf si une motion de censure réunit la majorité des membres (${censure.majorite} voix). Projection de la censure : ${censure.pour} voix. Coût de popularité.`
        : 'Le texte est considéré comme adopté : l’opposition ne réunit pas assez de signatures pour une motion de censure. Coût de popularité.',
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
    description: `Projection du gouvernement : ${projection.pour} pour, ${projection.contre} contre, ${projection.abstention} abstentions (${filledSeats(state.parlement!)} sièges pourvus).`,
    options: billChoices(state, ruleset, bill).map((c) => ({ id: c, ...descriptions[c] })),
    defaultOptionId: aiBillChoice(state, ruleset, bill),
  };
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

function vote(context: Context, bill: Bill, lecture: BillVote['lecture']): ReportEvent {
  const { state, ruleset } = context;
  const result = tallyVote(state, ruleset, bill, lecture, (groupId) => {
    const rng = stream(state.meta.seed, state.meta.week, 'vote', bill.id, lecture, groupId);
    return (rng.nextFloat() * 2 - 1) * ruleset.parlement.vote.alea;
  });
  bill.votes.push(result);
  const title = proposalsById(ruleset).get(bill.propositionId)!.libelle;
  const reading = lecture === 'premiere' ? 'en première lecture' : 'en lecture définitive';
  if (!result.adopte) conclude(context, bill, 'rejete', `rejeté ${reading}`);
  else if (lecture === 'definitive')
    conclude(context, bill, 'adopte', 'adopté en lecture définitive');
  else {
    bill.etape = 'navette';
    bill.echeance = state.meta.week + ruleset.parlement.calendrier.navetteSemaines;
  }
  return event(
    state,
    `vote-${bill.id}-${lecture}`,
    `« ${title} » ${result.adopte ? 'adopté' : 'rejeté'} ${reading} : ${result.pour} pour, ${result.contre} contre`,
    `${result.abstention} abstentions. ${describeVote(ruleset, result)}`,
  );
}

function engage(context: Context, bill: Bill, presidentId: string, events: ReportEvent[]): boolean {
  const { state, ruleset, ledger, step } = context;
  const parliament = state.parlement!;
  const session = sessionOf(ruleset, state.meta.date);
  parliament.usage49_3 = {
    session,
    autres: (parliament.usage49_3.session === session ? parliament.usage49_3.autres : 0) + 1,
  };
  bill.procedure = '49-3';
  const title = proposalsById(ruleset).get(bill.propositionId)!.libelle;
  ledger.apply(presidentId, 'popularite', [
    {
      label: `Recours à l’article 49 alinéa 3 sur « ${title} »`,
      value: -ruleset.parlement.censure.coutPopularite49_3,
      source: 'decision',
      step,
    },
  ]);
  const censure = censureVote(state, ruleset, (groupId) => {
    const rng = stream(state.meta.seed, state.meta.week, 'censure', bill.id, groupId);
    return (rng.nextFloat() * 2 - 1) * ruleset.parlement.vote.alea;
  });
  bill.censure = censure;
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
      events.push(vote(context, bill, 'premiere'));
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
        events.push(vote(context, bill, 'premiere'));
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
    ledger.apply(presidentId, 'popularite', [
      {
        label: `Entrée en vigueur : ${proposal.libelle}`,
        value: reformEffect(ruleset, proposal, reform.concessions),
        source: 'differe',
        step,
      },
    ]);
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

  if (quinquennat.gouvernement === null || censured) return { events, censured };

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
        id: `texte-${parliament.textes.length + 1}`,
        propositionId: next,
        deposeSemaine: week,
        etape: 'commission',
        echeance: week + calendrier.commissionSemaines,
        concessions: 0,
        procedure: 'ordinaire',
        votes: [],
        censure: null,
        issue: null,
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
      const projection = tallyVote(state, ruleset, bill, 'premiere', null);
      const comfortable =
        projection.adopte &&
        projection.pour >= projection.contre * (1 + ruleset.parlement.vote.margeConfort);
      if (comfortable) {
        events.push(vote(context, bill, 'premiere'));
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
    if (bill.etape === 'lecture_definitive') events.push(vote(context, bill, 'definitive'));
  }
  return { events, censured };
}
