import { z } from 'zod';
import { DEBATE_ANGLES, DebateRulesSchema } from './debats';
import { PrestationRulesSchema } from './prestations';
import { LongTermEffectSchema } from './consequences';
import { IsoDateSchema } from './game';
import { AiObjectiveSchema } from './campaign';
import { RealAssemblySchema } from './assemblee';
import { EconomicIndicatorSchema } from './economie';
import { RealEconomySchema } from './economie-reelle';
import { RealLegislativesSchema } from './legislatives';
import { RealMediaSchema } from './medias';
import { RealPersonalitiesSchema } from './personalities';
import { MinisterProfileSchema } from './quinquennat';
import { CampaignStyleSchema, PositionSchema } from './politics';
import {
  DIGITAL_TONES,
  FAMILLES_POLITIQUES,
  PARTI_MARQUE,
  type FamillePolitique,
} from './numerique';
import { ResourceKeySchema, ResourcesV1Schema } from './resources';

// Jeu de règles versionné (§2 : les dates électorales sont des paramètres versionnés vérifiés
// auprès des sources officielles, pas des constantes dispersées dans le code).
// Chaque donnée porte un statut et une source ; les paramètres de jeu sont des hypothèses.

/**
 * officiel : publié au Journal officiel ; annonce : annoncé officiellement, non encore décrété ;
 * deduit : calculé à partir d'une règle sourcée ; estimation : donnée réelle utilisée comme
 * approximation (ex. inscrits 2022 pour 2027) ; hypothese : paramètre de conception du jeu.
 */
export const DATA_STATUSES = ['officiel', 'annonce', 'deduit', 'estimation', 'hypothese'] as const;
export const DataStatusSchema = z.enum(DATA_STATUSES);
export type DataStatus = z.infer<typeof DataStatusSchema>;

const Id = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'identifiant en minuscules');
const Probability = z.number().min(0).max(1);
const Fraction = z.number().min(0).max(1);
/** Notoriété ou popularité, en centièmes de point (0 à 10 000). */
const Points = z.number().int().min(0).max(10_000);

const OrganisationMeans = z
  .object({
    budgetCentimes: z.number().int().min(0),
    militants: z.number().int().min(0),
    equipe: Fraction,
    promessesInitiales: z.number().int().min(0),
  })
  .strict();

export const SourceSchema = z
  .object({
    titre: z.string().min(1),
    url: z.url().nullable(),
    consulteLe: IsoDateSchema.nullable(),
  })
  .strict();

export const ScrutinSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    date: IsoDateSchema,
    statut: DataStatusSchema,
    sourceId: Id,
    /** Codes INSEE des territoires où l'on vote la veille (samedi). */
    votentLaVeille: z.array(z.string().regex(/^\d{3}$/)),
  })
  .strict();

export const EcheanceSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    date: IsoDateSchema,
    heure: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    statut: DataStatusSchema,
    /** Règle dont la date est déduite, le cas échéant. */
    regle: z.string().nullable(),
    sourceId: Id,
  })
  .strict();

/** Effet sur une ressource, en unités internes (voir resources.ts). */
export const EffectSchema = z
  .object({
    ressource: ResourceKeySchema,
    base: z.number().int(),
    /** Incertitude : la valeur tirée est uniforme dans [base − ecart, base + ecart]. */
    ecart: z.number().int().min(0),
    /** 0 : effet dans la semaine ; n : effet à l'entrée de la n-ième semaine suivante. */
    delaiSemaines: z.number().int().min(0).max(12),
    /** Gain réduit quand la ressource est déjà élevée (notoriété, popularité). */
    saturation: z.boolean(),
  })
  .strict();
export type Effect = z.infer<typeof EffectSchema>;

const Spread = z.object({ base: z.number().int().min(0), ecart: z.number().int().min(0) }).strict();

/**
 * Effets de campagne d'une action ou d'un événement (phase 5), en plus des effets sur les
 * ressources : promesses de parrainage, dons, emprunt, exposition médiatique, préparation des
 * débats. Les montants et probabilités sont des paramètres de jeu (hypothèses).
 */
export const CampaignEffectSchema = z
  .object({
    /** Promesses d'élus obtenues dans le département ciblé. */
    promesses: Spread.optional(),
    /** Offres de dons ; le moteur refuse celles que la loi interdit. */
    dons: z
      .object({
        donateurs: Spread,
        montantMoyenCentimes: z.number().int().min(1),
        probaPersonneMorale: Probability,
        probaDepassement: Probability,
        probaEspeces: Probability,
      })
      .strict()
      .optional(),
    /** Demande de prêt bancaire, accordée selon la solvabilité de la campagne. */
    emprunt: z
      .object({ montantCentimes: z.number().int().min(1) })
      .strict()
      .optional(),
    /**
     * Exposition médiatique supplémentaire : organe ciblé, organe de l'émission ciblée, sinon
     * organes de même portée (au tiers).
     */
    exposition: z.number().int().min(0).max(10_000).optional(),
    /** Heures de préparation des débats. */
    preparationDebat: z.number().int().min(0).optional(),
  })
  .strict();
export type CampaignEffect = z.infer<typeof CampaignEffectSchema>;

export const ActionDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    portee: z.enum(['locale', 'regionale', 'nationale']),
    /** Cible à choisir en programmant l'action, le cas échéant. */
    cible: z.enum(['departement', 'media', 'emission']).nullable(),
    cout: z
      .object({
        budgetCentimes: z.number().int().min(0),
        tempsHeures: z.number().int().min(0),
      })
      .strict(),
    prerequis: z.object({ militantsMin: z.number().int().min(0) }).strict(),
    effets: z.array(EffectSchema),
    campagne: CampaignEffectSchema.nullable(),
    /**
     * Aléa de l'action : tiré avec sa probabilité ; pour un passage dans les médias (phase 11),
     * survient sous le seuil d'incident du score, sans tirage (`prestations`).
     */
    risque: z
      .object({
        probabilite: Probability,
        libelle: z.string().min(1),
        effets: z.array(EffectSchema).min(1),
      })
      .strict()
      .nullable(),
    note: z.string().nullable(),
    /** Acte institutionnel du président (phase 6) : remaniement, dissolution de l'Assemblée. */
    institution: z.enum(['remaniement', 'dissolution']).optional(),
    /** Format des réseaux et nouveaux médias (phase 9) : l'action produit une publication. */
    format: Id.optional(),
  })
  .strict();
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

/** Règle datée : date, statut, source et règle de calcul. */
const DatedRuleSchema = z
  .object({
    date: IsoDateSchema,
    statut: DataStatusSchema,
    sourceId: Id,
    regle: z.string().min(1),
  })
  .strict();

/**
 * Présidence et quinquennat (phase 6) : dates du mandat (déduites de la Constitution et de la
 * proclamation de 2022), cycles électoraux suivants, postes du gouvernement, profils fictifs,
 * acceptation d'un poste et actions du président. Paramètres de jeu étiquetés `hypothese`.
 */
