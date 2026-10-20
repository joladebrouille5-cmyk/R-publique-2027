import { CURRENT_SAVE_SCHEMA_VERSION, loadStoredState, SaveFormatError } from '@r2027/save-engine';
import type { GameDetail, GameState, GameSummary, SaveSummary } from '@r2027/shared';
import { toIsoDate, type Database } from '../db';
import { conflict, HttpError, notFound } from '../errors';
import type { Game, GameSave } from '../generated/prisma/client';

export type LoadedGame = { game: Game; state: GameState; stateHash: string };

/** Relit un état stocké en base (empreinte, schéma, migration). Une anomalie n'est jamais masquée. */
export function readStoredState(
  state: unknown,
  stateHash: string,
  version: number,
  context: string,
) {
  try {
    return loadStoredState(state, stateHash, version);
  } catch (error) {
    if (error instanceof SaveFormatError) {
      throw new HttpError(500, 'etat_corrompu', `État illisible (${context}) : ${error.message}`);
    }
    throw error;
  }
}

export function toGameSummary(game: Game): GameSummary {
  return {
    id: game.id,
    name: game.name,
    mode: game.mode,
    difficulty: game.difficulty,
    phase: game.phase as GameSummary['phase'],
    week: game.week,
    date: toIsoDate(game.date),
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

export function toGameDetail({ game, state, stateHash }: LoadedGame): GameDetail {
  return {
    ...toGameSummary(game),
    seed: game.seed,
    engineVersion: game.engineVersion,
    rulesetVersion: game.rulesetVersion,
    saveSchemaVersion: game.saveSchemaVersion,
    version: game.version,
    stateHash,
    state,
  };
}

export function toSaveSummary(save: GameSave): SaveSummary {
  return {
    id: save.id,
    kind: save.kind,
    slot: save.slot,
    label: save.label,
    week: save.week,
    date: toIsoDate(save.date),
    stateHash: save.stateHash,
    engineVersion: save.engineVersion,
    saveSchemaVersion: save.saveSchemaVersion,
    createdAt: save.createdAt.toISOString(),
  };
}

/** Colonnes de `game` dérivées de l'état (la source de vérité reste l'état). */
export function gameColumns(state: GameState, stateHash: string) {
  return {
    state,
    stateHash,
    engineVersion: state.meta.engineVersion,
    rulesetVersion: state.meta.rulesetVersion,
    saveSchemaVersion: state.meta.saveSchemaVersion,
    phase: state.meta.phase,
    week: state.meta.week,
    date: new Date(`${state.meta.date}T00:00:00.000Z`),
  };
}

export async function findOwnedGame(db: Database, userId: string, gameId: string): Promise<Game> {
  const game = await db.game.findFirst({ where: { id: gameId, userId } });
  // Même réponse que la partie n'existe pas ou appartienne à un autre utilisateur.
  if (!game) throw notFound('Partie introuvable');
  return game;
}

/**
 * Charge une partie du joueur. Une partie enregistrée dans un ancien format est migrée et
 * réenregistrée immédiatement (événement `migration_de_sauvegarde` dans le journal).
 */
export async function loadOwnedGame(
  db: Database,
  userId: string,
  gameId: string,
): Promise<LoadedGame> {
  const game = await findOwnedGame(db, userId, gameId);
  const loaded = readStoredState(
    game.state,
    game.stateHash,
    game.saveSchemaVersion,
    `partie ${game.id}`,
  );
  if (loaded.migratedFrom === null)
    return { game, state: loaded.state, stateHash: loaded.stateHash };

  const migrated = await db.$transaction(async (tx) => {
    const { count } = await tx.game.updateMany({
      where: { id: game.id, version: game.version },
      data: { ...gameColumns(loaded.state, loaded.stateHash), version: { increment: 1 } },
    });
    if (count !== 1) throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps.');
    await tx.gameEvent.create({
      data: {
        gameId: game.id,
        week: loaded.state.meta.week,
        type: 'migration_de_sauvegarde',
        nature: 'systeme',
        payload: { from: loaded.migratedFrom, to: CURRENT_SAVE_SCHEMA_VERSION },
      },
    });
    return tx.game.findUniqueOrThrow({ where: { id: game.id } });
  });
  return { game: migrated, state: loaded.state, stateHash: loaded.stateHash };
}
