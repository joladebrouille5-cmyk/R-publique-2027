import { figureMainFunction, type GovernmentFigure } from '@r2027/shared';

// Textes des fiches de personnalités réelles nominables (phase 11) : seulement des fonctions
// relevées dans les sources, jamais un propos.

/**
 * Fonction principale d'une figure (règle partagée avec le moteur) : la première en cours (hors
 * « autre »), sinon la première de la fiche, signalée comme passée.
 */
export function mainFunction(figure: Pick<GovernmentFigure, 'fonctions'>): string {
  const main = figureMainFunction(figure);
  return main.enCours ? main.libelle : `${main.libelle} (fonction passée)`;
}