export const QuinquennatRulesSchema = z
  .object({
    note: z.string().min(1),
    mandat: z
      .object({
        dureeAnnees: z.literal(5),
        /** Constitution, art. 6 : nul ne peut exercer plus de deux mandats consécutifs. */
        mandatsConsecutifsMax: z.literal(2),
        statut: DataStatusSchema,
        sourceId: Id,
        regle: z.string().min(1),
      })
      .strict(),
    /** Début du mandat issu de la présidentielle de 2027 (décalé pour les cycles suivants). */
    investiture: DatedRuleSchema,
    /** Fin de ce mandat (décalée pour les cycles suivants). */
    finMandat: DatedRuleSchema,
    /** Présidentielles suivantes : calendrier de 2027 décalé de semaines entières. */
    cycles: z
      .array(
        z
          .object({
            annee: z.number().int().min(2028),
            decalageSemaines: z.number().int().min(1),
            statut: DataStatusSchema,
            regle: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    postes: z.array(z.object({ id: Id, libelle: z.string().min(1) }).strict()).min(5),
    profils: z.array(MinisterProfileSchema).min(4),
    /** Composition du gouvernement et acceptation d'un poste par un acteur (simulée). */
    acceptation: z
      .object({
        statut: z.literal('hypothese'),
        /** Proximité minimale (0 à 100) avec le président pour accepter un poste sans hésiter. */
        proximiteMin: z.number().int().min(0).max(100),
        /** Probabilité d'accepter Matignon en deçà de ce seuil. */
        probabiliteSousSeuil: Probability,
        /** Nombre maximal d'acteurs de la partie parmi les ministres (le reste : profils fictifs). */
        ministresActeursMax: z.number().int().min(0),
        /** Semaines pendant lesquelles un acteur qui a refusé n'est plus sollicité. */
        delaiApresRefus: z.number().int().min(1),
      })
      .strict(),
    /** Usure du pouvoir : perte de popularité hebdomadaire du président (centièmes de point). */
    opinion: z
      .object({
        statut: z.literal('hypothese'),
        usureHebdomadaire: z.number().int().min(0).max(1_000),
      })
      .strict(),
    /** Actions du président pendant le quinquennat (mêmes règles pour le joueur et l'IA). */
    actions: z.array(ActionDefinitionSchema).min(1),
  })
  .strict();
export type QuinquennatRules = z.infer<typeof QuinquennatRulesSchema>;

const Weeks = z.number().int().min(1);

/**
 * Parlement (phase 6, P6-04) : règles constitutionnelles citées (motion de censure, engagement
 * de responsabilité, session ordinaire) et paramètres de jeu (hypothèses) de la procédure, des
 * votes par groupe, des concessions, du Sénat simplifié et de l'effet des réformes. La
 * composition réelle de l'Assemblée (`assemblee`) vient de `pnpm data:assemblee` ; son
 * empreinte est vérifiée (une nouvelle importation impose une nouvelle version du jeu de règles).
 */
export const ParliamentRulesSchema = z
  .object({
    note: z.string().min(1),
    fichier: z.string().regex(/^[a-z0-9-]+\.json$/),
    /** SHA-256 de la sérialisation JSON de la composition (`JSON.stringify`). */
    empreinte: z.string().regex(/^[0-9a-f]{64}$/),
    regles: z
      .object({
        statut: DataStatusSchema,
        sourceIds: z.array(Id).min(1),
        /** Part des membres qui doivent signer une motion de censure (art. 49 al. 2). */
        signaturesCensure: Fraction,
        /** Engagements de responsabilité sur un texte autre que financier, par session (al. 3). */
        autres49_3ParSession: z.number().int().min(0),
        /** Mois d'ouverture de la session ordinaire (art. 28). */
        moisOuvertureSession: z.number().int().min(1).max(12),
        regle: z.string().min(1),
      })
      .strict(),
    calendrier: z
      .object({
        statut: z.literal('hypothese'),
        intervalleDepotSemaines: Weeks,
        textesSimultanesMax: z.number().int().min(1),
        commissionSemaines: Weeks,
        navetteSemaines: Weeks,
        lectureDefinitiveSemaines: Weeks,
      })
      .strict(),
    vote: z
      .object({
        statut: z.literal('hypothese'),
        poidsProximite: z.number().min(0),
        /** Distance (axes du jeu, 0 à 2,83) entre un groupe et un texte qui le laisse neutre. */
        distanceNeutre: z.number().positive(),
        poidsAlignement: z.number().min(0),
        /** Proximité (0 à 100) avec le président au-delà de laquelle un groupe le soutient. */
        seuilSoutien: z.number().int().min(0).max(100),
        /** Proximité en deçà de laquelle un groupe est dans l'opposition. */
        seuilOpposition: z.number().int().min(0).max(100),
        cohesion: Fraction,
        cohesionNonInscrits: Fraction,
        participation: Fraction,
        /** Soutien (en valeur absolue) en deçà duquel un groupe s'abstient. */
        seuilAbstention: Fraction,
        alea: Fraction,
        /** Avance minimale des voix favorables (en proportion) pour voter sans hésiter. */
        margeConfort: Fraction,
      })
      .strict(),
    concessions: z
      .object({
        statut: z.literal('hypothese'),
        max: z.number().int().min(0),
        soutienParConcession: Fraction,
        /** Part de l'effet de la réforme perdue par concession. */
        reductionEffet: Fraction,
      })
      .strict(),
    senat: z
      .object({
        statut: z.literal('hypothese'),
        probabiliteAccord: Probability,
        note: z.string().min(1),
      })
      .strict(),
    censure: z
      .object({
        statut: z.literal('hypothese'),
        /** Poids de l'impopularité du président dans la décision de censurer. */
        poidsPopularite: z.number().min(0),
        coutPopularite49_3: z.number().int().min(0),
        coutPopulariteCensure: z.number().int().min(0),
      })
      .strict(),
    reformes: z
      .object({
        statut: z.literal('hypothese'),
        /** Effet maximal sur la popularité du président à l'entrée en vigueur (centièmes). */
        effetPopulariteMax: z.number().int().min(0),
        /** Accueil (moyenne pondérée sur l'électorat) qui ne change pas la popularité. */
        accueilNeutre: z.number(),
        /** Accueil supplémentaire des publics particulièrement concernés. */
        bonusPublics: z.number().min(0),
      })
      .strict(),
  })
  .strict()
  .refine((p) => p.vote.seuilOpposition < p.vote.seuilSoutien, {
    message: 'Seuil d’opposition inférieur au seuil de soutien',
  });
export type ParliamentRules = z.infer<typeof ParliamentRulesSchema>;

/**
 * Modèle économique du quinquennat (phase 6, P6-05) : cibles de long terme, vitesses de retour,
 * sensibilités et aléa. Paramètres de jeu (hypothèses) ; les valeurs de départ viennent des
 * séries de l'Insee (`economieReelle`, `pnpm data:economie`, empreinte vérifiée).
 */
export const EconomyRulesSchema = z
  .object({
    statut: z.literal('hypothese'),
    note: z.string().min(1),
    fichier: z.string().regex(/^[a-z0-9-]+\.json$/),
    empreinte: z.string().regex(/^[0-9a-f]{64}$/),
    /** Conventions de départ des indicateurs sans série officielle (centièmes). */
    depart: z
      .object({ pouvoirAchat: z.number().int(), tensions: z.number().int().min(0).max(10_000) })
      .strict(),
    cibles: z
      .object({
        croissancePotentielle: z.number().int(),
        inflation: z.number().int(),
        chomageStructurel: z.number().int().min(0),
      })
      .strict(),
    /** Part de l'écart à la cible résorbée chaque semaine. */
    rappel: z
      .object({
        croissance: Fraction,
        inflation: Fraction,
        chomage: Fraction,
        deficit: Fraction,
        confiance: Fraction,
        tensions: Fraction,
      })
      .strict(),
    sensibilites: z
      .object({
        okun: z.number().min(0),
        inflationCroissance: z.number().min(0),
        deficitCroissance: z.number().min(0),
        multiplicateur: z.number().min(0),
        pouvoirAchatCroissance: z.number().min(0),
        pouvoirAchatInflation: z.number().min(0),
        confianceCroissance: z.number().min(0),
        confianceInflation: z.number().min(0),
        confianceChomage: z.number().min(0),
        tensionsChomage: z.number().min(0),
        tensionsInflation: z.number().min(0),
        tensionsConfiance: z.number().min(0),
        /** Popularité du président (centièmes) par point d'écart de la confiance à 100, chaque semaine. */
        popularite: z.number().min(0),
      })
      .strict(),
    /** Amplitude de l'aléa hebdomadaire de chaque indicateur (centièmes). */
    alea: z.record(EconomicIndicatorSchema, z.number().int().min(0)),
    /** Hausse des tensions sociales à chaque engagement de responsabilité (49.3). */
    tensions49_3: z.number().int().min(0),
  })
  .strict();
export type EconomyRules = z.infer<typeof EconomyRulesSchema>;

const CrisisEconomyEffectSchema = z
  .object({
    indicateur: EconomicIndicatorSchema,
    valeur: z.number().int(),
    delaiSemaines: z.number().int().min(0),
  })
  .strict();

/**
 * Crise fictive du quinquennat (phase 6, P6-06) : décision obligatoire du président. Depuis la
 * phase 7 : saison possible (mois de l'année) et conséquences durables de la crise et de
 * chaque choix.
 */
export const CrisisDefinitionSchema = z
  .object({
    id: z.string().regex(/^crise-[a-z0-9-]+$/),
    libelle: z.string().min(1),
    description: z.string().min(1),
    nature: z.literal('fictif'),
    majeur: z.boolean(),
    probabiliteHebdomadaire: Probability,
    /** Mois (1 à 12) où la crise peut survenir ; null : toute l'année. */
    mois: z.array(z.number().int().min(1).max(12)).min(1).nullable(),
    /** Séquelles de la crise elle-même, quel que soit le choix. */
    durable: LongTermEffectSchema.nullable(),
    /** Conditions sur les indicateurs économiques (centièmes) ou la popularité du président. */
    conditions: z.array(
      z
        .object({
          sur: z.union([EconomicIndicatorSchema, z.literal('popularite')]),
          min: z.number().int().nullable(),
          max: z.number().int().nullable(),
        })
        .strict(),
    ),
    delaiMinEntreOccurrences: z.number().int().min(0),
    occurrencesMax: z.number().int().min(1).nullable(),
    /** Effets immédiats de la crise sur l'économie et sur le président. */
    economie: z.array(CrisisEconomyEffectSchema),
    effets: z.array(EffectSchema),
    choix: z
      .array(
        z
          .object({
            id: Id,
            libelle: z.string().min(1),
            description: z.string().min(1),
            economie: z.array(CrisisEconomyEffectSchema),
            effets: z.array(EffectSchema),
            /** Conséquence durable du choix (phase 7). */
            durable: LongTermEffectSchema.nullable(),
          })
          .strict(),
      )
      .min(2),
    choixParDefaut: Id,
  })
  .strict();
export type CrisisDefinition = z.infer<typeof CrisisDefinitionSchema>;

/**
 * Législatives (phase 6, P6-07) : règles citées (Constitution, art. 12 ; code électoral d'après
 * une source secondaire), fin de la législature élue en 2024, blocs politiques (nuances du
 * ministère de l'Intérieur et groupes de l'Assemblée) et modèle de simulation (hypothèses). Les
 * résultats de 2024 par circonscription (`legislatives2024`) viennent de `pnpm data:legislatives`.
 */
export const LegislativeRulesSchema = z
  .object({
    note: z.string().min(1),
    fichier: z.string().regex(/^[a-z0-9-]+\.json$/),
    empreinte: z.string().regex(/^[0-9a-f]{64}$/),
    regles: z
      .object({
        statut: DataStatusSchema,
        sourceIds: z.array(Id).min(1),
        /** Élu au premier tour : plus de la moitié des exprimés et au moins ce quart des inscrits. */
        premierTourInscrits: Fraction,
        /** Qualification au second tour : part des inscrits (sinon les deux premiers). */
        qualificationInscrits: Fraction,
        /** Élections générales 20 à 40 jours après la dissolution (art. 12). */
        delaiMinJours: z.number().int().min(1),
        delaiMaxJours: z.number().int().min(1),
        /** Pas de nouvelle dissolution dans l'année qui suit ces élections (art. 12). */
        moratoireJours: z.number().int().min(1),
        dureeAnnees: z.number().int().min(1),
        regle: z.string().min(1),
      })
      .strict(),
    finLegislature: DatedRuleSchema,
    /** Élections de fin de législature : dates de jeu (dimanches). */
    echeance: z
      .object({
        t1: IsoDateSchema,
        t2: IsoDateSchema,
        statut: DataStatusSchema,
        regle: z.string().min(1),
      })
      .strict(),
    blocs: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
            libelle: z.string().min(1),
            nuances: z.array(z.string().regex(/^[A-Z]{2,4}$/)).min(1),
            groupes: z.array(Id).min(1),
          })
          .strict(),
      )
      .min(2),
    modele: z
      .object({
        statut: z.literal('hypothese'),
        /** Gain du camp présidentiel juste après la présidentielle (part des exprimés). */
        elanPresidentiel: Fraction,
        elanSemaines: z.number().int().min(1),
        /** Gain du camp présidentiel par point de popularité au-dessus de la référence. */
        effetPopularite: z.number().min(0),
        aleaNational: Fraction,
        aleaLocal: Fraction,
        /** Part des voix d'un bloc éliminé qui se reporte au second tour. */
        reportMax: Fraction,
        /** Distance (axes du jeu) au-delà de laquelle aucun report ne se fait. */
        distanceReport: z.number().positive(),
        blancsNulsT2: Fraction,
      })
      .strict(),
    ia: z
      .object({
        statut: z.literal('hypothese'),
        /** Le président IA dissout si ses soutiens ont moins de cette part des sièges… */
        soutiensMax: Fraction,
        /** … et si sa popularité atteint ce niveau. */
        populariteMin: z.number().int().min(0).max(10_000),
      })
      .strict(),
  })
  .strict();
