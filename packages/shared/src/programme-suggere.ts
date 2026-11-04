import type { Position } from './politics';
import type { Ruleset } from './ruleset';

// Programme de départ suggéré (phase 24) : règle partagée par le moteur (banc d'essai) et
// l'interface (bouton du QG). Les propositions suggérées sont ajoutées par le flux normal du
// programme (`programme.ajouter` du plan de la semaine) : rien n'est annoncé à la place du joueur.

const gap = (a: Position, b: Position) =>
  Math.hypot(a.economie - b.economie, a.societe - b.societe);

/**
 * Propositions à ajouter pour atteindre `programme.minimumRecommande` : les plus proches du
 * positionnement, d'abord une par domaine absent du programme, puis les suivantes ; jamais une
 * proposition déjà retenue, incompatible avec le programme ou dont une dépendance manque, et
 * jamais au-delà de `programme.maxPropositions`. Déterministe (égalités : identifiant).
 */
export function suggestedProgramme(
  position: Position,
  current: readonly string[],
  ruleset: Ruleset,
): string[] {
  const { propositions, minimumRecommande, maxPropositions } = ruleset.programme;
  const byId = new Map(propositions.map((p) => [p.id, p]));
  const target = Math.min(minimumRecommande, maxPropositions);
  const chosen = current.filter((id) => byId.has(id));
  const picked: string[] = [];
  if (chosen.length >= target) return picked;

  const candidates = propositions
    .filter((p) => !chosen.includes(p.id))
    .sort(
      (a, b) => gap(position, a.position) - gap(position, b.position) || a.id.localeCompare(b.id),
    );
  const fits = (id: string) => {
    const p = byId.get(id)!;
    const all = [...chosen, ...picked];
    return (
      !all.includes(id) &&
      p.dependances.every((d) => all.includes(d)) &&
      !p.incompatibilites.some((i) => all.includes(i)) &&
      !all.some((other) => byId.get(other)!.incompatibilites.includes(id))
    );
  };
  const covered = new Set(chosen.map((id) => byId.get(id)!.domaine));
  for (const firstPass of [true, false]) {
    for (const p of candidates) {
      if (chosen.length + picked.length >= target) return picked;
      if (firstPass && covered.has(p.domaine)) continue;
      if (!fits(p.id)) continue;
      picked.push(p.id);
      covered.add(p.domaine);
    }
  }
  return picked;
}

/** Libellés des facteurs d'intention qui dépendent du programme (moteur, §5.1). */
export const PROGRAMME_FACTOR_LABELS = ['Programme', 'Crédibilité'] as const;

/**
 * Effet estimé du programme sur les intentions d'un candidat, en centièmes de point : somme des
 * facteurs « Programme » et « Crédibilité » de la dernière opinion, convertie par la pente du
 * choix (part × (1 − part)). Estimation de lecture, pas un calcul du moteur ; null sans opinion.
 */
export function programmeEffect(
  opinion: {
    intentions: Record<string, number>;
    breakdown: Record<string, { label: string; value: number }[]>;
  } | null,
  actorId: string,
): number | null {
  const factors = opinion?.breakdown[actorId];
  const intention = opinion?.intentions[actorId];
  if (!factors || intention === undefined) return null;
  const utility = factors
    .filter((f) => (PROGRAMME_FACTOR_LABELS as readonly string[]).includes(f.label))
    .reduce((a, f) => a + f.value, 0);
  const share = intention / 10_000;
  return Math.round(share * (1 - share) * utility * 10_000);
}
