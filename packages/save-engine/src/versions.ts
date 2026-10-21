import {
  createOpponents,
  emptyParrainages,
  ENGINE_VERSION,
  FIRST_CYCLE,
  initialRelations,
  openingAccount,
  mandateDates,
  openEconomy,
  openLegislatives,
  openParliament,
  PLAYER_ACTOR_ID,
  SAVE_SCHEMA_VERSION,
} from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset, UnknownRulesetError } from '@r2027/rulesets';
import {
  GameStateSchema,
  GameStateV1Schema,
  GameStateV2Schema,
  GameStateV3Schema,
  GameStateV4Schema,
  GameStateV5Schema,
  GameStateV6Schema,
  GameStateV7Schema,
  GameStateV8Schema,
  GameStateV9Schema,
  GameStateV10Schema,
  GameStateV11Schema,
  addDays,
  daysFromCivil,
  parseIsoDate,
  type Actor,
  type ActorV4,
  type ActorV5,
  type ActorV6,
  type GameState,
  type GameStateV1,
  type GameStateV2,
  type GameStateV3,
  type GameStateV4,
  type GameStateV5,
  type GameStateV6,
  type GameStateV7,
  type GameStateV8,
  type GameStateV9,
  type GameStateV10,
  type GameStateV11,
} from '@r2027/shared';
import { z } from 'zod';
import { hashState, sha256, canonicalStringify } from './canonical';

export type SaveFormatErrorCode =
  | 'version_future'
  | 'version_inconnue'
  | 'etat_invalide'
  | 'empreinte_incoherente'
  | 'regles_inconnues'
  | 'format_inconnu'
  | 'incoherence';

