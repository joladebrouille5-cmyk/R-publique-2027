import {
  candidateName,
  DEFAULT_START_DATE,
  isoWeekday,
  parseIsoDate,
  RESOURCE_BOUNDS,
  rulesetKey,
  START_DATE_MAX,
  START_DATE_MIN,
  type Actor,
  type CandidateInput,
  type Difficulty,
  type GameMode,
  type GameState,
  type OpponentSet,
  type RealPersonality,
  type Resources,
  type ResourcesV1,
  type Ruleset,
} from '@r2027/shared';
import { initialRelations } from '../ai/relations';
import { openingAccount } from '../campaign/finances';
import { emptyParrainages, initialPromises } from '../campaign/parrainages';
import { FIRST_CYCLE } from '../presidency/dates';
import { compareStrings } from './ledger';
import { ENGINE_VERSION, SAVE_SCHEMA_VERSION } from './versions';

/** Identifiant de la campagne du joueur. */
export const PLAYER_ACTOR_ID = 'joueur';

export type CreateGameInput = {
  seed: string;
  mode: GameMode;
  difficulty: Difficulty;
  startDate?: string | undefined;
  candidate?: CandidateInput | undefined;
  /** Personnalité réelle incarnée (mode « candidat réel »). */
  personnaliteId?: string | undefined;
  /** Adversaires : fictifs (par défaut) ou personnalités réelles. */
  adversaires?: OpponentSet | undefined;
  /** Scénario de départ (phase 7) ; « standard » par défaut. */
  scenarioId?: string | undefined;
};

export class GameCreationError extends Error {
  constructor(
    readonly code:
      | 'date_de_depart_invalide'
      | 'candidat_requis'
      | 'profil_inconnu'
      | 'personnalite_requise'
      | 'personnalite_inconnue'
      | 'scenario_inconnu',
    message: string,
  ) {
    super(message);
    this.name = 'GameCreationError';
  }
}

/**
 * Ressources de départ bornées. Jauges Jeunesse et Dynamique (phase 9) : valeurs de départ du
 * jeu de règles, identiques pour tous les candidats, sauf si elles sont déjà fixées.
 */
const bounded = (
  ruleset: Ruleset,
  resources: ResourcesV1 & Partial<Pick<Resources, 'jeunesse' | 'dynamique'>>,
): Resources => {
  const result: Resources = { ...ruleset.numerique.initial, ...resources };
  for (const key of Object.keys(result) as (keyof Resources)[]) {
    const { min, max } = RESOURCE_BOUNDS[key];
    result[key] = Math.min(max, Math.max(min, result[key]));
  }
  return result;
};

/**
 * Candidat du joueur (§1.2) : ressources de départ selon la difficulté (§1.3), modifiées par
 * le profil choisi. Paramètres de jeu (hypothèses) ; aucun profil ne garantit la victoire.
 */
export function createPlayerActor(
  difficulty: Difficulty,
  ruleset: Ruleset,
  candidate: CandidateInput,
): Actor {
  const profile = candidate.profilId
    ? ruleset.profilsDeDepart.find((p) => p.id === candidate.profilId)
    : undefined;
  if (candidate.profilId && !profile) {
    throw new GameCreationError(
      'profil_inconnu',
      `Profil de départ inconnu : ${candidate.profilId}`,
    );
  }
  const base = ruleset.jeu.ressourcesInitiales[difficulty];
  const modifiers = profile?.modificateurs ?? {};
  const resources = bounded(ruleset, {
    budgetCentimes: base.budgetCentimes + (modifiers.budgetCentimes ?? 0),
    militants: base.militants + (modifiers.militants ?? 0),
    notoriete: base.notoriete + (modifiers.notoriete ?? 0),
    popularite: base.popularite + (modifiers.popularite ?? 0),
    tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
  });
  const identity = {
    prenom: (candidate.prenom ?? '').trim(),
    nom: candidate.nom.trim(),
    parti: candidate.parti.trim(),
    positionnement: candidate.positionnement,
    parcours: (candidate.parcours ?? '').trim(),
    nature: 'personnalise' as const,
    profilId: candidate.profilId ?? null,
    personnaliteId: null,
  };
  return {
    id: PLAYER_ACTOR_ID,
    kind: 'joueur',
    label: `Campagne de ${candidateName(identity)}`,
    candidate: identity,
    style: null,
    toleranceRisque: null,
    resources,
    status: 'candidat',
    history: { popularite: [resources.popularite] },
    equipe: ruleset.jeu.equipeJoueur,
    implantation: [],
    objectif: null,
    programme: { propositions: [], revirements: 0 },
    parrainages: emptyParrainages(),
    finances: openingAccount(resources.budgetCentimes, ruleset),
    preparationDebat: 0,
    strategie: null,
  };
}

