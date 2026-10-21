import {
  addDays,
  candidateName,
  PRIME_MINISTER_POST,
  type Actor,
  type GameState,
  type Government,
  type MemberRef,
  type MinisterProfile,
  type PendingDecision,
  type Position,
  type Quinquennat,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { proximity } from '../ai/relations';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';
import { mandateDates, weekReaches } from './dates';
import { openEconomy } from './economy';
import { openLegislatives } from './legislatives';
import { openParliament } from './parliament';

// Investiture et gouvernement (phase 6, P6-03). Le président nomme le Premier ministre : le
// joueur choisit parmi les acteurs de la partie et les profils fictifs du jeu de règles ; une
// personnalité réelle ou un candidat de la partie peut refuser (refus simulé, d'après sa
// proximité avec le président) ; un profil fictif accepte toujours. Les ministres sont proposés
// par le Premier ministre : les acteurs les plus proches du président qui acceptent, dans la
// limite du jeu de règles, puis des profils fictifs. Même règle pour le président joueur et
// pour le président IA, dont le choix est déterministe.

export const GOVERNMENT_DECISION_EVENT = 'nomination-premier-ministre';
const COMPETENCE_WEIGHT = 20;

const pct = (value: number) => `${Math.round(value * 100)} %`;

/** Président en exercice (ou élu en attendant son investiture). */
export function presidentOf(state: GameState): Actor {
  const id = state.quinquennat?.mandat.presidentId;
  const actor = id ? state.actors[id] : undefined;
  if (!actor) throw new Error('Aucun président dans cette partie');
  return actor;
}

export function profileById(ruleset: Ruleset, id: string): MinisterProfile | undefined {
  return ruleset.quinquennat.profils.find((p) => p.id === id);
}

/** Nom d'un membre du gouvernement, avec la mention de sa nature. */
export function memberLabel(state: GameState, ruleset: Ruleset, member: MemberRef): string {
  if (member.nature === 'profil') {
    const profile = profileById(ruleset, member.ref);
    return profile ? `${profile.prenom} ${profile.nom} (profil fictif)` : member.ref;
  }
  const actor = state.actors[member.ref];
  if (!actor) return member.ref;
  const name = candidateName(actor.candidate);
  return actor.candidate.nature === 'reel' ? `${name} (nomination simulée)` : name;
}

const positioned = (id: string, positionnement: Position) => ({
  id,
  candidate: { positionnement },
});

/** Proximité (0 à 100) entre le président et une position. */
function closeness(president: Actor, id: string, position: Position): number {
  return proximity(president, positioned(id, position));
}

/** Préférence pour un profil fictif : proximité avec le président et compétence de gestion. */
function profileScore(president: Actor, profile: MinisterProfile): number {
  return (
    closeness(president, profile.id, profile.positionnement) +
    COMPETENCE_WEIGHT * profile.competence
  );
}

function sortedProfiles(president: Actor, ruleset: Ruleset, exclude: ReadonlySet<string>) {
  return ruleset.quinquennat.profils
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ profile: p, score: profileScore(president, p) }))
    .sort((a, b) => b.score - a.score || compareStrings(a.profile.id, b.profile.id));
}

/** Acteur ayant refusé un poste depuis moins de `delaiApresRefus` semaines. */
function recentlyRefused(state: GameState, ruleset: Ruleset, actorId: string): boolean {
  const delay = ruleset.quinquennat.acceptation.delaiApresRefus;
  return (state.quinquennat?.refus ?? []).some(
    (r) => r.acteurId === actorId && state.meta.week - r.semaine < delay,
  );
}

/**
 * Acteurs que l'on peut solliciter : tous ceux de la partie sauf le président, le joueur
 * lorsqu'il n'est pas président (ses choix ne sont jamais faits par l'IA) et ceux qui ont
 * refusé récemment ; du plus proche au plus éloigné du président.
 */
function eligibleActors(state: GameState, ruleset: Ruleset, president: Actor) {
  return Object.values(state.actors)
    .filter(
      (a) =>
        a.id !== president.id &&
        a.id !== state.player.actorId &&
        !recentlyRefused(state, ruleset, a.id),
    )
    .map((actor) => ({ actor, proximite: proximity(president, actor) }))
    .sort((a, b) => b.proximite - a.proximite || compareStrings(a.actor.id, b.actor.id));
}

/** Choix du Premier ministre par l'IA : l'allié le plus proche s'il y en a un, sinon un profil. */
export function aiPrimeMinister(state: GameState, ruleset: Ruleset, president: Actor): MemberRef {
  const majority = cohabitationMajority(state, ruleset);
  if (majority) {
    // Cohabitation : un profil fictif proche de la majorité de l'Assemblée (hypothèse de jeu).
    const best = [...ruleset.quinquennat.profils].sort(
      (a, b) =>
        distance(a.positionnement, majority) - distance(b.positionnement, majority) ||
        compareStrings(a.id, b.id),
    )[0]!;
    return { nature: 'profil', ref: best.id };
  }
  const ally = eligibleActors(state, ruleset, president).find(
    (e) => e.proximite >= ruleset.quinquennat.acceptation.proximiteMin,
  );
  if (ally) return { nature: 'acteur', ref: ally.actor.id };
  return { nature: 'profil', ref: sortedProfiles(president, ruleset, new Set())[0]!.profile.id };
}

