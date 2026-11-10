import { z } from 'zod';
import { IsoDateSchema } from './game';
import { PositionSchema } from './politics';

// Personnalités politiques réelles (décision Q2 du 21/10/2026) : candidatures déclarées à la
// présidentielle de 2027, faits publics sourcés et datés, photos sous licence libre créditées,
// position d'après l'enquête d'experts Chapel Hill (CHES). Produit par `pnpm data:personnalites`.
// Aucun propos ni aucune citation n'est attribué à une personne réelle : le schéma n'a aucun
// champ pour cela, et tout comportement d'une personnalité dans la partie est simulé.

const Code = z.string().regex(/^(\d{2}|2A|2B|97\d)$/);
const RegionCode = z.string().regex(/^\d{2}$/);

/** Référence de presse ou de base de données citée pour un fait. */
export const FactSourceSchema = z
  .object({
    titre: z.string().min(1),
    url: z.url(),
    /** Média ou base (« Le Point », « Wikidata »…). */
    site: z.string().min(1).nullable(),
    /** Date de publication, si la source la donne. */
    date: IsoDateSchema.nullable(),
  })
  .strict();
export type FactSource = z.infer<typeof FactSourceSchema>;

export const CANDIDACY_STATUSES = ['declaree', 'designee'] as const;

export const CandidacySchema = z
  .object({
    /** declaree : annonce publique ; designee : candidature désignée par un parti ou une primaire. */
    statut: z.enum(CANDIDACY_STATUSES),
    date: IsoDateSchema,
    /** Formulation neutre rédigée par le jeu (jamais une citation). */
    libelle: z.string().min(1),
    source: FactSourceSchema,
  })
  .strict();

/**
 * Méthodes de position ; `sans_parti` (phase 25 ter) : personnalité sans parti ni rattachement
 * noté par CHES, placée au milieu de l'échelle du jeu (hypothèse, aucune prise de position prêtée).
 */
export const POSITION_METHODS = [
  'parti',
  'parti_soutien',
  'ancien_parti',
  'famille',
  'sans_parti',
] as const;
export type PositionMethod = (typeof POSITION_METHODS)[number];

export const EstimatedPositionSchema = PositionSchema.extend({
  /** estimation : position d'experts du parti ; hypothese : rattachement indirect (voir detail). */
  statut: z.enum(['estimation', 'hypothese']),
  methode: z.enum(POSITION_METHODS),
  /** Parti ou partis de l'enquête CHES utilisés (abréviations du fichier CHES) ; aucun sans parti. */
  partisReference: z.array(z.string().min(1)),
  /** Vague de l'enquête CHES (année). */
  vague: z.number().int().min(1999),
  /** Positions brutes CHES (0 à 10) avant conversion ; null sans parti. */
  ches: z.object({ lrecon: z.number(), galtan: z.number() }).strict().nullable(),
  detail: z.string().min(1),
})
  .strict()
  .superRefine((p, ctx) => {
    const sansParti = p.methode === 'sans_parti';
    if (sansParti !== (p.ches === null) || sansParti !== (p.partisReference.length === 0))
      ctx.addIssue({
        code: 'custom',
        path: ['partisReference'],
        message: 'Parti CHES et positions brutes exigés, sauf sans parti (ni l’un ni l’autre)',
      });
    if (sansParti && p.statut !== 'hypothese')
      ctx.addIssue({ code: 'custom', path: ['statut'], message: 'Sans parti : hypothèse' });
  });
export type EstimatedPosition = z.infer<typeof EstimatedPositionSchema>;

/**
 * Licences libres acceptées pour une photo : domaine public, CC0, CC BY et CC BY-SA (versions
 * 1.0 à 4.0, adaptations nationales comprises), Licence Ouverte d'Etalab.
 */
export const FREE_LICENSES =
  /^(CC0( 1\.0)?|Public domain|Domaine public|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)( [A-Za-z]+)?|Licence Ouverte( [12]\.0)?)$/;

