import { z } from 'zod';
import { CandidatePhotoSchema } from './portrait';

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

/** Identité d'un candidat aux formats 3 à 5 (figée pour les migrations). */
export const CandidateIdentityV5Schema = z
  .object({
    prenom: z.string().trim().max(40),
    nom: z.string().trim().min(1).max(60),
    parti: z.string().trim().min(1).max(80),
    positionnement: PositionSchema,
    parcours: z.string().trim().max(500),
    nature: z.enum(['personnalise', 'fictif']),
    profilId: z.string().nullable(),
  })
  .strict();

/**
 * personnalise : candidat inventé par le joueur ; fictif : adversaire inventé par le jeu ;
 * reel : personnalité politique réelle (phase 5 bis), décrite par sa fiche sourcée du jeu de
 * règles (`personnaliteId`). Son comportement dans la partie est toujours simulé.
 */
export const CandidateNatureSchema = z.enum(['personnalise', 'fictif', 'reel']);
export type CandidateNature = z.infer<typeof CandidateNatureSchema>;

export const PersonalityIdSchema = z.string().regex(/^reel-[a-z0-9-]+$/);

const CandidateIdentityV6Shape = CandidateIdentityV5Schema.extend({
  nature: CandidateNatureSchema,
  /** Fiche de la personnalité réelle dans le jeu de règles ; null sinon. */
  personnaliteId: PersonalityIdSchema.nullable(),
}).strict();

const realHasFiche = {
  check: (c: { nature: CandidateNature; personnaliteId: string | null }) =>
    (c.nature === 'reel') === (c.personnaliteId !== null),
  message: 'Une personnalité réelle, et elle seule, renvoie à sa fiche',
};

/** Identité d'un candidat aux formats 6 à 16 (figée pour les migrations). */
export const CandidateIdentityV16Schema = CandidateIdentityV6Shape.refine(realHasFiche.check, {
  message: realHasFiche.message,
  path: ['personnaliteId'],
});
export type CandidateIdentityV16 = z.infer<typeof CandidateIdentityV16Schema>;

/**
 * Identité d'un candidat (format 17, phase 13) : photo choisie par le joueur pour son candidat
 * personnalisé (URL de données contrôlée), null sinon.
 */
export const CandidateIdentitySchema = CandidateIdentityV6Shape.extend({
  photo: CandidatePhotoSchema.nullable(),
})
  .strict()
  .refine(realHasFiche.check, { message: realHasFiche.message, path: ['personnaliteId'] })
  .refine((c) => c.photo === null || c.nature === 'personnalise', {
    message: 'Seul un candidat personnalisé porte une photo choisie par le joueur',
    path: ['photo'],
  });
export type CandidateIdentity = z.infer<typeof CandidateIdentitySchema>;

export function candidateName(candidate: Pick<CandidateIdentity, 'prenom' | 'nom'>): string {
  return `${candidate.prenom} ${candidate.nom}`.trim();
}
