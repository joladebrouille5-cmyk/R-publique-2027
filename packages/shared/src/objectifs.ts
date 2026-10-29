import type { GameState } from './game';
import type { MandateGrade, MandateObjective } from './quinquennat';
import type { ObjectiveDefinition, Ruleset } from './ruleset';

// Objectifs de mandat et note finale (phase 15, idée I2) : règles de lecture partagées par le
// moteur (bilan du quinquennat) et l'interface (suivi dans la vue du mandat). Mesure actuelle,
// atteinte, part du chemin parcourue et note sur 20 : un objectif atteint compte pour 1, un
// objectif manqué pour la moitié de la part du chemin parcourue vers la cible. Cibles et barème :
// paramètres de jeu (hypothèses), jamais des prévisions.

/** Objectif du catalogue du jeu de règles ; erreur s'il est inconnu. */
export function objectiveDefinition(ruleset: Ruleset, id: string): ObjectiveDefinition {
  const objective = ruleset.objectifs.catalogue.find((o) => o.id === id);
  if (!objective) throw new Error(`Objectif inconnu du jeu de règles : ${id}`);
  return objective;
}

/** Valeur actuelle de la mesure d'un objectif (unités du jeu de règles). */
export function objectiveMeasure(state: GameState, objective: ObjectiveDefinition): number {
  const quinquennat = state.quinquennat;
  switch (objective.mesure) {
    case 'indicateur':
      return state.economie?.indicateurs[objective.indicateur!] ?? 0;
    case 'popularite':
      return quinquennat
        ? (state.actors[quinquennat.mandat.presidentId]?.resources.popularite ?? 0)
        : 0;
    case 'reformes': {
      const since = quinquennat?.depart.semaine ?? 0;
      return (state.parlement?.reformes ?? []).filter((r) => r.adopteeSemaine >= since).length;
    }
    case 'censures':
      return (quinquennat?.anciensGouvernements ?? []).filter(
        (g) => g.motif === 'motion de censure',
      ).length;
  }
}

/** Un objectif est-il atteint avec cette valeur ? */
export function objectiveMet(
  ruleset: Ruleset,
  objective: MandateObjective,
  value: number,
): boolean {
  return objectiveDefinition(ruleset, objective.id).sens === 'baisse'
    ? value <= objective.cible
    : value >= objective.cible;
}

/**
 * Part du chemin parcourue vers la cible (0 à 1), dans le sens de l'objectif ; nulle quand la
 * cible n'est pas au-delà du départ dans ce sens (un plancher à ne pas franchir, par exemple).
 */
export function objectiveProgress(
  ruleset: Ruleset,
  objective: MandateObjective,
  value: number,
): number {
  const sens = objectiveDefinition(ruleset, objective.id).sens;
  const span =
    sens === 'hausse' ? objective.cible - objective.depart : objective.depart - objective.cible;
  if (span <= 0) return 0;
  const done = sens === 'hausse' ? value - objective.depart : objective.depart - value;
  return Math.min(1, Math.max(0, done / span));
}

/** Note du mandat sur 20 avec ses objectifs à la date de l'état ; null sans objectifs fixés. */
export function mandateGrade(state: GameState, ruleset: Ruleset): MandateGrade | null {
  const objectives = state.quinquennat?.objectifs ?? [];
  if (objectives.length === 0) return null;
  const detail = objectives.map((o) => {
    const fin = objectiveMeasure(state, objectiveDefinition(ruleset, o.id));
    return { ...o, fin, atteint: objectiveMet(ruleset, o, fin) };
  });
  const points = detail.reduce(
    (sum, o) => sum + (o.atteint ? 1 : 0.5 * objectiveProgress(ruleset, o, o.fin)),
    0,
  );
  const valeur = Math.round((20 * points) / detail.length);
  const mention =
    ruleset.objectifs.mentions.find((m) => valeur >= m.min)?.libelle ??
    ruleset.objectifs.mentions.at(-1)!.libelle;
  return { valeur, mention, objectifs: detail };
}
