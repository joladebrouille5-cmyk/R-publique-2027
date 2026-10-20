import { z } from 'zod';

// Identité politique des candidats (§1.2) et positionnement sur deux axes.

/** Positionnement : économie (−100 gauche … +100 droite), société (−100 progressiste … +100 conservateur). */
export const PositionSchema = z
  .object({
    economie: z.number().int().min(-100).max(100),
    societe: z.number().int().min(-100).max(100),
  })
  .strict();
export type Position = z.infer<typeof PositionSchema>;

export const CAMPAIGN_STYLES = ['prudent', 'equilibre', 'offensif'] as const;
export const CampaignStyleSchema = z.enum(CAMPAIGN_STYLES);
export type CampaignStyle = z.infer<typeof CampaignStyleSchema>;

/**
 * personnalise : candidat inventé par le joueur ; fictif : adversaire inventé par le jeu.
 * Les personnalités réelles (« reel ») nécessitent des profils sourcés (décision Q2 du plan).
 */
export const CandidateNatureSchema = z.enum(['personnalise', 'fictif']);

export const CandidateIdentitySchema = z
  .object({
    prenom: z.string().trim().max(40),
    nom: z.string().trim().min(1).max(60),
    parti: z.string().trim().min(1).max(80),
    positionnement: PositionSchema,
    parcours: z.string().trim().max(500),
    nature: CandidateNatureSchema,
    profilId: z.string().nullable(),
  })
  .strict();
export type CandidateIdentity = z.infer<typeof CandidateIdentitySchema>;

export function candidateName(candidate: Pick<CandidateIdentity, 'prenom' | 'nom'>): string {
  return `${candidate.prenom} ${candidate.nom}`.trim();
}
