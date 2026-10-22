import {
  DIGITAL_HISTORY_WEEKS,
  famillePolitique,
  PARTI_MARQUE,
  type DigitalPost,
  type DigitalReaction,
  type DigitalReception,
  type DigitalTone,
  type GameState,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import type { Rng } from '../core/rng';
import { stream } from '../core/random';
import type { ValidatedAction } from './actions';

// Réseaux sociaux et nouveaux médias (phase 9). Chaque action d'un format numérique (interview
// longue sur YouTube, décryptage, vidéos courtes, direct sur Twitch) produit une publication
// SIMULÉE : vues estimées par le jeu, puis réactions de comptes INVENTÉS tirées des modèles du
// jeu de règles. Les effets sur les jauges passent par les effets de l'action (registre) ;
// ici, rien ne modifie une ressource. Aucun propos n'est prêté à une personne réelle.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Tire un ton : l'humeur (−0,3 à +0,3) dépend de la popularité et du buzz du candidat. */
function drawTone(rng: Rng, mood: number, incident: boolean): DigitalTone {
  const positive = incident ? 0.15 : 0.45 + mood;
  const negative = incident ? 0.6 : 0.2 - mood / 2;
  const roll = rng.nextFloat();
  if (roll < positive) return 'positif';
  if (roll < positive + negative) return 'negatif';
  return 'neutre';
}

/** Accueil d'ensemble : un incident l'emporte ; sinon, solde des réactions. */
export function reception(
  reactions: readonly DigitalReaction[],
  incident: boolean,
): DigitalReception {
  if (incident) return 'hostile';
  const balance = reactions.reduce(
    (sum, r) => sum + (r.ton === 'positif' ? 1 : r.ton === 'negatif' ? -1 : 0),
    0,
  );
  if (balance >= 2) return 'enthousiaste';
  if (balance > 0) return 'favorable';
  if (balance === 0) return 'partage';
  return 'hostile';
}

/**
 * Étape 5 (après les effets des actions) : publications simulées de la semaine, pour le joueur
 * comme pour les adversaires. Le fil de l'état garde les plus récentes.
 */
export function publishDigital(
  state: GameState,
  ruleset: Ruleset,
  validated: readonly ValidatedAction[],
  risks: readonly ReportEvent[],
): DigitalPost[] {
  const rules = ruleset.numerique;
  const formats = new Map(rules.formats.map((f) => [f.id, f]));
  const week = state.meta.week;
  const incidents = new Set(risks.map((r) => r.id));
  const posts: DigitalPost[] = [];
  // Textes des dernières réactions du fil (les plus récentes en dernier) : à ne pas reprendre.
  const used = new Set(
    state.numerique.publications
      .flatMap((p) => p.reactions.map((r) => r.texte))
      .slice(rules.memoireReactions > 0 ? -rules.memoireReactions : Infinity),
  );
  for (const { actorId, index, definition } of validated) {
    const format = definition.format ? formats.get(definition.format) : undefined;
    if (!format) continue;
    const actor = state.actors[actorId]!;
    const rng = stream(state.meta.seed, week, 'numerique', actorId, index, definition.id);
    const id = `a-${week}-${actorId}-${index}`;
    const incident = incidents.has(`${id}-risque`);
    const { notoriete, jeunesse, popularite, dynamique } = actor.resources;
    const spread = 1 + (rng.nextFloat() * 2 - 1) * format.vues.ecart;
    const vues = Math.max(
      0,
      Math.round(
        format.vues.base * (0.5 + notoriete / 10_000) * (0.5 + jeunesse / 10_000) * spread,
      ),
    );
    const mood = clamp((popularite - 3_000) / 10_000 + dynamique / 20_000, -0.3, 0.3);
    // Comptes tirés sans remise ; textes tirés parmi les modèles du ton (format et communs) ou,
    // pour une part des réactions, parmi ceux des militants (soutien) ou des opposants de la
    // famille politique du candidat ; aucun texte déjà paru dans les réactions récentes du fil.
    const accounts = [...rules.comptes];
    const reactions: DigitalReaction[] = [];
    const count = Math.min(rules.reactionsParPublication, accounts.length);
    const partisans = rules.reactionsPartisanes[famillePolitique(actor.candidate.positionnement)];
    const parti = actor.candidate.parti.trim();
    for (let k = 0; k < count; k++) {
      const ton = drawTone(rng, mood, incident);
      const partisan = ton !== 'neutre' && parti !== '' && rng.nextFloat() < rules.partPartisane;
      const general = [...format.reactions[ton], ...rules.reactionsCommunes[ton]];
      const militant = partisan
        ? (ton === 'positif' ? partisans.soutien : partisans.opposition).map((t) =>
            t.replaceAll(PARTI_MARQUE, parti).slice(0, 200),
          )
        : [];
      // Premier jeu de modèles qui offre un texte inédit ; sinon (tout épuisé), le général.
      const pool =
        [militant, general].map((l) => l.filter((t) => !used.has(t))).find((l) => l.length > 0) ??
        general;
      const compte = accounts.splice(rng.nextInt(accounts.length), 1)[0]!;
      const texte = pool[rng.nextInt(pool.length)]!;
      used.add(texte);
      const jaime = Math.round((vues / 2_000) * (0.2 + rng.nextFloat()));
      reactions.push({ compte, texte, ton, jaime });
    }
    reactions.sort((a, b) => b.jaime - a.jaime);
    posts.push({
      id,
      semaine: week,
      acteurId: actorId,
      actionId: definition.id,
      formatId: format.id,
      vues,
      accueil: reception(reactions, incident),
      incident,
      reactions,
    });
  }
  state.numerique.publications = [...state.numerique.publications, ...posts].slice(
    -rules.publicationsMax,
  );
  // Relevé des passages récents de chaque candidat (le fil, limité, ne suffit pas à compter).
  for (const post of posts) {
    const byAction = (state.numerique.passages[post.acteurId] ??= {});
    byAction[post.actionId] = [
      ...(byAction[post.actionId] ?? []).filter((w) => w > week - DIGITAL_HISTORY_WEEKS),
      week,
    ].slice(-DIGITAL_HISTORY_WEEKS);
  }
  return posts;
}
