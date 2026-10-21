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
  type Resources,
  type Ruleset,
} from '@r2027/shared';
import { initialRelations } from '../ai/relations';
import { openingAccount } from '../campaign/finances';
import { emptyParrainages, initialPromises } from '../campaign/parrainages';
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
};

export class GameCreationError extends Error {
  constructor(
    readonly code:
      'mode_non_disponible' | 'date_de_depart_invalide' | 'candidat_requis' | 'profil_inconnu',
    message: string,
  ) {
    super(message);
    this.name = 'GameCreationError';
  }
}

const bounded = (resources: Resources): Resources => {
  const result = { ...resources };
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
  const resources = bounded({
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
    const resources = bounded({
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

/**
 * Promesses de parrainage de départ : celles des partis (jeu de règles) et, pour le joueur,
 * selon la difficulté. Attribuées dans l'ordre des identifiants, dans la limite des élus libres.
 */
export function distributeInitialPromises(state: GameState, ruleset: Ruleset): void {
  for (const id of Object.keys(state.actors).sort(compareStrings)) {
    const actor = state.actors[id]!;
    const total =
      actor.kind === 'joueur'
        ? ruleset.jeu.promessesInitialesJoueur[state.meta.difficulty]
        : (ruleset.candidatsFictifs.find((c) => c.id === id)?.promessesInitiales ?? 0);
    actor.parrainages.promesses = initialPromises(state, ruleset, total, actor.implantation);
  }
}

export function createGame(input: CreateGameInput, ruleset: Ruleset): GameState {
  if (input.mode === 'candidat_reel') {
    throw new GameCreationError(
      'mode_non_disponible',
      'Le mode « candidat réel » nécessite des profils de personnalités sourcés, non encore validés (question Q2 du plan).',
    );
  }
  if (input.mode === 'candidat_personnalise' && !input.candidate) {
    throw new GameCreationError('candidat_requis', 'Créez votre candidat pour jouer dans ce mode.');
  }

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

  const actors = createOpponents(input.difficulty, ruleset);
  if (input.mode === 'candidat_personnalise') {
    actors[PLAYER_ACTOR_ID] = createPlayerActor(input.difficulty, ruleset, input.candidate!);
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
  };
  distributeInitialPromises(state, ruleset);
  return state;
}
