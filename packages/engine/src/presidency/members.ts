import {
  candidateName,
  type GameState,
  type Government,
  type GovernmentFigure,
  type MemberRef,
  type MinisterProfile,
  type Position,
  type Ruleset,
} from '@r2027/shared';

// Membres du gouvernement (phase 11, P11-02) : ce que le jeu prête à chacun — compétence
// (estimée pour une figure réelle, paramètre de jeu sinon), popularité (celle de l'acteur, ou
// prêtée à une figure d'après sa notoriété, hypothèse), groupe de l'Assemblée associé et position.
// Utilisé par le gouvernement, le Parlement, la censure et les crises.

export function profileById(ruleset: Ruleset, id: string): MinisterProfile | undefined {
  return ruleset.quinquennat.profils.find((p) => p.id === id);
}

export function figureById(ruleset: Ruleset, id: string): GovernmentFigure | undefined {
  return ruleset.figures.figures.find((f) => f.id === id);
}

/** Nom d'un membre du gouvernement, sans mention de sa nature. */
export function memberName(state: GameState, ruleset: Ruleset, member: MemberRef): string {
  if (member.nature === 'profil') {
    const profile = profileById(ruleset, member.ref);
    return profile ? `${profile.prenom} ${profile.nom}` : member.ref;
  }
  if (member.nature === 'figure') {
    const figure = figureById(ruleset, member.ref);
    return figure ? `${figure.prenom} ${figure.nom}` : member.ref;
  }
  const actor = state.actors[member.ref];
  return actor ? candidateName(actor.candidate) : member.ref;
}

/** Ce que le jeu prête à un membre du gouvernement (hypothèses, estimations). */
export type MemberTraits = {
  /** Compétence de gestion (0 à 1). */
  competence: number;
  /** Popularité (centièmes de point) : celle de l'acteur, ou prêtée à une figure ; neutre sinon. */
  popularite: number;
  /** Groupe de l'Assemblée nationale associé, ou null. */
  groupe: string | null;
  position: Position;
};

export function memberTraits(state: GameState, ruleset: Ruleset, member: MemberRef): MemberTraits {
  const reference = ruleset.jeu.opinion.popularite.reference;
  const equipe = ruleset.quinquennat.equipe;
  if (member.nature === 'profil') {
    const profile = profileById(ruleset, member.ref);
    if (!profile) throw new Error(`Profil inconnu : ${member.ref}`);
    return {
      competence: profile.competence,
      popularite: reference,
      groupe: null,
      position: profile.positionnement,
    };
  }
  if (member.nature === 'figure') {
    const figure = figureById(ruleset, member.ref);
    if (!figure) throw new Error(`Figure inconnue : ${member.ref}`);
    return {
      competence: figure.competence.valeur,
      popularite: equipe.popularite[figure.notoriete.niveau - 1]!,
      groupe: figure.groupe,
      position: { economie: figure.position.economie, societe: figure.position.societe },
    };
  }
  const actor = state.actors[member.ref];
  if (!actor) throw new Error(`Acteur inconnu : ${member.ref}`);
  const personality = actor.candidate.personnaliteId;
  return {
    competence: equipe.competenceActeur,
    popularite: actor.resources.popularite,
    groupe: personality
      ? (ruleset.figures.rattachements.find((r) => r.personnaliteId === personality)?.groupe ??
        null)
      : null,
    position: actor.candidate.positionnement,
  };
}

/** Compétence de l'équipe : Premier ministre et moyenne des ministres régaliens (pondérés). */
export function teamCompetence(state: GameState, ruleset: Ruleset, government: Government) {
  const { poidsPremierMinistre, postesRegaliens } = ruleset.quinquennat.equipe;
  const pm = memberTraits(state, ruleset, government.premierMinistre).competence;
  const regalian = government.ministres.filter((m) => postesRegaliens.includes(m.posteId));
  if (regalian.length === 0) return pm;
  const mean =
    regalian.reduce((sum, m) => sum + memberTraits(state, ruleset, m).competence, 0) /
    regalian.length;
  return poidsPremierMinistre * pm + (1 - poidsPremierMinistre) * mean;
}

/** Membres du gouvernement en place par groupe de l'Assemblée (ouverture aux autres groupes). */
export function governmentGroups(state: GameState, ruleset: Ruleset): Map<string, number> {
  const government = state.quinquennat?.gouvernement;
  const counts = new Map<string, number>();
  if (!government) return counts;
  for (const member of [government.premierMinistre, ...government.ministres]) {
    const groupe = memberTraits(state, ruleset, member).groupe;
    if (groupe) counts.set(groupe, (counts.get(groupe) ?? 0) + 1);
  }
  return counts;
}

/** Membre du gouvernement chargé d'un poste (le Premier ministre si le poste est vacant ou null). */
export function memberInCharge(state: GameState, posteId: string | null): MemberRef | null {
  const government = state.quinquennat?.gouvernement;
  if (!government) return null;
  return (
    (posteId ? government.ministres.find((m) => m.posteId === posteId) : undefined) ??
    government.premierMinistre
  );
}
