import { z } from 'zod';
import { IsoDateSchema } from './game';
import { EstimatedPositionSchema, ImportedSourceSchema, photoCreditSchema } from './personalities';

// Figures politiques réelles proposées pour le gouvernement (phase 11, P11-02 ; vivier élargi en
// phase 14) : personnalités qui ne sont pas candidates dans la partie mais que le président peut
// nommer à Matignon ou à un ministère. Produit par `pnpm data:gouvernement` : fonctions et parti
// relevés dans l'infobox de l'article Wikipédia (révision figée), identifiant, photos et décès
// d'après Wikidata, photo sous licence libre (Wikimedia Commons), position du parti d'après
// l'enquête d'experts Chapel Hill. Compétence : estimation selon une méthode documentée ; notoriété : niveau déduit des
// fonctions. Aucun propos ni aucune citation n'est attribué à une personne réelle : le schéma n'a
// aucun champ pour cela ; nominations, refus et action au gouvernement sont simulés.

const Id = z.string().min(1).max(120);

/** Date d'une fonction : jour connu (AAAA-MM-JJ) ou seulement l'année (AAAA). */
export const PartialDateSchema = z
  .string()
  .regex(/^\d{4}(-\d{2}-\d{2})?$/, 'Date attendue au format AAAA ou AAAA-MM-JJ');

/** Nature d'une fonction, déduite de son libellé (règles dans `methode.fonctions`). */
export const FIGURE_FUNCTION_KINDS = [
  'president-republique',
  'premier-ministre',
  'ministre',
  'secretaire-etat',
  'parlementaire',
  'executif-local',
  'direction',
  'autre',
] as const;
export type FigureFunctionKind = (typeof FIGURE_FUNCTION_KINDS)[number];

export const FigureFunctionSchema = z
  .object({
    /** Libellé lisible de l'infobox (liens et notes retirés). */
    libelle: z.string().min(1),
    debut: PartialDateSchema.nullable(),
    fin: PartialDateSchema.nullable(),
    enCours: z.boolean(),
    nature: z.enum(FIGURE_FUNCTION_KINDS),
  })
  .strict();
export type FigureFunction = z.infer<typeof FigureFunctionSchema>;

/** Composante de l'estimation de compétence (points de 0 à 1). */
const CompetenceFactorSchema = z
  .object({ libelle: z.string().min(1), valeur: z.number().min(-1).max(1) })
  .strict();

export const GovernmentFigureSchema = z
  .object({
    id: z.string().regex(/^figure-[a-z0-9-]+$/),
    prenom: z.string().min(1),
    nom: z.string().min(1),
    /**
     * Parti en cours d'après le champ « parti » de l'infobox de l'article (révision importée), ou
     * « Sans étiquette » (position du dernier parti suivi quitté, hypothèse).
     */
    parti: z.string().min(1),
    /** Groupe de l'Assemblée nationale associé au parti (identifiant de `assemblee`), ou null. */
    groupe: Id.nullable(),
    wikidata: z.string().regex(/^Q\d+$/),
    /** Révision importée de l'article Wikipédia. */
    article: z.url(),
    fonctions: z.array(FigureFunctionSchema).min(1),
    position: EstimatedPositionSchema,
    /** Compétence de gestion (0 à 1) : estimation, somme de facteurs bornée (méthode documentée). */
    competence: z
      .object({
        valeur: z.number().min(0).max(1),
        statut: z.literal('estimation'),
        facteurs: z.array(CompetenceFactorSchema).min(1),
      })
      .strict(),
    /** Notoriété (1 à 3) déduite des fonctions ; sert d'hypothèse de popularité au jeu. */
    notoriete: z
      .object({
        niveau: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        motif: z.string().min(1),
      })
      .strict(),
    photo: photoCreditSchema('gouvernement').nullable(),
    photoAbsente: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if ((f.photo === null) === (f.photoAbsente === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['photo'],
        message: 'Photo créditée ou motif d’absence, exactement l’un des deux',
      });
    }
  });
export type GovernmentFigure = z.infer<typeof GovernmentFigureSchema>;

/**
 * Fonction principale d'une figure : la première fonction en cours (hors « autre »), sinon la
 * première de sa fiche, qui peut être terminée (`enCours` faux : à signaler comme passée). Règle
 * commune au moteur (descriptions des nominations) et à l'interface (fiches).
 */
export function figureMainFunction(figure: Pick<GovernmentFigure, 'fonctions'>): FigureFunction {
  return figure.fonctions.find((f) => f.enCours && f.nature !== 'autre') ?? figure.fonctions[0]!;
}

/** Groupe de l'Assemblée associé au parti d'une personnalité réelle candidate (table du jeu). */
export const GroupAttachmentSchema = z
  .object({
    personnaliteId: z.string().regex(/^reel-[a-z0-9-]+$/),
    groupe: Id,
    motif: z.string().min(1),
  })
  .strict();
export type GroupAttachment = z.infer<typeof GroupAttachmentSchema>;

/**
 * Personnalité de la sélection écartée à l'import (phase 14) : article sans infobox de fonctions,
 * parti en cours non suivi par le jeu, personne décédée… avec le motif.
 */
export const DiscardedFigureSchema = z
  .object({
    id: z.string().regex(/^figure-[a-z0-9-]+$/),
    prenom: z.string().min(1),
    nom: z.string().min(1),
    motif: z.string().min(1),
  })
  .strict();
export type DiscardedFigure = z.infer<typeof DiscardedFigureSchema>;

export const GovernmentFiguresSchema = z
  .object({
    verifieLe: IsoDateSchema,
    decision: z.string().min(1),
    sources: z.array(ImportedSourceSchema).min(1),
    methode: z
      .object({
        fonctions: z.string().min(1),
        competence: z.string().min(1),
        notoriete: z.string().min(1),
        position: z.string().min(1),
        groupe: z.string().min(1),
        parti: z.string().min(1),
        photo: z.string().min(1),
      })
      .strict(),
    figures: z.array(GovernmentFigureSchema).min(1),
    /** Personnalités de la sélection écartées, avec leur motif (phase 14). */
    ecartees: z.array(DiscardedFigureSchema),
    rattachements: z.array(GroupAttachmentSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const [i, f] of value.figures.entries()) {
      if (ids.has(f.id))
        ctx.addIssue({
          code: 'custom',
          path: ['figures', i, 'id'],
          message: 'Identifiant en double',
        });
      ids.add(f.id);
    }
  });
export type GovernmentFigures = z.infer<typeof GovernmentFiguresSchema>;
