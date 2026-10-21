import {
  RESOURCE_BOUNDS,
  RESOURCE_KEYS,
  type Factor,
  type GameState,
  type ResourceChange,
  type ResourceKey,
} from '@r2027/shared';

/**
 * Registre des variations de ressources d'une semaine. Toute modification passe par ici :
 * chaque variation est la somme exacte de ses facteurs, écrêtement aux bornes compris.
 */
export class Ledger {
  private readonly changes = new Map<string, ResourceChange>();

  constructor(private readonly state: GameState) {}

  current(actorId: string, ressource: ResourceKey): number {
    return this.actor(actorId).resources[ressource];
  }

  /** Applique un ensemble de facteurs comme une seule variation, puis écrête aux bornes. */
  apply(actorId: string, ressource: ResourceKey, factors: Factor[]): number {
    const significant = factors.filter((factor) => factor.value !== 0);
    if (significant.length === 0) return 0;
    const actor = this.actor(actorId);
    const before = actor.resources[ressource];
    const raw = before + significant.reduce((sum, factor) => sum + factor.value, 0);
    const { min, max } = RESOURCE_BOUNDS[ressource];
    const bounded = Math.min(max, Math.max(min, raw));
    const recorded = [...significant];
    if (bounded !== raw) {
      recorded.push({
        label: bounded === max ? 'Plafond atteint' : 'Plancher atteint (aucune valeur négative)',
        value: bounded - raw,
        source: 'limite',
        step: significant[significant.length - 1]!.step,
      });
    }
    actor.resources[ressource] = bounded;

    const key = `${actorId}\u0000${ressource}`;
    const change = this.changes.get(key) ?? {
      actorId,
      ressource,
      before,
      after: before,
      factors: [],
    };
    change.after = bounded;
    change.factors.push(...recorded);
    this.changes.set(key, change);
    return bounded - before;
  }

  /** Variations de la semaine, dans un ordre stable (acteur, puis ordre des ressources). */
  list(): ResourceChange[] {
    return [...this.changes.values()]
      .filter((change) => change.factors.length > 0)
      .sort(
        (a, b) =>
          compareStrings(a.actorId, b.actorId) ||
          RESOURCE_KEYS.indexOf(a.ressource) - RESOURCE_KEYS.indexOf(b.ressource),
      );
  }

  factorsOfStep(step: number): Factor[] {
    return this.list().flatMap((change) => change.factors.filter((f) => f.step === step));
  }

  private actor(actorId: string) {
    const actor = this.state.actors[actorId];
    if (!actor) throw new Error(`Acteur inconnu : ${actorId}`);
    return actor;
  }
}

/** Comparaison indépendante de la langue du système (déterminisme). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