/** Crédit d'une photo de Wikimedia Commons, servie depuis le dossier `dossier` de l'interface. */
export function photoCreditSchema(dossier: 'personnalites' | 'gouvernement') {
  return z
    .object({
      /** Chemin servi par l'interface (`apps/web/public`). */
      fichier: z.string().regex(new RegExp(`^${dossier}/[a-z0-9-]+\\.webp$`)),
      auteur: z.string().min(1),
      licence: z.string().regex(FREE_LICENSES, 'licence libre attendue'),
      licenceUrl: z.url().nullable(),
      /** Page du fichier sur Wikimedia Commons. */
      source: z.url(),
      modification: z.string().min(1),
      /** Photo choisie hors de la source (celle de la source n'étant pas libre) : motif consigné. */
      choix: z.string().min(1).optional(),
    })
    .strict();
}

export const PhotoCreditSchema = photoCreditSchema('personnalites');
export type PhotoCredit = z.infer<typeof PhotoCreditSchema>;

/** Fait public cité mot pour mot depuis la ligne de la personnalité (révision de l'article). */
export const QuotedFactSchema = z.object({ fait: z.string().min(1) }).strict();

export const NOTORIETY_LEVELS = [1, 2, 3] as const;
export const ORGANISATION_LEVELS = ['grande', 'moyenne', 'petite', 'aucune'] as const;
export type OrganisationLevel = (typeof ORGANISATION_LEVELS)[number];

export const RealPersonalitySchema = z
  .object({
    id: z.string().regex(/^reel-[a-z0-9-]+$/),
    prenom: z.string().min(1),
    nom: z.string().min(1),
    /** Étiquette telle que donnée par la source (« Renaissance / Agir »). */
    parti: z.string().min(1),
    /** Fonctions en cours relevées dans la source (au plus quatre). */
    fonctions: z.array(z.string().min(1)).max(4),
    wikidata: z
      .string()
      .regex(/^Q\d+$/)
      .nullable(),
    article: z.url(),
    candidature: CandidacySchema,
    position: EstimatedPositionSchema,
    photo: PhotoCreditSchema.nullable(),
    /** Motif de l'absence de photo (licence non libre, pas de photo dans la source…). */
    photoAbsente: z.string().min(1).nullable(),
    /** Départements des mandats en cours et régions correspondantes (ancrage pour les parrainages). */
    implantation: z
      .object({
        departements: z.array(Code),
        regions: z.array(RegionCode),
        faits: z.array(z.string().min(1)),
      })
      .strict(),
    /** Niveaux des moyens de départ (hypothèse de jeu, règles dans `methode`). */
    moyens: z
      .object({
        notoriete: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        motifNotoriete: z.string().min(1),
        organisation: z.enum(ORGANISATION_LEVELS),
        motifOrganisation: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if ((p.photo === null) === (p.photoAbsente === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['photo'],
        message: 'Photo créditée ou motif d’absence, exactement l’un des deux',
      });
    }
    if (p.position.methode === 'parti' && p.position.statut !== 'estimation') {
      ctx.addIssue({
        code: 'custom',
        path: ['position'],
        message: 'Position du parti : estimation',
      });
    }
    if (
      (p.position.methode === 'ancien_parti' || p.position.methode === 'famille') &&
      p.position.statut !== 'hypothese'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['position'],
        message: 'Rattachement indirect : hypothèse',
      });
    }
  });
export type RealPersonality = z.infer<typeof RealPersonalitySchema>;

export const ImportedSourceSchema = z
  .object({
    id: z.string().min(1),
    titre: z.string().min(1),
    url: z.url(),
    licence: z.string().min(1),
    /** Révision, vague ou version de la source. */
    version: z.string().min(1),
    consulteLe: IsoDateSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const RealPersonalitiesSchema = z
  .object({
    verifieLe: IsoDateSchema,
    decision: z.string().min(1),
    sources: z.array(ImportedSourceSchema).min(1),
    methode: z
      .object({
        position: z.string().min(1),
        notoriete: z.string().min(1),
        organisation: z.string().min(1),
        implantation: z.string().min(1),
      })
      .strict(),
    personnalites: z.array(RealPersonalitySchema).min(1),
    /** Candidatures déclarées dans la source mais non intégrées au jeu, avec le motif. */
    nonIntegrees: z.array(
      z
        .object({
          prenom: z.string(),
          nom: z.string().min(1),
          parti: z.string().min(1),
          motif: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const [i, p] of value.personnalites.entries()) {
      if (ids.has(p.id))
        ctx.addIssue({
          code: 'custom',
          path: ['personnalites', i, 'id'],
          message: 'Identifiant en double',
        });
      ids.add(p.id);
    }
  });
export type RealPersonalities = z.infer<typeof RealPersonalitiesSchema>;
