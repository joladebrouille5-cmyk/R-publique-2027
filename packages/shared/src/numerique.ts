import { z } from 'zod';

// Réseaux sociaux et nouveaux médias (phase 9, format 14). Formats réels sourcés dans le jeu
// de règles (interviews longues sur YouTube, décryptage, vidéos courtes, direct sur Twitch) ;
// chaque passage du candidat produit une publication SIMULÉE : vues estimées par le jeu et
// réactions de comptes INVENTÉS, tirées de modèles du jeu de règles. Aucun propos n'est prêté
// à un animateur, à une chaîne ni à une personne réelle : le schéma n'a aucun champ pour cela.

export const DIGITAL_TONES = ['positif', 'neutre', 'negatif'] as const;
export const DigitalToneSchema = z.enum(DIGITAL_TONES);
export type DigitalTone = z.infer<typeof DigitalToneSchema>;

/** Réaction d'un compte fictif (pseudonyme inventé du jeu de règles). */
export const DigitalReactionSchema = z
  .object({
    compte: z.string().regex(/^@[a-z0-9_.]{3,30}$/),
    texte: z.string().min(1).max(200),
    ton: DigitalToneSchema,
    /** « J'aime » simulés. */
    jaime: z.number().int().min(0),
  })
  .strict();
export type DigitalReaction = z.infer<typeof DigitalReactionSchema>;

/** Accueil d'ensemble d'une publication, déduit des réactions et d'un éventuel incident. */
export const DIGITAL_RECEPTIONS = ['enthousiaste', 'favorable', 'partage', 'hostile'] as const;
export const DigitalReceptionSchema = z.enum(DIGITAL_RECEPTIONS);
export type DigitalReception = z.infer<typeof DigitalReceptionSchema>;

/** Publication simulée : un passage d'un candidat dans un format numérique. */
export const DigitalPostSchema = z
  .object({
    id: z.string().min(1).max(120),
    semaine: z.number().int().min(0),
    acteurId: z.string().min(1).max(120),
    actionId: z.string().min(1).max(120),
    formatId: z.string().min(1).max(120),
    /** Vues estimées par le jeu (simulation). */
    vues: z.number().int().min(0),
    accueil: DigitalReceptionSchema,
    /** L'aléa de l'action s'est produit (séquence sortie de son contexte, etc.). */
    incident: z.boolean(),
    reactions: z.array(DigitalReactionSchema).max(6),
  })
  .strict();
export type DigitalPost = z.infer<typeof DigitalPostSchema>;

/** Fil des dernières publications simulées (format 14, figé pour les migrations). */
export const DigitalStateV14Schema = z
  .object({ publications: z.array(DigitalPostSchema).max(60) })
  .strict();

/** Semaines des passages récents (douze au plus) d'un candidat, par action numérique. */
export const DIGITAL_HISTORY_WEEKS = 12;

/**
 * Fil des dernières publications simulées (la plus récente en dernier) et, depuis le format 15,
 * relevé des passages récents de chaque candidat dans chaque format : le fil, limité, ne suffit
 * pas à compter les répétitions (risque majoré de l'interview longue, lassitude de l'IA).
 */
export const DigitalStateSchema = DigitalStateV14Schema.extend({
  passages: z.record(
    z.string().min(1).max(120),
    z.record(
      z.string().min(1).max(120),
      z.array(z.number().int().min(0)).max(DIGITAL_HISTORY_WEEKS),
    ),
  ),
}).strict();
export type DigitalState = z.infer<typeof DigitalStateSchema>;
