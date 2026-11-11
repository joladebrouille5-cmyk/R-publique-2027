// Carte de France 3D (phase 26) : lecture des formes du plateau (chemins SVG déjà projetés) et
// règles d'affichage d'un département — hauteur du relief, avancement du dépouillement. Sans
// three.js : la scène en fait des volumes.

export type Anneau = [number, number][];

/** Anneaux d'un chemin « M x y L x y … Z » (tel que produit par `boardShapes`). */
export function anneaux(d: string): Anneau[] {
  return d
    .split('Z')
    .map((partie) =>
      [...partie.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(
        (m) => [Number(m[1]), Number(m[2])] as [number, number],
      ),
    )
    .filter((anneau) => anneau.length >= 3);
}

export type Departement3D = {
  /** Couleur du candidat en tête (ou teinte d'attente), en hexadécimal. */
  couleur: string;
  /** Score du candidat en tête, en part des exprimés (0 à 1) : hauteur du relief. */
  score: number;
  /** Avancement du dépouillement (0 : en attente ; 1 : terminé). */
  avancement: number;
};

/** Hauteur du relief (unités de la scène) : proportionnelle au score du candidat en tête. */
export const HAUTEUR_MAX = 90;
export const HAUTEUR_SOCLE = 4;
export const hauteurDuRelief = (score: number) =>
  HAUTEUR_SOCLE + HAUTEUR_MAX * Math.max(0, Math.min(1, score));