export type LegislativeRules = z.infer<typeof LegislativeRulesSchema>;

export const EventConditionSchema = z
  .object({
    ressource: ResourceKeySchema,
    min: z.number().int().nullable(),
    max: z.number().int().nullable(),
  })
  .strict();

export const EventChoiceSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    effets: z.array(EffectSchema),
  })
  .strict();

export const EventDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    nature: z.literal('fictif'),
    /** Un événement majeur déclenche une sauvegarde automatique préalable (§12). */
    majeur: z.boolean(),
    probabiliteHebdomadaire: Probability,
    conditions: z.array(EventConditionSchema),
    delaiMinEntreOccurrences: z.number().int().min(0),
    occurrencesMax: z.number().int().min(1).nullable(),
    effets: z.array(EffectSchema),
    campagne: CampaignEffectSchema.nullable(),
    choix: z.array(EventChoiceSchema),
    choixParDefaut: Id.nullable(),
  })
  .strict();
export type EventDefinition = z.infer<typeof EventDefinitionSchema>;

/** Ressources de départ par difficulté ; Jeunesse et Dynamique viennent de `numerique.initial`. */
const DifficultyResources = ResourcesV1Schema.omit({ tempsHeures: true });
const Coefficient = z.number().min(0).max(100);
const ResourceModifiers = z
  .object({
    budgetCentimes: z.number().int(),
    militants: z.number().int(),
    notoriete: z.number().int(),
    popularite: z.number().int(),
  })
  .partial()
  .strict();

/**
 * Scénario de départ (phase 7) : situation choisie à la création de la partie. Le scénario de
 * référence ne change rien ; les autres sont des situations fictives, étiquetées comme telles,
 * dont tous les paramètres sont des hypothèses de jeu.
 */
