import {
  addDays,
  candidateName,
  MINISTER_DECISION_EVENT,
  PRIME_MINISTER_POST,
  type Actor,
  type GameState,
  type Government,
  type MemberRef,
  type MinisterProfile,
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
import { figureById, memberName, memberTraits, profileById, teamCompetence } from './members';
import { openParliament } from './parliament';
import { updateTension } from './tension';

// Investiture et gouvernement (phase 6, P6-03 ; figures réelles en phase 11, P11-02). Le
// président nomme le Premier ministre : le joueur choisit parmi les acteurs de la partie, les
// figures réelles du jeu de règles (fiches sourcées) et les profils fictifs ; une personnalité
// réelle peut refuser (refus simulé, d'après sa proximité avec le président) ; un profil fictif
// accepte toujours. Le Premier ministre propose les ministres : les personnalités proches du
// président (acteurs et figures) qui acceptent, dans la limite du jeu de règles, puis des profils
// fictifs ; le président joueur peut ensuite pourvoir lui-même les ministères régaliens. Même
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
 * Ministres proposés par le Premier ministre : d'abord les personnalités proches du président
 * (acteurs et figures, qui acceptent), dans l'ordre des postes et dans la limite du jeu de
 * règles, puis des profils fictifs du plus au moins pertinent.
 */
export function composeMinisters(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  primeMinister: MemberRef,
): Government['ministres'] {
  const { proximiteMin, ministresActeursMax } = ruleset.quinquennat.acceptation;
  const allies = eligibleCandidates(state, ruleset, president)
    .filter((c) => c.proximite >= proximiteMin && c.member.ref !== primeMinister.ref)
    .slice(0, ministresActeursMax);
  const profiles = sortedProfiles(president, ruleset, new Set([primeMinister.ref]));
  return ruleset.quinquennat.postes.map((poste, i) => {
    const ally = allies[i];
    if (ally) return { ...ally.member, posteId: poste.id };
    return {
      nature: 'profil' as const,
      ref: profiles[i - allies.length]!.profile.id,
      posteId: poste.id,
    };
  });
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

/** Description d'une personnalité proposée au joueur (aucun propos, faits et hypothèses). */
function candidateOption(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
  candidate: Candidate,
): { id: string; libelle: string; description: string } {
  const { proximiteMin } = ruleset.quinquennat.acceptation;
  const answer =
    candidate.proximite >= proximiteMin
      ? 'acceptation attendue.'
      : 'acceptation incertaine (un refus est possible).';
  const proximite = `Proximité avec vous : ${candidate.proximite}/100 ; ${answer}`;
  if (candidate.member.nature === 'figure') {
    const f = figureById(ruleset, candidate.member.ref)!;
    const current = f.fonctions.find((x) => x.enCours && x.nature !== 'autre') ?? f.fonctions[0]!;
    return {
      id: f.id,
      libelle: `${f.prenom} ${f.nom} — ${f.parti}`,
      description:
        `Personnalité réelle (${current.libelle}) : sa réponse et son action au gouvernement sont simulées, aucun propos ne lui est attribué. ` +
        `Compétence estimée : ${pct(f.competence.valeur)} ; popularité prêtée (hypothèse) : niveau ${f.notoriete.niveau} sur 3. ${proximite}`,
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
  return {
    id: `g-${week}-${PRIME_MINISTER_POST}`,
    kind: 'gouvernement',
    eventId: GOVERNMENT_DECISION_EVENT,
    actorId: president.id,
    createdWeek: week,
    label: 'Nommer le Premier ministre',
    description:
      'Le Premier ministre proposera les ministres : des personnalités proches de vous si elles acceptent, sinon des profils fictifs ; vous pourrez ensuite pourvoir vous-même les ministères régaliens. Une personnalité éloignée de vous peut refuser.',
    options: [...candidates, ...profiles],
    defaultOptionId: aiPrimeMinister(state, ruleset, president).ref,
  };
}

/** Identifiant de la décision de nomination à un ministère. */
const ministerDecisionId = (week: number, posteId: string) => `g-${week}-${posteId}`;

/**
 * Décisions du président joueur après la nomination du Premier ministre : confirmer ou
 * remplacer chaque ministre régalien proposé (une décision par ministère).
 */
export function requestMinisters(state: GameState, ruleset: Ruleset): void {
  const government = state.quinquennat?.gouvernement;
  if (!government) return;
  const president = presidentOf(state);
  if (president.id !== state.player.actorId) return;
  const week = state.meta.week;
  const members = new Set([government.premierMinistre, ...government.ministres].map((m) => m.ref));
  const libelles = new Map(ruleset.quinquennat.postes.map((p) => [p.id, p.libelle]));
  const candidates = eligibleCandidates(state, ruleset, president).filter(
    (c) => !members.has(c.member.ref),
  );
  const profiles = sortedProfiles(president, ruleset, members);
  for (const posteId of ruleset.quinquennat.equipe.postesRegaliens) {
    const current = government.ministres.find((m) => m.posteId === posteId);
    if (!current) continue;
    const id = ministerDecisionId(week, posteId);
    state.pendingDecisions = state.pendingDecisions.filter((d) => d.id !== id);
    const name = memberLabel(state, ruleset, current);
    const competence = memberTraits(state, ruleset, current).competence;
    state.pendingDecisions.push({
      id,
      kind: 'gouvernement',
      eventId: MINISTER_DECISION_EVENT,
      actorId: president.id,
      createdWeek: week,
      label: `Ministère : ${libelles.get(posteId) ?? posteId}`,
      description:
        `Le Premier ministre propose ${name}. Confirmez, ou nommez une autre personnalité : une personnalité éloignée de vous peut refuser (refus simulé), et le ministère reste alors à ${name}. ` +
        'La compétence du ministre pèse sur l’action du gouvernement et sur la gestion des crises de son domaine.',
      options: [
        {
          id: current.ref,
          libelle: `Confirmer ${name}`,
          description: `Proposition du Premier ministre. Compétence ${current.nature === 'figure' ? 'estimée' : 'prêtée'} : ${pct(competence)}.`,
        },
        ...candidates.map((c) => candidateOption(state, ruleset, president, c)),
        ...profiles.map(({ profile }) => profileOption(president, profile)),
      ],
      defaultOptionId: current.ref,
    });
  }
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
  const index = government.ministres.indexOf(current);
  government.ministres[index] = { ...member, posteId };
  const value = nominationEffect(
    state,
    ruleset,
    member,
    ruleset.quinquennat.equipe.nomination.ministre,
  );
  if (value !== 0) {
    book.ledger.apply(president.id, 'popularite', [
      {
        label: `Nomination de ${name} (${poste}) : popularité prêtée, hypothèse de jeu`,
        value,
        source: 'decision',
        step: book.step,
      },
    ]);
  }
  return governmentEvent(
    state,
    `ministre-${posteId}`,
    `${memberLabel(state, ruleset, member)} nommé(e) au ministère « ${poste} »`,
    `En remplacement de ${memberName(state, ruleset, current)}. Compétence ${member.nature === 'figure' ? 'estimée' : 'prêtée'} : ${pct(memberTraits(state, ruleset, member).competence)}.`,
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
