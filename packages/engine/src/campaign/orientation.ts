import type {
  ElectorateGroup,
  GameState,
  Orientation,
  Position,
  Ruleset,
  UtilityFactor,
} from '@r2027/shared';
import { distance } from '../election/model';

// Orientation stratégique du mouvement du joueur (phase 15), choisie à la création de la partie :
// moyens et promesses de parrainage de départ, et base électorale de départ, facteur du score
// latent dans certains groupes d'électeurs qui décroît linéairement jusqu'à s'éteindre (au bout
// de `dureeSemaines` semaines de partie). Paramètres de jeu (hypothèses), sans prétention de mesure.

const CENTER: Position = { economie: 0, societe: 0 };

export function orientationById(ruleset: Ruleset, id: string): Orientation | undefined {
  return ruleset.orientations.liste.find((o) => o.id === id);
}

/** Groupes d'électeurs concernés par la base électorale de départ d'une orientation. */
export function baseGroups(
  ruleset: Ruleset,
  orientation: Orientation,
  position: Position,
): Set<string> {
  const groups = ruleset.electorat.groupes;
  const { groupes, distance: limit = 0 } = orientation.base;
  if (groupes === 'tous') return new Set(groups.map((g) => g.id));
  if (groupes === 'plus-proche') {
    // Le plus proche du candidat ; à égalité, le premier dans l'ordre du jeu de règles.
    let nearest = groups[0]!;
    for (const g of groups)
      if (distance(g.position, position) < distance(nearest.position, position)) nearest = g;
    return new Set([nearest.id]);
  }
  return new Set(
    groups
      .filter((g) =>
        groupes === 'proches'
          ? distance(g.position, position) <= limit
          : distance(g.position, CENTER) >= limit,
      )
      .map((g) => g.id),
  );
}

/** Part restante (1 → 0) de la base électorale de départ, selon les semaines de partie écoulées. */
export function baseRemaining(state: GameState, ruleset: Ruleset): number {
  return Math.max(0, 1 - state.meta.week / ruleset.orientations.dureeSemaines);
}

/** Facteur « base électorale de départ » du candidat du joueur dans un groupe d'électeurs. */
export function orientationFactors(
  state: GameState,
  ruleset: Ruleset,
  group: ElectorateGroup,
  actorId: string,
): UtilityFactor[] {
  const id = state.player.orientation;
  if (!id || actorId !== state.player.actorId) return [];
  const orientation = orientationById(ruleset, id);
  if (!orientation) throw new Error(`Orientation inconnue du jeu de règles : ${id}`);
  const remaining = baseRemaining(state, ruleset);
  if (remaining === 0) return [];
  const actor = state.actors[actorId]!;
  if (!baseGroups(ruleset, orientation, actor.candidate.positionnement).has(group.id)) return [];
  return [
    {
      label: `Base électorale de départ (« ${orientation.libelle} », hypothèse de jeu)`,
      value: orientation.base.valeur * remaining,
    },
  ];
}