/**
 * Position moyenne (pondérée par les sièges) des groupes d'opposition quand ils détiennent la
 * majorité de l'Assemblée élue aux dernières législatives ; null hors cohabitation.
 */
export function cohabitationMajority(state: GameState, ruleset: Ruleset): Position | null {
  if (!state.legislatives?.derniere.cohabitation || !state.parlement) return null;
  const groups = ruleset.assemblee.groupes.filter(
    (g) => state.parlement!.groupes[g.id]?.alignement === 'opposition',
  );
  const seats = groups.reduce((sum, g) => sum + state.parlement!.groupes[g.id]!.sieges, 0);
  if (seats === 0) return null;
  const weighted = (axis: keyof Position) =>
    Math.round(
      groups.reduce(
        (sum, g) => sum + state.parlement!.groupes[g.id]!.sieges * g.position[axis],
        0,
      ) / seats,
    );
  return { economie: weighted('economie'), societe: weighted('societe') };
}

/** Réponse (simulée) d'un acteur sollicité pour Matignon. */
export function acceptsPost(state: GameState, ruleset: Ruleset, president: Actor, actor: Actor) {
  const { proximiteMin, probabiliteSousSeuil } = ruleset.quinquennat.acceptation;
  if (proximity(president, actor) >= proximiteMin) return true;
  return (
    stream(state.meta.seed, state.meta.week, 'gouvernement', actor.id).nextFloat() <
    probabiliteSousSeuil
  );
}

/**
 * Ministres proposés par le Premier ministre : d'abord les acteurs proches du président (qui
 * acceptent), dans l'ordre des postes et dans la limite du jeu de règles, puis des profils
 * fictifs du plus au moins pertinent.
 */
export function composeMinisters(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  primeMinister: MemberRef,
): Government['ministres'] {
  const { proximiteMin, ministresActeursMax } = ruleset.quinquennat.acceptation;
  const allies = eligibleActors(state, ruleset, president)
    .filter((e) => e.proximite >= proximiteMin && e.actor.id !== primeMinister.ref)
    .slice(0, ministresActeursMax);
  const profiles = sortedProfiles(president, ruleset, new Set([primeMinister.ref]));
  return ruleset.quinquennat.postes.map((poste, i) => {
    const ally = allies[i];
    if (ally) return { nature: 'acteur' as const, ref: ally.actor.id, posteId: poste.id };
    return {
      nature: 'profil' as const,
      ref: profiles[i - allies.length]!.profile.id,
      posteId: poste.id,
    };
  });
}