/** Adversaires fictifs du jeu de règles ; leurs moyens dépendent de la difficulté (§1.3). */
export function createOpponents(difficulty: Difficulty, ruleset: Ruleset): Record<string, Actor> {
  const level = ruleset.ia[difficulty];
  const opponents: Record<string, Actor> = {};
  for (const c of ruleset.candidatsFictifs) {
    const resources = bounded(ruleset, {
      ...c.ressources,
      budgetCentimes: Math.round(c.ressources.budgetCentimes * level.multiplicateurBudget),
      tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
    });
    opponents[c.id] = {
      id: c.id,
      kind: 'adversaire',
      label: `Campagne de ${c.prenom} ${c.nom}`,
      candidate: {
        prenom: c.prenom,
        nom: c.nom,
        parti: c.parti,
        positionnement: c.positionnement,
        parcours: c.parcours,
        nature: 'fictif',
        profilId: null,
        personnaliteId: null,
      },
      style: c.style,
      toleranceRisque: c.toleranceRisque,
      resources,
      status: 'candidat',
      history: { popularite: [resources.popularite] },
      equipe: c.equipe,
      implantation: [...c.implantation],
      objectif: c.objectif,
      programme: { propositions: [...c.programme], revirements: 0 },
      parrainages: emptyParrainages(),
      finances: openingAccount(resources.budgetCentimes, ruleset),
      preparationDebat: 0,
      strategie: null,
    };
  }
  return opponents;
}

/** Fiche d'une personnalité réelle du jeu de règles ; erreur si elle n'existe pas. */
export function findPersonality(ruleset: Ruleset, id: string): RealPersonality {
  const personality = ruleset.personnalites.personnalites.find((p) => p.id === id);
  if (!personality) {
    throw new GameCreationError('personnalite_inconnue', `Personnalité inconnue : ${id}`);
  }
  return personality;
}

/**
 * Pression de gestion du joueur selon la difficulté (§1.3) : rapport entre les moyens de
 * départ du niveau choisi et ceux du niveau standard (appliqué aux moyens d'une personnalité).
 */
function playerScale(ruleset: Ruleset, difficulty: Difficulty) {
  const r = ruleset.jeu.ressourcesInitiales;
  const p = ruleset.jeu.promessesInitialesJoueur;
  return {
    budget: r[difficulty].budgetCentimes / r.standard.budgetCentimes,
    militants: r[difficulty].militants / r.standard.militants,
    promesses: p[difficulty] / p.standard,
  };
}

/**
 * Campagne d'une personnalité réelle (phase 5 bis), jouée par le joueur ou par l'IA : moyens de
 * départ selon les niveaux de sa fiche (hypothèses du jeu de règles), position estimée d'après
 * l'enquête CHES, aucun programme prêté par le jeu. Son comportement est simulé.
 */
