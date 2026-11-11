// Disposition des sièges de l'hémicycle 3D (phase 26) : arcs concentriques en gradins, groupes
// rangés de la gauche vers la droite en secteurs, comme sur l'hémicycle 2D. Aucune donnée ici :
// les effectifs viennent de la partie, les couleurs de la convention du jeu.

export type GroupeSieges = { id: string; sieges: number };

export type Siege = {
  /** Position dans la salle : x vers la droite, z vers le fond, y la hauteur du gradin. */
  x: number;
  y: number;
  z: number;
  /** Angle sur l'arc : π à l'extrême gauche, 0 à l'extrême droite. */
  angle: number;
  rang: number;
  /** Groupe assis, ou null pour un siège vacant. */
  groupe: string | null;
};

export const RAYON_INTERIEUR = 3.2;
export const RAYON_EXTERIEUR = 9.6;
const HAUTEUR_GRADIN = 0.34;

/** Places par rang, proportionnelles au rayon (méthode du plus fort reste). */
export function rangs(total: number): { rayon: number; sieges: number }[] {
  const nombre = Math.max(1, Math.round(Math.sqrt(total / 4.5)));
  const rayons = Array.from(
    { length: nombre },
    (_, i) => RAYON_INTERIEUR + ((RAYON_EXTERIEUR - RAYON_INTERIEUR) * i) / Math.max(1, nombre - 1),
  );
  const somme = rayons.reduce((a, b) => a + b, 0);
  const exact = rayons.map((r) => (total * r) / somme);
  const sieges = exact.map(Math.floor);
  let reste = total - sieges.reduce((a, b) => a + b, 0);
  const ordre = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  for (const { i } of ordre) {
    if (reste-- <= 0) break;
    sieges[i]! += 1;
  }
  return rayons.map((rayon, i) => ({ rayon, sieges: sieges[i]! }));
}

/**
 * Les `total` sièges de la salle, attribués aux groupes dans l'ordre donné (de la gauche vers la
 * droite) ; les sièges restants, à l'extrême droite, sont vacants. Un groupe occupe un secteur :
 * les sièges sont pris par angle décroissant, tous rangs confondus.
 */
export function disposerSieges(total: number, groupes: readonly GroupeSieges[]): Siege[] {
  const sieges: Siege[] = [];
  rangs(total).forEach(({ rayon, sieges: places }, rang) => {
    for (let k = 0; k < places; k++) {
      const angle = places === 1 ? Math.PI / 2 : Math.PI * (1 - k / (places - 1));
      sieges.push({
        x: rayon * Math.cos(angle),
        y: rang * HAUTEUR_GRADIN,
        z: -rayon * Math.sin(angle),
        angle,
        rang,
        groupe: null,
      });
    }
  });
  sieges.sort((a, b) => b.angle - a.angle || a.rang - b.rang);
  let index = 0;
  for (const groupe of groupes)
    for (let k = 0; k < groupe.sieges && index < sieges.length; k++)
      sieges[index++]!.groupe = groupe.id;
  return sieges;
}

/** Centre d'un groupe dans la salle (cible de la caméra et du halo), ou null s'il n'a aucun siège. */
export function centreDuGroupe(sieges: readonly Siege[], groupe: string) {
  const siens = sieges.filter((s) => s.groupe === groupe);
  if (siens.length === 0) return null;
  const somme = siens.reduce((a, s) => ({ x: a.x + s.x, y: a.y + s.y, z: a.z + s.z }), {
    x: 0,
    y: 0,
    z: 0,
  });
  return { x: somme.x / siens.length, y: somme.y / siens.length, z: somme.z / siens.length };
}

export const REACTIONS = ['apaisement', 'echauffement', 'contre-attaque'] as const;
export type Reaction = (typeof REACTIONS)[number];

/**
 * Réaction de la salle à une réplique, d'après ses points de tension (jeu de règles) : négatifs,
 * la salle s'apaise ; nettement positifs, l'opposition réagit à la contre-attaque ; sinon elle
 * s'échauffe.
 */
export function reactionDeLaSalle(pointsDeTension: number): Reaction {
  if (pointsDeTension < 0) return 'apaisement';
  return pointsDeTension >= 6 ? 'contre-attaque' : 'echauffement';
}

/**
 * Amplitude des micro-mouvements d'un siège (0 à 1) : la tension parlementaire de la partie donne
 * le fond, la réaction le relief. À la contre-attaque, l'opposition bondit et la majorité
 * applaudit à peine.
 */
export function agitation(
  reaction: Reaction | null,
  tension: number,
  alignement: 'soutien' | 'independant' | 'opposition',
): number {
  const fond = 0.04 + 0.22 * Math.max(0, Math.min(1, tension / 100));
  if (reaction === null) return fond;
  if (reaction === 'apaisement') return fond * 0.15;
  if (reaction === 'echauffement') return Math.min(1, fond + 0.35);
  return alignement === 'opposition' ? 1 : alignement === 'independant' ? 0.45 : 0.18;
}
