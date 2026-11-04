import { z } from 'zod';
import { EconomicIndicatorSchema } from './economie';

// Conséquences à long terme (phase 7) : un choix ou une crise laisse un effet hebdomadaire
// pendant plusieurs semaines (indicateurs économiques, popularité du président) et des
// fragilités qui rendent d'autres crises plus ou moins probables. Paramètres de jeu
// (hypothèses) ; chaque effet passe par les registres du moteur, avec son libellé.
// Module sans dépendance à game.ts ni à ruleset.ts (qui l'importent).

const CrisisId = z.string().regex(/^crise-[a-z0-9-]+$/);
const Week = z.number().int().min(0);

const WeeklyEconomy = z.array(
  z.object({ indicateur: EconomicIndicatorSchema, valeur: z.number().int() }).strict(),
);
const Vulnerabilities = z.array(
  z.object({ crise: CrisisId, multiplicateur: z.number().min(0).max(10) }).strict(),
);

/** Définition d'une conséquence durable (jeu de règles). */
export const LongTermEffectSchema = z
  .object({
    libelle: z.string().min(1),
    semaines: z.number().int().min(1).max(260),
    /** Effet par semaine sur des indicateurs (centièmes). */
    economie: WeeklyEconomy,
    /** Effet par semaine sur la popularité du président (centièmes de point). */
    popularite: z.number().int(),
    /** Crises rendues plus (multiplicateur > 1) ou moins probables pendant la durée. */
    vulnerabilites: Vulnerabilities,
  })
  .strict();
export type LongTermEffect = z.infer<typeof LongTermEffectSchema>;

export const CONSEQUENCE_ORIGINS = ['crise', 'decision', 'scenario'] as const;

/** Conséquence en cours ou passée dans une partie : semaines de début et de fin incluses. */
export const ConsequenceSchema = LongTermEffectSchema.omit({ semaines: true })
  .extend({
    id: z.string().min(1).max(160),
    origine: z.enum(CONSEQUENCE_ORIGINS),
    /** Crise, choix ou scénario à l'origine de la conséquence. */
    ref: z.string().min(1).max(120),
    debut: Week,
    fin: Week,
  })
  .strict();
export type Consequence = z.infer<typeof ConsequenceSchema>;

/** Conséquence résumée dans le bilan d'un quinquennat. */
export const ConsequenceSummarySchema = ConsequenceSchema.pick({
  libelle: true,
  origine: true,
  debut: true,
  fin: true,
}).strict();
export type ConsequenceSummary = z.infer<typeof ConsequenceSummarySchema>;
