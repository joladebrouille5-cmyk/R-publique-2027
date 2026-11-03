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
import { ProgressionRulesSchema } from './progression';
import { GovernmentFiguresSchema } from './figures';
import { RealPersonalitiesSchema } from './personalities';
import { MinisterProfileSchema } from './quinquennat';
import { CampaignStyleSchema, PositionSchema } from './politics';
import {
  DIGITAL_TONES,
  FAMILLES_POLITIQUES,
  PARTI_MARQUE,
  type FamillePolitique,
} from './numerique';
import { CounterpartSchema } from './precampagne';
import { ResourceKeySchema, ResourcesV1Schema } from './resources';
import { AchievementDefinitionSchema } from './succes';

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
    /**
     * Négociation du soutien d'une personnalité réelle (phase 15), avec ou sans contrepartie ;
     * issue simulée par le moteur (`negociations`).
     */
    soutien: z.object({ contrepartie: CounterpartSchema }).strict().optional(),
  })
  .strict();
export type CampaignEffect = z.infer<typeof CampaignEffectSchema>;

export const ActionDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    portee: z.enum(['locale', 'regionale', 'nationale']),
    /**
     * Cible à choisir en programmant l'action, le cas échéant ; depuis la phase 15 : une
     * personnalité réelle (négociation de soutien) ou un ministère (remaniement ciblé).
     */
    cible: z.enum(['departement', 'media', 'emission', 'personnalite', 'poste']).nullable(),
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
    /**
     * Acte institutionnel du président (phase 6) : remaniement, dissolution de l'Assemblée ;
     * depuis la phase 15, remplacement d'un seul ministre (remaniement ciblé).
     */
    institution: z.enum(['remaniement', 'dissolution', 'remaniement-cible']).optional(),
    /** Format des réseaux et nouveaux médias (phase 9) : l'action produit une publication. */
    format: Id.optional(),
    // Actions du chef de l'État (phase 13) : paramètres de jeu (hypothèses), sauf la règle citée.
    /** Délai minimal entre deux emplois (semaines) ; un nouveau quinquennat le remet à zéro. */
    delaiSemaines: z.number().int().min(1).optional(),
    /** Condition d'emploi : une crise est survenue dans les semaines précédentes. */
    condition: z.enum(['crise-recente']).optional(),
    /** Effets immédiats sur les indicateurs économiques (centièmes), par le registre de l'économie. */
    economie: z
      .array(z.object({ indicateur: EconomicIndicatorSchema, valeur: z.number().int() }).strict())
      .optional(),
    /** Effets sur le Parlement : apaisement de la tension (points) et part de la fronde résorbée. */
    parlement: z
      .object({ apaisement: z.number().int().min(0).max(100), fronde: Fraction })
      .strict()
      .optional(),
    /**
     * Poste du gouvernement dont le titulaire module les effets (compétence) ; null : le Premier
     * ministre ; absent : aucune modulation.
     */
    poste: Id.nullable().optional(),
    /** Règle officielle citée par l'action (source du jeu de règles). */
    sourceId: Id.optional(),
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
        /**
         * Nombre maximal de personnalités (acteurs de la partie ou figures réelles) parmi les
         * ministres proposés par le Premier ministre (le reste : profils fictifs).
         */
        ministresActeursMax: z.number().int().min(0),
        /** Semaines pendant lesquelles un acteur qui a refusé n'est plus sollicité. */
        delaiApresRefus: z.number().int().min(1),
      })
      .strict(),
    /**
     * Équipe gouvernementale (phase 11, P11-02) : figures réelles nominables (`figures`, issues
     * de `pnpm data:gouvernement`, empreinte vérifiée) et effets de la compétence et de la
     * popularité des membres. Paramètres de jeu (hypothèses), jamais présentés comme une mesure.
     */
    equipe: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        fichier: z.string().regex(/^[a-z0-9-]+\.json$/),
        /** SHA-256 de la sérialisation JSON des fiches (`JSON.stringify`). */
        empreinte: z.string().regex(/^[0-9a-f]{64}$/),
        /** Postes que le président pourvoit lui-même après la nomination du Premier ministre. */
        postesRegaliens: z.array(Id).min(1),
        /** Popularité prêtée à une figure selon son niveau de notoriété 1, 2, 3 (centièmes). */
        popularite: z.tuple([Points, Points, Points]),
        /** Compétence prêtée à un candidat de la partie nommé au gouvernement (aucune estimation). */
        competenceActeur: Fraction,
        /** Part du Premier ministre dans la compétence de l'équipe (le reste : postes régaliens). */
        poidsPremierMinistre: Fraction,
        /** Effet d'une nomination sur la popularité du président : poids × (popularité − référence). */
        nomination: z.object({ premierMinistre: Fraction, ministre: Fraction }).strict(),
        /** Action du gouvernement, chaque semaine : poids × (compétence de l'équipe − 0,5). */
        actionHebdomadaire: z.number().int().min(0).max(500),
        /**
         * Ouverture : un groupe non allié représenté au gouvernement soutient davantage les
         * textes et censure moins, par membre et au plus `membresMax` membres.
         */
        ouverture: z
          .object({
            soutienParMembre: z.number().min(0).max(1),
            censureParMembre: z.number().min(0).max(1),
            membresMax: z.number().int().min(1),
          })
          .strict(),
        /** Censure : propension réduite de poids × (compétence du Premier ministre − 0,5). */
        censureCompetence: z.number().min(0).max(2),
        /** Crise : effet sur la popularité de poids × (compétence du ministre concerné − 0,5). */
        crise: z.number().int().min(0).max(1_000),
        /**
         * Effets thématiques des ministres (phase 13) : domaines du programme et indicateurs de
         * chaque poste ; effet hebdomadaire sur un indicateur par unité d'écart de compétence à
         * 0,5 (centièmes).
         */
        themes: z
          .array(
            z
              .object({
                posteId: Id,
                domaines: z.array(Id),
                indicateurs: z.array(
                  z
                    .object({ indicateur: EconomicIndicatorSchema, parSemaine: z.number().int() })
                    .strict(),
                ),
              })
              .strict(),
          )
          .min(1),
        /** Soutien des groupes aux textes du domaine d'un ministre : poids × (compétence − 0,5). */
        soutienTheme: z.number().min(0).max(2),
        /** Effets d'une action du président liée à un poste : × (1 + poids × (compétence − 0,5)). */
        actionPoste: z.number().min(0).max(2),
        /**
         * Expertise ministérielle (phase 14) : une fonction de ministre, de secrétaire d'État ou
         * de ministre délégué, en cours ou passée, dont le libellé cite un mot-clé d'un poste
         * donne un bonus de compétence sur ce poste (meilleure fonction retenue). Table de
         * mots-clés et bonus : paramètres de jeu (hypothèses).
         */
        expertise: z
          .object({
            /** Mots-clés cherchés dans le libellé (sans accents ni majuscules), par poste. */
            postes: z
              .array(
                z.object({ posteId: Id, motsCles: z.array(z.string().min(3)).min(1) }).strict(),
              )
              .min(1),
            /** Bonus d'une fonction de ministre du domaine (ministre d'État, garde des Sceaux). */
            ministre: Fraction,
            /** Bonus d'une fonction de secrétaire d'État ou de ministre délégué du domaine. */
            secretaireEtat: Fraction,
            /** Compétence maximale sur un poste, bonus compris. */
            plafond: Fraction,
          })
          .strict(),
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
    /**
     * Ministres vivants (phase 15) : popularité prêtée (centièmes) et loyauté envers le
     * président (0 à 100) de chaque membre du gouvernement, et départs simulés. Paramètres de
     * jeu (hypothèses) ; la popularité prêtée n'est jamais présentée comme un sondage.
     */
    suivi: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        loyaute: z
          .object({
            /** Loyauté de départ à une proximité de 50/100 avec le président. */
            base: z.number().int().min(0).max(100),
            /** Points de loyauté de départ par point de proximité au-dessus de 50. */
            poidsProximite: z.number().min(0).max(2),
            /** Loyauté de départ en plus pour le Premier ministre. */
            premierMinistre: z.number().int().min(0).max(50),
            /** Part de l'écart à la loyauté de départ résorbée chaque semaine. */
            rappel: Fraction,
            /** Points par point d'écart de la popularité du président à la référence. */
            poidsPopularitePresident: z.number().min(0).max(2),
            /** Un point de loyauté perdu toutes les n semaines au poste (usure). */
            usureSemaines: z.number().int().min(1),
          })
          .strict(),
        popularite: z
          .object({
            /** Perte hebdomadaire (centièmes) : usure au poste. */
            usureHebdomadaire: z.number().int().min(0).max(500),
            /** Part de l'écart à la popularité prêtée de départ résorbée chaque semaine. */
            rappel: Fraction,
            /** Part de l'écart hebdomadaire de popularité du président reportée sur ses ministres. */
            poidsPresident: Fraction,
            /** Crise de son domaine : poids × (compétence − 0,5) (centièmes). */
            crise: z.number().int().min(0).max(2_000),
            /** Texte de son domaine adopté (+) ou rejeté (−) (centièmes). */
            texte: z.number().int().min(0).max(1_000),
          })
          .strict(),
        depart: z
          .object({
            /** Départ possible en deçà de cette loyauté… */
            loyauteMax: z.number().int().min(0).max(100),
            /** …ou de cette popularité prêtée (centièmes). */
            populariteMax: Points,
            probabilite: Probability,
            /** Semaines au poste avant un départ possible. */
            semainesMin: z.number().int().min(0),
            /** Popularité perdue par le président à chaque départ (centièmes). */
            effetPresident: z.number().int().min(0).max(1_000),
          })
          .strict(),
      })
      .strict(),
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
        /** Motions de censure qu'un député peut signer par session ordinaire (art. 49 al. 2). */
        motionsParSession: z.number().int().min(1),
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
    /**
     * Tension parlementaire (phase 13), de 0 à 100 : facteurs (points) et effets. Toutes ces
     * valeurs sont des hypothèses de jeu.
     */
    tension: z
      .object({
        statut: z.literal('hypothese'),
        base: z.number().int().min(0).max(100),
        /** Points pour une Assemblée entièrement dans l'opposition (au prorata des sièges). */
        poidsOpposition: z.number().min(0),
        /** Points pour un président sans aucun soutien (au prorata des voix manquantes). */
        poidsMinorite: z.number().min(0),
        /** Points pour un président sans aucune popularité (au prorata de l'écart à la référence). */
        poidsImpopularite: z.number().min(0),
        par49_3: z.number().int().min(0),
        /** Points par frondeur (fronde de fond), plafonnés. */
        parFrondeur: z.number().min(0),
        frondeMax: z.number().int().min(0),
        /** Points par motion spontanée de la session. */
        parMotion: z.number().int().min(0),
        /** Points retranchés par une coalition de gouvernement. */
        coalition: z.number().int().min(0),
        /** Points par point de tensions sociales au-dessus de 50 (indicateur de l'économie). */
        poidsTensionsSociales: z.number().min(0),
        /** Part de l'apaisement perdue chaque semaine. */
        decroissanceApaisement: Fraction,
        /** Au-delà, l'opposition peut déposer une motion de censure spontanée. */
        seuilMotion: z.number().int().min(0).max(100),
        /** Probabilité hebdomadaire d'une motion par point au-dessus du seuil. */
        probabiliteParPoint: Probability,
        delaiMotionSemaines: Weeks,
        /** Propension à censurer : poids × (tension − 50) / 50. */
        effetCensure: z.number().min(0),
        /** Coût du 49.3 (popularité, tensions sociales) × (1 + majoration × tension / 100). */
        majoration49_3: z.number().min(0),
      })
      .strict(),
    /**
     * Frondeurs (phase 13) : part des députés d'un groupe qui soutient le président votant
     * contre un texte (hypothèses). Nombres seulement : aucun député n'est nommé.
     */
    frondeurs: z
      .object({
        statut: z.literal('hypothese'),
        /** Distance (axes du jeu) entre le groupe et le texte en deçà de laquelle nul ne fronde. */
        toleranceDistance: z.number().min(0),
        poidsEloignement: z.number().min(0),
        poidsImpopularite: z.number().min(0),
        poidsTension: z.number().min(0),
        /** Réduction par la compétence du ministre du domaine : poids × (compétence − 0,5). */
        poidsMinistre: z.number().min(0),
        partMax: Fraction,
        /** Part des sièges des groupes soutiens qui rejoint la fronde après un 49.3. */
        hausse49_3: Fraction,
        /** Part de la fronde de fond résorbée chaque semaine. */
        baisseHebdomadaire: Fraction,
        negociation: z.object({ reduction: Fraction, reductionEffet: Fraction }).strict(),
        /** Part supplémentaire de frondeurs dans les groupes d'une coalition. */
        coalition: Fraction,
      })
      .strict(),
    /** Interventions du premier groupe d'opposition lors des votes clés (phase 13, hypothèses). */
    opposition: z
      .object({
        statut: z.literal('hypothese'),
        /** Vote clé : écart projeté entre pour et contre inférieur à cette part des sièges. */
        margeCle: Fraction,
        /** Effet sur le soutien des groupes non alignés. */
        effet: Fraction,
        /** Distance (axes du jeu) maximale entre un candidat fictif battu et le groupe qu'il mène. */
        distanceMeneur: z.number().positive(),
      })
      .strict(),
    /**
     * Questions au gouvernement (phase 15). Règle citée (`sourceId`) : une séance par semaine
     * au moins est réservée aux questions des parlementaires et aux réponses du gouvernement
     * (Constitution, art. 48). Thèmes, répliques et effets : hypothèses du jeu. Un groupe
     * d'opposition interpelle ; aucun député n'est nommé, aucun propos n'est rapporté.
     */
    qag: z
      .object({
        statut: z.literal('hypothese'),
        sourceId: Id,
        note: z.string().min(1),
        /** Mois sans séance (intersession : la session ordinaire va d'octobre à juin, art. 28). */
        moisSansSeance: z.array(z.number().int().min(1).max(12)),
        themes: z
          .array(
            z
              .object({
                id: Id,
                libelle: z.string().min(1),
                /** Ministère du thème ; null : le Premier ministre. */
                poste: Id.nullable(),
                /** Indicateur dont la dégradation depuis le début du mandat rend le thème probable. */
                indicateur: EconomicIndicatorSchema.nullable(),
              })
              .strict(),
          )
          .min(3),
        /** Poids d'un thème dont l'indicateur s'est dégradé depuis le début du mandat. */
        poidsDegradation: z.number().min(1).max(10),
        reponses: z
          .array(
            z
              .object({
                id: Id,
                libelle: z.string().min(1),
                description: z.string().min(1),
                /** Points de tension : positifs, échauffement ; négatifs, apaisement. */
                tension: z.number().int().min(-20).max(20),
                /** Popularité du président (centièmes), modulée par la compétence du ministre. */
                popularite: z.number().int().min(-1_000).max(1_000),
                economie: z
                  .array(
                    z
                      .object({ indicateur: EconomicIndicatorSchema, valeur: z.number().int() })
                      .strict(),
                  )
                  .default([]),
                /** Poids de la compétence du ministre du thème : × (1 + poids × (compétence − 0,5)). */
                modulation: z.number().min(0).max(4),
              })
              .strict(),
          )
          .min(2)
          .max(4),
        reponseParDefaut: Id,
        /** Part de l'échauffement perdue chaque semaine. */
        decroissanceEchauffement: Fraction,
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
    /**
     * Poste du gouvernement dont le titulaire gère la crise (phase 11) ; null : le Premier
     * ministre. Sa compétence module l'effet de la réponse sur la popularité du président.
     */
    poste: Id.nullable(),
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
    /**
     * Alliances (phase 13) : campagne, investitures communes, désistements, front républicain,
     * coalition et mobilisation par les déplacements du président. Hypothèses de jeu.
     */
    alliances: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        /** Ouverture de la campagne : semaines avant le premier tour (aussitôt après une dissolution). */
        campagneSemaines: z.number().int().min(1),
        /** Part des voix du partenaire reportée sur le candidat commun. */
        reportInvestitures: Fraction,
        /** Part des voix d'un allié désisté reportée sur l'allié resté en lice. */
        reportDesistement: Fraction,
        /** Distances (axes du jeu) maximales pour qu'un bloc accepte chaque accord. */
        distanceDesistements: z.number().positive(),
        distanceInvestitures: z.number().positive(),
        frontRepublicain: z
          .object({
            /** Bloc face auquel les signataires se désistent. */
            contre: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
            /** Distance minimale au bloc exclu pour qu'un bloc s'y associe. */
            distanceMin: z.number().positive(),
          })
          .strict(),
        coalition: z.object({ distanceMax: z.number().positive() }).strict(),
        /** Mobilisation du camp présidentiel : bonus de voix par déplacement, plafond (dix-millièmes). */
        mobilisation: z
          .object({
            parDeplacement: z.number().int().min(0).max(10_000),
            max: z.number().int().min(0).max(10_000),
          })
          .strict(),
        /** Règle de l'IA pour les blocs que le joueur ne conduit pas. */
        ia: z.object({ desistements: z.boolean(), frontRepublicain: z.boolean() }).strict(),
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

/**
 * Familles d'événements de campagne (phase 11) : une seule par semaine, fraîcheur par famille.
 * Phase 20 : `coup-adversaire`, coups simulés du rival le plus proche dans les intentions.
 */
export const EVENT_FAMILIES = [
  'fait-divers',
  'polemique',
  'opportunite',
  'vie-de-campagne',
  'coup-adversaire',
] as const;
export const EventFamilySchema = z.enum(EVENT_FAMILIES);
export type EventFamily = z.infer<typeof EventFamilySchema>;

/** Marque du département d'un événement local, remplacée par « Nom (code) ». */
export const DEPARTEMENT_MARQUE = '{departement}';

/** Marque du rival visé par un coup adverse (phase 20), remplacée par son nom. */
export const ADVERSAIRE_MARQUE = '{adversaire}';

/**
 * Suite d'un événement (phase 20, événements en chaîne) : un autre événement du catalogue,
 * programmé quelques semaines plus tard avec une probabilité, dès que l'événement survient ou
 * seulement après l'option `choix` de sa décision.
 */
export const EventFollowUpSchema = z
  .object({
    evenement: Id,
    choix: Id.nullable(),
    probabilite: Probability,
    delaiSemaines: z
      .object({
        min: z.number().int().min(1).max(8),
        max: z.number().int().min(1).max(8),
      })
      .strict()
      .refine((d) => d.min <= d.max, 'délai minimal supérieur au délai maximal'),
  })
  .strict();
export type EventFollowUp = z.infer<typeof EventFollowUpSchema>;

const Bounds = z
  .object({ min: z.number().int().nullable(), max: z.number().int().nullable() })
  .strict();

/**
 * Contexte d'un événement (phase 11), en plus des seuils de ressources : phase, semaines avant
 * le prochain scrutin, rang du joueur dans les dernières intentions, actions récentes du joueur,
 * caractère local (dans un département où il a fait campagne).
 */
export const EventContextSchema = z
  .object({
    phases: z
      .array(z.enum(['campagne', 'entre_deux_tours']))
      .min(1)
      .optional(),
    semainesAvantScrutin: Bounds.optional(),
    rang: Bounds.optional(),
    actionsRecentes: z
      .object({ actions: z.array(Id).min(1), semaines: z.number().int().min(1).max(12) })
      .strict()
      .optional(),
    local: z.literal(true).optional(),
  })
  .strict();
export type EventContext = z.infer<typeof EventContextSchema>;

export const EventDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    nature: z.literal('fictif'),
    famille: EventFamilySchema,
    contexte: EventContextSchema.default({}),
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
    /** Phase 20 : événements programmés à la suite de celui-ci (chaîne). */
    suites: z.array(EventFollowUpSchema).default([]),
    /** Phase 20 : jamais tiré au hasard ; ne survient qu'en suite d'un autre événement. */
    enSuiteSeulement: z.boolean().default(false),
    /**
     * Phase 20, coup adverse : le rival le plus proche du joueur dans les intentions (marque
     * `{adversaire}`) en est l'auteur, simulé ; `effets` s'appliquent à ce rival.
     */
    adversaire: z
      .object({ effets: z.array(EffectSchema) })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type EventDefinition = z.infer<typeof EventDefinitionSchema>;

/** Ressources de départ par difficulté ; Jeunesse et Dynamique viennent de `numerique.initial`. */
const DifficultyResources = ResourcesV1Schema.omit({ tempsHeures: true });

/** Une valeur par niveau de difficulté (phase 18 : cinq niveaux, du plus facile au plus dur). */
export const byDifficulty = <T extends z.ZodType>(value: T) =>
  z
    .object({
      decouverte: value,
      accessible: value,
      standard: value,
      expert: value,
      legende: value,
    })
    .strict();
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
    /**
     * Notoriété de départ des adversaires (phase 18), relative à celle de leur fiche : moins
     * connus en Découverte, davantage en Légende.
     */
    multiplicateurNotoriete: z.number().positive().max(3),
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

/**
 * Orientation stratégique du mouvement du joueur (phase 15), choisie à la création : moyens et
 * promesses de parrainage de départ, et base électorale de départ (facteur du score latent dans
 * certains groupes d'électeurs, qui décroît jusqu'à s'éteindre). Paramètres de jeu (hypothèses).
 */
export const OrientationSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    modificateurs: z
      .object({
        budgetCentimes: z.number().int(),
        militants: z.number().int(),
        notoriete: z.number().int(),
        popularite: z.number().int(),
        jeunesse: z.number().int(),
        dynamique: z.number().int(),
      })
      .partial()
      .strict(),
    /** Promesses de parrainage de départ en plus (ou en moins). */
    promesses: z.number().int().min(-500).max(500),
    base: z
      .object({
        /**
         * Groupes concernés : le plus proche du candidat ; ceux à une distance d'au plus
         * `distance` du candidat ; ceux à une distance d'au moins `distance` du centre ; tous.
         */
        groupes: z.enum(['plus-proche', 'proches', 'peripherie', 'tous']),
        /** Facteur du score latent au départ (unités du modèle). */
        valeur: z.number().min(0).max(2),
        distance: z.number().min(0).max(3).optional(),
      })
      .strict(),
  })
  .strict();
