import {
  addDays,
  candidateName,
  figureMainFunction,
  membersMajority,
  MINISTER_DECISION_EVENT,
  PRIME_MINISTER_POST,
  promisedMinistries,
  type Actor,
  type GameState,
  type Government,
  type MemberRef,
  type MinisterProfile,
  type DecisionProposal,
  type PendingDecision,
  type Position,
  type Quinquennat,
  type QuinquennatSnapshot,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { proximity } from '../ai/relations';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';
import { mandateDates, weekReaches } from './dates';
import { addConsequence } from './consequences';
import { openEconomy, scheduleEconomy } from './economy';
import { openLegislatives } from './legislatives';
import {
  figureById,
  memberName,
  memberTraits,
  postCompetenceOf,
  postExpertise,
  profileById,
  teamCompetence,
} from './members';
import { openParliament } from './parliament';
import { updateTension } from './tension';

// Investiture et gouvernement (phase 6, P6-03 ; figures réelles en phase 11, P11-02). Le
// président nomme le Premier ministre : le joueur choisit parmi les acteurs de la partie, les
// figures réelles du jeu de règles (fiches sourcées) et les profils fictifs ; une personnalité
// réelle peut refuser (refus simulé, d'après sa proximité avec le président) ; un profil fictif
// accepte toujours. Le Premier ministre propose les ministres : les personnalités proches du
// président (acteurs et figures) qui acceptent, placées là où elles sont le plus expertes (phase
// 14), dans la limite du jeu de règles, puis des profils fictifs pour les postes restants ; le
// président joueur peut ensuite pourvoir lui-même les ministères régaliens. Même
// règle pour le président joueur et pour le président IA, dont le choix est déterministe. La
// compétence et la popularité prêtées aux membres agissent sur la popularité du président, le
// Parlement, la censure et les crises, toujours par le registre (hypothèses de jeu).

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

/** Nom d'un membre du gouvernement, avec la mention de sa nature. */
export function memberLabel(state: GameState, ruleset: Ruleset, member: MemberRef): string {
  const name = memberName(state, ruleset, member);
  if (member.nature === 'profil') return `${name} (profil fictif)`;
  if (member.nature === 'figure') return `${name} (nomination simulée)`;
  return state.actors[member.ref]?.candidate.nature === 'reel'
    ? `${name} (nomination simulée)`
    : name;
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

/** Acteur ou figure ayant refusé un poste depuis moins de `delaiApresRefus` semaines. */
function recentlyRefused(state: GameState, ruleset: Ruleset, id: string): boolean {
  const delay = ruleset.quinquennat.acceptation.delaiApresRefus;
  return (state.quinquennat?.refus ?? []).some(
    (r) => r.acteurId === id && state.meta.week - r.semaine < delay,
  );
}

/** Personnalité sollicitable (acteur de la partie ou figure réelle), avec sa proximité. */
export type Candidate = {
  member: MemberRef;
  proximite: number;
  competence: number;
  /** Préférence du Premier ministre et de l'IA : proximité, puis compétence. */
  score: number;
};

/**
 * Personnalités que l'on peut solliciter : les acteurs de la partie sauf le président, le joueur
 * lorsqu'il n'est pas président (ses choix ne sont jamais faits par l'IA), et les figures réelles
 * du jeu de règles, sauf celles et ceux qui ont refusé récemment ; de la préférence la plus forte
 * à la plus faible.
 */
export function eligibleCandidates(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
): Candidate[] {
  const competenceActeur = ruleset.quinquennat.equipe.competenceActeur;
  const actors = Object.values(state.actors)
    .filter((a) => a.id !== president.id && a.id !== state.player.actorId)
    .map((actor) => ({
      member: { nature: 'acteur' as const, ref: actor.id },
      proximite: proximity(president, actor),
      competence: competenceActeur,
    }));
  const figures = ruleset.figures.figures.map((f) => ({
    member: { nature: 'figure' as const, ref: f.id },
    proximite: closeness(president, f.id, f.position),
    competence: f.competence.valeur,
  }));
  return [...actors, ...figures]
    .filter((c) => !recentlyRefused(state, ruleset, c.member.ref))
    .map((c) => ({ ...c, score: c.proximite + COMPETENCE_WEIGHT * c.competence }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.proximite - a.proximite ||
        compareStrings(a.member.ref, b.member.ref),
    );
}

/** Choix du Premier ministre par l'IA : l'allié préféré s'il y en a un, sinon un profil. */
export function aiPrimeMinister(state: GameState, ruleset: Ruleset, president: Actor): MemberRef {
  const majority = cohabitationMajority(state, ruleset);
  if (majority) {
    // Cohabitation : la figure ou le profil le plus proche de la majorité (hypothèse de jeu).
    const options = [
      ...ruleset.figures.figures.map((f) => ({
        member: { nature: 'figure' as const, ref: f.id },
        position: f.position as Position,
        competence: f.competence.valeur,
      })),
      ...ruleset.quinquennat.profils.map((p) => ({
        member: { nature: 'profil' as const, ref: p.id },
        position: p.positionnement,
        competence: p.competence,
      })),
    ].filter((o) => !recentlyRefused(state, ruleset, o.member.ref));
    return options.sort(
      (a, b) =>
        distance(a.position, majority) - distance(b.position, majority) ||
        b.competence - a.competence ||
        compareStrings(a.member.ref, b.member.ref),
    )[0]!.member;
  }
  const ally = eligibleCandidates(state, ruleset, president).find(
    (c) => c.proximite >= ruleset.quinquennat.acceptation.proximiteMin,
  );
  if (ally) return ally.member;
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

/**
 * Réponse (simulée) d'un acteur ou d'une figure sollicité pour un poste : acceptation assurée
 * au-delà de la proximité minimale avec le président, sinon tirage. Pour Matignon, en
 * cohabitation, une personnalité rattachée à un groupe de la majorité d'opposition accepte.
 */
export function acceptsPost(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  member: Pick<Actor, 'id'> & { candidate: { positionnement: Position } },
  posteId: string = PRIME_MINISTER_POST,
): boolean {
  const { proximiteMin, probabiliteSousSeuil } = ruleset.quinquennat.acceptation;
  if (proximity(president, member) >= proximiteMin) return true;
  if (posteId === PRIME_MINISTER_POST && cohabitationMajority(state, ruleset)) {
    const nature = state.actors[member.id] ? ('acteur' as const) : ('figure' as const);
    const groupe = memberTraits(state, ruleset, { nature, ref: member.id }).groupe;
    if (groupe && state.parlement?.groupes[groupe]?.alignement === 'opposition') return true;
  }
  const keys =
    posteId === PRIME_MINISTER_POST
      ? ['gouvernement', member.id]
      : ['gouvernement', member.id, posteId];
  return stream(state.meta.seed, state.meta.week, ...keys).nextFloat() < probabiliteSousSeuil;
}

/**
 * Ministres proposés par le Premier ministre (phase 14) : les personnalités proches du président
 * (acteurs et figures, qui acceptent) sont placées là où elles sont le plus expertes — couples
 * (personnalité, poste) du plus au moins pertinent : bonus d'expertise sur le poste, compétence
 * sur le poste, préférence du Premier ministre (proximité et compétence), ordre des postes —, au
 * plus `ministresActeursMax` ; les profils fictifs, du plus au moins pertinent, pourvoient les
 * postes restants. Déterministe.
 */
export function composeMinisters(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  primeMinister: MemberRef,
): Government['ministres'] {
  const { proximiteMin, ministresActeursMax } = ruleset.quinquennat.acceptation;
  const postes = ruleset.quinquennat.postes;
  const chosen = new Map<string, MemberRef>();
  const placed = new Set<string>();
  // Ministères promis pendant la campagne (phase 15) : au premier gouvernement du mandat, ces
  // personnalités sont placées d'abord, sur le poste où elles sont le plus pertinentes.
  for (const ref of pendingPromises(state, president.id)) {
    if (ref === primeMinister.ref) continue;
    const member = { nature: 'figure' as const, ref };
    const best = postes
      .filter((p) => !chosen.has(p.id))
      .map((poste, ordre) => ({
        posteId: poste.id,
        ordre,
        bonus: postExpertise(ruleset, member, poste.id)?.bonus ?? 0,
        competence: postCompetenceOf(state, ruleset, member, poste.id),
      }))
      .sort((a, b) => b.bonus - a.bonus || b.competence - a.competence || a.ordre - b.ordre)[0];
    if (!best) break;
    chosen.set(best.posteId, member);
    placed.add(ref);
  }
  const promisedCount = placed.size;
  const allies = eligibleCandidates(state, ruleset, president).filter(
    (c) =>
      c.proximite >= proximiteMin &&
      c.member.ref !== primeMinister.ref &&
      !placed.has(c.member.ref),
  );
  const pairs = allies
    .flatMap((c, rang) =>
      postes.map((poste, ordre) => ({
        member: c.member,
        posteId: poste.id,
        rang,
        ordre,
        bonus: postExpertise(ruleset, c.member, poste.id)?.bonus ?? 0,
        competence: postCompetenceOf(state, ruleset, c.member, poste.id),
      })),
    )
    .sort(
      (a, b) =>
        b.bonus - a.bonus || b.competence - a.competence || a.rang - b.rang || a.ordre - b.ordre,
    );
  for (const pair of pairs) {
    if (chosen.size - promisedCount >= ministresActeursMax) break;
    if (chosen.has(pair.posteId) || placed.has(pair.member.ref)) continue;
    chosen.set(pair.posteId, pair.member);
    placed.add(pair.member.ref);
  }
  const profiles = sortedProfiles(president, ruleset, new Set([primeMinister.ref]));
  let next = 0;
  return postes.map((poste) => {
    const member = chosen.get(poste.id);
    if (member) return { ...member, posteId: poste.id };
    return { nature: 'profil' as const, ref: profiles[next++]!.profile.id, posteId: poste.id };
  });
}

/**
 * Personnalités à qui le président a promis un ministère pendant la campagne qui l'a élu (phase
 * 15), tant que le premier gouvernement de son mandat n'a pas été nommé, ou quand il l'est.
 */
function pendingPromises(state: GameState, presidentId: string): string[] {
  const quinquennat = state.quinquennat;
  if (!quinquennat || quinquennat.anciensGouvernements.length > 0) return [];
  if (quinquennat.gouvernement && quinquennat.gouvernement.numero !== 1) return [];
  return promisedMinistries(state, presidentId, state.cycle.annee);
}

/** Vrai si un ministère avait été promis à ce membre pendant la campagne du président. */
export function wasPromised(state: GameState, member: MemberRef): boolean {
  const presidentId = state.quinquennat?.mandat.presidentId;
  return (
    member.nature === 'figure' &&
    presidentId !== undefined &&
    pendingPromises(state, presidentId).includes(member.ref)
  );
}

/** Popularité prêtée à un membre, comparée à la référence : effet de sa nomination. */
function nominationEffect(state: GameState, ruleset: Ruleset, member: MemberRef, weight: number) {
  const reference = ruleset.jeu.opinion.popularite.reference;
  return Math.round(weight * (memberTraits(state, ruleset, member).popularite - reference));
}

function nominationEvent(state: GameState, ruleset: Ruleset, government: Government): ReportEvent {
  const pm = memberLabel(state, ruleset, government.premierMinistre);
  const count = (nature: MemberRef['nature']) =>
    government.ministres.filter((m) => m.nature === nature).length;
  return {
    id: `gouvernement-${state.meta.week}-${government.numero}`,
    kind: 'evenement',
    refId: 'gouvernement',
    label: `Gouvernement n° ${government.numero} : ${pm} nommé(e) Premier ministre`,
    description:
      `Le Premier ministre compose un gouvernement de ${government.ministres.length} ministres : ` +
      `${count('acteur')} candidat(s) de la partie, ${count('figure')} personnalité(s) réelle(s) et ` +
      `${count('profil')} profil(s) fictif(s). Compétence estimée de l’équipe : ${pct(teamCompetence(state, ruleset, government))}. ` +
      'Les nominations de personnalités réelles sont simulées ; aucun propos ne leur est attribué.',
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}

/** Écritures du registre et de l'étape en cours, pour les effets d'une nomination. */
export type NominationBook = { ledger: Ledger; step: number };

/**
 * Nomme le Premier ministre et son gouvernement ; la popularité prêtée au Premier ministre et
 * aux ministres régaliens agit sur celle du président (registre). Renvoie l'événement du bilan.
 */
export function nominate(
  state: GameState,
  ruleset: Ruleset,
  primeMinister: MemberRef,
  book: NominationBook,
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
  const { nomination, postesRegaliens } = ruleset.quinquennat.equipe;
  const factors = [
    {
      label: `Nomination de ${memberName(state, ruleset, primeMinister)} à Matignon (popularité prêtée, hypothèse de jeu)`,
      value: nominationEffect(state, ruleset, primeMinister, nomination.premierMinistre),
      source: 'decision' as const,
      step: book.step,
    },
    {
      label:
        'Ministres régaliens proposés par le Premier ministre (popularité prêtée, hypothèse de jeu)',
      value: government.ministres
        .filter((m) => postesRegaliens.includes(m.posteId))
        .reduce((sum, m) => sum + nominationEffect(state, ruleset, m, nomination.ministre), 0),
      source: 'decision' as const,
      step: book.step,
    },
  ].filter((f) => f.value !== 0);
  if (factors.length) book.ledger.apply(president.id, 'popularite', factors);
  requestMinisters(state, ruleset);
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

/**
 * Compétence d'un membre sur un poste, pour les descriptions : « 60 % » ou, avec une expertise,
 * « 70 % sur ce poste (expertise : Ministre de l'Intérieur) ».
 */
function competenceText(
  state: GameState,
  ruleset: Ruleset,
  member: MemberRef,
  posteId: string | null,
): string {
  const general = memberTraits(state, ruleset, member).competence;
  const expertise = postExpertise(ruleset, member, posteId);
  if (!expertise) return pct(general);
  const onPost = postCompetenceOf(state, ruleset, member, posteId);
  return `${pct(general)}, ${pct(onPost)} sur ce poste (expertise : ${expertise.fonction}${expertise.enCours ? '' : ', fonction passée'})`;
}

/**
 * Description d'une personnalité proposée au joueur (aucun propos, faits et hypothèses), pour
 * Matignon (`posteId` null) ou pour un ministère (compétence et expertise sur ce poste).
 */
function candidateOption(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  candidate: Candidate,
  posteId: string | null = null,
): { id: string; libelle: string; description: string } {
  const { proximiteMin } = ruleset.quinquennat.acceptation;
  const answer =
    candidate.proximite >= proximiteMin
      ? 'acceptation attendue.'
      : 'acceptation incertaine (un refus est possible).';
  const proximite = `Proximité avec vous : ${candidate.proximite}/100 ; ${answer}`;
  if (candidate.member.nature === 'figure') {
    const f = figureById(ruleset, candidate.member.ref)!;
    // Fonction principale (`@r2027/shared`), signalée comme passée quand elle n'est plus exercée.
    const main = figureMainFunction(f);
    const fonction = main.enCours ? main.libelle : `fonction passée : ${main.libelle}`;
    return {
      id: f.id,
      libelle: `${f.prenom} ${f.nom} — ${f.parti}`,
      description:
        `Personnalité réelle (${fonction}) : sa réponse et son action au gouvernement sont simulées, aucun propos ne lui est attribué. ` +
        `Compétence estimée : ${competenceText(state, ruleset, candidate.member, posteId)} ; popularité prêtée (hypothèse) : niveau ${f.notoriete.niveau} sur 3. ${proximite}`,
    };
  }
  const actor = state.actors[candidate.member.ref]!;
  return {
    id: actor.id,
    libelle: `${candidateName(actor.candidate)} — ${actor.candidate.parti}`,
    description:
      (actor.candidate.nature === 'reel'
        ? 'Personnalité réelle candidate : sa réponse et son action au gouvernement sont simulées, aucun propos ne lui est attribué. '
        : 'Candidat de la partie. ') + proximite,
  };
}

function profileOption(president: Actor, profile: MinisterProfile) {
  return {
    id: profile.id,
    libelle: `${profile.prenom} ${profile.nom} — profil fictif (${profile.famille})`,
    description: `${profile.parcours} Compétence de gestion : ${pct(profile.competence)} ; proximité avec vous : ${closeness(president, profile.id, profile.positionnement)}/100. Accepte toujours.`,
  };
}

/** Nombre de personnalités proposées pour Matignon (phase 25 ter). */
export const PRIME_MINISTER_PROPOSALS = 5;

/** État de l'Assemblée au moment de nommer le Premier ministre (phase 25 ter). */
export type AssemblySituation = {
  /** Majorité d'opposition issue des dernières législatives (sa position moyenne), sinon null. */
  cohabitation: Position | null;
  soutien: number;
  opposition: number;
  independants: number;
  majorite: number;
  /** Assemblée issue des législatives de 2024 (réelles) ou d'un scrutin simulé. */
  simulee: boolean;
};

export function assemblySituation(state: GameState, ruleset: Ruleset): AssemblySituation {
  const groupes = Object.values(state.parlement?.groupes ?? {});
  const seats = (alignment: string) =>
    groupes.filter((g) => g.alignement === alignment).reduce((sum, g) => sum + g.sieges, 0);
  return {
    cohabitation: cohabitationMajority(state, ruleset),
    soutien: seats('soutien'),
    opposition: seats('opposition'),
    independants: seats('independant'),
    majorite: state.parlement ? membersMajority(state.parlement) : 0,
    simulee: (state.legislatives?.derniere.motif ?? 'reelles-2024') !== 'reelles-2024',
  };
}

/** Le contexte de la nomination, en clair (phase 25 ter). */
export function assemblyContext(situation: AssemblySituation): string {
  const origin = situation.simulee
    ? 'issue du scrutin législatif simulé'
    : 'issue des législatives de 2024 (groupes actuels)';
  const seats = `${situation.soutien} sièges pour votre camp, ${situation.opposition} pour l’opposition, ${situation.independants} non alignés ; majorité absolue : ${situation.majorite}.`;
  const verdict = situation.cohabitation
    ? 'Cohabitation : l’opposition détient la majorité absolue, les propositions viennent de cette majorité.'
    : situation.soutien >= situation.majorite
      ? 'Majorité absolue pour votre camp : cohabitation improbable, les propositions viennent de votre camp.'
      : 'Majorité relative : cohabitation improbable, les propositions viennent de votre camp et de ses alliés.';
  return `Assemblée nationale ${origin} : ${seats} ${verdict}`;
}

/** Personnalité ou profil envisageable pour Matignon, avec ce qui fonde la proposition. */
type PrimeMinisterPool = {
  member: MemberRef;
  position: Position;
  competence: number;
  proximite: number;
};

function primeMinisterPool(state: GameState, ruleset: Ruleset, president: Actor) {
  const actors = Object.values(state.actors)
    .filter((a) => a.id !== president.id && a.id !== state.player.actorId)
    .map((a) => ({ nature: 'acteur' as const, ref: a.id }));
  const figures = ruleset.figures.figures.map((f) => ({ nature: 'figure' as const, ref: f.id }));
  const profiles = ruleset.quinquennat.profils.map((p) => ({
    nature: 'profil' as const,
    ref: p.id,
  }));
  return [...actors, ...figures, ...profiles]
    .filter((member) => !recentlyRefused(state, ruleset, member.ref))
    .map((member): PrimeMinisterPool => {
      const traits = memberTraits(state, ruleset, member);
      return {
        member,
        position: traits.position,
        competence: traits.competence,
        proximite: closeness(president, member.ref, traits.position),
      };
    });
}

/**
 * Une proposition est cohérente avec l'Assemblée : en cohabitation, plus proche de la majorité
 * d'opposition que du président ; sinon, dans le camp du président (proximité au moins égale au
 * seuil d'acceptation).
 */
export function coherentWithAssembly(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  member: MemberRef,
): boolean {
  const position = memberTraits(state, ruleset, member).position;
  const majority = cohabitationMajority(state, ruleset);
  if (majority)
    return distance(position, majority) < distance(position, president.candidate.positionnement);
  return closeness(president, member.ref, position) >= ruleset.quinquennat.acceptation.proximiteMin;
}

/** Forces et limites d'une proposition (faits du jeu de règles, estimations, hypothèses). */
function proposalTraits(
  state: GameState,
  ruleset: Ruleset,
  candidate: PrimeMinisterPool,
  cohabitation: boolean,
): { forces: string[]; limites: string[] } {
  const forces: string[] = [];
  const limites: string[] = [];
  const { member, competence } = candidate;
  if (competence >= 0.7)
    forces.push(`Compétence de gestion élevée (${pct(competence)}, estimation)`);
  else if (competence < 0.5)
    limites.push(`Compétence de gestion limitée (${pct(competence)}, estimation)`);
  const groupe = memberTraits(state, ruleset, member).groupe;
  const sigle = ruleset.assemblee.groupes.find((g) => g.id === groupe)?.sigle;
  if (cohabitation && groupe && state.parlement?.groupes[groupe]?.alignement === 'opposition')
    forces.push(`Rattachement au groupe ${sigle ?? groupe}, de la majorité`);
  if (member.nature === 'profil') {
    forces.push('Accepte toujours (profil fictif)');
    limites.push('Sans notoriété ni groupe à l’Assemblée');
  } else {
    if (member.nature === 'figure') {
      const niveau = figureById(ruleset, member.ref)!.notoriete.niveau;
      if (niveau === 3) forces.push('Popularité prêtée élevée (hypothèse)');
      if (niveau === 1) limites.push('Peu connue du grand public (hypothèse)');
    }
    if (!cohabitation && candidate.proximite < ruleset.quinquennat.acceptation.proximiteMin + 10)
      limites.push(`Refus possible (proximité ${candidate.proximite}/100)`);
    if (cohabitation) limites.push('Éloignement de votre ligne : arbitrages à négocier');
    else if (forces.length === 0 && limites.length === 0)
      forces.push(`Acceptation attendue (proximité ${candidate.proximite}/100)`);
  }
  return { forces: forces.slice(0, 2), limites: limites.slice(0, 2) };
}

function proposalJustification(
  state: GameState,
  ruleset: Ruleset,
  candidate: PrimeMinisterPool,
  cohabitation: boolean,
): string {
  const { member, proximite } = candidate;
  const camp = cohabitation
    ? 'proche de la majorité d’opposition, que la cohabitation impose de ménager'
    : `proche de votre ligne (proximité ${proximite}/100)`;
  if (member.nature === 'figure') {
    const main = figureMainFunction(figureById(ruleset, member.ref)!);
    return `${main.enCours ? main.libelle : `Ancienne fonction : ${main.libelle}`} ; ${camp}.`;
  }
  if (member.nature === 'acteur') {
    const actor = state.actors[member.ref]!;
    return `Candidature à la présidentielle (${actor.candidate.parti}) ; ${camp}.`;
  }
  const profile = profileById(ruleset, member.ref)!;
  return `Profil fictif (${profile.famille}) ; ${camp}.`;
}

/**
 * Cinq propositions pour Matignon (phase 25 ter), cohérentes avec l'Assemblée : en cohabitation,
 * les plus proches de la majorité d'opposition (puis les plus compétentes) ; sinon, les alliés du
 * président (proximité, puis compétence). Quatre personnalités (acteurs de la partie, figures
 * réelles) et un profil fictif, complétés au besoin. Déterministe ; aucun propos attribué.
 */
export function primeMinisterProposals(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
): { member: MemberRef; proposal: Omit<DecisionProposal, 'optionId'> }[] {
  const majority = cohabitationMajority(state, ruleset);
  const coherent = primeMinisterPool(state, ruleset, president)
    .filter((c) => coherentWithAssembly(state, ruleset, president, c.member))
    .sort((a, b) =>
      majority
        ? distance(a.position, majority) - distance(b.position, majority) ||
          b.competence - a.competence ||
          compareStrings(a.member.ref, b.member.ref)
        : b.proximite +
            COMPETENCE_WEIGHT * b.competence -
            (a.proximite + COMPETENCE_WEIGHT * a.competence) ||
          compareStrings(a.member.ref, b.member.ref),
    );
  const people = coherent.filter((c) => c.member.nature !== 'profil');
  const profiles = coherent.filter((c) => c.member.nature === 'profil');
  const chosen = [...people.slice(0, PRIME_MINISTER_PROPOSALS - 1), ...profiles.slice(0, 1)];
  for (const c of coherent) {
    if (chosen.length >= PRIME_MINISTER_PROPOSALS) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.map((c) => ({
    member: c.member,
    proposal: {
      justification: proposalJustification(state, ruleset, c, majority !== null),
      ...proposalTraits(state, ruleset, c, majority !== null),
    },
  }));
}

/** Décision du président joueur : nommer le Premier ministre. */
export function governmentDecision(state: GameState, ruleset: Ruleset): PendingDecision {
  const president = presidentOf(state);
  const week = state.meta.week;
  const candidates = eligibleCandidates(state, ruleset, president).map((c) =>
    candidateOption(state, ruleset, president, c),
  );
  const profiles = sortedProfiles(president, ruleset, new Set()).map(({ profile }) =>
    profileOption(president, profile),
  );
  const options = [...candidates, ...profiles];
  // Phase 25 ter : les cinq propositions viennent en tête ; la liste complète reste ouverte.
  const proposals = primeMinisterProposals(state, ruleset, president);
  const first = new Set(proposals.map((p) => p.member.ref));
  return {
    id: `g-${week}-${PRIME_MINISTER_POST}`,
    kind: 'gouvernement',
    eventId: GOVERNMENT_DECISION_EVENT,
    actorId: president.id,
    createdWeek: week,
    label: 'Nommer le Premier ministre',
    description:
      'Le Premier ministre proposera les ministres : des personnalités proches de vous si elles acceptent, sinon des profils fictifs ; vous pourrez ensuite pourvoir vous-même les ministères régaliens. Une personnalité éloignée de vous peut refuser.',
    options: [
      ...proposals.map((p) => options.find((o) => o.id === p.member.ref)!),
      ...options.filter((o) => !first.has(o.id)),
    ],
    defaultOptionId: aiPrimeMinister(state, ruleset, president).ref,
    contexte: assemblyContext(assemblySituation(state, ruleset)),
    propositions: proposals.map((p) => ({ optionId: p.member.ref, ...p.proposal })),
  };
}

/** Identifiant de la décision de nomination à un ministère. */
const ministerDecisionId = (week: number, posteId: string) => `g-${week}-${posteId}`;

/**
 * Décision du président joueur sur un ministère : confirmer le ministre proposé par le Premier
 * ministre, ou nommer une autre personnalité (experts du poste d'abord). `intro` précède la
 * description (départ, remaniement ciblé). Remplace une décision ouverte pour le même poste.
 */
export function requestMinisterDecision(
  state: GameState,
  ruleset: Ruleset,
  posteId: string,
  intro = '',
): void {
  const government = state.quinquennat?.gouvernement;
  const current = government?.ministres.find((m) => m.posteId === posteId);
  if (!government || !current) return;
  const president = presidentOf(state);
  const week = state.meta.week;
  const members = new Set([government.premierMinistre, ...government.ministres].map((m) => m.ref));
  const candidates = eligibleCandidates(state, ruleset, president).filter(
    (c) => !members.has(c.member.ref),
  );
  const profiles = sortedProfiles(president, ruleset, members);
  const id = ministerDecisionId(week, posteId);
  state.pendingDecisions = state.pendingDecisions.filter((d) => d.id !== id);
  const name = memberLabel(state, ruleset, current);
  const libelle = ruleset.quinquennat.postes.find((p) => p.id === posteId)?.libelle ?? posteId;
  // Personnalités expertes du poste d'abord (bonus), puis l'ordre de préférence habituel.
  const forPost = candidates
    .map((c, rang) => ({ c, rang, bonus: postExpertise(ruleset, c.member, posteId)?.bonus ?? 0 }))
    .sort((a, b) => b.bonus - a.bonus || a.rang - b.rang)
    .map(({ c }) => c);
  const promise = wasPromised(state, current)
    ? ` Ce ministère avait été promis à ${name} pendant la campagne : le lui retirer coûte ${ruleset.negociations.promesseNonTenue / 100} point(s) de popularité (promesse non tenue).`
    : '';
  state.pendingDecisions.push({
    id,
    kind: 'gouvernement',
    eventId: MINISTER_DECISION_EVENT,
    actorId: president.id,
    createdWeek: week,
    label: `Ministère : ${libelle}`,
    description:
      intro +
      `Le Premier ministre propose ${name}. Confirmez, ou nommez une autre personnalité : une personnalité éloignée de vous peut refuser (refus simulé), et le ministère reste alors à ${name}. ` +
      'La compétence du ministre sur son poste (expertise d’une fonction ministérielle passée ou présente comprise) pèse sur l’action du gouvernement et sur la gestion des crises de son domaine.' +
      promise,
    options: [
      {
        id: current.ref,
        libelle: `Confirmer ${name}`,
        description: `Proposition du Premier ministre. Compétence ${current.nature === 'figure' ? 'estimée' : 'prêtée'} : ${competenceText(state, ruleset, current, posteId)}.`,
      },
      ...forPost.map((c) => candidateOption(state, ruleset, president, c, posteId)),
      ...profiles.map(({ profile }) => profileOption(president, profile)),
    ],
    defaultOptionId: current.ref,
    posteId,
  });
}

/**
 * Décisions du président joueur après la nomination du Premier ministre : confirmer ou
 * remplacer chaque ministre régalien proposé (une décision par ministère).
 */
export function requestMinisters(state: GameState, ruleset: Ruleset): void {
  const government = state.quinquennat?.gouvernement;
  if (!government) return;
  if (presidentOf(state).id !== state.player.actorId) return;
  for (const posteId of ruleset.quinquennat.equipe.postesRegaliens)
    requestMinisterDecision(state, ruleset, posteId);
}

/**
 * Remplaçant proposé par le Premier ministre pour un ministère (départ, remaniement ciblé) :
 * la personnalité proche du président (qui accepte) la plus pertinente pour le poste —
 * expertise, compétence sur le poste, préférence habituelle —, sinon le meilleur profil fictif.
 */
export function proposeReplacement(state: GameState, ruleset: Ruleset, posteId: string): MemberRef {
  const government = state.quinquennat!.gouvernement!;
  const president = presidentOf(state);
  const members = new Set([government.premierMinistre, ...government.ministres].map((m) => m.ref));
  const { proximiteMin } = ruleset.quinquennat.acceptation;
  const best = eligibleCandidates(state, ruleset, president)
    .filter((c) => !members.has(c.member.ref) && c.proximite >= proximiteMin)
    .map((c, rang) => ({
      member: c.member,
      rang,
      bonus: postExpertise(ruleset, c.member, posteId)?.bonus ?? 0,
      competence: postCompetenceOf(state, ruleset, c.member, posteId),
    }))
    .sort((a, b) => b.bonus - a.bonus || b.competence - a.competence || a.rang - b.rang)[0];
  if (best) return best.member;
  return { nature: 'profil', ref: sortedProfiles(president, ruleset, members)[0]!.profile.id };
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
  if (state.pendingDecisions.some((d) => d.eventId === GOVERNMENT_DECISION_EVENT)) return;
  // Matignon vacant : les décisions sur les ministères d'un gouvernement tombé n'ont plus d'objet.
  state.pendingDecisions = state.pendingDecisions.filter(
    (d) => d.eventId !== MINISTER_DECISION_EVENT,
  );
  state.pendingDecisions.push(governmentDecision(state, ruleset));
}

/** Membre désigné par l'identifiant d'une option (acteur, figure ou profil). */
function memberOf(state: GameState, ruleset: Ruleset, optionId: string): MemberRef {
  if (profileById(ruleset, optionId)) return { nature: 'profil', ref: optionId };
  if (figureById(ruleset, optionId)) return { nature: 'figure', ref: optionId };
  if (state.actors[optionId]) return { nature: 'acteur', ref: optionId };
  throw new Error(`Membre du gouvernement inconnu : ${optionId}`);
}

const asPositioned = (state: GameState, ruleset: Ruleset, member: MemberRef) =>
  positioned(member.ref, memberTraits(state, ruleset, member).position);

function governmentEvent(state: GameState, id: string, label: string, description: string) {
  return {
    id: `${id}-${state.meta.week}`,
    kind: 'evenement' as const,
    refId: 'gouvernement',
    label,
    description,
    nature: 'simule' as const,
    majeur: false,
    decisionId: null,
  };
}

/**
 * Réponse du président joueur pour Matignon : nomination, ou refus simulé de la personnalité
 * sollicitée (une nouvelle décision est alors ouverte, sans elle).
 */
export function answerGovernment(
  state: GameState,
  ruleset: Ruleset,
  optionId: string,
  book: NominationBook,
): ReportEvent {
  const president = presidentOf(state);
  const member = memberOf(state, ruleset, optionId);
  if (
    member.nature === 'profil' ||
    acceptsPost(state, ruleset, president, asPositioned(state, ruleset, member))
  )
    return nominate(state, ruleset, member, book);
  state.quinquennat!.refus.push({
    acteurId: member.ref,
    semaine: state.meta.week,
    posteId: PRIME_MINISTER_POST,
  });
  return governmentEvent(
    state,
    `refus-${member.ref}`,
    `${memberName(state, ruleset, member)} décline Matignon (refus simulé)`,
    `Proximité avec le président : ${proximity(president, asPositioned(state, ruleset, member))}/100. Choisissez un autre Premier ministre.`,
  );
}

/**
 * Réponse du président joueur pour un ministère régalien : confirmation, nomination (avec
 * l'effet de la popularité prêtée), ou refus simulé (le ministre proposé reste en place).
 */
export function answerMinister(
  state: GameState,
  ruleset: Ruleset,
  decision: PendingDecision,
  optionId: string,
  book: NominationBook,
): ReportEvent | null {
  const government = state.quinquennat?.gouvernement;
  const posteId = decision.id.slice(`g-${decision.createdWeek}-`.length);
  const current = government?.ministres.find((m) => m.posteId === posteId);
  if (!government || !current || current.ref === optionId) return null;
  const president = presidentOf(state);
  const member = memberOf(state, ruleset, optionId);
  const poste = ruleset.quinquennat.postes.find((p) => p.id === posteId)?.libelle ?? posteId;
  const name = memberName(state, ruleset, member);
  const members = [government.premierMinistre, ...government.ministres];
  if (members.some((m) => m.ref === member.ref)) {
    return governmentEvent(
      state,
      `ministre-${posteId}`,
      `${name} est déjà membre du gouvernement : ministère « ${poste} » inchangé`,
      `${memberName(state, ruleset, current)} reste en fonction.`,
    );
  }
  if (
    member.nature !== 'profil' &&
    !acceptsPost(state, ruleset, president, asPositioned(state, ruleset, member), posteId)
  ) {
    state.quinquennat!.refus.push({ acteurId: member.ref, semaine: state.meta.week, posteId });
    return governmentEvent(
      state,
      `refus-${member.ref}-${posteId}`,
      `${name} décline le ministère « ${poste} » (refus simulé)`,
      `Proximité avec le président : ${proximity(president, asPositioned(state, ruleset, member))}/100. ${memberName(state, ruleset, current)} reste en fonction.`,
    );
  }
  const broken = wasPromised(state, current);
  const index = government.ministres.indexOf(current);
  government.ministres[index] = { ...member, posteId };
  const value = nominationEffect(
    state,
    ruleset,
    member,
    ruleset.quinquennat.equipe.nomination.ministre,
  );
  const factors = [
    {
      label: `Nomination de ${name} (${poste}) : popularité prêtée, hypothèse de jeu`,
      value,
      source: 'decision' as const,
      step: book.step,
    },
  ];
  // Ministère promis pendant la campagne et retiré au premier gouvernement : promesse non tenue.
  if (broken) {
    factors.push({
      label: `Promesse de ministère non tenue : ${memberName(state, ruleset, current)} (hypothèse de jeu)`,
      value: -ruleset.negociations.promesseNonTenue,
      source: 'decision',
      step: book.step,
    });
  }
  book.ledger.apply(president.id, 'popularite', factors);
  return governmentEvent(
    state,
    `ministre-${posteId}`,
    `${memberLabel(state, ruleset, member)} nommé(e) au ministère « ${poste} »`,
    `En remplacement de ${memberName(state, ruleset, current)}. Compétence ${member.nature === 'figure' ? 'estimée' : 'prêtée'} : ${competenceText(state, ruleset, member, posteId)}.`,
  );
}

/**
 * Action du gouvernement, chaque semaine : la compétence de l'équipe (Premier ministre et
 * ministres régaliens) relève ou abaisse la popularité du président (registre).
 */
export function governmentAction(
  state: GameState,
  ruleset: Ruleset,
  presidentId: string,
  book: NominationBook,
): void {
  const government = state.quinquennat?.gouvernement;
  if (!government) return;
  const team = teamCompetence(state, ruleset, government);
  const value = Math.round(ruleset.quinquennat.equipe.actionHebdomadaire * (team - 0.5));
  if (value === 0) return;
  book.ledger.apply(presidentId, 'popularite', [
    {
      label: `Action du gouvernement (compétence de l’équipe : ${pct(team)}, hypothèse de jeu)`,
      value,
      source: 'opinion',
      step: book.step,
    },
  ]);
}

/**
 * Premier quinquennat (phase 7) : choc économique du scénario de départ, appliqué la semaine
 * suivante comme effet différé nommé, et sa conséquence durable éventuelle.
 */
function openScenario(state: GameState, ruleset: Ruleset): void {
  const scenario = ruleset.scenarios.find((s) => s.id === state.scenario);
  if (!scenario || scenario.nature === 'reference') return;
  const label = `Scénario fictif « ${scenario.libelle} » : situation de départ`;
  for (const e of scenario.quinquennat.economie)
    scheduleEconomy(state, e.indicateur, e.valeur, 1, label);
  if (scenario.quinquennat.durable)
    addConsequence(state, scenario.quinquennat.durable, 'scenario', scenario.id);
}

/** Relevé du quinquennat à la date de la partie (popularité du président, économie). */
export function snapshot(state: GameState, presidentId: string): QuinquennatSnapshot {
  return {
    semaine: state.meta.week,
    date: state.meta.date,
    popularite: state.actors[presidentId]?.resources.popularite ?? null,
    indicateurs: state.economie ? { ...state.economie.indicateurs } : null,
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
  const quinquennat: Quinquennat = {
    mandat: { presidentId: winnerId, debut, fin, numero },
    gouvernement: null,
    anciensGouvernements: [],
    feuilleDeRoute: [...winner.programme.propositions],
    refus: [],
    depart: {
      semaine: state.meta.week,
      date: state.meta.date,
      popularite: null,
      indicateurs: null,
    },
    usages: {},
    suivi: {},
    objectifs: [],
    deplacements: {},
    suivisDecisions: [],
  };
  state.quinquennat = quinquennat;
  state.parlement = openParliament(ruleset, winner, state.parlement);
  if (state.economie === null) {
    state.economie = openEconomy(ruleset, state.meta.week);
    openScenario(state, ruleset);
  }
  state.legislatives ??= openLegislatives(ruleset, state.parlement);
  updateTension(state, ruleset);
  // Relevé de départ (bilan de fin de mandat) : popularité du président élu, économie.
  quinquennat.depart = snapshot(state, winnerId);
  state.meta.phase = 'presidence';
  state.calendar = { blockedBy: null, blockedMessage: null };
  requestGovernment(state, ruleset);
}
