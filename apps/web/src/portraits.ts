import type { Actor, PhotoCredit, RealPersonality, Ruleset } from '@r2027/shared';

// Portraits des candidats (phase 9) : photo sous licence libre quand elle existe, sinon
// initiales sur la couleur de la famille politique la plus proche. La famille est le groupe
// d'électeurs du jeu de règles le plus proche du positionnement (convention du jeu : ce ne
// sont pas les couleurs officielles d'un parti).

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
  };
}

export type Portrait = {
  prenom: string;
  nom: string;
  photo: string | null;
  famille: Family | null;
};

/** Portrait d'un acteur de la partie : photo de sa fiche réelle s'il en a une. */
export function portraitOf(
  actor: Pick<Actor, 'candidate'>,
  ruleset: Ruleset | undefined,
): Portrait {
  const { candidate } = actor;
  const fiche = candidate.personnaliteId
    ? ruleset?.personnalites.personnalites.find((p) => p.id === candidate.personnaliteId)
    : undefined;
  return {
    prenom: candidate.prenom,
    nom: candidate.nom,
    photo: fiche?.photo ? photoUrl(fiche.photo) : null,
    famille: familyOf(candidate.positionnement, ruleset),
  };
}