export type Orientation = z.infer<typeof OrientationSchema>;

/**
 * Urgence ministérielle (phase 15) : situation sectorielle fictive rattachée à un ministère,
 * présentée au président (joueur, sinon l'IA retient le choix par défaut) avec deux choix à
 * effet direct : popularité du président (centièmes, modulée par la compétence du ministre en
 * charge), indicateurs économiques (déficit, tensions sociales…), popularité prêtée et loyauté
 * du ministre. Aucun propos n'est prêté au ministre ni à quiconque.
 */
const UrgencyChoiceSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    popularite: z.number().int().min(-1_000).max(1_000),
    economie: z.array(
      z.object({ indicateur: EconomicIndicatorSchema, valeur: z.number().int() }).strict(),
    ),
    ministre: z
      .object({
        popularite: z.number().int().min(-2_000).max(2_000),
        loyaute: z.number().int().min(-30).max(30),
      })
      .strict(),
  })
  .strict();

export const UrgencyDefinitionSchema = z
  .object({
    id: z.string().regex(/^urgence-[a-z0-9-]+$/),
    poste: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    nature: z.literal('fictif'),
    probabiliteHebdomadaire: Probability,
    delaiMinEntreOccurrences: z.number().int().min(0),
    occurrencesMax: z.number().int().min(1).nullable(),
    /** Mois (1 à 12) où l'urgence peut survenir ; null : toute l'année. */
    mois: z.array(z.number().int().min(1).max(12)).min(1).nullable(),
    choix: z.tuple([UrgencyChoiceSchema, UrgencyChoiceSchema]),
    choixParDefaut: Id,
  })
  .strict();
