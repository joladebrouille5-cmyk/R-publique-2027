import {
  candidateName,
  type Actor,
  type CandidateIdentity,
  type GameState,
  type Government,
  type MemberRef,
  type Position,
  type PresidentialArchive,
  type QuinquennatReview,
  type RecordRole,
  type ReportEvent,
  type Resources,
  type Ruleset,
  type Succession,
  type SuccessionAnnouncement,
  type UtilityFactor,
} from '@r2027/shared';
import { openingAccount } from '../campaign/finances';
import { emptyParrainages } from '../campaign/parrainages';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';
import { figureById, memberTraits, profileById } from './members';

// Présidentielle suivante (phase 23) : décision de candidature du joueur, candidatures simulées
// des autres candidats, entrants et poids du bilan du quinquennat sur les intentions de vote.
// Paramètres : bloc `succession` du jeu de règles (hypothèses). Tirages par la graine de la
// partie ; aucun propos n'est prêté à une personne réelle : les annonces décrivent des faits de
// jeu, avec leur motif chiffré.

/** Libellé du facteur d'utilité du bilan, dans « Pourquoi ça bouge ? » et le détail. */
export const RECORD_FACTOR_LABEL = 'Bilan du quinquennat';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Arrondi au dix-millième : valeur stable une fois enregistrée dans l'état. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Score du bilan du quinquennat (spec §5) : popularité finale du président au-dessus ou en
 * dessous du pivot, note du mandat sur 20 autour de 10 (10 sans objectifs fixés) et variation du
 * chômage en points (une baisse compte en faveur du sortant), borné à ± `bilan.max`.
 */
export function recordScore(review: QuinquennatReview, ruleset: Ruleset): number {
  const params = ruleset.succession.bilan;
  const popularity = review.fin.popularite ?? params.pivotPopularite;
  const grade = review.note?.valeur ?? 10;
  const start = review.debut.indicateurs?.chomage;
  const end = review.fin.indicateurs?.chomage;
  const unemployment = start !== undefined && end !== undefined ? (end - start) / 100 : 0;
  const raw =
    (params.poidsPopularite * (popularity - params.pivotPopularite)) / 10_000 +
    (params.poidsNote * (grade - 10)) / 10 -
    params.poidsChomage * unemployment;
  return round4(clamp(raw, -params.max, params.max));
}

/**
 * Facteur « Bilan du quinquennat » d'un candidat pendant la campagne qui suit le quinquennat
 * (arrêté à l'ouverture de la campagne) ; aucun facteur hors de cette campagne.
 */
export function recordFactors(state: GameState, contenderId: string): UtilityFactor[] {
  const succession = state.succession;
  if (!succession || state.meta.phase !== 'campagne' || succession.annee !== state.cycle.annee)
    return [];
  const entry = succession.bilan[contenderId];
  return entry ? [{ label: RECORD_FACTOR_LABEL, value: entry.facteur }] : [];
}

// ————————————————————————————————————————————————————————————————————————————————
// Candidatures à l'ouverture de la campagne suivante (spec §2 à §4).

/** Contexte de la présidentielle qui s'achève, relevé avant l'ouverture de la suivante. */
export type SuccessionContext = {
  presidentId: string;
  /** Le président achève son deuxième mandat consécutif (Constitution, art. 6). */
  termLimited: boolean;
  /** Présidentielle archivée du cycle qui s'achève (null si la partie n'en a pas). */
  previous: PresidentialArchive | null;
  /** Dernier gouvernement du quinquennat (null s'il n'y en avait pas en fonction). */
  government: Government | null;
  /** Popularité prêtée des membres du gouvernement (`quinquennat.suivi`). */
  suivi: Record<string, { popularite: number }>;
};

/** Source d'un candidat entrant : figure réelle du vivier ou profil fictif du jeu de règles. */
export type EntrantSource = { nature: 'figure' | 'profil'; ref: string };

const pct = (fraction: number) => `${(fraction * 100).toFixed(1).replace('.', ',')} %`;
const pctCentiemes = (centiemes: number) => pct(centiemes / 10_000);

/** Identifiant de l'acteur entrant : année du cycle et fiche d'origine. */
export const entrantId = (annee: number, source: EntrantSource) => `entrant-${annee}-${source.ref}`;
const ENTRANT_ID = /^entrant-\d{4}-(.+)$/;

