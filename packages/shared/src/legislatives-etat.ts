import { z } from 'zod';
import { isValidIsoDate } from './dates';

// Législatives simulées (phase 6, P6-07) : état de partie. Module sans dépendance à game.ts
// (qui l'importe), d'où une définition locale des dates.

const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'Date attendue au format AAAA-MM-JJ' });

/** Code de circonscription : département (« 01 », « 2A », « 971 », « ZZ »…) + numéro sur deux chiffres. */
export const CirconscriptionCodeSchema = z.string().regex(/^(\d{2}|2A|2B|97\d|98\d|ZX|ZZ)\d{2}$/);

const Bloc = z.string().regex(/^[a-z]+(-[a-z]+)*$/);
const Votes = z.record(Bloc, z.number().int().min(0));

/** Résultat simulé d'une circonscription (voix par bloc, un candidat par bloc). */
export const DistrictOutcomeSchema = z
  .object({
    code: CirconscriptionCodeSchema,
    inscrits: z.number().int().positive(),
    t1: z
      .object({ votants: z.number().int().min(0), exprimes: z.number().int().min(0), voix: Votes })
      .strict(),
    t2: z
      .object({ votants: z.number().int().min(0), exprimes: z.number().int().min(0), voix: Votes })
      .strict()
      .nullable(),
    /** Bloc élu ; null au premier tour quand un second tour est nécessaire. */
    elu: Bloc.nullable(),
    tour: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();
export type DistrictOutcome = z.infer<typeof DistrictOutcomeSchema>;

export const LEGISLATIVE_MOTIVES = ['reelles-2024', 'dissolution', 'fin-de-legislature'] as const;

export const LegislativeOutcomeSchema = z
  .object({
    motif: z.enum(LEGISLATIVE_MOTIVES),
    t1: IsoDateSchema,
    t2: IsoDateSchema,
    siegesParBloc: z.record(Bloc, z.number().int().min(0)),
    siegesParGroupe: z.record(z.string().min(1), z.number().int().min(0)),
    /** Voix nationales du premier tour par bloc. */
    voixT1: Votes,
    /** L'opposition au président détient la majorité des sièges. */
    cohabitation: z.boolean(),
    /** Détail par circonscription (législatives simulées ; vide pour celles de 2024, réelles). */
    circonscriptions: z.array(DistrictOutcomeSchema),
  })
  .strict();
export type LegislativeOutcome = z.infer<typeof LegislativeOutcomeSchema>;

export const LegislativesStateSchema = z
  .object({
    derniere: LegislativeOutcomeSchema,
    /** Prochaines élections générales : fin de législature ou dissolution. */
    prochaine: z
      .object({
        motif: z.enum(['dissolution', 'fin-de-legislature']),
        t1: IsoDateSchema,
        t2: IsoDateSchema,
      })
      .strict()
      .nullable(),
    /** Fin des pouvoirs de l'Assemblée en place. */
    finLegislature: IsoDateSchema,
    /** Premier tour dépouillé, en attendant le second. */
    premierTour: z.array(DistrictOutcomeSchema).nullable(),
  })
  .strict();
export type LegislativesState = z.infer<typeof LegislativesStateSchema>;
