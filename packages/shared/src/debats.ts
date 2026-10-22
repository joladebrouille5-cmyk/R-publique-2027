import { z } from 'zod';
import { DigitalToneSchema } from './numerique';

// Débats télévisés (phase 10) : débats à plusieurs avant le premier tour et débat
// d'entre-deux-tours, joués séquence par séquence. Dates, invitations, effets et répliques sont
// des hypothèses du jeu (jeu de règles) ; les chaînes sont celles de la liste des médias réels,
// sans journaliste nommé ni question attribuée. Les répliques sont des modèles du jeu, écrites
// pour le joueur et les candidats fictifs seulement : aucune n'est prêtée à une personne réelle.

const RuleId = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'identifiant en minuscules');
const Id = z.string().min(1).max(120);
const Probability = z.number().min(0).max(1);
const Fraction = z.number().min(0).max(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Line = z.string().min(1).max(220);

/**
 * Cartes d'une séquence : défendre une proposition (ou sa vision), répondre à une attaque reçue,
 * attaquer un adversaire (cible et angle), rester au-dessus de la mêlée, tenter une petite phrase.
 */
export const DEBATE_CARDS = [
  'defendre',
  'repondre',
  'attaquer',
  'hauteur',
  'petite-phrase',
] as const;
export const DebateCardSchema = z.enum(DEBATE_CARDS);
export type DebateCard = z.infer<typeof DebateCardSchema>;

/**
 * Angles d'attaque : toujours des faits de la partie (crédibilité du programme, revirements,
 * dons refusés, ralliements, bilan d'un président sortant). Une attaque dont le fait est faux se
 * retourne contre l'attaquant.
 */
export const DEBATE_ANGLES = [
  'programme',
  'revirements',
  'finances',
  'ralliement',
  'bilan',
] as const;
export const DebateAngleSchema = z.enum(DEBATE_ANGLES);
export type DebateAngle = z.infer<typeof DebateAngleSchema>;

// --- Règles (jeu de règles 12.0.0) ---

export const DebateThemeSchema = z
  .object({
    id: RuleId,
    libelle: z.string().min(1),
    /** Domaines du programme dont une proposition peut être défendue dans ce thème. */
    domaines: z.array(RuleId),
  })
  .strict();
export type DebateTheme = z.infer<typeof DebateThemeSchema>;

export const DebateSessionRuleSchema = z
  .object({
    id: RuleId,
    /** Échéance datée du calendrier (transposée pour les cycles suivants). */
    echeanceId: RuleId,
    libelle: z.string().min(1),
    tour: z.union([z.literal(1), z.literal(2)]),
    invites: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('sondage'), nombre: z.number().int().min(2).max(20) }).strict(),
      z.object({ mode: z.literal('tous') }).strict(),
      z.object({ mode: z.literal('finalistes') }).strict(),
    ]),
    /** Chaîne de la liste des médias réels (aucun journaliste nommé). */
    mediaId: RuleId,
    /** Thèmes des séquences, dans l'ordre ; la conclusion s'y ajoute toujours. */
    themes: z.array(RuleId).min(1),
    /** Adversaires qui prennent la parole à chaque séquence, au plus (grands débats). */
    coupsIaParSequence: z.number().int().min(1).max(20),
  })
  .strict();
export type DebateSessionRule = z.infer<typeof DebateSessionRuleSchema>;

const Lines = z.array(Line).min(1);

