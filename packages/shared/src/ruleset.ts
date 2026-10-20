import { z } from 'zod';
import { IsoDateSchema } from './game';
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

export const ActionDefinitionSchema = z
  .object({
    id: Id,
    libelle: z.string().min(1),
    description: z.string().min(1),
    portee: z.enum(['locale', 'regionale', 'nationale']),
    cout: z
      .object({
        budgetCentimes: z.number().int().min(0),
        tempsHeures: z.number().int().min(0),
      })
      .strict(),
    prerequis: z.object({ militantsMin: z.number().int().min(0) }).strict(),
    effets: z.array(EffectSchema).min(1),
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
  })
  .strict();

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
    profilsDeDepart: z.array(StartingProfileSchema).min(1),
    ia: z
      .object({
        statut: z.literal('hypothese'),
        accessible: AiLevel,
        standard: AiLevel,
        expert: AiLevel,
      })
      .strict(),
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
      'Profil de départ',
      ruleset.profilsDeDepart.map((p) => p.id),
    );
    unique(
      'Institut',
      ruleset.sondages.instituts.map((i) => i.id),
    );
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
      if (!hasChoices && event.effets.length === 0) issue(`${event.id} : aucun effet`);
    }
  });
export type Ruleset = z.infer<typeof RulesetSchema>;

/** Identifiant complet d'un jeu de règles, enregistré dans chaque partie : « id@version ». */
export function rulesetKey(ruleset: Pick<Ruleset, 'id' | 'version'>): string {
  return `${ruleset.id}@${ruleset.version}`;
}
