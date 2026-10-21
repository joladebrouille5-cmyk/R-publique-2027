import type { Coverage, GameState, MediaState, Ruleset } from '@r2027/shared';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import type { ValidatedAction } from './actions';
import { credibility, proposalsById } from './programme';

// Médias (§8) : chaque organe (fictif) a une portée, une audience, une crédibilité et des
// priorités. Chaque semaine, il expose les candidats selon leur notoriété, leurs actions et la
// rencontre entre leur programme et ses priorités, avec une tonalité qui dépend de leur
// popularité, de la crédibilité de leur programme, d'une part d'aléa et des incidents.

const ACTIVE = new Set(['candidat', 'qualifie']);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Part de l'exposition répartie selon la notoriété (le reste vient des actions et du programme). */
const NOTORIETY_SHARE = 6_000;
const PRIORITY_BONUS = 150;
const PRIORITY_BONUS_MAX = 600;
const INCIDENT_TONE = 30;

/**
 * Étape 6 : couverture de la semaine, indice médiatique de chaque candidat (−1 à +1) et gain
 * de notoriété proportionnel à l'audience touchée (inscrit au registre avec son facteur).
 */
export function updateMedia(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  actions: readonly ValidatedAction[],
  incidents: ReadonlySet<string>,
  step: number,
): MediaState | null {
  const actors = Object.values(state.actors)
    .filter((a) => ACTIVE.has(a.status))
    .sort((a, b) => compareStrings(a.id, b.id));
  if (actors.length === 0) return null;
  const week = state.meta.week;
  const proposals = proposalsById(ruleset);
  const attention = actors.map((a) => Math.pow(Math.max(a.resources.notoriete, 100) / 10_000, 1.5));
  const totalAttention = attention.reduce((sum, v) => sum + v, 0);

  const couverture: MediaState['couverture'] = {};
  const weighted = new Map<string, number>(actors.map((a) => [a.id, 0]));
  const reach = new Map<string, number>(actors.map((a) => [a.id, 0]));
  let totalWeight = 0;
  for (const outlet of ruleset.medias.organes) {
    const weight = outlet.audience * outlet.credibilite;
    totalWeight += weight;
    couverture[outlet.id] = {};
    // Un flux d'aléa par organe, tiré candidat par candidat dans l'ordre des identifiants.
    const rng = stream(state.meta.seed, week, 'medias', outlet.id);
    actors.forEach((actor, i) => {
      let exposure = Math.round((NOTORIETY_SHARE * attention[i]!) / totalAttention);
      for (const action of actions) {
        if (action.actorId !== actor.id) continue;
        const bonus = action.definition.campagne?.exposition ?? 0;
        if (bonus === 0) continue;
        if (action.cible === outlet.id) exposure += bonus;
        else if (action.definition.cible !== 'media') {
          const national = action.definition.portee === 'nationale';
          if (national === (outlet.portee === 'nationale')) exposure += Math.round(bonus / 3);
        }
      }
      const matches = actor.programme.propositions.filter((id) =>
        outlet.priorites.includes(proposals.get(id)?.domaine ?? ''),
      ).length;
      exposure += Math.min(PRIORITY_BONUS_MAX, PRIORITY_BONUS * matches);
      exposure = clamp(exposure, 0, 10_000);

      const alea = rng.nextFloat() * 50 - 25;
      const tone = Math.round(
        clamp(
          (actor.resources.popularite - 3_000) / 40 +
            credibility(actor.programme, ruleset).value * 30 * outlet.credibilite +
            alea -
            (incidents.has(actor.id) ? INCIDENT_TONE : 0),
          -100,
          100,
        ),
      );
      const coverage: Coverage = { exposition: exposure, tonalite: tone + 0 };
      couverture[outlet.id]![actor.id] = coverage;
      weighted.set(actor.id, weighted.get(actor.id)! + (weight * exposure * tone) / 1_000_000);
      reach.set(actor.id, reach.get(actor.id)! + outlet.audience * exposure);
    });
  }

  const indice: MediaState['indice'] = {};
  for (const actor of actors) {
    indice[actor.id] = Math.round((weighted.get(actor.id)! / totalWeight) * 1000) / 1000 + 0;
    const gain = Math.round(ruleset.medias.notorieteParExposition * reach.get(actor.id)!);
    ledger.apply(actor.id, 'notoriete', [
      { label: 'Couverture médiatique de la semaine', value: gain, source: 'opinion', step },
    ]);
  }
  return { semaine: week, couverture, indice };
}