export type UrgencyDefinition = z.infer<typeof UrgencyDefinitionSchema>;

/**
 * Objectif de mandat du catalogue (phase 15) : mesure (indicateur économique, popularité du
 * président, réformes adoptées, censures), sens et cible (écart au départ ou valeur), domaines
 * du programme qui le rendent prioritaire. Paramètres de jeu, jamais des prévisions.
 */
export const ObjectiveDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    mesure: z.enum(['indicateur', 'popularite', 'reformes', 'censures']),
    indicateur: EconomicIndicatorSchema.optional(),
    /** baisse : la valeur de fin doit être au plus la cible ; hausse : au moins la cible. */
    sens: z.enum(['baisse', 'hausse']),
    /** Cible = départ + écart (indicateur, popularité). */
    ecart: z.number().int().optional(),
    /** Cible absolue (réformes, censures). */
    valeur: z.number().int().min(0).optional(),
    domaines: z.array(Id),
  })
  .strict();
export type ObjectiveDefinition = z.infer<typeof ObjectiveDefinitionSchema>;

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
        /**
         * Fraîcheur des événements (phase 11) : le poids d'un événement est multiplié par
         * `facteur` si un événement de la même famille est survenu dans les `semaines` passées.
         */
        fraicheurEvenements: z
          .object({ facteur: Fraction, semaines: z.number().int().min(1).max(12) })
          .strict(),
        /**
         * Phase 20 : heures de campagne en moins dans une semaine qui compte un jour férié, du
         * lundi au samedi (cérémonies, électeurs en congé) ; hypothèse de jeu, 0 pour aucun effet.
         */
        heuresSemaineFeriee: z.number().int().min(0).max(40).default(0),
        /** Qualité de l'équipe du candidat du joueur (0 à 1). */
        equipeJoueur: Fraction,
        /** Promesses de parrainage dont dispose le joueur au départ, selon la difficulté. */
        promessesInitialesJoueur: byDifficulty(z.number().int().min(0)),
        ressourcesInitiales: byDifficulty(DifficultyResources),
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
        /**
         * Rendez-vous d'élus (phase 15) : pendant la course aux parrainages, jusqu'à la semaine
         * qui précède la clôture des présentations, une délégation d'élus d'un département
         * (anonyme, fictive) propose des promesses au joueur (paramètres de jeu, hypothèses).
         */
        rendezVous: z
          .object({
            statut: z.literal('hypothese'),
            probabiliteHebdo: Probability,
            /** Semaines minimales entre deux rendez-vous. */
            delaiSemaines: z.number().int().min(1),
            promesses: z
              .object({ min: z.number().int().min(1), max: z.number().int().min(1) })
              .strict(),
            /** Heures du candidat consacrées à la délégation s'il la reçoit. */
            tempsHeures: z.number().int().min(0).max(40),
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
        /**
         * Phase 20 (rouage réel) : à compter de l'échéance `echeanceId` du calendrier (période
         * électorale de l'Arcom), égalité stricte des temps de parole à la télévision et à la
         * radio : la part de l'exposition qui suit la notoriété y est la même pour chaque
         * candidat en lice, sans propension par parti ; seules les actions la font varier.
         */
        periodeElectorale: z
          .object({ echeanceId: Id, sourceId: Id })
          .strict()
          .nullable()
          .default(null),
      })
      .strict(),
    mediasReels: RealMediaSchema,
    /** Phase 20 : palmarès, niveaux, déblocages et défi du jour (hypothèses de jeu). */
    progression: ProgressionRulesSchema,
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
    /** Orientations stratégiques du mouvement du joueur (phase 15, hypothèses). */
    orientations: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        /** Semaines de campagne au bout desquelles la base électorale de départ s'éteint. */
        dureeSemaines: z.number().int().min(1),
        liste: z.array(OrientationSchema).min(3),
      })
      .strict(),
    /**
     * Négociations de soutien avec les personnalités réelles nominables (phase 15) : issue
     * simulée (probabilité selon la proximité, le rapport de forces et la contrepartie), effets
     * du soutien obtenu. Paramètres de jeu (hypothèses) ; aucun propos n'est attribué.
     */
    negociations: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        /** Proximité (0 à 100) en deçà de laquelle la personnalité refuse toujours. */
        proximiteMin: z.number().int().min(0).max(100),
        /** Probabilité d'accepter à une proximité de 50, sans contrepartie. */
        probabiliteBase: Probability,
        /** Probabilité en plus par point de proximité au-dessus de 50 (× 100). */
        poidsProximite: z.number().min(0).max(2),
        /** Probabilité en plus par point d'intentions de vote du candidat (× 100). */
        poidsIntentions: z.number().min(0).max(2),
        /** Probabilité en plus quand un ministère est promis. */
        bonusMinistere: Probability,
        /** Semaines avant de solliciter de nouveau une personnalité qui a refusé. */
        delaiApresRefus: z.number().int().min(1),
        /** Soutiens au plus par candidat et par campagne. */
        soutiensMax: z.number().int().min(1),
        /** Poids du soutien dans le score latent des groupes proches de la personnalité. */
        poids: z.number().min(0).max(3),
        /** Notoriété et militants gagnés selon la notoriété de la personnalité (niveaux 1 à 3). */
        notoriete: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
        militants: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
        /** Popularité perdue par ministère promis et non tenu au premier gouvernement. */
        promesseNonTenue: z.number().int().min(0).max(2_000),
        /** Loyauté de départ en plus pour un ministre à qui un ministère avait été promis. */
        loyautePromesse: z.number().int().min(0).max(50),
      })
      .strict(),
    /** Urgences ministérielles du quinquennat (phase 15) : au plus une par semaine. */
    urgences: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        liste: z.array(UrgencyDefinitionSchema).min(4),
      })
      .strict(),
    /** Objectifs de mandat et note finale (phase 15), paramètres de jeu (hypothèses). */
    objectifs: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        nombre: z.number().int().min(1).max(6),
        catalogue: z.array(ObjectiveDefinitionSchema).min(4),
        /** Mentions, de la meilleure à la moins bonne : note minimale sur 20 et libellé. */
        mentions: z
          .array(
            z.object({ min: z.number().int().min(0).max(20), libelle: z.string().min(1) }).strict(),
          )
          .min(2),
      })
      .strict(),
    /** Succès de la partie (phase 15) : convention du jeu. */
    succes: z
      .object({
        statut: z.literal('hypothese'),
        note: z.string().min(1),
        liste: z.array(AchievementDefinitionSchema).min(10),
      })
      .strict(),
    ia: z
      .object({
        statut: z.literal('hypothese'),
        decouverte: AiLevel,
        accessible: AiLevel,
        standard: AiLevel,
        expert: AiLevel,
        legende: AiLevel,
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
    /** Figures réelles nominables au gouvernement (`pnpm data:gouvernement`, phase 11). */
    figures: GovernmentFiguresSchema,
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
    // Événements (phase 11) : actions récentes connues ; marque du département pour les locaux.
    const actionIds = new Set(ruleset.actions.map((a) => a.id));
    for (const event of ruleset.evenements) {
      for (const id of event.contexte.actionsRecentes?.actions ?? [])
        if (!actionIds.has(id)) issue(`${event.id} : action récente inconnue (${id})`);
      const marked = [event.libelle, event.description].some((t) => t.includes(DEPARTEMENT_MARQUE));
      if (event.contexte.local && !event.libelle.includes(DEPARTEMENT_MARQUE))
        issue(`${event.id} : événement local sans ${DEPARTEMENT_MARQUE} dans son libellé`);
      if (!event.contexte.local && marked)
        issue(`${event.id} : ${DEPARTEMENT_MARQUE} réservé aux événements locaux`);
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
      // Phase 15 : un ministère est la cible du seul remaniement ciblé.
      const posteTarget = action.institution === 'remaniement-cible';
      if (posteTarget ? action.cible !== 'poste' : action.cible === 'poste')
        issue(`${action.id} : la cible « ministère » est celle du seul remaniement ciblé`);
      if (action.cible !== null && action.cible !== 'departement' && action.cible !== 'poste')
        issue(`${action.id} : seule une cible départementale est possible pour le président`);
      if (action.effets.length === 0 && !action.institution) issue(`${action.id} : aucun effet`);
      if (action.poste && !ruleset.quinquennat.postes.some((p) => p.id === action.poste))
        issue(`${action.id} : poste inconnu ${action.poste}`);
      if (action.sourceId && !sourceIds.has(action.sourceId))
        issue(`${action.id} : source inconnue ${action.sourceId}`);
    }
    for (const action of ruleset.actions) {
      // Phase 15 : la négociation d'un soutien vise une personnalité, et elle seule.
      if ((action.campagne?.soutien !== undefined) !== (action.cible === 'personnalite'))
        issue(`${action.id} : une négociation de soutien vise une personnalité, et elle seule`);
      if (action.cible === 'poste' || action.institution)
        issue(`${action.id} : ministère et acte institutionnel réservés au président`);
      const presidential = [
        action.delaiSemaines,
        action.condition,
        action.economie,
        action.parlement,
        action.poste,
        action.sourceId,
      ];
      if (presidential.some((v) => v !== undefined))
        issue(
          `${action.id} : délai, condition, économie, Parlement et poste réservés au président`,
        );
    }
    // Phase 15 : orientations, urgences, QAG, objectifs et succès.
    unique(
      'Orientation',
      ruleset.orientations.liste.map((o) => o.id),
    );
    for (const o of ruleset.orientations.liste) {
      const needsDistance = o.base.groupes === 'proches' || o.base.groupes === 'peripherie';
      if (needsDistance !== (o.base.distance !== undefined))
        issue(
          `Orientation ${o.id} : distance requise pour « proches » et « périphérie » seulement`,
        );
    }
    const posteIds = new Set(ruleset.quinquennat.postes.map((p) => p.id));
    unique(
      'Urgence',
      ruleset.urgences.liste.map((u) => u.id),
    );
    for (const u of ruleset.urgences.liste) {
      if (!posteIds.has(u.poste)) issue(`Urgence ${u.id} : poste inconnu ${u.poste}`);
      if (u.choix[0].id === u.choix[1].id) issue(`Urgence ${u.id} : deux choix distincts attendus`);
      if (!u.choix.some((c) => c.id === u.choixParDefaut))
        issue(`Urgence ${u.id} : choix par défaut inconnu`);
    }
    const qag = ruleset.parlement.qag;
    if (!sourceIds.has(qag.sourceId)) issue(`QAG : source inconnue ${qag.sourceId}`);
    unique(
      'Thème de QAG',
      qag.themes.map((t) => t.id),
    );
    for (const t of qag.themes)
      if (t.poste !== null && !posteIds.has(t.poste))
        issue(`QAG ${t.id} : poste inconnu ${t.poste}`);
    unique(
      'Réplique de QAG',
      qag.reponses.map((r) => r.id),
    );
    if (!qag.reponses.some((r) => r.id === qag.reponseParDefaut))
      issue('QAG : réplique par défaut inconnue');
    const obj = ruleset.objectifs;
    unique(
      'Objectif',
      obj.catalogue.map((o) => o.id),
    );
    if (obj.catalogue.length < obj.nombre) issue('Objectifs : catalogue plus court que le nombre');
    for (const o of obj.catalogue) {
      const relative = o.mesure === 'indicateur' || o.mesure === 'popularite';
      if (relative ? o.ecart === undefined : o.valeur === undefined)
        issue(`Objectif ${o.id} : écart (indicateur, popularité) ou valeur (réformes, censures)`);
      if ((o.mesure === 'indicateur') !== (o.indicateur !== undefined))
        issue(`Objectif ${o.id} : indicateur requis pour la seule mesure « indicateur »`);
      for (const d of o.domaines)
        if (!ruleset.programme.domaines.some((x) => x.id === d))
          issue(`Objectif ${o.id} : domaine inconnu ${d}`);
    }
    if (obj.mentions.some((m, i) => i > 0 && m.min >= obj.mentions[i - 1]!.min))
      issue('Objectifs : mentions attendues de la meilleure à la moins bonne');
    if (obj.mentions.at(-1)!.min !== 0) issue('Objectifs : la dernière mention commence à 0');
    unique(
      'Succès',
      ruleset.succes.liste.map((a) => a.id),
    );
    const rv = ruleset.parrainages.rendezVous;
    if (rv.promesses.min > rv.promesses.max)
      issue('Rendez-vous d’élus : promesses minimales supérieures aux maximales');

    // Thèmes des ministres (phase 13) : postes et domaines connus, un thème par poste.
    unique(
      'Thème ministériel',
      ruleset.quinquennat.equipe.themes.map((t) => t.posteId),
    );
    const domainIds = new Set(ruleset.programme.domaines.map((d) => d.id));
    for (const theme of ruleset.quinquennat.equipe.themes) {
      if (!ruleset.quinquennat.postes.some((p) => p.id === theme.posteId))
        issue(`Thème : poste inconnu ${theme.posteId}`);
      for (const d of theme.domaines)
        if (!domainIds.has(d)) issue(`Thème ${theme.posteId} : domaine inconnu ${d}`);
    }
    unique(
      'Domaine couvert par un ministre',
      ruleset.quinquennat.equipe.themes.flatMap((t) => t.domaines),
    );
    if (
      !ruleset.legislatives.blocs.some(
        (b) => b.id === ruleset.legislatives.alliances.frontRepublicain.contre,
      )
    )
      issue('Front républicain : bloc exclu inconnu');
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
    const postIds = new Set(ruleset.quinquennat.postes.map((p) => p.id));
    for (const crisis of ruleset.crises) {
      unique(
        `Choix de ${crisis.id}`,
        crisis.choix.map((c) => c.id),
      );
      if (!crisis.choix.some((c) => c.id === crisis.choixParDefaut))
        issue(`${crisis.id} : choix par défaut inconnu ${crisis.choixParDefaut}`);
      checkDurable(crisis.id, crisis.durable);
      for (const choice of crisis.choix) checkDurable(`${crisis.id}/${choice.id}`, choice.durable);
      if (crisis.poste !== null && !postIds.has(crisis.poste))
        issue(`${crisis.id} : poste inconnu ${crisis.poste}`);
    }
    for (const id of ruleset.quinquennat.equipe.postesRegaliens)
      if (!postIds.has(id)) issue(`Poste régalien inconnu : ${id}`);
    // Expertise ministérielle (phase 14) : postes connus, une entrée par poste.
    const expertise = ruleset.quinquennat.equipe.expertise;
    unique(
      'Expertise ministérielle',
      expertise.postes.map((e) => e.posteId),
    );
    for (const e of expertise.postes)
      if (!postIds.has(e.posteId)) issue(`Expertise : poste inconnu ${e.posteId}`);
    if (expertise.secretaireEtat > expertise.ministre)
      issue('Expertise : le bonus de secrétaire d’État dépasse celui de ministre');
    const assemblyIds = new Set(ruleset.assemblee.groupes.map((g) => g.id));
    const realIds = new Set(ruleset.personnalites.personnalites.map((p) => p.id));
    unique(
      'Figure du gouvernement',
      ruleset.figures.figures.map((f) => f.id),
    );
    for (const f of ruleset.figures.figures)
      if (f.groupe !== null && !assemblyIds.has(f.groupe))
        issue(`${f.id} : groupe inconnu ${f.groupe}`);
    for (const r of ruleset.figures.rattachements) {
      if (!assemblyIds.has(r.groupe)) issue(`${r.personnaliteId} : groupe inconnu ${r.groupe}`);
      if (!realIds.has(r.personnaliteId))
        issue(`Rattachement d'une personnalité inconnue : ${r.personnaliteId}`);
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

    // Phase 20 : progression (déblocages et défi visant des contenus existants).
    const { progression } = ruleset;
    if (!(progression.sourceId in ruleset.sources))
      issue(`Progression : source inconnue ${progression.sourceId}`);
    const scenarioIds = new Set(ruleset.scenarios.map((sc) => sc.id));
    for (const d of progression.deblocages)
      if (d.scenarioId !== undefined && !scenarioIds.has(d.scenarioId))
        issue(`Déblocage ${d.id} : scénario inconnu ${d.scenarioId}`);
    if (!scenarioIds.has(progression.defi.scenarioId))
      issue(`Défi du jour : scénario inconnu ${progression.defi.scenarioId}`);
    if (
      progression.deblocages.some(
        (d) =>
          d.difficulte === progression.defi.difficulte ||
          d.scenarioId === progression.defi.scenarioId,
      )
    )
      issue('Défi du jour : ses paramètres ne peuvent pas être verrouillés');

    // Phase 20 : période électorale de l'Arcom, rattachée à une échéance et à une source.
    const periode = ruleset.medias.periodeElectorale;
    if (periode) {
      if (!ruleset.calendrier.echeances.some((e) => e.id === periode.echeanceId))
        issue(`Période électorale : échéance inconnue ${periode.echeanceId}`);
      if (!(periode.sourceId in ruleset.sources))
        issue(`Période électorale : source inconnue ${periode.sourceId}`);
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
      // Phase 20 : suites (chaînes) et coups adverses.
      for (const follow of event.suites) {
        const next = ruleset.evenements.find((e) => e.id === follow.evenement);
        if (!next) issue(`${event.id} : suite inconnue ${follow.evenement}`);
        if (follow.evenement === event.id) issue(`${event.id} : un événement ne se suit pas`);
        if (follow.choix !== null && !event.choix.some((c) => c.id === follow.choix))
          issue(`${event.id} : la suite ${follow.evenement} cite un choix inconnu ${follow.choix}`);
      }
      if (
        event.enSuiteSeulement &&
        !ruleset.evenements.some((e) => e.suites.some((f) => f.evenement === event.id))
      )
        issue(`${event.id} : événement de suite qu'aucun autre ne programme`);
      const named = [event.libelle, event.description].some((t) => t.includes(ADVERSAIRE_MARQUE));
      if ((event.adversaire !== null) !== (event.famille === 'coup-adversaire'))
        issue(`${event.id} : un coup adverse, et lui seul, a un rival (adversaire)`);
      if (event.adversaire !== null && !named)
        issue(`${event.id} : un coup adverse nomme son rival ({adversaire})`);
      if (event.adversaire === null && named)
        issue(`${event.id} : la marque {adversaire} exige un coup adverse`);
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
