import type {
  Actor,
  FictionalCandidate,
  MinisterProfile,
  PhotoCredit,
  RealPersonality,
  Ruleset,
} from '@r2027/shared';

// Portraits (phase 9, étendus en phase 13) : la photo importée par le joueur pour son candidat,
// ou la photo sous licence libre d'une personnalité réelle ; à défaut, un portrait illustré
// généré pour un personnage fictif (adversaire, profil du gouvernement, candidat sans photo) et
// une silhouette neutre avec les initiales pour une personne réelle — jamais de visage dessiné
// pour une personne réelle. Fond : couleur de la famille politique la plus proche, le groupe
// d'électeurs du jeu de règles le plus proche du positionnement (convention du jeu : ce ne sont
// pas les couleurs officielles d'un parti).

export type Family = {
  id: string;
  libelle: string;
  /** Fond de l'avatar et texte lisible dessus (contraste vérifié ≥ 4,5:1). */
  fond: string;
  texte: string;
};

const PALETTE: Record<string, { fond: string; texte: string }> = {
  'gauche-radicale': { fond: '#b81d3a', texte: '#ffffff' },
  'gauche-sociale': { fond: '#c2386e', texte: '#ffffff' },
  ecologistes: { fond: '#17804a', texte: '#ffffff' },
  'centre-gauche': { fond: '#b5501a', texte: '#ffffff' },
  'centre-liberal': { fond: '#f2c14e', texte: '#2a1f00' },
  'droite-moderee': { fond: '#2a6fc0', texte: '#ffffff' },
  'droite-conservatrice': { fond: '#2440b0', texte: '#ffffff' },
  'droite-nationale': { fond: '#1c2a5e', texte: '#ffffff' },
  eloignes: { fond: '#5d6886', texte: '#ffffff' },
};
const NEUTRAL = { fond: '#5d6886', texte: '#ffffff' };

export function familyOf(
  position: { economie: number; societe: number },
  ruleset: Pick<Ruleset, 'electorat'> | undefined,
): Family | null {
  const groups = ruleset?.electorat.groupes ?? [];
  let best: (typeof groups)[number] | undefined;
  let bestDistance = Infinity;
  for (const group of groups) {
    const distance = Math.hypot(
      group.position.economie - position.economie,
      group.position.societe - position.societe,
    );
    if (distance < bestDistance) {
      best = group;
      bestDistance = distance;
    }
  }
  if (!best) return null;
  return { id: best.id, libelle: best.libelle, ...(PALETTE[best.id] ?? NEUTRAL) };
}

export function initialsOf(person: { prenom: string; nom: string }): string {
  const first = (word: string) => [...word.trim()][0] ?? '';
  const initials = `${first(person.prenom)}${first(person.nom)}`.toLocaleUpperCase('fr-FR');
  return initials || '?';
}

export const photoUrl = (photo: PhotoCredit) => `${import.meta.env.BASE_URL}${photo.fichier}`;

/** Portrait d'une fiche de personnalité réelle (choix de la personnalité incarnée). */
export function portraitOfPersonality(
  personality: Pick<RealPersonality, 'prenom' | 'nom' | 'photo' | 'position'>,
  ruleset: Pick<Ruleset, 'electorat'> | undefined,
): Portrait {
  return {
    prenom: personality.prenom,
    nom: personality.nom,
    photo: personality.photo ? photoUrl(personality.photo) : null,
    famille: familyOf(personality.position, ruleset),
    illustration: null,
  };
}

export type Portrait = {
  prenom: string;
  nom: string;
  photo: string | null;
  famille: Family | null;
  /** Graine du portrait illustré d'un personnage fictif ; null pour une personne réelle. */
  illustration: string | null;
};

/**
 * Portrait d'un acteur de la partie : la photo importée par le joueur, la photo libre de sa
 * fiche réelle (candidate ou figure du vivier, phase 23), sinon un portrait illustré s'il est fictif (silhouette et initiales s'il est
 * réel).
 */
export function portraitOf(
  actor: Pick<Actor, 'candidate'>,
  ruleset: Ruleset | undefined,
): Portrait {
  const { candidate } = actor;
  // Phase 23 : une figure du vivier entrée dans la course garde la photo libre de sa fiche.
  const fiche = candidate.personnaliteId
    ? ruleset?.personnalites.personnalites.find((p) => p.id === candidate.personnaliteId)
    : candidate.figureId
      ? ruleset?.figures.figures.find((f) => f.id === candidate.figureId)
      : undefined;
  return {
    prenom: candidate.prenom,
    nom: candidate.nom,
    photo: candidate.photo ?? (fiche?.photo ? photoUrl(fiche.photo) : null),
    famille: familyOf(candidate.positionnement, ruleset),
    illustration:
      candidate.nature === 'reel'
        ? null
        : `${candidate.nature}:${candidate.prenom} ${candidate.nom}`,
  };
}

/** Portrait d'un profil fictif du gouvernement : toujours illustré. */
export function portraitOfProfile(
  profile: Pick<MinisterProfile, 'id' | 'prenom' | 'nom' | 'positionnement'>,
  ruleset: Pick<Ruleset, 'electorat'> | undefined,
): Portrait {
  return {
    prenom: profile.prenom,
    nom: profile.nom,
    photo: null,
    famille: familyOf(profile.positionnement, ruleset),
    illustration: `profil:${profile.id}`,
  };
}

/**
 * Portrait d'un candidat fictif du jeu de règles (mur d'affichage de l'écran-titre) : la même
 * graine que dans la partie, donc le même visage.
 */
export function portraitOfFictional(
  candidate: Pick<FictionalCandidate, 'prenom' | 'nom' | 'positionnement'>,
  ruleset: Pick<Ruleset, 'electorat'> | undefined,
): Portrait {
  return {
    prenom: candidate.prenom,
    nom: candidate.nom,
    photo: null,
    famille: familyOf(candidate.positionnement, ruleset),
    illustration: `fictif:${candidate.prenom} ${candidate.nom}`,
  };
}

/**
 * Couleur d'un candidat dans les graphiques (sondages, résultats) : celle de sa famille politique
 * (convention du jeu, pas la couleur officielle d'un parti) ; le nom est toujours écrit à côté.
 */
export function colorOf(
  actor: Pick<Actor, 'candidate'> | undefined,
  ruleset: Pick<Ruleset, 'electorat'> | undefined,
): string {
  return (actor && familyOf(actor.candidate.positionnement, ruleset)?.fond) ?? NEUTRAL.fond;
}
