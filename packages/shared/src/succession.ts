// Présidentielle suivante (phase 23) : options de la décision de candidature du joueur. Règle
// commune au moteur (création et application de la décision) et à l'interface (cartes des
// successeurs : portrait, nom, parti, nature réelle ou fictive).

/** Option « se représenter » de la décision `candidature`. */
export const REPRESENT_OPTION_ID = 'se-representer';

export const SUCCESSOR_NATURES = ['acteur', 'figure', 'profil'] as const;
/** Successeur proposé : acteur de la partie, figure réelle du vivier ou profil fictif. */
export type SuccessorSource = { nature: (typeof SUCCESSOR_NATURES)[number]; ref: string };

const SUCCESSOR_OPTION = /^successeur-(acteur|figure|profil)-(.+)$/;

/** Identifiant de l'option « passer la main à » un successeur. */
export const successorOptionId = (source: SuccessorSource) =>
  `successeur-${source.nature}-${source.ref}`;

/** Successeur désigné par une option de la décision de candidature, ou null. */
export function parseSuccessorOptionId(id: string): SuccessorSource | null {
  const match = SUCCESSOR_OPTION.exec(id);
  return match ? { nature: match[1] as SuccessorSource['nature'], ref: match[2]! } : null;
}