export function createRealActor(
  personality: RealPersonality,
  difficulty: Difficulty,
  ruleset: Ruleset,
  asPlayer: boolean,
): Actor {
  const params = ruleset.personnalitesReelles;
  const means = params.organisation[personality.moyens.organisation];
  const scale = asPlayer
    ? playerScale(ruleset, difficulty)
    : { budget: ruleset.ia[difficulty].multiplicateurBudget, militants: 1, promesses: 1 };
  const resources = bounded(ruleset, {
    budgetCentimes: Math.round(means.budgetCentimes * scale.budget),
    militants: Math.round(means.militants * scale.militants),
    notoriete: params.notoriete[personality.moyens.notoriete - 1]!,
    popularite: asPlayer
      ? ruleset.jeu.ressourcesInitiales[difficulty].popularite
      : params.popularite,
    tempsHeures: ruleset.jeu.tempsHebdomadaireHeures,
  });
  const identity = {
    prenom: personality.prenom,
    nom: personality.nom,
    parti: personality.parti,
    positionnement: {
      economie: personality.position.economie,
      societe: personality.position.societe,
    },
    parcours: '',
    nature: 'reel' as const,
    profilId: null,
    personnaliteId: personality.id,
  };
  return {
    id: asPlayer ? PLAYER_ACTOR_ID : personality.id,
    kind: asPlayer ? 'joueur' : 'adversaire',
    label: `Campagne de ${candidateName(identity)}`,
    candidate: identity,
    style: asPlayer ? null : params.style,
    toleranceRisque: asPlayer ? null : params.toleranceRisque,
    resources,
    status: 'candidat',
    history: { popularite: [resources.popularite] },
    equipe: means.equipe,
    implantation: [...personality.implantation.regions],
    objectif: asPlayer ? null : params.objectif,
    programme: { propositions: [], revirements: 0 },
    parrainages: emptyParrainages(),
    finances: openingAccount(resources.budgetCentimes, ruleset),
    preparationDebat: 0,
    strategie: null,
  };
}

/** Promesses de parrainage de départ d'un candidat (jeu de règles, difficulté pour le joueur). */
function initialPromiseCount(state: GameState, ruleset: Ruleset, actor: Actor): number {
  const personalityId = actor.candidate.personnaliteId;
  if (personalityId) {
    const personality = findPersonality(ruleset, personalityId);
    const base = ruleset.personnalitesReelles.organisation[personality.moyens.organisation];
    const scale =
      actor.kind === 'joueur' ? playerScale(ruleset, state.meta.difficulty).promesses : 1;
    return Math.round(base.promessesInitiales * scale);
  }
  return actor.kind === 'joueur'
    ? ruleset.jeu.promessesInitialesJoueur[state.meta.difficulty]
    : (ruleset.candidatsFictifs.find((c) => c.id === actor.id)?.promessesInitiales ?? 0);
}

/**
 * Promesses de parrainage de départ : celles des partis (jeu de règles) et, pour le joueur,
 * selon la difficulté. Attribuées dans l'ordre des identifiants, dans la limite des élus libres,
 * aux seuls candidats en lice (pas à un président sortant inéligible).
 */
export function distributeInitialPromises(state: GameState, ruleset: Ruleset): void {
  for (const id of Object.keys(state.actors).sort(compareStrings)) {
    const actor = state.actors[id]!;
    if (actor.status !== 'candidat') continue;
    const total = initialPromiseCount(state, ruleset, actor);
    actor.parrainages.promesses = initialPromises(state, ruleset, total, actor.implantation);
  }
}

/**
 * Moyens de départ d'un candidat, recalculés comme à la création de la partie (budget,
 * militants, notoriété) : ils dotent chaque candidat au début d'une nouvelle présidentielle
 * (phase 6, P6-08).
 */
export function initialMeans(state: GameState, ruleset: Ruleset, actor: Actor): Resources {
  const { difficulty } = state.meta;
  const personalityId = actor.candidate.personnaliteId;
  if (personalityId) {
    const personality = findPersonality(ruleset, personalityId);
    return createRealActor(personality, difficulty, ruleset, actor.kind === 'joueur').resources;
  }
  if (actor.kind === 'joueur') {
    const { prenom, nom, parti, positionnement, parcours, profilId } = actor.candidate;
    return createPlayerActor(difficulty, ruleset, {
      prenom,
      nom,
      parti,
      positionnement,
      parcours,
      profilId,
    }).resources;
  }
  return createOpponents(difficulty, ruleset)[actor.id]?.resources ?? actor.resources;
}

