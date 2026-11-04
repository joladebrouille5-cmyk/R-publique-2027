import {
  DIGITAL_HISTORY_WEEKS,
  plateauFormat,
  type ActionDefinition,
  type GameState,
  type Posture,
  type Prestation,
  type PrestationRules,
  type Ruleset,
} from '@r2027/shared';
import { credibility } from './programme';

export { isPlateau, plateauFormat } from '@r2027/shared';

// Passages dans les médias sans aléa (phase 11) : le score d'un passage (−100 à +100) est la
// somme de raisons explicites, toutes tirées de l'état et du jeu de règles — préparation,
// adéquation de la posture au format, crédibilité du programme, situation, popularité,
// lassitude du public. Aucun tirage : même état, même plan, même résultat. Les affinités
// portent sur des formats d'exercice, jamais sur une chaîne ou une émission réelle.

type Reason = Prestation['raisons'][number];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);

/** Rang du candidat dans les dernières intentions (1 = en tête), sinon null. */
function rankOf(state: GameState, actorId: string): number | null {
  const intentions = state.opinion?.intentions;
  const mine = intentions?.[actorId];
  if (!intentions || mine === undefined) return null;
  return 1 + Object.values(intentions).filter((v) => v > mine).length;
}

/** Situation : l'offensive sert le challenger et dessert le favori ; le rassemblement l'inverse. */
function situation(state: GameState, rules: PrestationRules, actorId: string, posture: Posture) {
  const rank = rankOf(state, actorId);
  if (rank === null || posture === 'pedagogique') return null;
  const secondRound = state.meta.phase === 'entre_deux_tours';
  const where = `${ordinal(rank)} des intentions`;
  if (posture === 'offensive') {
    if (rank === 1) return { label: `Offensive en favori (${where})`, valeur: -rules.situation };
    if (secondRound ? rank === 2 : rank >= 3)
      return { label: `Offensive en challenger (${where})`, valeur: rules.situation };
    return null;
  }
  if (secondRound || rank <= 2)
    return { label: `Rassembleuse en position de l’emporter (${where})`, valeur: rules.situation };
  if (rank >= 5)
    return { label: `Rassembleuse sans réserve de voix (${where})`, valeur: -rules.situation };
  return null;
}

export type PlateauInput = {
  actorId: string;
  definition: ActionDefinition;
  cible: string | null;
  posture: Posture;
  /** Posture choisie dans le plan (sinon : posture par défaut). */
  choisie: boolean;
  /** Heures de préparation de la semaine, en plus de celles déjà acquises. */
  preparationSemaine: number;
  /** Passages dans la même action plus tôt dans le plan de la semaine. */
  passagesSemaine: number;
};

/** Score d'un passage, ses raisons (somme = score avant bornes), son niveau et l'incident. */
export function scorePrestation(
  state: GameState,
  ruleset: Ruleset,
  input: PlateauInput,
): Prestation {
  const rules = ruleset.prestations;
  const { actorId, definition, posture } = input;
  const actor = state.actors[actorId]!;
  const format = plateauFormat(ruleset, definition, input.cible);
  if (!format) throw new Error(`Format de passage introuvable : ${definition.id}`);
  const libelle = rules.postures.find((p) => p.id === posture)!.libelle;
  const reasons: Reason[] = [];

  const hours = actor.preparationDebat + input.preparationSemaine;
  reasons.push({
    label: `Préparation (${Math.min(hours, rules.preparationHeures)} h sur ${rules.preparationHeures} h utiles)`,
    valeur: Math.round(
      (rules.preparation * Math.min(hours, rules.preparationHeures)) / rules.preparationHeures,
    ),
  });
  reasons.push({
    label: `Posture ${libelle.toLowerCase()}, format « ${format.libelle} »`,
    valeur: format.affinites[posture],
  });
  // Aucun programme n'est prêté à une personnalité réelle adverse : facteur neutre.
  if (!(actor.candidate.nature === 'reel' && actor.kind === 'adversaire')) {
    const value = Math.round(
      rules.credibilite[posture] * credibility(actor.programme, ruleset).value,
    );
    if (value !== 0) reasons.push({ label: 'Crédibilité du programme', valeur: value });
  }
  const placed = situation(state, rules, actorId, posture);
  if (placed) reasons.push(placed);
  const popularity = Math.round(
    rules.popularite * clamp((actor.resources.popularite - 3_000) / 3_000, -1, 1),
  );
  if (popularity !== 0)
    reasons.push({
      label: `Popularité (${(actor.resources.popularite / 100).toFixed(0)} %)`,
      valeur: popularity,
    });
  const since = state.meta.week - Math.min(rules.repetition.semaines, DIGITAL_HISTORY_WEEKS);
  const repeats =
    (state.numerique.passages[actorId]?.[definition.id] ?? []).filter(
      (w) => w >= since && w < state.meta.week,
    ).length + input.passagesSemaine;
  if (repeats > 0)
    reasons.push({
      label: `Lassitude du public (${repeats} passage(s) en ${rules.repetition.semaines} semaines)`,
      valeur: -rules.repetition.parPassage * repeats,
    });

  const score = clamp(
    reasons.reduce((sum, r) => sum + r.valeur, 0),
    -100,
    100,
  );
  const { reussie, ratee, incident } = rules.seuils;
  return {
    posture,
    choisie: input.choisie,
    formatId: format.id,
    format: format.libelle,
    score,
    niveau: score >= reussie ? 'reussie' : score < ratee ? 'ratee' : 'correcte',
    incident: definition.risque !== null && score <= incident,
    raisons: reasons,
  };
}

/** Posture au meilleur score (à égalité, l'ordre du jeu de règles) : choix de l'IA. */
export function bestPosture(
  state: GameState,
  ruleset: Ruleset,
  input: Omit<PlateauInput, 'posture' | 'choisie'>,
): Posture {
  let best = ruleset.prestations.postures[0]!.id;
  let bestScore = -Infinity;
  for (const { id } of ruleset.prestations.postures) {
    const { score } = scorePrestation(state, ruleset, { ...input, posture: id, choisie: true });
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** Part déterministe d'un effet : son écart, au prorata du score (−100 à +100). */
export const scoredAlea = (ecart: number, score: number) => Math.round((ecart * score) / 100) + 0;