/** Fiche d'origine d'un acteur entré lors d'une présidentielle suivante, ou null. */
export function entrantSourceOf(actor: Actor): EntrantSource | null {
  if (actor.candidate.figureId) return { nature: 'figure', ref: actor.candidate.figureId };
  const match = ENTRANT_ID.exec(actor.id);
  return match && match[1]!.startsWith('profil-') ? { nature: 'profil', ref: match[1]! } : null;
}

/** Acteur de la partie qui incarne déjà un membre du gouvernement (ou une fiche), s'il y en a un. */
export function actorOfMember(state: GameState, member: MemberRef | EntrantSource) {
  if (member.nature === 'acteur') return state.actors[member.ref];
  return Object.values(state.actors).find((actor) => {
    const source = entrantSourceOf(actor);
    return source?.nature === member.nature && source.ref === member.ref;
  });
}

/** Moyens de départ d'un candidat entrant (hypothèses du jeu de règles, `succession.entrants`). */
export function entrantResources(ruleset: Ruleset, source: EntrantSource): Resources {
  const params = ruleset.succession.entrants;
  const figure = source.nature === 'figure' ? figureById(ruleset, source.ref) : undefined;
  return {
    ...ruleset.numerique.initial,
    budgetCentimes: params.budgetCentimes,
    militants: params.militants,
    notoriete: figure ? params.notoriete[figure.notoriete.niveau - 1]! : params.notorieteProfil,
    popularite: params.popularite,
    tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
  };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Candidat entrant (spec §3) : une figure réelle du vivier (position estimée d'après l'enquête
 * CHES, aucun programme prêté, candidature simulée) ou un profil fictif du jeu de règles, avec
 * les moyens de départ d'un entrant. Joué par l'IA, ou par le joueur s'il lui passe la main.
 */
export function createEntrantActor(
  source: EntrantSource,
  state: GameState,
  ruleset: Ruleset,
  asPlayer: boolean,
): Actor {
  const figure = source.nature === 'figure' ? figureById(ruleset, source.ref) : undefined;
  const profile = source.nature === 'profil' ? profileById(ruleset, source.ref) : undefined;
  if (!figure && !profile) throw new Error(`Fiche inconnue : ${source.ref}`);
  const candidate: CandidateIdentity = figure
    ? {
        prenom: figure.prenom,
        nom: figure.nom,
        parti: figure.parti,
        positionnement: { economie: figure.position.economie, societe: figure.position.societe },
        parcours: '',
        nature: 'reel',
        profilId: null,
        personnaliteId: null,
        figureId: figure.id,
        photo: null,
      }
    : {
        prenom: profile!.prenom,
        nom: profile!.nom,
        parti: capitalize(profile!.famille),
        positionnement: profile!.positionnement,
        parcours: profile!.parcours,
        nature: 'fictif',
        profilId: null,
        personnaliteId: null,
        photo: null,
      };
  const resources = entrantResources(ruleset, source);
  const ai = ruleset.personnalitesReelles;
  return {
    id: entrantId(state.cycle.annee, source),
    kind: asPlayer ? 'joueur' : 'adversaire',
    label: `Campagne de ${candidateName(candidate)}`,
    candidate,
    style: asPlayer ? null : ai.style,
    toleranceRisque: asPlayer ? null : ai.toleranceRisque,
    resources,
    status: 'candidat',
    history: { popularite: [resources.popularite] },
    equipe: asPlayer ? ruleset.jeu.equipeJoueur : ai.organisation.moyenne.equipe,
    implantation: [],
    objectif: asPlayer ? null : ai.objectif,
    programme: { propositions: [], revirements: 0 },
    parrainages: emptyParrainages(),
    finances: openingAccount(resources.budgetCentimes, ruleset),
    preparationDebat: 0,
    strategie: null,
  };
}

/** Ancien candidat du joueur, devenu acteur de l'IA en passant la main : il ne revient pas. */
const formerPlayer = (actor: Actor) => actor.kind === 'adversaire' && actor.style === null;

/**
 * Probabilité qu'un candidat de la présidentielle précédente se représente (spec §2) : président
 * sortant selon sa popularité finale (0 au terme de deux mandats consécutifs), finaliste battu,
 * éliminé au premier tour selon son score, écarté ou retiré.
 */
export function runProbability(
  actorId: string,
  state: GameState,
  ruleset: Ruleset,
  context: Pick<SuccessionContext, 'presidentId' | 'termLimited' | 'previous'>,
): number {
  const actor = state.actors[actorId]!;
  const params = ruleset.succession.representation;
  if (formerPlayer(actor)) return 0;
  if (actorId === context.presidentId) {
    if (context.termLimited) return 0;
    const { base, pente, pivot, min, max } = params.sortant;
    return clamp(base + (pente * (actor.resources.popularite - pivot)) / 10_000, min, max);
  }
  if (actor.status === 'battu') return params.finaliste;
  if (actor.status === 'elimine') {
    const { base, pente, min, max } = params.elimine;
    return clamp(base + pente * firstRoundShare(context.previous, actorId), min, max);
  }
  return params.autre;
}

function firstRoundShare(previous: PresidentialArchive | null, actorId: string): number {
  if (!previous || previous.t1.exprimes === 0) return 0;
  return (previous.t1.voix[actorId] ?? 0) / previous.t1.exprimes;
}

/** Motif de jeu, chiffré, de la décision d'un candidat de la présidentielle précédente. */
function runMotive(
  actor: Actor,
  context: Pick<SuccessionContext, 'presidentId' | 'termLimited' | 'previous'>,
): string {
  const year = context.previous?.annee;
  const of = year ? ` en ${year}` : '';
  if (actor.id === context.presidentId)
    return context.termLimited
      ? 'président sortant au terme de deux mandats consécutifs (Constitution, art. 6)'
      : `président sortant, popularité finale de ${pctCentiemes(actor.resources.popularite)}`;
  if (actor.status === 'battu') return `finaliste battu au second tour${of}`;
  if (actor.status === 'elimine')
    return `score au premier tour${of} : ${pct(firstRoundShare(context.previous, actor.id))}`;
  if (actor.status === 'ecarte') return `écarté faute de parrainages${of}`;
  if (actor.status === 'retire') return `retiré de la course par un ralliement${of}`;
  return 'candidat de la présidentielle précédente';
}

/** Plus courte distance entre une position et les candidats déclarés (Infinity sans candidat). */
function nearestDeclared(state: GameState, position: Position): number {
  const declared = Object.values(state.actors).filter((a) => a.status === 'candidat');
  return Math.min(Infinity, ...declared.map((a) => distance(position, a.candidate.positionnement)));
}

const declaredCount = (state: GameState) =>
  Object.values(state.actors).filter((a) => a.status === 'candidat').length;

/** Popularité prêtée d'un membre du gouvernement (suivi du quinquennat, sinon celle du jeu). */
function memberPopularity(
  state: GameState,
  ruleset: Ruleset,
  member: MemberRef,
  suivi: SuccessionContext['suivi'],
) {
  return suivi[member.ref]?.popularite ?? memberTraits(state, ruleset, member).popularite;
}

/** Annonce enregistrée dans l'état et dans le bilan de la semaine (copie fixe, sans propos). */
function announce(
  state: GameState,
  annonces: SuccessionAnnouncement[],
  events: ReportEvent[],
  announcement: SuccessionAnnouncement,
  majeur: boolean,
): void {
  annonces.push(announcement);
  const name = candidateName(state.actors[announcement.actorId]!.candidate);
  const year = state.cycle.annee;
  const label = {
    candidat: `Candidature simulée : ${name} se représente`,
    retrait: `Candidature simulée : ${name} ne se présente pas à la présidentielle ${year}`,
    entree: `Candidature simulée : ${name} entre dans la course`,
    successeur: `Vous passez la main : ${name} porte votre camp en ${year}`,
  }[announcement.choix];
  events.push({
    id: `candidature-${year}-${announcement.actorId}`,
    kind: 'evenement',
    refId: 'succession',
    label,
    description: `Motif du jeu : ${announcement.motif}.`,
    nature: 'simule',
    majeur,
    decisionId: null,
  });
}

/**
 * Applique les candidatures de la présidentielle suivante (spec §4), une fois le quinquennat
 * archivé et le cycle suivant ouvert, avant les moyens de départ : décisions des candidats de la
 * présidentielle précédente (tirages), choix du joueur, entrants (héritier du camp sortant,
 * ministre ambitieux, familles sans candidat), dans la limite de `maxCandidats`, puis facteurs
 * de bilan. Écrit `state.succession` ; renvoie les annonces du bilan de la semaine.
 */
export function applySuccession(
  state: GameState,
  ruleset: Ruleset,
  review: QuinquennatReview,
  context: SuccessionContext,
): ReportEvent[] {
  const params = ruleset.succession;
  const year = state.cycle.annee;
  const week = state.meta.week;
  const seed = state.meta.seed;
  const playerId = state.player.actorId;
  const annonces: SuccessionAnnouncement[] = [];
  const events: ReportEvent[] = [];
  // Candidats qui ne se sont pas présentés à la présidentielle précédente : ils restent à l'écart.
  const absent = new Set(
    (state.succession?.annonces ?? []).filter((a) => a.choix === 'retrait').map((a) => a.actorId),
  );

  // 1. Le joueur (spec §1) : il se représente s'il le peut.
  const player = playerId ? state.actors[playerId] : undefined;
  const playerEligible = player && !(context.termLimited && player.id === context.presidentId);
  if (player && playerEligible) {
    player.status = 'candidat';
    announce(
      state,
      annonces,
      events,
      { actorId: player.id, choix: 'candidat', motif: 'choix du joueur' },
      false,
    );
  } else if (player) {
    player.status = 'ineligible';
  }

  // 2. Les autres candidats de la présidentielle précédente décident (tirages de la graine), le
  // plus probable d'abord, dans la limite du plafond. Probabilités et motifs sont relevés sur la
  // présidentielle qui s'achève, avant tout changement de statut.
  const others = Object.values(state.actors)
    .filter((a) => a.id !== playerId && !absent.has(a.id))
    .map((actor) => ({
      actor,
      p: runProbability(actor.id, state, ruleset, context),
      motif: runMotive(actor, context),
    }))
    .sort((a, b) => b.p - a.p || compareStrings(a.actor.id, b.actor.id));
  for (const { actor } of others) actor.status = 'retire';
  for (const id of absent) {
    const actor = state.actors[id];
    if (actor && id !== playerId && actor.status !== 'ineligible') actor.status = 'retire';
  }
  for (const { actor, p, motif } of others) {
    const draw = stream(seed, week, 'candidature', year, actor.id).nextFloat();
    const runs = draw < p && declaredCount(state) < params.maxCandidats;
    if (runs) actor.status = 'candidat';
    else if (actor.id === context.presidentId && context.termLimited) actor.status = 'ineligible';
    if (formerPlayer(actor)) continue;
    announce(
      state,
      annonces,
      events,
      {
        actorId: actor.id,
        choix: runs ? 'candidat' : 'retrait',
        motif:
          draw < p && !runs ? `plafond du jeu : ${params.maxCandidats} candidats déclarés` : motif,
      },
      actor.id === context.presidentId,
    );
  }

  // 3. Entrants, dans l'ordre, sans dépasser le plafond.
  const roles: Record<string, RecordRole> = {};
  const room = () => declaredCount(state) < params.maxCandidats;
  const enter = (source: EntrantSource, motif: string, majeur: boolean) => {
    const actor = createEntrantActor(source, state, ruleset, false);
    state.actors[actor.id] = actor;
    announce(state, annonces, events, { actorId: actor.id, choix: 'entree', motif }, majeur);
    return actor;
  };
  const government = context.government;
  const president = state.actors[context.presidentId];
  const presidentRuns = president?.status === 'candidat';
  const presidentIsPlayer = context.presidentId === playerId;
  const available = (member: MemberRef) =>
    member.nature !== 'acteur' && actorOfMember(state, member) === undefined;
  const ministersByPopularity = (government?.ministres ?? [])
    .map((m) => ({
      member: m as MemberRef,
      popularite: memberPopularity(state, ruleset, m, context.suivi),
    }))
    .sort((a, b) => b.popularite - a.popularite || compareStrings(a.member.ref, b.member.ref));

  // 3a. Héritier du camp sortant : le président (IA) ne se représente pas.
  let heirRef: string | null = null;
  if (government && !presidentIsPlayer && !presidentRuns && room()) {
    const pm = government.premierMinistre;
    const heir = available(pm)
      ? { member: pm, motif: 'Premier ministre du gouvernement sortant, camp du président sortant' }
      : ministersByPopularity
          .filter(({ member }) => available(member))
          .map(({ member, popularite }) => ({
            member,
            motif: `ministre du gouvernement sortant, popularité prêtée de ${pctCentiemes(popularite)}, camp du président sortant`,
          }))[0];
    if (heir) {
      const actor = enter(
        { nature: heir.member.nature as EntrantSource['nature'], ref: heir.member.ref },
        heir.motif,
        true,
      );
      roles[actor.id] = 'heritier';
      heirRef = heir.member.ref;
    }
  }

  // 3b. Ministre ambitieux : le plus populaire, s'il atteint le seuil et que sa place est libre.
  const ambitious = ministersByPopularity.find(
    ({ member }) => member.ref !== heirRef && available(member),
  );
  if (
    ambitious &&
    room() &&
    ambitious.popularite >= params.ministreSeuilPopularite &&
    nearestDeclared(state, memberTraits(state, ruleset, ambitious.member).position) >=
      params.distanceMinistre &&
    stream(seed, week, 'candidature', year, 'ministre', ambitious.member.ref).nextFloat() <
      params.ministreProbabilite
  ) {
    enter(
      { nature: ambitious.member.nature as EntrantSource['nature'], ref: ambitious.member.ref },
      `ministre du gouvernement sortant, popularité prêtée de ${pctCentiemes(ambitious.popularite)}`,
      false,
    );
  }

  // 3c. Familles sans candidat : le profil fictif le plus proche de chaque groupe d'électeurs
  // qu'aucun candidat déclaré ne représente ; au moins deux candidats déclarés en tout cas.
  const freeProfiles = () =>
    ruleset.quinquennat.profils.filter(
      (p) => actorOfMember(state, { nature: 'profil', ref: p.id }) === undefined,
    );
  const closestProfile = (position: Position) =>
    [...freeProfiles()].sort(
      (a, b) =>
        distance(position, a.positionnement) - distance(position, b.positionnement) ||
        compareStrings(a.id, b.id),
    )[0];
  for (const group of ruleset.electorat.groupes) {
    if (!room() || nearestDeclared(state, group.position) < params.distanceFamille) continue;
    const profile = closestProfile(group.position);
    if (profile)
      enter(
        { nature: 'profil', ref: profile.id },
        `famille ${group.libelle.toLowerCase()} sans candidat proche`,
        false,
      );
  }
  const byWeight = [...ruleset.electorat.groupes].sort(
    (a, b) => b.part - a.part || compareStrings(a.id, b.id),
  );
  for (const group of byWeight) {
    if (declaredCount(state) >= 2) break;
    const profile = closestProfile(group.position);
    if (profile)
      enter(
        { nature: 'profil', ref: profile.id },
        `famille ${group.libelle.toLowerCase()}, champ de candidats réduit`,
        false,
      );
  }

  // 4. Facteurs de bilan (spec §5) : président sortant, héritier, membres du dernier gouvernement.
  const score = recordScore(review, ruleset);
  const members = new Set(
    government
      ? [government.premierMinistre, ...government.ministres].map((m) => `${m.nature}:${m.ref}`)
      : [],
  );
  const bilan: Succession['bilan'] = {};
  for (const actor of Object.values(state.actors).sort((a, b) => compareStrings(a.id, b.id))) {
    if (actor.status !== 'candidat') continue;
    const source = entrantSourceOf(actor);
    const key = source ? `${source.nature}:${source.ref}` : `acteur:${actor.id}`;
    const role: RecordRole | undefined =
      actor.id === context.presidentId
        ? 'sortant'
        : (roles[actor.id] ?? (members.has(key) ? 'ministre' : undefined));
    if (!role) continue;
    const weight =
      role === 'sortant' ? 1 : role === 'heritier' ? params.bilan.heritier : params.bilan.ministre;
    bilan[actor.id] = { facteur: round4(weight * score), role };
  }

  state.succession = {
    annee: year,
    choixJoueur: state.succession?.annee === year ? state.succession.choixJoueur : null,
    annonces,
    bilan,
  };
  return events;
}