export const ScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    libelle: z.string().min(1),
    description: z.string().min(1),
    nature: z.enum(['reference', 'fictif']),
    statut: z.literal('hypothese'),
    campagne: z
      .object({
        /** Écarts appliqués aux moyens de départ du joueur et de ses adversaires. */
        joueur: ResourceModifiers,
        adversaires: ResourceModifiers,
        /** Multiplicateur des probabilités des événements de campagne. */
        evenements: z.number().min(0).max(5),
      })
      .strict(),
    quinquennat: z
      .object({
        /** Choc sur l'économie à l'ouverture du premier quinquennat (centièmes). */
        economie: z.array(
          z.object({ indicateur: EconomicIndicatorSchema, valeur: z.number().int() }).strict(),
        ),
        /** Multiplicateur des probabilités de toutes les crises. */
        crises: z.number().min(0).max(5),
        /** Conséquence durable dès l'ouverture du premier quinquennat. */
        durable: LongTermEffectSchema.nullable(),
      })
      .strict(),
  })
  .strict();
export type Scenario = z.infer<typeof ScenarioSchema>;

/** Groupe d'électeurs du modèle national (hypothèse de jeu : part, position, participation). */
export const ElectorateGroupSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    part: Fraction,
    position: PositionSchema,
    participation: Fraction,
  })
  .strict();
export type ElectorateGroup = z.infer<typeof ElectorateGroupSchema>;

export const FictionalCandidateSchema = z
  .object({
    id: z.string().regex(/^adv-[a-z0-9-]+$/),
    prenom: z.string().min(1),
    nom: z.string().min(1),
    parti: z.string().min(1),
    famille: z.string().min(1),
    positionnement: PositionSchema,
    parcours: z.string().min(1),
    style: CampaignStyleSchema,
    toleranceRisque: Fraction,
    ressources: DifficultyResources,
    objectif: AiObjectiveSchema,
    equipe: Fraction,
    /** Régions (codes INSEE) où le parti compte le plus d'élus. */
    implantation: z.array(z.string().regex(/^\d{2}$/)).min(1),
    promessesInitiales: z.number().int().min(0),
    /** Propositions du programme, dans l'ordre d'annonce. */
    programme: z.array(Id),
  })
  .strict();
export type FictionalCandidate = z.infer<typeof FictionalCandidateSchema>;

export const StartingProfileSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    modificateurs: ResourceModifiers,
  })
  .strict();

export const InstituteSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    taille: z.number().int().min(100).max(20_000),
    methode: z.string().min(1),
    /** Un sondage toutes les `periodicite` semaines, à partir de la semaine `decalage`. */
    periodicite: z.number().int().min(1),
    decalage: z.number().int().min(0),
  })
  .strict();

const AiLevel = z
  .object({
    multiplicateurBudget: z.number().min(0).max(10),
    actionsParSemaine: z.number().int().min(0),
    /** Finesse des choix : plus elle est basse, plus l'IA retient l'action la mieux évaluée. */
    temperature: z.number().positive().max(5),
  })
  .strict();

/** Proposition de programme (§6). Coûts et délais : estimations de jeu, pas des chiffrages. */
export const ProposalSchema = z
  .object({
    id: Id,
    domaine: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    /** Coût annuel en régime de croisière, en millions d'euros (négatif : économie). */
    coutMillionsEuros: z.number().int(),
    /** Délai de mise en œuvre, en mois. */
    delaiMois: z.number().int().min(0).max(120),
    faisabilite: Fraction,
    dependances: z.array(Id),
    incompatibilites: z.array(Id),
    /** Orientation de la mesure sur les deux axes du jeu. */
    position: PositionSchema,
    /** Groupes d'électeurs particulièrement sensibles à la mesure. */
    publics: z.array(Id),
    /** Confiance dans les estimations de coût et d'effet. */
    confiance: z.enum(['faible', 'moyenne', 'elevee']),
  })
  .strict();
export type Proposal = z.infer<typeof ProposalSchema>;

const DepartementCode = z.string().regex(/^(\d{2}|2A|2B|97\d)$/);

/**
 * Réseaux sociaux et nouveaux médias (phase 9). Les formats et leurs exemples sont réels et
 * sourcés (révisions figées) ; leurs effets, les vues et les réactions sont des paramètres de
 * jeu (hypothèses). Les comptes qui réagissent sont inventés ; aucun propos n'est prêté à un
 * animateur, à une chaîne ni à une personne réelle.
 */
const ReactionTemplates = z
  .object(
    Object.fromEntries(
      DIGITAL_TONES.map((t) => [t, z.array(z.string().min(1).max(200)).min(3)]),
    ) as {
      [K in (typeof DIGITAL_TONES)[number]]: z.ZodArray<z.ZodString>;
    },
  )
  .strict();

export const DigitalFormatSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    plateforme: z.string().min(1),
    description: z.string().min(1),
    /** Exemples réels du format (chaînes, émissions), avec un fait vérifié dans la source. */
    exemples: z
      .array(z.object({ nom: z.string().min(1), fait: z.string().min(1), sourceId: Id }).strict())
      .min(1),
    /** Vues d'une publication (simulation) : base × (0,5 + notoriété) × (0,5 + jeunesse) ± écart. */
    vues: z.object({ base: z.number().int().min(1), ecart: Fraction }).strict(),
    reactions: ReactionTemplates,
  })
  .strict();
export type DigitalFormat = z.infer<typeof DigitalFormatSchema>;

export const DigitalRulesSchema = z
  .object({
    statut: z.literal('hypothese'),
    sourceId: Id,
    note: z.string().min(1),
    /** Jauges de départ de tous les candidats. */
    initial: z.object({ jeunesse: Points, dynamique: Points }).strict(),
    /** Part de la jauge Jeunesse perdue chaque semaine. */
    erosionJeunesse: Fraction,
    /** Part de la Dynamique (buzz) retombée chaque semaine. */
    retombeeDynamique: Fraction,
    modele: z
      .object({
        /** Poids de l'écho chez les 18-34 ans dans le score latent, par groupe d'électeurs. */
        jeunesse: z.record(Id, z.number().min(0).max(5)),
        /** Jauge Jeunesse neutre (au-dessus : bonus, en dessous : malus). */
        referenceJeunesse: Points,
        /** Poids de la Dynamique (buzz) dans le score latent. */
        elan: z.number().min(0).max(5),
      })
      .strict(),
    formats: z.array(DigitalFormatSchema).min(1),
    /** Modèles communs à tous les formats, par ton (phase 11). */
    reactionsCommunes: ReactionTemplates,
    /**
     * Réactions de militants (soutien) et d'opposants, par famille politique du candidat
     * (phase 11) ; « {parti} » est remplacé par le parti du candidat, aucun nom de personne.
     */
    reactionsPartisanes: z
      .object(
        Object.fromEntries(
          FAMILLES_POLITIQUES.map((f) => [
            f,
            z
              .object({
                soutien: z.array(z.string().min(1).max(200)).min(4),
                opposition: z.array(z.string().min(1).max(200)).min(4),
              })
              .strict(),
          ]),
        ) as {
          [K in FamillePolitique]: z.ZodObject<{
            soutien: z.ZodArray<z.ZodString>;
            opposition: z.ZodArray<z.ZodString>;
          }>;
        },
      )
      .strict(),
    /** Part des réactions écrites par des militants ou des opposants. */
    partPartisane: Fraction,
    /** Une réaction ne reprend pas un texte paru dans ce nombre de réactions récentes du fil. */
    memoireReactions: z.number().int().min(0).max(200),
    /** Pseudonymes inventés des comptes qui réagissent (aucun compte réel). */
    comptes: z.array(z.string().regex(/^@[a-z0-9_.]{3,30}$/)).min(8),
    /** Publications gardées dans le fil (les plus récentes). */
    publicationsMax: z.number().int().min(1).max(60),
    reactionsParPublication: z.number().int().min(1).max(6),
  })
  .strict();