export function createGame(input: CreateGameInput, ruleset: Ruleset): GameState {
  if (input.mode === 'candidat_personnalise' && !input.candidate) {
    throw new GameCreationError('candidat_requis', 'Créez votre candidat pour jouer dans ce mode.');
  }
  if (input.mode === 'candidat_reel' && !input.personnaliteId) {
    throw new GameCreationError(
      'personnalite_requise',
      'Choisissez la personnalité que vous incarnez dans ce mode.',
    );
  }
  const scenarioId = input.scenarioId ?? 'standard';
  const scenario = ruleset.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    throw new GameCreationError('scenario_inconnu', `Scénario inconnu : ${scenarioId}`);
  }
  const personality =
    input.mode === 'candidat_reel' ? findPersonality(ruleset, input.personnaliteId!) : null;
  const adversaires: OpponentSet = input.adversaires ?? 'fictifs';

  const startDate = input.startDate ?? DEFAULT_START_DATE;
  const civil = parseIsoDate(startDate);
  if (!civil) {
    throw new GameCreationError('date_de_depart_invalide', `Date invalide : ${startDate}`);
  }
  if (isoWeekday(civil) !== 1) {
    throw new GameCreationError(
      'date_de_depart_invalide',
      'La partie avance par semaines : la date de départ doit être un lundi.',
    );
  }
  if (startDate < START_DATE_MIN || startDate > START_DATE_MAX) {
    throw new GameCreationError(
      'date_de_depart_invalide',
      `La date de départ doit être comprise entre le ${START_DATE_MIN} et le ${START_DATE_MAX}.`,
    );
  }

  // Adversaires : fictifs, ou toutes les personnalités réelles sauf celle que le joueur incarne.
  const actors =
    adversaires === 'reels'
      ? Object.fromEntries(
          ruleset.personnalites.personnalites
            .filter((p) => p.id !== personality?.id)
            .map((p) => [p.id, createRealActor(p, input.difficulty, ruleset, false)]),
        )
      : createOpponents(input.difficulty, ruleset);
  if (input.mode === 'candidat_personnalise') {
    actors[PLAYER_ACTOR_ID] = createPlayerActor(input.difficulty, ruleset, input.candidate!);
  } else if (personality) {
    actors[PLAYER_ACTOR_ID] = createRealActor(personality, input.difficulty, ruleset, true);
  }
  // Scénario de départ : écarts sur les moyens du joueur et de ses adversaires (hypothèses).
  for (const actor of Object.values(actors)) {
    const modifiers =
      actor.kind === 'joueur' ? scenario.campagne.joueur : scenario.campagne.adversaires;
    if (Object.keys(modifiers).length === 0) continue;
    actor.resources = bounded(ruleset, {
      ...actor.resources,
      budgetCentimes: actor.resources.budgetCentimes + (modifiers.budgetCentimes ?? 0),
      militants: actor.resources.militants + (modifiers.militants ?? 0),
      notoriete: actor.resources.notoriete + (modifiers.notoriete ?? 0),
      popularite: actor.resources.popularite + (modifiers.popularite ?? 0),
    });
    actor.history = { popularite: [actor.resources.popularite] };
    actor.finances = openingAccount(actor.resources.budgetCentimes, ruleset);
  }
  const state: GameState = {
    meta: {
      seed: input.seed,
      week: 0,
      date: startDate,
      startDate,
      phase: 'campagne',
      difficulty: input.difficulty,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: rulesetKey(ruleset),
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    },
    player: {
      mode: input.mode,
      actorId: input.mode === 'observateur' ? null : PLAYER_ACTOR_ID,
      adversaires,
    },
    actors,
    scheduled: [],
    pendingDecisions: [],
    eventHistory: {},
    opinion: null,
    polls: [],
    elections: { t1: null, t2: null, consignes: [], debate: null, debateDetail: null },
    calendar: { blockedBy: null, blockedMessage: null },
    campagne: { parrainages: 'modelise', finances: 'complet' },
    medias: null,
    relations: initialRelations(actors),
    alliances: [],
    cycle: { ...FIRST_CYCLE },
    quinquennat: null,
    historique: { presidentielles: [], quinquennats: [] },
    parlement: null,
    economie: null,
    legislatives: null,
    scenario: scenario.id,
    consequences: [],
    numerique: { publications: [] },
  };
  distributeInitialPromises(state, ruleset);
  return state;
}