function nominationEvent(state: GameState, ruleset: Ruleset, government: Government): ReportEvent {
  const pm = memberLabel(state, ruleset, government.premierMinistre);
  const actors = government.ministres.filter((m) => m.nature === 'acteur').length;
  return {
    id: `gouvernement-${state.meta.week}-${government.numero}`,
    kind: 'evenement',
    refId: 'gouvernement',
    label: `Gouvernement n° ${government.numero} : ${pm} nommé(e) Premier ministre`,
    description:
      `Le Premier ministre compose un gouvernement de ${government.ministres.length} ministres, ` +
      `dont ${actors} issu(s) des candidats de la partie et ${government.ministres.length - actors} ` +
      'profil(s) fictif(s). Les nominations de personnalités réelles sont simulées ; aucun propos ne leur est attribué.',
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}

/** Nomme le Premier ministre et son gouvernement ; renvoie l'événement du bilan. */
export function nominate(
  state: GameState,
  ruleset: Ruleset,
  primeMinister: MemberRef,
): ReportEvent {
  const quinquennat = state.quinquennat!;
  const president = presidentOf(state);
  const government: Government = {
    numero: quinquennat.anciensGouvernements.length + 1,
    premierMinistre: primeMinister,
    ministres: composeMinisters(state, ruleset, president, primeMinister),
    nommeLe: state.meta.date,
  };
  quinquennat.gouvernement = government;
  return nominationEvent(state, ruleset, government);
}

/** Fin des fonctions du gouvernement en place (remaniement, fin du quinquennat). */
export function endGovernment(quinquennat: Quinquennat, date: string, motif: string): void {
  const current = quinquennat.gouvernement;
  if (!current) return;
  quinquennat.anciensGouvernements.push({
    numero: current.numero,
    premierMinistre: current.premierMinistre,
    debut: current.nommeLe,
    fin: date,
    motif,
  });
  quinquennat.gouvernement = null;
}

/** Décision du président joueur : nommer le Premier ministre. */
export function governmentDecision(state: GameState, ruleset: Ruleset): PendingDecision {
  const president = presidentOf(state);
  const { proximiteMin } = ruleset.quinquennat.acceptation;
  const week = state.meta.week;
  const actorOptions = eligibleActors(state, ruleset, president).map(({ actor, proximite }) => ({
    id: actor.id,
    libelle: `${candidateName(actor.candidate)} — ${actor.candidate.parti}`,
    description:
      (actor.candidate.nature === 'reel'
        ? 'Personnalité réelle : sa réponse et son action au gouvernement sont simulées, aucun propos ne lui est attribué. '
        : 'Candidat de la partie. ') +
      `Proximité avec vous : ${proximite}/100 ; ` +
      (proximite >= proximiteMin
        ? 'acceptation attendue.'
        : 'acceptation incertaine (un refus est possible).'),
  }));
  const profileOptions = sortedProfiles(president, ruleset, new Set()).map(({ profile }) => ({
    id: profile.id,
    libelle: `${profile.prenom} ${profile.nom} — profil fictif (${profile.famille})`,
    description: `${profile.parcours} Compétence de gestion : ${pct(profile.competence)} ; proximité avec vous : ${closeness(president, profile.id, profile.positionnement)}/100. Accepte toujours.`,
  }));
  return {
    id: `g-${week}-${PRIME_MINISTER_POST}`,
    kind: 'gouvernement',
    eventId: GOVERNMENT_DECISION_EVENT,
    actorId: president.id,
    createdWeek: week,
    label: 'Nommer le Premier ministre',
    description:
      'Le Premier ministre composera le gouvernement : des candidats de la partie proches de vous s’ils acceptent, sinon des profils fictifs. Une personnalité éloignée de vous peut refuser.',
    options: [...actorOptions, ...profileOptions],
    defaultOptionId: aiPrimeMinister(state, ruleset, president).ref,
  };
}

/** Le gouvernement est-il à nommer cette semaine (mandat commencé, Matignon vacant) ? */
export function governmentDue(state: GameState): boolean {
  const q = state.quinquennat;
  return q !== null && q.gouvernement === null && weekReaches(state.meta.date, q.mandat.debut);
}

/**
 * Si le président joueur doit nommer un Premier ministre, ajoute la décision (une seule à la
 * fois). Le président IA nomme le sien pendant la résolution de la semaine.
 */
export function requestGovernment(state: GameState, ruleset: Ruleset): void {
  if (!governmentDue(state)) return;
  const president = presidentOf(state);
  if (president.id !== state.player.actorId) return;
  if (state.pendingDecisions.some((d) => d.kind === 'gouvernement')) return;
  state.pendingDecisions.push(governmentDecision(state, ruleset));
}

/**
 * Réponse du président joueur : nomination, ou refus simulé de la personnalité sollicitée
 * (une nouvelle décision est alors ouverte, sans elle).
 */
export function answerGovernment(
  state: GameState,
  ruleset: Ruleset,
  optionId: string,
): ReportEvent {
  const president = presidentOf(state);
  if (profileById(ruleset, optionId))
    return nominate(state, ruleset, { nature: 'profil', ref: optionId });
  const actor = state.actors[optionId];
  if (!actor) throw new Error(`Membre du gouvernement inconnu : ${optionId}`);
  if (acceptsPost(state, ruleset, president, actor))
    return nominate(state, ruleset, { nature: 'acteur', ref: actor.id });
  state.quinquennat!.refus.push({
    acteurId: actor.id,
    semaine: state.meta.week,
    posteId: PRIME_MINISTER_POST,
  });
  return {
    id: `refus-${state.meta.week}-${actor.id}`,
    kind: 'evenement',
    refId: 'gouvernement',
    label: `${candidateName(actor.candidate)} décline Matignon (refus simulé)`,
    description: `Proximité avec le président : ${proximity(president, actor)}/100. Choisissez un autre Premier ministre.`,
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}

/**
 * Ouverture du quinquennat après la victoire au second tour (ou au premier) : mandat du
 * président, feuille de route tirée de son programme, partie débloquée en phase `presidence`.
 * Le Premier ministre est nommé à l'investiture.
 */
export function openQuinquennat(state: GameState, ruleset: Ruleset, winnerId: string): void {
  const winner = state.actors[winnerId];
  if (!winner) throw new Error(`Vainqueur inconnu : ${winnerId}`);
  const { debut, fin } = mandateDates(ruleset, state.cycle);
  const previous = state.historique.quinquennats.at(-1)?.mandat;
  const renewed = previous?.presidentId === winnerId && addDays(previous.fin, 1) === debut;
  const numero = renewed ? previous.numero + 1 : 1;
  if (numero > ruleset.quinquennat.mandat.mandatsConsecutifsMax)
    throw new Error(`${winnerId} ne peut pas exercer un troisième mandat consécutif`);
  state.quinquennat = {
    mandat: { presidentId: winnerId, debut, fin, numero },
    gouvernement: null,
    anciensGouvernements: [],
    feuilleDeRoute: [...winner.programme.propositions],
    refus: [],
  };
  state.parlement = openParliament(ruleset, winner, state.parlement);
  state.economie ??= openEconomy(ruleset, state.meta.week);
  state.legislatives ??= openLegislatives(ruleset, state.parlement);
  state.meta.phase = 'presidence';
  state.calendar = { blockedBy: null, blockedMessage: null };
  requestGovernment(state, ruleset);
}