export type DigitalRules = z.infer<typeof DigitalRulesSchema>;

export const RulesetSchema = z
  .object({
    id: Id,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    libelle: z.string().min(1),
    verifieLe: IsoDateSchema,
    sources: z.record(Id, SourceSchema),
    calendrier: z
      .object({
        scrutins: z.array(ScrutinSchema).min(1),
        echeances: z.array(EcheanceSchema),
      })
      .strict(),
    jeu: z
      .object({
        statut: z.literal('hypothese'),
        sourceId: Id,
        tempsHebdomadaireHeures: z.number().int().min(1).max(168),
        actionsMaxParSemaine: z.number().int().min(1),
        evenementsMaxParSemaine: z.number().int().min(0),
        /** Qualité de l'équipe du candidat du joueur (0 à 1). */
        equipeJoueur: Fraction,
        /** Promesses de parrainage dont dispose le joueur au départ, selon la difficulté. */
        promessesInitialesJoueur: z
          .object({
            accessible: z.number().int().min(0),
            standard: z.number().int().min(0),
            expert: z.number().int().min(0),
          })
          .strict(),
        ressourcesInitiales: z
          .object({
            accessible: DifficultyResources,
            standard: DifficultyResources,
            expert: DifficultyResources,
          })
          .strict(),
        opinion: z
          .object({
            erosionNotoriete: Fraction,
            popularite: z
              .object({ reference: z.number().int().min(0).max(10_000), rappel: Fraction })
              .strict(),
            attritionMilitants: Fraction,
          })
          .strict(),
      })
      .strict(),
    actions: z.array(ActionDefinitionSchema).min(1),
    evenements: z.array(EventDefinitionSchema),
    electorat: z
      .object({
        inscrits: z
          .object({
            valeur: z.number().int().positive(),
            statut: DataStatusSchema,
            sourceId: Id,
            note: z.string().min(1),
          })
          .strict(),
        statutGroupes: z.literal('hypothese'),
        groupes: z.array(ElectorateGroupSchema).min(2),
        /**
         * Géographie électorale (phase 4) : répartition des électeurs de chaque candidat d'une
         * élection passée entre les groupes du jeu, pour situer les groupes commune par commune.
         * Les abstentionnistes se répartissent selon l'abstention attendue de chaque groupe.
         */
        baseHistorique: z
          .object({
            statut: z.literal('hypothese'),
            note: z.string().min(1),
            election: Id,
            /** Électeurs fictifs « nationaux » ajoutés à chaque commune (petites communes). */
            lissage: z.number().int().min(0),
            /** Bornes du facteur de participation locale (écart à 2022, à composition égale). */
            participationLocale: z
              .object({ min: Fraction, max: z.number().min(1).max(3) })
              .strict(),
            /** Nom du candidat (tel qu'écrit dans le fichier officiel) → part de ses électeurs par groupe. */
            candidats: z.record(z.string().min(1), z.record(Id, Fraction)),
          })
          .strict(),
      })
      .strict(),
    modele: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        proximite: Coefficient,
        notoriete: Coefficient,
        popularite: Coefficient,
        dynamique: Coefficient,
        /** Phase 5 : programme, crédibilité, médias et alliances (§5.1). */
        programme: Coefficient,
        credibilite: Coefficient,
        medias: Coefficient,
        alliances: Coefficient,
        alea: Coefficient,
        /**
         * Persistance de la part d'incertitude d'une semaine à l'autre (phase 11) : moyenne
         * pondérée des chocs des semaines passées (0 : tirage indépendant chaque semaine).
         */
        persistanceIncertitude: Fraction,
        participation: z
          .object({ effetProximite: Fraction, min: Fraction, max: Fraction })
          .strict(),
        blancsNuls: z
          .object({
            blancsT1: Fraction,
            nulsT1: Fraction,
            blancsT2Min: Fraction,
            blancsT2Max: Fraction,
            nulsT2: Fraction,
          })
          .strict(),
        secondTour: z
          .object({
            effetConsigne: Coefficient,
            effetDebat: Coefficient,
            abstentionDifferentielle: Fraction,
            seuilConsigne: z.number().min(0).max(3),
          })
          .strict(),
      })
      .strict(),
    sondages: z
      .object({
        statut: z.literal('hypothese'),
        instituts: z.array(InstituteSchema).min(1),
        biaisMaxCentiemes: z.number().int().min(0).max(1_000),
        /**
         * Part de l'écart d'échantillonnage conservée après redressement par quotas (phase 11,
         * hypothèse) : 1 = tirage brut, plus bas = vagues plus stables.
         */
        redressement: Fraction,
        limites: z.string().min(1),
      })
      .strict(),
    candidatsFictifs: z.array(FictionalCandidateSchema).min(1),
    programme: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        domaines: z.array(z.object({ id: Id, libelle: z.string().min(1) }).strict()).length(17),
        propositions: z.array(ProposalSchema).min(17),
        maxPropositions: z.number().int().min(1),
        /** Heures de travail pour annoncer une proposition. */
        heuresParProposition: z.number().int().min(0),
        /** Coût annuel total (millions d'euros) au-delà duquel la crédibilité baisse. */
        coutSoutenable: z.number().int().min(1),
        /** Crédibilité perdue par proposition retirée (revirement). */
        penaliteRevirement: Fraction,
      })
      .strict(),
    parrainages: z
      .object({
        /** Règle officielle (loi n° 62-1292, art. 3). */
        statut: DataStatusSchema,
        sourceId: Id,
        seuil: z.number().int().min(1),
        departementsMin: z.number().int().min(1),
        partMaxParDepartement: Fraction,
        note: z.string().min(1),
        ouvertureEcheanceId: Id,
        clotureEcheanceId: Id,
        /** Élus susceptibles de parrainer, par département (approximation sourcée). */
        reservoir: z
          .object({
            statut: DataStatusSchema,
            sourceId: Id,
            note: z.string().min(1),
            departements: z.record(
              DepartementCode,
              z
                .object({
                  nom: z.string().min(1),
                  region: z.string().regex(/^\d{2}$/),
                  elus: z.number().int().min(1),
                })
                .strict(),
            ),
          })
          .strict(),
        /** Dynamique des promesses et des envois (paramètres de jeu). */
        dynamique: z
          .object({
            statut: z.literal('hypothese'),
            partMobilisable: Fraction,
            conversionHebdo: Fraction,
            renoncementHebdo: Fraction,
            envoiHebdo: Fraction,
            tauxInvalidite: Fraction,
            /** Part des promesses initiales d'un parti situées dans ses régions d'implantation. */
            partImplantation: Fraction,
          })
          .strict(),
      })
      .strict(),
    finances: z
      .object({
        /** Règles officielles (guide CNCCFP 2027). */
        statut: DataStatusSchema,
        sourceId: Id,
        plafondT1Centimes: z.number().int().min(1),
        plafondT2Centimes: z.number().int().min(1),
        donMaxCentimes: z.number().int().min(1),
        donEspecesMaxCentimes: z.number().int().min(0),
        avanceForfaitaireCentimes: z.number().int().min(0),
        remboursement: z
          .object({ seuilExprimes: Fraction, tauxSousSeuil: Fraction, tauxAuDessus: Fraction })
          .strict(),
        note: z.string().min(1),
        /** Paramètres de jeu : origine des fonds de départ, emprunts bancaires. */
        jeu: z
          .object({
            statut: z.literal('hypothese'),
            partApportPersonnelInitial: Fraction,
            emprunt: z
              .object({
                tauxAnnuel: Fraction,
                /** Intentions minimales (centièmes de point) pour un remboursement au taux plein. */
                seuilIntentions: z.number().int().min(0).max(10_000),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Médias réels (phase 5 ter) : paramètres de jeu (hypothèses) appliqués aux organes, aux
     * temps de parole et aux émissions importés par `pnpm data:medias` (`mediasReels`, dont
     * l'empreinte est vérifiée : une nouvelle importation impose une nouvelle version du jeu de
     * règles). Aucune crédibilité ni ligne éditoriale n'est propre à un média réel.
     */
    medias: z
      .object({
        statut: z.literal('hypothese'),
        sourceId: Id,
        note: z.string().min(1),
        fichier: z.string().regex(/^[a-z0-9-]+\.json$/),
        /** SHA-256 de la sérialisation JSON des données (`JSON.stringify`). */
        empreinte: z.string().regex(/^[0-9a-f]{64}$/),
        /** Poids d'audience de chaque type de média, réparti selon les parts mesurées. */
        poidsParType: z
          .object({
            television: z.number().positive(),
            radio: z.number().positive(),
            presse: z.number().positive(),
          })
          .strict(),
        /** Crédibilité identique pour tous les organes. */
        credibilite: Fraction,
        /** Bornes appliquées à la propension d'exposition par parti (temps de parole). */
        propension: z
          .object({ min: z.number().positive(), max: z.number().positive() })
          .strict()
          .refine((p) => p.min <= 1 && p.max >= 1, 'Bornes encadrant l’exposition moyenne (1)'),
        /** Part de l'exposition d'une émission reportée sur les autres organes qui la diffusent. */
        partCodiffusion: Fraction,
        /** Notoriété gagnée par point d'exposition pondérée par l'audience. */
        notorieteParExposition: z.number().min(0),
      })
      .strict(),
    mediasReels: RealMediaSchema,
    numerique: DigitalRulesSchema,
    quinquennat: QuinquennatRulesSchema,
    parlement: ParliamentRulesSchema,
    assemblee: RealAssemblySchema,
    economie: EconomyRulesSchema,
    economieReelle: RealEconomySchema,
    crises: z.array(CrisisDefinitionSchema).min(1),
    scenarios: z.array(ScenarioSchema).min(1),
    legislatives: LegislativeRulesSchema,
    legislatives2024: RealLegislativesSchema,
    /** Débats télévisés (phase 10) : séances, cartes, angles, effets, répliques. */
    debats: DebateRulesSchema,
    /** Passages dans les médias sans aléa (phase 11) : postures, formats, score. */
    prestations: PrestationRulesSchema,
    alliances: z
      .object({
        statut: z.literal('hypothese'),
        /** Ralliements possibles dans les n semaines qui précèdent le premier tour. */
        fenetreSemaines: z.number().int().min(1),
        /** Intentions (centièmes de point) sous lesquelles un candidat envisage de se rallier. */
        seuilIntentions: z.number().int().min(0).max(10_000),
        /** Proximité minimale (0 à 100) avec le candidat soutenu. */
        proximiteMin: z.number().int().min(0).max(100),
        probabiliteHebdo: Probability,
      })
      .strict(),
    profilsDeDepart: z.array(StartingProfileSchema).min(1),
    ia: z
      .object({
        statut: z.literal('hypothese'),
        accessible: AiLevel,
        standard: AiLevel,
        expert: AiLevel,
      })
      .strict(),
    /**
     * Personnalités réelles (phase 5 bis) : paramètres de jeu (hypothèses) qui convertissent
     * les niveaux de notoriété et d'organisation des fiches en moyens de départ. Les fiches
     * elles-mêmes (`personnalites`) viennent de `pnpm data:personnalites` ; leur empreinte
     * est vérifiée : une nouvelle importation impose une nouvelle version du jeu de règles.
     */
    personnalitesReelles: z
      .object({
        statut: z.literal('hypothese'),
        sourceId: Id,
        note: z.string().min(1),
        fichier: z.string().regex(/^[a-z0-9-]+\.json$/),
        /** SHA-256 de la sérialisation JSON des fiches (`JSON.stringify`). */
        empreinte: z.string().regex(/^[0-9a-f]{64}$/),
        /** Notoriété de départ (centièmes de point) par niveau 1, 2, 3. */
        notoriete: z.tuple([Points, Points, Points]),
        popularite: Points,
        /** Moyens de départ par niveau d'organisation. */
        organisation: z
          .object({
            grande: OrganisationMeans,
            moyenne: OrganisationMeans,
            petite: OrganisationMeans,
            aucune: OrganisationMeans,
          })
          .strict(),
        style: CampaignStyleSchema,
        toleranceRisque: Fraction,
        objectif: AiObjectiveSchema,
      })
      .strict(),
    personnalites: RealPersonalitiesSchema,
  })
  .strict()
  .superRefine((ruleset, ctx) => {
    const sourceIds = new Set(Object.keys(ruleset.sources));
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const referenced = [
      ...ruleset.calendrier.scrutins.map((s) => s.sourceId),
      ...ruleset.calendrier.echeances.map((e) => e.sourceId),
      ruleset.jeu.sourceId,
      ruleset.electorat.inscrits.sourceId,
      ruleset.personnalitesReelles.sourceId,
      ruleset.medias.sourceId,
      ruleset.numerique.sourceId,
      ruleset.prestations.sourceId,
      ...ruleset.numerique.formats.flatMap((f) => f.exemples.map((e) => e.sourceId)),
      ruleset.quinquennat.mandat.sourceId,
      ruleset.quinquennat.investiture.sourceId,
      ruleset.quinquennat.finMandat.sourceId,
      ...ruleset.parlement.regles.sourceIds,
      ...ruleset.legislatives.regles.sourceIds,
      ruleset.legislatives.finLegislature.sourceId,
    ];
    for (const id of referenced) if (!sourceIds.has(id)) issue(`Source inconnue : ${id}`);

    const unique = (label: string, ids: string[]) => {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) issue(`${label} en double : ${id}`);
        seen.add(id);
      }
    };
    unique(
      'Scrutin',
      ruleset.calendrier.scrutins.map((s) => s.id),
    );
    unique(
      'Échéance',
      ruleset.calendrier.echeances.map((e) => e.id),
    );
    unique(
      'Action',
      [...ruleset.actions, ...ruleset.quinquennat.actions].map((a) => a.id),
    );
    // Réseaux et nouveaux médias : chaque format est employé, chaque groupe d'électeurs pondéré.
    const formats = new Set(ruleset.numerique.formats.map((f) => f.id));
    unique('Format numérique', [...formats]);
    unique('Compte fictif', ruleset.numerique.comptes);
    // Réactions (phase 11) : aucune marque hors des réactions partisanes, qui n'ont que « {parti} ».
    const neutres = [
      ...ruleset.numerique.formats.flatMap((f) => Object.values(f.reactions).flat()),
      ...Object.values(ruleset.numerique.reactionsCommunes).flat(),
    ];
    for (const text of neutres)
      if (/[{}]/.test(text)) issue(`Réaction : marque inattendue dans « ${text} »`);
    for (const text of Object.values(ruleset.numerique.reactionsPartisanes).flatMap((p) => [
      ...p.soutien,
      ...p.opposition,
    ]))
      if (/[{}]/.test(text.replaceAll(PARTI_MARQUE, '')))
        issue(`Réaction partisane : seule la marque ${PARTI_MARQUE} est admise (« ${text} »)`);
    for (const action of [...ruleset.actions, ...ruleset.quinquennat.actions]) {
      if (action.format && !formats.has(action.format))
        issue(`${action.id} : format numérique inconnu (${action.format})`);
    }
    for (const id of formats) {
      if (!ruleset.actions.some((a) => a.format === id))
        issue(`Format numérique sans action : ${id}`);
    }
    // Passages dans les médias (phase 11) : chaque action et chaque format employé est connu.
    const prestations = ruleset.prestations;
    const plateaux = new Set(prestations.formats.map((f) => f.id));
    unique('Format de passage', [...plateaux]);
    unique(
      'Posture',
      prestations.postures.map((p) => p.id),
    );
    const employed = new Set<string>();
    for (const id of prestations.actions) {
      const action = ruleset.actions.find((a) => a.id === id);
      if (!action) issue(`Passage dans les médias : action inconnue (${id})`);
      else if (action.cible === 'media')
        Object.values(prestations.formatParTypeOrgane).forEach((f) => employed.add(f));
      else if (action.cible === 'emission') employed.add(prestations.formatEmission);
      else if (action.format) employed.add(action.format);
      else issue(`Passage dans les médias : ${id} n'a ni cible média ni format`);
    }
    for (const id of employed)
      if (!plateaux.has(id)) issue(`Passage dans les médias : format sans affinités (${id})`);
    for (const id of plateaux)
      if (!employed.has(id)) issue(`Passage dans les médias : format inemployé (${id})`);
    const { reussie, ratee, incident } = prestations.seuils;
    if (!(incident < ratee && ratee < reussie))
      issue('Passage dans les médias : seuils attendus incident < raté < réussi');
    const groups = ruleset.electorat.groupes.map((g) => g.id).sort();
    const weighted = Object.keys(ruleset.numerique.modele.jeunesse).sort();
    if (groups.join() !== weighted.join())
      issue('Numérique : un poids Jeunesse par groupe d’électeurs, ni plus ni moins');
    unique(
      'Poste du gouvernement',
      ruleset.quinquennat.postes.map((p) => p.id),
    );
    unique(
      'Profil fictif',
      ruleset.quinquennat.profils.map((p) => p.id),
    );
    const years = ruleset.quinquennat.cycles.map((c) => c.annee);
    if (years.some((y, i) => i > 0 && y <= years[i - 1]!))
      issue('Cycles électoraux : années non croissantes');
    // Un profil de plus que de postes : Matignon peut toujours être pourvu par un profil fictif.
    if (ruleset.quinquennat.profils.length <= ruleset.quinquennat.postes.length)
      issue('Quinquennat : il faut plus de profils fictifs que de postes à pourvoir');
    for (const action of ruleset.quinquennat.actions) {
      if (action.cout.budgetCentimes !== 0 || action.campagne !== null)
        issue(`${action.id} : une action du président n'a ni coût budgétaire ni effet de campagne`);
      if (action.cible !== null && action.cible !== 'departement')
        issue(`${action.id} : seule une cible départementale est possible pour le président`);
      if (action.effets.length === 0 && !action.institution) issue(`${action.id} : aucun effet`);
    }
    if (ruleset.quinquennat.actions.filter((a) => a.institution === 'remaniement').length !== 1)
      issue('Quinquennat : une et une seule action de remaniement');
    if (ruleset.quinquennat.actions.filter((a) => a.institution === 'dissolution').length > 1)
      issue('Quinquennat : une seule action de dissolution');
    // Législatives : chaque nuance de 2024 et chaque groupe de l'Assemblée dans un seul bloc.
    const nuanceBloc = new Map<string, string>();
    const groupBloc = new Map<string, string>();
    for (const bloc of ruleset.legislatives.blocs) {
      for (const n of bloc.nuances) {
        if (nuanceBloc.has(n)) issue(`Nuance ${n} dans deux blocs`);
        nuanceBloc.set(n, bloc.id);
      }
      for (const g of bloc.groupes) {
        if (groupBloc.has(g)) issue(`Groupe ${g} dans deux blocs`);
        groupBloc.set(g, bloc.id);
      }
    }
    for (const d of ruleset.legislatives2024.circonscriptions)
      for (const n of Object.keys(d.voix))
        if (!nuanceBloc.has(n)) issue(`Nuance ${n} (${d.code}) rattachée à aucun bloc`);
    for (const g of ruleset.assemblee.groupes)
      if (!groupBloc.has(g.id)) issue(`Groupe ${g.id} rattaché à aucun bloc`);
    for (const g of groupBloc.keys())
      if (!ruleset.assemblee.groupes.some((a) => a.id === g)) issue(`Groupe inconnu : ${g}`);
    for (const action of ruleset.actions)
      if (action.institution) issue(`${action.id} : acte institutionnel hors du quinquennat`);
    unique(
      'Événement',
      [...ruleset.evenements, ...ruleset.crises].map((e) => e.id),
    );
    const crisisIds = new Set(ruleset.crises.map((c) => c.id));
    const checkDurable = (
      owner: string,
      durable: { vulnerabilites: { crise: string }[] } | null,
    ) => {
      for (const v of durable?.vulnerabilites ?? [])
        if (!crisisIds.has(v.crise))
          issue(`${owner} : vulnérabilité à une crise inconnue ${v.crise}`);
    };
    for (const crisis of ruleset.crises) {
      unique(
        `Choix de ${crisis.id}`,
        crisis.choix.map((c) => c.id),
      );
      if (!crisis.choix.some((c) => c.id === crisis.choixParDefaut))
        issue(`${crisis.id} : choix par défaut inconnu ${crisis.choixParDefaut}`);
      checkDurable(crisis.id, crisis.durable);
      for (const choice of crisis.choix) checkDurable(`${crisis.id}/${choice.id}`, choice.durable);
    }
    unique(
      'Scénario',
      ruleset.scenarios.map((s) => s.id),
    );
    const reference = ruleset.scenarios.filter((s) => s.nature === 'reference');
    if (reference.length !== 1 || reference[0]!.id !== 'standard')
      issue('Un seul scénario de référence, « standard »');
    for (const s of reference) {
      const neutral =
        Object.keys(s.campagne.joueur).length === 0 &&
        Object.keys(s.campagne.adversaires).length === 0 &&
        s.campagne.evenements === 1 &&
        s.quinquennat.economie.length === 0 &&
        s.quinquennat.crises === 1 &&
        s.quinquennat.durable === null;
      if (!neutral) issue('Le scénario de référence ne modifie rien');
    }
    for (const s of ruleset.scenarios) checkDurable(`Scénario ${s.id}`, s.quinquennat.durable);

    unique(
      'Groupe d’électeurs',
      ruleset.electorat.groupes.map((g) => g.id),
    );
    unique(
      'Candidat fictif',
      ruleset.candidatsFictifs.map((c) => c.id),
    );
    unique(
      'Personnalité réelle',
      ruleset.personnalites.personnalites.map((p) => p.id),
    );
    for (const p of ruleset.personnalites.personnalites) {
      for (const region of p.implantation.regions) {
        if (
          !Object.values(ruleset.parrainages.reservoir.departements).some(
            (d) => d.region === region,
          )
        )
          issue(`${p.id} : région inconnue ${region}`);
      }
    }
    unique(
      'Profil de départ',
      ruleset.profilsDeDepart.map((p) => p.id),
    );
    unique(
      'Institut',
      ruleset.sondages.instituts.map((i) => i.id),
    );
    const groupIds = new Set(ruleset.electorat.groupes.map((g) => g.id));
    for (const [name, shares] of Object.entries(ruleset.electorat.baseHistorique.candidats)) {
      for (const id of Object.keys(shares))
        if (!groupIds.has(id)) issue(`${name} : groupe inconnu ${id}`);
      const sum = Object.values(shares).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-9) issue(`${name} : parts totalisant ${sum}, pas 1`);
    }
    const totalShare = ruleset.electorat.groupes.reduce((sum, g) => sum + g.part, 0);
    if (Math.abs(totalShare - 1) > 1e-9)
      issue(`Les parts des groupes totalisent ${totalShare}, pas 1`);
    const { min, max } = ruleset.modele.participation;
    if (min > max) issue('Participation : min > max');
    if (ruleset.modele.blancsNuls.blancsT2Min > ruleset.modele.blancsNuls.blancsT2Max) {
      issue('Blancs au second tour : min > max');
    }

    for (const event of ruleset.evenements) {
      unique(
        `Choix de ${event.id}`,
        event.choix.map((c) => c.id),
      );
      const hasChoices = event.choix.length > 0;
      if (hasChoices !== (event.choixParDefaut !== null)) {
        issue(`${event.id} : choixParDefaut requis si et seulement si des choix existent`);
      }
      if (event.choixParDefaut && !event.choix.some((c) => c.id === event.choixParDefaut)) {
        issue(`${event.id} : choix par défaut inconnu ${event.choixParDefaut}`);
      }
      if (!hasChoices && event.effets.length === 0 && !event.campagne)
        issue(`${event.id} : aucun effet`);
    }

    // Phase 5 : actions de campagne.
    for (const action of ruleset.actions) {
      if (action.effets.length === 0 && !action.campagne) issue(`${action.id} : aucun effet`);
      if (action.campagne?.promesses && action.cible !== 'departement')
        issue(`${action.id} : les promesses de parrainage exigent un département cible`);
    }

    // Programme : domaines, propositions, dépendances et incompatibilités réciproques.
    const { programme } = ruleset;
    unique(
      'Domaine',
      programme.domaines.map((d) => d.id),
    );
    unique(
      'Proposition',
      programme.propositions.map((p) => p.id),
    );
    const domains = new Set(programme.domaines.map((d) => d.id));
    const proposals = new Map(programme.propositions.map((p) => [p.id, p]));
    for (const domain of domains) {
      if (!programme.propositions.some((p) => p.domaine === domain))
        issue(`Domaine sans proposition : ${domain}`);
    }
    for (const p of programme.propositions) {
      if (!domains.has(p.domaine)) issue(`${p.id} : domaine inconnu ${p.domaine}`);
      for (const id of [...p.dependances, ...p.incompatibilites])
        if (!proposals.has(id)) issue(`${p.id} : proposition inconnue ${id}`);
      for (const id of p.incompatibilites)
        if (!proposals.get(id)?.incompatibilites.includes(p.id))
          issue(`${p.id} et ${id} : incompatibilité non réciproque`);
      for (const id of p.publics) if (!groupIds.has(id)) issue(`${p.id} : groupe inconnu ${id}`);
    }
    const checkProgramme = (owner: string, ids: readonly string[]) => {
      if (ids.length > programme.maxPropositions) issue(`${owner} : programme trop long`);
      unique(`${owner} : proposition`, [...ids]);
      for (const id of ids) {
        const p = proposals.get(id);
        if (!p) {
          issue(`${owner} : proposition inconnue ${id}`);
          continue;
        }
        for (const dep of p.dependances)
          if (!ids.includes(dep)) issue(`${owner} : ${id} exige ${dep}`);
        for (const other of p.incompatibilites)
          if (ids.includes(other)) issue(`${owner} : ${id} et ${other} incompatibles`);
      }
    };

    // Débats télévisés (phase 10) : échéances datées, chaînes réelles, thèmes et domaines connus.
    const { debats } = ruleset;
    if (!sourceIds.has(debats.sourceId)) issue(`Source inconnue : ${debats.sourceId}`);
    unique(
      'Débat',
      debats.seances.map((d) => d.id),
    );
    const debateThemes = new Set(debats.themes.map((t) => t.id));
    unique('Thème de débat', [...debats.themes.map((t) => t.id), debats.conclusion.id]);
    for (const theme of [...debats.themes, debats.conclusion])
      for (const d of theme.domaines)
        if (!domains.has(d)) issue(`Thème ${theme.id} : domaine inconnu ${d}`);
    const channels = new Set(
      ruleset.mediasReels.organes.filter((o) => o.type === 'television').map((o) => o.id),
    );
    const debateEcheances = new Map(ruleset.calendrier.echeances.map((e) => [e.id, e]));
    for (const d of debats.seances) {
      if (!debateEcheances.has(d.echeanceId)) issue(`${d.id} : échéance inconnue ${d.echeanceId}`);
      if (!channels.has(d.mediaId)) issue(`${d.id} : chaîne de télévision inconnue ${d.mediaId}`);
      for (const t of d.themes) if (!debateThemes.has(t)) issue(`${d.id} : thème inconnu ${t}`);
      if ((d.tour === 2) !== (d.invites.mode === 'finalistes'))
        issue(`${d.id} : seul le débat d'entre-deux-tours réunit les finalistes`);
    }
    if (debats.seances.filter((d) => d.tour === 2).length > 1)
      issue('Un seul débat d’entre-deux-tours');
    const angleIds = debats.angles.map((a) => a.id).sort();
    if (angleIds.join() !== [...DEBATE_ANGLES].sort().join())
      issue('Débats : un libellé par angle d’attaque, ni plus ni moins');
    const debateWeights = Object.values(debats.poids).reduce((a, b) => a + b, 0);
    if (Math.abs(debateWeights - 1) > 1e-9) issue(`Débats : poids totalisant ${debateWeights}`);

    // Parrainages, financement, médias.
    const { parrainages } = ruleset;
    const echeances = new Set(ruleset.calendrier.echeances.map((e) => e.id));
    for (const id of [parrainages.ouvertureEcheanceId, parrainages.clotureEcheanceId])
      if (!echeances.has(id)) issue(`Parrainages : échéance inconnue ${id}`);
    for (const id of [
      parrainages.sourceId,
      parrainages.reservoir.sourceId,
      ruleset.finances.sourceId,
    ])
      if (!sourceIds.has(id)) issue(`Source inconnue : ${id}`);
    const regions = new Set(Object.values(parrainages.reservoir.departements).map((d) => d.region));
    if (Object.keys(parrainages.reservoir.departements).length < parrainages.departementsMin)
      issue('Parrainages : réservoir plus petit que le nombre de départements requis');
    for (const c of ruleset.candidatsFictifs) {
      checkProgramme(c.id, c.programme);
      for (const r of c.implantation)
        if (!regions.has(r)) issue(`${c.id} : région d'implantation inconnue ${r}`);
    }
    const personalityIds = new Set(ruleset.personnalites.personnalites.map((p) => p.id));
    for (const r of ruleset.mediasReels.rattachements)
      if (!personalityIds.has(r.personnaliteId))
        issue(`Médias : rattachement d’une personnalité inconnue ${r.personnaliteId}`);
    for (const id of personalityIds)
      if (!ruleset.mediasReels.rattachements.some((r) => r.personnaliteId === id))
        issue(`Médias : personnalité ${id} sans rattachement aux temps de parole`);
    for (const a of ruleset.actions) {
      if (a.cible === 'emission' && ruleset.mediasReels.emissions.length === 0)
        issue(`${a.id} : aucune émission politique à cibler`);
    }
    if (ruleset.finances.plafondT2Centimes < ruleset.finances.plafondT1Centimes)
      issue('Finances : plafond du second tour inférieur à celui du premier');
  });
export type Ruleset = z.infer<typeof RulesetSchema>;

/** Identifiant complet d'un jeu de règles, enregistré dans chaque partie : « id@version ». */
export function rulesetKey(ruleset: Pick<Ruleset, 'id' | 'version'>): string {
  return `${ruleset.id}@${ruleset.version}`;
}