export const DebateRulesSchema = z
  .object({
    statut: z.literal('hypothese'),
    sourceId: RuleId,
    note: z.string().min(1),
    preparationMaxHeures: z.number().int().min(1),
    /** Part des heures de préparation perdue chaque semaine. */
    usurePreparation: Fraction,
    /** Poids de la préparation, de la maîtrise, de la cohérence et du hasard (« réponse »). */
    poids: z
      .object({
        preparation: Fraction,
        maitrise: Fraction,
        coherence: Fraction,
        reponse: Fraction,
      })
      .strict(),
    seances: z.array(DebateSessionRuleSchema).min(1),
    themes: z.array(DebateThemeSchema).min(1),
    /** Thème de la dernière séquence de chaque débat. */
    conclusion: DebateThemeSchema,
    angles: z
      .array(
        z
          .object({
            id: DebateAngleSchema,
            libelle: z.string().min(1),
            /** Ce que l'attaque reproche, pour l'interface (« dons refusés »…). */
            fait: z.string().min(1),
          })
          .strict(),
      )
      .length(DEBATE_ANGLES.length),
    /** Programme jugé peu crédible en dessous de ce score (−1 à +1) : angle « programme ». */
    seuilCredibilite: z.number().min(-1).max(1),
    /** Effets des coups sur l'approbation du public (points, de 0 à 100). */
    approbation: z
      .object({
        depart: z.number().min(0).max(100),
        defendre: z.number().min(0),
        attaque: z.number().min(0),
        gainAttaquant: z.number().min(0),
        /** Au-delà de ce nombre d'attaques dans un débat, chaque attaque coûte `malus`. */
        agressivite: z
          .object({ seuil: z.number().int().min(0), malus: z.number().min(0) })
          .strict(),
        retour: z.number().min(0),
        riposte: z.number().min(0),
        riposteFausse: z.number().min(0),
        hauteur: z.number().min(0),
        hauteurFavori: z.number().min(0),
        /** Part des coups reçus dans la séquence effacée en restant au-dessus de la mêlée. */
        hauteurAmortit: Fraction,
        petitePhrase: z
          .object({
            reussite: Probability,
            echec: Probability,
            gain: z.number().min(0),
            perte: z.number().min(0),
          })
          .strict(),
      })
      .strict(),
    ia: z
      .object({
        /** Probabilité d'attaquer selon le style de campagne. */
        attaque: z
          .object({ prudent: Probability, equilibre: Probability, offensif: Probability })
          .strict(),
        riposte: Probability,
        hauteurFavori: Probability,
        petitePhrase: Probability,
        /** Probabilité de se tromper d'angle, multipliée par (1 − maîtrise). */
        erreurAngle: Probability,
        /** Bonus de maîtrise des adversaires selon la difficulté. */
        difficulte: z
          .object({ accessible: z.number(), standard: z.number(), expert: z.number() })
          .strict(),
        /** Un favori qui devance le deuxième d'au moins `ecartMin` (centièmes) peut refuser. */
        refus: z.object({ ecartMin: z.number().int().min(0), probabilite: Probability }).strict(),
      })
      .strict(),
    effets: z
      .object({
        /** Popularité (centièmes de point) pour une prestation de ±1. */
        popularite: z.number().int().min(0),
        /** Notoriété gagnée par un participant, multipliée par (1 − notoriété). */
        notoriete: z.number().int().min(0),
        /** Dynamique d'une petite phrase réussie. */
        dynamiquePetitePhrase: z.number().int().min(0),
        /** Popularité perdue par un candidat qui refuse un débat (chaise vide). */
        chaiseVide: z.number().int().min(0),
        /** Prestation retenue pour une chaise vide (−1 à 0). */
        prestationChaiseVide: z.number().min(-1).max(0),
        /** Poids du facteur de vote « Débats télévisés » pour une prestation de ±1. */
        voteT1: z.number().min(0),
        /** Part du facteur conservée chaque semaine. */
        persistance: Fraction,
      })
      .strict(),
    /** Sondage flash « le plus convaincant » : parts selon l'approbation finale. */
    sondageFlash: z.object({ temperature: z.number().positive() }).strict(),
    /** Modèles de répliques (joueur et candidats fictifs) ; {proposition}, {theme}. */
    repliques: z
      .object({
        defendre: Lines,
        vision: Lines,
        attaque: z
          .object({
            programme: Lines,
            revirements: Lines,
            finances: Lines,
            ralliement: Lines,
            bilan: Lines,
          })
          .strict(),
        repondre: Lines,
        repondreFausse: Lines,
        hauteur: Lines,
        petitePhraseReussie: Lines,
        petitePhraseRatee: Lines,
      })
      .strict(),
    /** Réactions de comptes fictifs, sans nom de candidat, selon l'issue du coup. */
    reactions: z.object({ positif: Lines, neutre: Lines, negatif: Lines }).strict(),
  })
  .strict();
export type DebateRules = z.infer<typeof DebateRulesSchema>;

// --- État (format de sauvegarde 15) ---

export const DEBATE_OUTCOMES = ['reussi', 'neutre', 'rate', 'retourne'] as const;
export const DebateOutcomeSchema = z.enum(DEBATE_OUTCOMES);
export type DebateOutcome = z.infer<typeof DebateOutcomeSchema>;

