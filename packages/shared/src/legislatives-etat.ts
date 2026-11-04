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

const DistrictRound = z
  .object({ votants: z.number().int().min(0), exprimes: z.number().int().min(0), voix: Votes })
  .strict();

const DistrictOutcomeShape = z
  .object({
    code: CirconscriptionCodeSchema,
    inscrits: z.number().int().positive(),
    t1: DistrictRound,
    t2: DistrictRound.nullable(),
    /** Bloc élu ; null au premier tour quand un second tour est nécessaire. */
    elu: Bloc.nullable(),
    tour: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();

/** Résultat simulé d'une circonscription aux formats 11 à 16 (figé). */
export const DistrictOutcomeV16Schema = DistrictOutcomeShape;

/**
 * Résultat simulé d'une circonscription (format 17, phase 13) : voix par bloc (un candidat par
 * bloc, ou un candidat commun à deux blocs alliés), blocs sans candidat au premier tour du fait
 * d'une investiture commune (`communs`) et blocs qualifiés qui se sont désistés avant le second
 * tour (`retraits`).
 */
export const DistrictOutcomeSchema = DistrictOutcomeShape.extend({
  communs: z.array(Bloc),
  retraits: z.array(Bloc),
}).strict();
export type DistrictOutcome = z.infer<typeof DistrictOutcomeSchema>;

export const LEGISLATIVE_MOTIVES = ['reelles-2024', 'dissolution', 'fin-de-legislature'] as const;

/**
 * Accord électoral entre blocs (phase 13) : investitures communes (un seul candidat des deux
 * blocs au premier tour), désistements réciproques (au second tour, le moins bien placé des
 * alliés se retire) ou front républicain (les blocs signataires se désistent face au bloc
 * `contre` quand il peut l'emporter). Accord du joueur ou règle de l'IA (hypothèses).
 */
export const ELECTORAL_PACT_TYPES = ['investitures', 'desistements', 'front-republicain'] as const;
export type ElectoralPactType = (typeof ELECTORAL_PACT_TYPES)[number];

export const ElectoralPactSchema = z
  .object({
    type: z.enum(ELECTORAL_PACT_TYPES),
    blocs: z.array(Bloc).min(1),
    /** Bloc face auquel les signataires se désistent (front républicain), sinon null. */
    contre: Bloc.nullable(),
    origine: z.enum(['joueur', 'ia']),
  })
  .strict()
  .refine((a) => (a.type === 'front-republicain') === (a.contre !== null), {
    message: 'Un bloc exclu pour le front républicain, et seulement pour lui',
  })
  .refine((a) => a.type === 'front-republicain' || a.blocs.length === 2, {
    message: 'Un accord d’investitures ou de désistements lie deux blocs',
  });
export type ElectoralPact = z.infer<typeof ElectoralPactSchema>;

const LegislativeOutcomeShape = z
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
    circonscriptions: z.array(DistrictOutcomeV16Schema),
  })
  .strict();

/** Résultat d'élections législatives aux formats 11 à 16 (figé). */
export const LegislativeOutcomeV16Schema = LegislativeOutcomeShape;

/** Résultat d'élections législatives (format 17) : circonscriptions et accords en vigueur. */
export const LegislativeOutcomeSchema = LegislativeOutcomeShape.extend({
  circonscriptions: z.array(DistrictOutcomeSchema),
  alliances: z.array(ElectoralPactSchema),
}).strict();
export type LegislativeOutcome = z.infer<typeof LegislativeOutcomeSchema>;

const DepartementCode = z.string().regex(/^(\d{2}|2A|2B|97\d|98\d|ZX|ZZ)$/);

/**
 * Campagne des prochaines législatives (phase 13), ouverte quelques semaines avant le premier
 * tour (aussitôt après une dissolution) : accords retenus, stratégie du camp du joueur arrêtée
 * ou non, mobilisation du camp présidentiel par département (dix-millièmes de voix en plus,
 * obtenus par les déplacements du président).
 */
export const LegislativeCampaignSchema = z
  .object({
    alliances: z.array(ElectoralPactSchema),
    strategieArretee: z.boolean(),
    mobilisation: z.record(DepartementCode, z.number().int().min(0).max(10_000)),
  })
  .strict();
export type LegislativeCampaign = z.infer<typeof LegislativeCampaignSchema>;

const LegislativesStateShape = z
  .object({
    derniere: LegislativeOutcomeV16Schema,
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
    premierTour: z.array(DistrictOutcomeV16Schema).nullable(),
  })
  .strict();

/** Législatives aux formats 11 à 16 (figé). */
export const LegislativesStateV16Schema = LegislativesStateShape;
export type LegislativesStateV16 = z.infer<typeof LegislativesStateV16Schema>;

/** Législatives (format 17, phase 13) : résultats du format 17 et campagne en cours. */
export const LegislativesStateSchema = LegislativesStateShape.extend({
  derniere: LegislativeOutcomeSchema,
  premierTour: z.array(DistrictOutcomeSchema).nullable(),
  campagne: LegislativeCampaignSchema.nullable(),
}).strict();
export type LegislativesState = z.infer<typeof LegislativesStateSchema>;
