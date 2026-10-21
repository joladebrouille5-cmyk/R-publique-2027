import { z } from 'zod';
import { IsoDateSchema } from './game';
import { AiObjectiveSchema } from './campaign';
import { RealMediaSchema } from './medias';
import { RealPersonalitiesSchema } from './personalities';
import { CampaignStyleSchema, PositionSchema } from './politics';
import { ResourceKeySchema, ResourcesSchema } from './resources';

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
    risque: z
      .object({
        probabilite: Probability,
        libelle: z.string().min(1),
        effets: z.array(EffectSchema).min(1),
      })
      .strict()
      .nullable(),
    note: z.string().nullable(),
  })
  .strict();
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

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

const DifficultyResources = ResourcesSchema.omit({ tempsHeures: true });
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
    debats: z
      .object({
        statut: z.literal('hypothese'),
        preparationMaxHeures: z.number().int().min(1),
        poids: z
          .object({
            preparation: Fraction,
            maitrise: Fraction,
            coherence: Fraction,
            reponse: Fraction,
          })
          .strict(),
      })
      .strict(),
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
      ruleset.actions.map((a) => a.id),
    );
    unique(
      'Événement',
      ruleset.evenements.map((e) => e.id),
    );

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