/** Coup joué par un candidat pendant une séquence. */
export const DebateMoveSchema = z
  .object({
    acteurId: Id,
    carte: DebateCardSchema,
    /** Adversaire visé (attaque) ou auquel on répond. */
    cible: Id.nullable(),
    angle: DebateAngleSchema.nullable(),
    /** Proposition du programme défendue, le cas échéant. */
    propositionId: Id.nullable(),
    issue: DebateOutcomeSchema,
    /** Variation de l'approbation de chaque candidat concerné (points, de 0 à 100). */
    effets: z.record(Id, z.number()),
    /** Réplique (modèle du jeu) ; null pour une personnalité réelle. */
    replique: z.string().max(400).nullable(),
    /** Temps de parole simulé, en secondes. */
    duree: z.number().int().min(0).max(600),
    /** Réaction d'un compte fictif, sans nom de candidat. */
    reaction: z
      .object({
        compte: z.string().regex(/^@[a-z0-9_.]{3,30}$/),
        texte: z.string().min(1).max(200),
        ton: DigitalToneSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type DebateMove = z.infer<typeof DebateMoveSchema>;

export const DebateSequenceSchema = z
  .object({ theme: Id, coups: z.array(DebateMoveSchema).max(40) })
  .strict();
export type DebateSequence = z.infer<typeof DebateSequenceSchema>;

/** Carte proposée au joueur pour la séquence en cours. */
export const DebateOfferSchema = z
  .object({
    carte: DebateCardSchema,
    /** Proposition à défendre (carte « défendre »), sinon null : la vision du candidat. */
    propositionId: Id.nullable(),
    /** Auteur de l'attaque reçue (carte « répondre »). */
    attaquant: Id.nullable(),
  })
  .strict();
export type DebateOffer = z.infer<typeof DebateOfferSchema>;

export const DEBATE_STATUSES = ['prevu', 'en_cours', 'termine'] as const;
export const DebateStatusSchema = z.enum(DEBATE_STATUSES);
export type DebateStatus = z.infer<typeof DebateStatusSchema>;

/** Débat de la campagne en cours : invités, chaises vides, séquences, approbation, résultat. */
export const DebateSessionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    tour: z.union([z.literal(1), z.literal(2)]),
    date: IsoDate,
    semaine: z.number().int().min(0),
    mediaId: Id,
    /** Candidats invités (présents ou non), triés. */
    invites: z.array(Id),
    /** Invités qui ont refusé (chaise vide). */
    refus: z.array(Id),
    statut: DebateStatusSchema,
    /** Thèmes des séquences, conclusion comprise. */
    themes: z.array(Id).min(1),
    sequences: z.array(DebateSequenceSchema),
    /** Séquence en cours pour le joueur : coups déjà joués avant lui et cartes proposées. */
    enCours: z
      .object({
        index: z.number().int().min(0),
        ouverture: z.array(DebateMoveSchema),
        cartes: z.array(DebateOfferSchema).length(3),
      })
      .strict()
      .nullable(),
    /** Approbation du public (0 à 100) de chaque candidat présent. */
    approbation: z.record(Id, z.number().min(0).max(100)),
    resultat: z
      .object({
        /** Sondage flash simulé : parts (centièmes) des présents jugés les plus convaincants. */
        convaincant: z.record(Id, z.number().int().min(0).max(10_000)),
        /** Prestation (−1 à +1) de chaque invité, chaises vides comprises. */
        prestation: z.record(Id, z.number().min(-1).max(1)),
        /** Effets appliqués à la résolution de la semaine. */
        applique: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type DebateSession = z.infer<typeof DebateSessionSchema>;

/** Débats de la présidentielle en cours (remis à zéro à chaque cycle). */
export const DebatesStateSchema = z
  .object({ seances: z.array(DebateSessionSchema).max(10) })
  .strict();
export type DebatesState = z.infer<typeof DebatesStateSchema>;

/** Identifiant d'un débat dans une route d'API. */
export const DebateIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60);

/** Demande du joueur pour un débat de la semaine (API). */
export const DebateRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ouvrir') }).strict(),
  z.object({ action: z.literal('refuser') }).strict(),
  z.object({ action: z.literal('finir'), sequence: z.number().int().min(0) }).strict(),
  z
    .object({
      action: z.literal('jouer'),
      /** Index de la séquence en cours : refuse un coup rejoué ou périmé. */
      sequence: z.number().int().min(0),
      carte: DebateCardSchema,
      cible: Id.optional(),
      angle: DebateAngleSchema.optional(),
    })
    .strict(),
]);
export type DebateRequest = z.infer<typeof DebateRequestSchema>;