/** Sauvegarde ou fichier illisible : refusé en entier, jamais appliqué partiellement. */
export class SaveFormatError extends Error {
  constructor(
    readonly code: SaveFormatErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export const CURRENT_SAVE_SCHEMA_VERSION = SAVE_SCHEMA_VERSION;

const SCHEMAS: Record<number, z.ZodType> = {
  1: GameStateV1Schema,
  2: GameStateV2Schema,
  3: GameStateV3Schema,
  4: GameStateV4Schema,
  5: GameStateV5Schema,
  6: GameStateV6Schema,
  7: GameStateV7Schema,
  8: GameStateV8Schema,
  9: GameStateV9Schema,
  10: GameStateV10Schema,
  11: GameStateV11Schema,
  12: GameStateSchema,
};

/** Jeux de règles des parties aux formats 2 (phase 2) et 3 (phase 3). */
const V2_RULESET_KEY = 'presidentielle-2027@1.0.0';
const V3_RULESET_KEY = 'presidentielle-2027@2.0.0';

/**
 * Format 1 → 2 (phase 2) : ajout des ressources de campagne, des effets programmés, des
 * décisions et du calendrier ; l'aléa n'est plus stocké (dérivé de la graine). Les ressources
 * de départ sont celles du jeu de règles courant (identiques à celles de la version 1.0.0).
 */
function migrateV1ToV2(v1: GameStateV1): GameStateV2 {
  const jeu = getRuleset(CURRENT_RULESET_KEY).jeu;
  const observer = v1.player.mode === 'observateur';
  const resources = {
    ...jeu.ressourcesInitiales[v1.meta.difficulty],
    tempsHeures: jeu.tempsHebdomadaireHeures,
  };
  return {
    meta: {
      ...v1.meta,
      engineVersion: '0.2.0',
      rulesetVersion: V2_RULESET_KEY,
      saveSchemaVersion: 2,
    },
    player: { mode: v1.player.mode, actorId: observer ? null : PLAYER_ACTOR_ID },
    actors: observer
      ? {}
      : {
          [PLAYER_ACTOR_ID]: {
            id: PLAYER_ACTOR_ID,
            kind: 'joueur',
            label: 'Votre campagne',
            resources,
          },
        },
    scheduled: [],
    pendingDecisions: [],
    eventHistory: {},
    calendar: { blockedBy: null },
  };
}

/** Identité attribuée au candidat d'une partie créée avant la phase 3 (modifiable en phase 5). */
export const MIGRATED_CANDIDATE = {
  prenom: '',
  nom: 'Candidat du joueur',
  parti: 'Sans étiquette',
  positionnement: { economie: 0, societe: 0 },
  parcours: 'Candidature créée avant la phase 3 : identité et positionnement par défaut.',
  nature: 'personnalise',
  profilId: null,
} as const satisfies ActorV4['candidate'];

/** Acteur au format 4 (sans les champs de campagne de la phase 5). */
function toV4Actor(actor: Actor): ActorV4 {
  const { id, kind, label, candidate, style, toleranceRisque, resources, history } = actor;
  return {
    id,
    kind,
    label,
    candidate: {
      prenom: candidate.prenom,
      nom: candidate.nom,
      parti: candidate.parti,
      positionnement: candidate.positionnement,
      parcours: candidate.parcours,
      nature: candidate.nature === 'fictif' ? 'fictif' : 'personnalise',
      profilId: candidate.profilId,
    },
    style,
    toleranceRisque,
    resources,
    status: 'candidat',
    history,
  };
}

/**
 * Format 2 → 3 (phase 3) : le joueur devient un candidat (identité par défaut, au centre),
 * les adversaires fictifs du jeu de règles courant entrent en campagne avec leurs moyens de
 * départ, les décisions en attente sont des réponses à des événements, et le blocage de la
 * phase 2 au premier tour est levé : le scrutin est désormais simulé.
 */
function migrateV2ToV3(v2: GameStateV2): GameStateV3 {
  const ruleset = getRuleset(CURRENT_RULESET_KEY);
  const actors: Record<string, ActorV4> = {};
  for (const [id, actor] of Object.entries(v2.actors)) {
    actors[id] = {
      ...actor,
      candidate: {
        ...MIGRATED_CANDIDATE,
        positionnement: { ...MIGRATED_CANDIDATE.positionnement },
      },
      style: null,
      toleranceRisque: null,
      status: 'candidat',
      history: { popularite: [actor.resources.popularite] },
    };
  }
  for (const [id, opponent] of Object.entries(createOpponents(v2.meta.difficulty, ruleset)))
    actors[id] = toV4Actor(opponent);
  return {
    meta: {
      ...v2.meta,
      engineVersion: '0.3.0',
      rulesetVersion: V3_RULESET_KEY,
      saveSchemaVersion: 3,
    },
    player: v2.player,
    actors,
    scheduled: v2.scheduled,
    pendingDecisions: v2.pendingDecisions.map((d) => ({ ...d, kind: 'evenement' })),
    eventHistory: v2.eventHistory,
    opinion: null,
    polls: [],
    elections: { t1: null, t2: null, consignes: [], debate: null },
    calendar: { blockedBy: null, blockedMessage: null },
  };
}

/**
 * Format 3 → 4 (phase 4) : les résultats déjà dépouillés n'ont pas de détail territorial
 * (`territoire: null`, l'écran Résultats et la carte l'indiquent) ; le jeu de règles passe à la
 * version qui porte la géographie électorale. Les tours à venir seront dépouillés par commune.
 */
function migrateV3ToV4(v3: GameStateV3): GameStateV4 {
  const round = (result: GameStateV3['elections']['t1']) =>
    result ? { ...result, territoire: null } : null;
  return {
    ...v3,
    meta: {
      ...v3.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 4,
    },
    elections: { ...v3.elections, t1: round(v3.elections.t1), t2: round(v3.elections.t2) },
  };
}

/**
 * Format 4 → 5 (phase 5) : chaque candidat reçoit un programme (celui de son parti pour les
 * adversaires, vide pour le joueur), un compte de campagne ouvert avec sa trésorerie actuelle
 * (les dépenses antérieures ne sont pas comptabilisées : régime « partiel ») et des parrainages
 * vides ; les parrainages ne sont pas modélisés pour une partie déjà commencée (personne n'est
 * écarté). Relations initiales selon les positionnements ; jeu de règles courant.
 */
function migrateV4ToV5(v4: GameStateV4): GameStateV5 {
  const ruleset = getRuleset(CURRENT_RULESET_KEY);
  const actors: Record<string, ActorV5> = {};
  for (const [id, actor] of Object.entries(v4.actors)) {
    const fictional = ruleset.candidatsFictifs.find((c) => c.id === id);
    actors[id] = {
      ...actor,
      equipe: fictional?.equipe ?? ruleset.jeu.equipeJoueur,
      implantation: fictional ? [...fictional.implantation] : [],
      objectif: fictional?.objectif ?? null,
      programme: { propositions: fictional ? [...fictional.programme] : [], revirements: 0 },
      parrainages: emptyParrainages(),
      finances: openingAccount(actor.resources.budgetCentimes, ruleset),
      preparationDebat: 0,
      strategie: null,
    };
  }
  return {
    ...v4,
    meta: {
      ...v4.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 5,
    },
    actors,
    elections: { ...v4.elections, debateDetail: null },
    campagne: { parrainages: 'non_modelise', finances: 'partiel' },
    medias: null,
    relations: initialRelations(actors),
    alliances: [],
  };
}

/**
 * Format 5 → 6 (phase 5 bis) : les candidats existants ne sont pas des personnalités réelles
 * (`personnaliteId` nul) et les adversaires restent fictifs ; jeu de règles courant (4.0.0
 * n'ajoutait que les personnalités réelles et leurs paramètres).
 */
function migrateV5ToV6(v5: GameStateV5): GameStateV6 {
  const actors: Record<string, ActorV6> = {};
  for (const [id, actor] of Object.entries(v5.actors)) {
    actors[id] = { ...actor, candidate: { ...actor.candidate, personnaliteId: null } };
  }
  return {
    ...v5,
    meta: {
      ...v5.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 6,
    },
    player: { ...v5.player, adversaires: 'fictifs' },
    actors,
  };
}

/**
 * Format 6 → 7 (phase 5 ter) : les organes de presse fictifs laissent place aux médias réels.
 * La couverture de la dernière semaine, qui portait sur les organes fictifs, est effacée ; elle
 * sera recalculée par les médias réels dès la semaine suivante (indice médiatique neutre d'ici
 * là). La partie passe au jeu de règles courant.
 */
function migrateV6ToV7(v6: GameStateV6): GameStateV7 {
  return {
    ...v6,
    meta: {
      ...v6.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 7,
    },
    medias: null,
  };
}

/**
 * Format 7 → 8 (phase 6) : la partie appartient au cycle de la présidentielle de 2027, sans
 * quinquennat ni archive antérieurs. Une partie terminée au second tour (bloquée sur
 * `fin-de-la-presidentielle`) reprend au début du quinquennat : le vainqueur, joueur ou IA,
 * entre en fonctions à l'investiture, comme le prévoit le moteur au second tour (l'Assemblée
 * est ouverte par la migration suivante). Les décisions en attente gardent leur forme.
 */
function migrateV7ToV8(v7: GameStateV7): GameStateV8 {
  const state: GameStateV8 = {
    ...v7,
    meta: {
      ...v7.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 8,
    },
    cycle: { ...FIRST_CYCLE },
    quinquennat: null,
    historique: { presidentielles: [], quinquennats: [] },
  };
  if (v7.calendar.blockedBy === 'fin-de-la-presidentielle') {
    const winner = v7.elections.t2?.winner ?? v7.elections.t1?.winner;
    const actor = winner ? v7.actors[winner] : undefined;
    if (!winner || !actor)
      throw new SaveFormatError('incoherence', 'Présidentielle terminée sans vainqueur.');
    // Ouverture du quinquennat telle que la fait le moteur au second tour : la partie, bloquée
    // la semaine qui suit le scrutin, est antérieure à l'investiture (nomination à venir).
    const { debut, fin } = mandateDates(getRuleset(CURRENT_RULESET_KEY), FIRST_CYCLE);
    state.quinquennat = {
      mandat: { presidentId: winner, debut, fin, numero: 1 },
      gouvernement: null,
      anciensGouvernements: [],
      feuilleDeRoute: [...actor.programme.propositions],
      refus: [],
    };
    state.meta.phase = 'presidence';
    state.calendar = { blockedBy: null, blockedMessage: null };
  }
  return state;
}

/**
 * Format 8 → 9 (phase 6, P6-04) : la partie reçoit l'Assemblée nationale réelle du jeu de
 * règles courant. Pendant une campagne, pas encore de Parlement (`null`) ; pendant un
 * quinquennat, l'Assemblée est ouverte comme au début d'un quinquennat (sièges importés,
 * alignements par rapport au président, aucun texte déposé : la feuille de route est déposée à
 * partir de la semaine suivante).
 */
function migrateV8ToV9(v8: GameStateV8): GameStateV9 {
  const president = v8.quinquennat ? v8.actors[v8.quinquennat.mandat.presidentId] : undefined;
  if (v8.quinquennat && !president)
    throw new SaveFormatError('incoherence', 'Président inconnu dans la partie.');
  return {
    ...v8,
    meta: {
      ...v8.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 9,
    },
    parlement: president ? openParliament(getRuleset(CURRENT_RULESET_KEY), president, null) : null,
  };
}

/**
 * Format 9 → 10 (phase 6, P6-05 et P6-06) : la partie reçoit l'économie du quinquennat. Pendant
 * une campagne, pas encore d'économie (`null`) ; pendant un quinquennat, les indicateurs partent
 * des valeurs de l'Insee du jeu de règles courant, comme au début d'un quinquennat (la
 * conjoncture des semaines déjà jouées n'est pas reconstituée).
 */
function migrateV9ToV10(v9: GameStateV9): GameStateV10 {
  return {
    ...v9,
    meta: {
      ...v9.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 10,
    },
    economie: v9.quinquennat ? openEconomy(getRuleset(CURRENT_RULESET_KEY), v9.meta.week) : null,
  };
}

/**
 * Format 10 → 11 (phase 6, P6-07) : la partie reçoit l'état des législatives. Pendant une
 * campagne, rien (`null`) ; pendant un quinquennat, les dernières élections sont celles de 2024
 * (réelles, sièges de l'Assemblée en place) et les prochaines celles de la fin de la
 * législature, comme au début d'un quinquennat.
 */
function migrateV10ToV11(v10: GameStateV10): GameStateV11 {
  return {
    ...v10,
    meta: {
      ...v10.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 11,
    },
    legislatives:
      v10.quinquennat && v10.parlement
        ? openLegislatives(getRuleset(CURRENT_RULESET_KEY), v10.parlement)
        : null,
  };
}

/**
 * Format 11 → 12 (phase 6, P6-08) : bilan du quinquennat et présidentielle suivante. Un
 * quinquennat en cours reçoit son relevé de départ : semaine du second tour de 2027 (seul cycle
 * jouable avant ce format), premières valeurs enregistrées de l'économie ; la popularité du
 * président à son élection n'était pas enregistrée (null, signalé dans le bilan). Aucun
 * quinquennat ne pouvait être achevé avant ce format (la partie se bloquait à la fin du mandat).
 */
function migrateV11ToV12(v11: GameStateV11): GameState {
  if (v11.historique.quinquennats.length > 0) {
    throw new SaveFormatError(
      'incoherence',
      'Quinquennat archivé dans un format antérieur au 12 : impossible, la fin du mandat y bloquait la partie.',
    );
  }
  let quinquennat: GameState['quinquennat'] = null;
  if (v11.quinquennat) {
    const t2 = getRuleset(CURRENT_RULESET_KEY).calendrier.scrutins.at(-1)!.date;
    const day = (iso: string) => daysFromCivil(parseIsoDate(iso)!);
    const semaine = Math.max(0, Math.floor((day(t2) - day(v11.meta.startDate)) / 7));
    const recorded =
      v11.economie?.historique.find((h) => h.semaine >= semaine) ?? v11.economie?.historique[0];
    quinquennat = {
      ...v11.quinquennat,
      depart: {
        semaine,
        date: addDays(v11.meta.startDate, 7 * semaine),
        popularite: null,
        indicateurs: recorded ? { ...recorded.valeurs } : null,
      },
    };
  }
  return {
    ...v11,
    meta: {
      ...v11.meta,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
      saveSchemaVersion: 12,
    },
    quinquennat,
    historique: { presidentielles: v11.historique.presidentielles, quinquennats: [] },
  };
}

const MIGRATIONS: Record<number, (state: never) => unknown> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
  4: migrateV4ToV5,
  5: migrateV5ToV6,
  6: migrateV6ToV7,
  7: migrateV7ToV8,
  8: migrateV8ToV9,
  9: migrateV9ToV10,
  10: migrateV10ToV11,
  11: migrateV11ToV12,
};

export type LoadedState = { state: GameState; stateHash: string; migratedFrom: number | null };

/** Valide un état selon le schéma de sa version puis le migre jusqu'au format courant. */
export function upgradeState(raw: unknown, version: number): Omit<LoadedState, 'stateHash'> {
  if (version > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new SaveFormatError(
      'version_future',
      `Format de sauvegarde ${version} plus récent que ce serveur (format ${CURRENT_SAVE_SCHEMA_VERSION}).`,
    );
  }
  const schema = SCHEMAS[version];
  if (!schema)
    throw new SaveFormatError('version_inconnue', `Format de sauvegarde inconnu : ${version}.`);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new SaveFormatError(
      'etat_invalide',
      `État invalide pour le format ${version}.`,
      z.treeifyError(parsed.error),
    );
  }
  let value: unknown = parsed.data;
  for (let v = version; v < CURRENT_SAVE_SCHEMA_VERSION; v++)
    value = MIGRATIONS[v]!(value as never);
  const state = GameStateSchema.parse(value);
  try {
    getRuleset(state.meta.rulesetVersion);
  } catch (error) {
    if (error instanceof UnknownRulesetError) {
      throw new SaveFormatError('regles_inconnues', error.message);
    }
    throw error;
  }
  return { state, migratedFrom: version < CURRENT_SAVE_SCHEMA_VERSION ? version : null };
}

/**
 * Relit un état stocké (base ou fichier) : l'empreinte est vérifiée sur l'état tel qu'il a
 * été enregistré, AVANT toute migration ; puis l'état est validé et migré.
 */
export function loadStoredState(raw: unknown, expectedHash: string, version: number): LoadedState {
  let actualHash: string;
  try {
    actualHash = sha256(canonicalStringify(raw));
  } catch {
    throw new SaveFormatError('etat_invalide', 'État non sérialisable.');
  }
  if (actualHash !== expectedHash) {
    throw new SaveFormatError(
      'empreinte_incoherente',
      'Empreinte incohérente : l’état a été modifié ou corrompu.',
    );
  }
  const upgraded = upgradeState(raw, version);
  return { ...upgraded, stateHash: hashState(upgraded.state) };
}
