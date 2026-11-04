import { z } from 'zod';
import type { ActionDefinition, Ruleset } from './ruleset';

// Passages dans les médias sans aléa (phase 11) : interview, émission politique, entretien long,
// décryptage, vidéos courtes, direct. Leur réussite ne doit rien au hasard : elle dépend de la
// préparation du candidat, de la posture choisie (offensive, pédagogique, rassembleuse), du
// format de l'exercice, de sa situation (rang, crédibilité du programme, popularité) et de la
// lassitude du public. Les affinités entre postures et formats sont des hypothèses du jeu sur
// les FORMATS, jamais sur une chaîne ou une émission : aucune ligne éditoriale n'est prêtée à
// un média réel.

const RuleId = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'identifiant en minuscules');
const Id = z.string().min(1).max(120);
/** Score, seuils et raisons : centièmes, de −100 (passage raté) à +100 (passage réussi). */
const Score = z.number().int().min(-100).max(100);

export const POSTURES = ['offensive', 'pedagogique', 'rassembleuse'] as const;
export const PostureSchema = z.enum(POSTURES);
export type Posture = z.infer<typeof PostureSchema>;

/** Paramètres de jeu des passages dans les médias (jeu de règles 13.0.0, hypothèses). */
export const PrestationRulesSchema = z
  .object({
    statut: z.literal('hypothese'),
    sourceId: RuleId,
    note: z.string().min(1),
    postures: z
      .array(
        z
          .object({ id: PostureSchema, libelle: z.string().min(1), description: z.string().min(1) })
          .strict(),
      )
      .length(POSTURES.length),
    /** Posture retenue quand le plan n'en précise pas. */
    postureParDefaut: PostureSchema,
    /** Actions jouées comme des passages dans les médias. */
    actions: z.array(RuleId).min(1),
    /** Format d'une interview selon le type de l'organe ciblé, et d'une émission politique. */
    formatParTypeOrgane: z.object({ television: RuleId, radio: RuleId, presse: RuleId }).strict(),
    formatEmission: RuleId,
    formats: z
      .array(
        z
          .object({
            id: RuleId,
            libelle: z.string().min(1),
            /** Adéquation de chaque posture au format, en centièmes (−100 à +100). */
            affinites: z.record(PostureSchema, Score),
          })
          .strict(),
      )
      .min(1),
    /** Préparation (heures de préparation des débats et plateaux) : jusqu'à n centièmes. */
    preparation: Score,
    /** Heures de préparation au-delà desquelles le bonus n'augmente plus. */
    preparationHeures: z.number().int().min(1),
    /** Crédibilité du programme (−1 à +1) : poids par posture, en centièmes. */
    credibilite: z.record(PostureSchema, Score),
    /** Rang dans les intentions : bonus ou malus de situation, en centièmes. */
    situation: Score,
    /** Popularité : écart à 30 %, rapporté à 30 points, en centièmes. */
    popularite: Score,
    /** Lassitude : malus par passage dans la même action pendant les dernières semaines. */
    repetition: z.object({ parPassage: Score, semaines: z.number().int().min(1).max(12) }).strict(),
    seuils: z
      .object({
        /** Au-dessus : passage réussi. */
        reussie: Score,
        /** En dessous : passage raté. */
        ratee: Score,
        /** Au plus : l'aléa de l'action se produit (petite phrase, bad buzz…). */
        incident: Score,
      })
      .strict(),
    /** Tonalité de la couverture par l'organe du passage : ± n points pour un score de ±100. */
    tonalite: z.number().int().min(0).max(100),
  })
  .strict();
export type PrestationRules = z.infer<typeof PrestationRulesSchema>;

export const PRESTATION_LEVELS = ['reussie', 'correcte', 'ratee'] as const;

/** Résultat d'un passage, avec ses raisons : la somme des raisons vaut le score (avant bornes). */
export const PrestationSchema = z
  .object({
    posture: PostureSchema,
    /** Posture choisie dans le plan ; sinon, posture par défaut du jeu de règles. */
    choisie: z.boolean(),
    formatId: Id,
    format: z.string().min(1),
    score: Score,
    niveau: z.enum(PRESTATION_LEVELS),
    incident: z.boolean(),
    raisons: z
      .array(z.object({ label: z.string().min(1), valeur: z.number().int() }).strict())
      .max(8),
  })
  .strict();
export type Prestation = z.infer<typeof PrestationSchema>;

type PlateauRules = Pick<Ruleset, 'prestations' | 'mediasReels'>;

/** L'action se joue-t-elle comme un passage dans les médias ? */
export function isPlateau(ruleset: PlateauRules, action: Pick<ActionDefinition, 'id'>): boolean {
  return ruleset.prestations.actions.includes(action.id);
}

/**
 * Format de l'exercice : interview selon le type de l'organe ciblé (inconnu tant qu'aucun organe
 * n'est choisi), émission politique, ou format numérique de l'action.
 */
export function plateauFormat(
  ruleset: PlateauRules,
  action: Pick<ActionDefinition, 'cible' | 'format'>,
  cible: string | null,
): PrestationRules['formats'][number] | undefined {
  const rules = ruleset.prestations;
  let id: string | undefined;
  if (action.cible === 'media') {
    const outlet = ruleset.mediasReels.organes.find((o) => o.id === cible);
    id = outlet ? rules.formatParTypeOrgane[outlet.type] : undefined;
  } else if (action.cible === 'emission') id = rules.formatEmission;
  else id = action.format;
  return rules.formats.find((f) => f.id === id);
}
