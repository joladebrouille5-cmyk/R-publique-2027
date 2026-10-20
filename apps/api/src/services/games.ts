import { randomBytes } from 'node:crypto';
import { createGame, GameCreationError, SAVE_SCHEMA_VERSION } from '@r2027/engine';
import { snapshotState, SnapshotIntegrityError, verifySnapshot } from '@r2027/save-engine';
import type {
  CreateGameRequestSchema,
  CreateSaveRequestSchema,
  GameDetail,
  GameState,
  GameSummary,
  RestoreSaveRequestSchema,
  SaveSummary,
} from '@r2027/shared';
import type { z } from 'zod';
import { fromIsoDate, toIsoDate, type Database } from '../db';
import { conflict, HttpError, notFound } from '../errors';
import type { Game, GameSave } from '../generated/prisma/client';

type CreateGameBody = z.output<typeof CreateGameRequestSchema>;
type CreateSaveBody = z.output<typeof CreateSaveRequestSchema>;
type RestoreSaveBody = z.output<typeof RestoreSaveRequestSchema>;

/** Graine aléatoire générée côté serveur quand le joueur n'en fournit pas. */
export function randomSeed(): string {
  return randomBytes(12).toString('base64url');
}

function readState(state: unknown, stateHash: string, context: string): GameState {
  try {
    return verifySnapshot(state, stateHash);
  } catch (error) {
    // Ne jamais masquer une corruption : l'erreur est explicite et journalisée.
    const reason = error instanceof SnapshotIntegrityError ? error.message : 'schéma invalide';
    throw new HttpError(500, 'etat_corrompu', `État illisible (${context}) : ${reason}`);
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

export function toGameDetail(game: Game): GameDetail {
  return {
    ...toGameSummary(game),
    seed: game.seed,
    engineVersion: game.engineVersion,
    rulesetVersion: game.rulesetVersion,
    saveSchemaVersion: game.saveSchemaVersion,
    version: game.version,
    stateHash: game.stateHash,
    state: readState(game.state, game.stateHash, `partie ${game.id}`),
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

export async function listGames(db: Database, userId: string): Promise<GameSummary[]> {
  const games = await db.game.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return games.map(toGameSummary);
}

async function findOwnedGame(db: Database, userId: string, gameId: string): Promise<Game> {
  const game = await db.game.findFirst({ where: { id: gameId, userId } });
  // Même réponse que la partie n'existe pas ou appartienne à un autre utilisateur.
  if (!game) throw notFound('Partie introuvable');
  return game;
}

export async function getGame(db: Database, userId: string, gameId: string): Promise<GameDetail> {
  return toGameDetail(await findOwnedGame(db, userId, gameId));
}

export async function createNewGame(
  db: Database,
  userId: string,
  body: CreateGameBody,
): Promise<GameDetail> {
  const seed = body.seed ?? randomSeed();
  let initial: GameState;
  try {
    initial = createGame({
      seed,
      mode: body.mode,
      difficulty: body.difficulty,
      startDate: body.startDate,
    });
  } catch (error) {
    if (error instanceof GameCreationError) throw new HttpError(422, error.code, error.message);
    throw error;
  }
  const { state, stateHash } = snapshotState(initial);

  const game = await db.$transaction(async (tx) => {
    const created = await tx.game.create({
      data: {
        userId,
        name: body.name,
        mode: body.mode,
        difficulty: body.difficulty,
        seed,
        engineVersion: state.meta.engineVersion,
        rulesetVersion: state.meta.rulesetVersion,
        saveSchemaVersion: state.meta.saveSchemaVersion,
        phase: state.meta.phase,
        week: state.meta.week,
        date: fromIsoDate(state.meta.date),
        state,
        stateHash,
      },
    });
    await tx.gameEvent.create({
      data: {
        gameId: created.id,
        week: state.meta.week,
        type: 'partie_creee',
        nature: 'systeme',
        payload: { mode: body.mode, difficulty: body.difficulty, seed, startDate: state.meta.date },
      },
    });
    return created;
  });
  return toGameDetail(game);
}

export async function listSaves(
  db: Database,
  userId: string,
  gameId: string,
): Promise<SaveSummary[]> {
  await findOwnedGame(db, userId, gameId);
  const saves = await db.gameSave.findMany({
    where: { gameId },
    orderBy: [{ slot: 'asc' }, { createdAt: 'desc' }],
  });
  return saves.map(toSaveSummary);
}

export async function createManualSave(
  db: Database,
  userId: string,
  gameId: string,
  body: CreateSaveBody,
): Promise<SaveSummary> {
  const game = await findOwnedGame(db, userId, gameId);
  const state = readState(game.state, game.stateHash, `partie ${game.id}`);

  const save = await db.$transaction(async (tx) => {
    const existing = await tx.gameSave.findUnique({
      where: { gameId_slot: { gameId, slot: body.slot } },
    });
    if (existing && !body.overwrite) {
      throw conflict(
        'emplacement_occupe',
        `L'emplacement ${body.slot} contient déjà une sauvegarde (semaine ${existing.week}).`,
      );
    }
    if (existing) await tx.gameSave.delete({ where: { id: existing.id } });
    const created = await tx.gameSave.create({
      data: {
        gameId,
        kind: 'manuelle',
        slot: body.slot,
        label: body.label ?? null,
        week: state.meta.week,
        date: fromIsoDate(state.meta.date),
        state,
        stateHash: game.stateHash,
        engineVersion: state.meta.engineVersion,
        saveSchemaVersion: state.meta.saveSchemaVersion,
      },
    });
    await tx.gameEvent.create({
      data: {
        gameId,
        week: state.meta.week,
        type: 'sauvegarde_creee',
        nature: 'systeme',
        payload: { saveId: created.id, slot: body.slot, overwrite: Boolean(existing) },
      },
    });
    return created;
  });
  return toSaveSummary(save);
}

export async function restoreSave(
  db: Database,
  userId: string,
  gameId: string,
  saveId: string,
  body: RestoreSaveBody,
): Promise<GameDetail> {
  const game = await findOwnedGame(db, userId, gameId);
  const save = await db.gameSave.findFirst({ where: { id: saveId, gameId } });
  if (!save) throw notFound('Sauvegarde introuvable');
  if (save.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new HttpError(
      422,
      'version_de_sauvegarde_incompatible',
      `Sauvegarde au format ${save.saveSchemaVersion}, format attendu ${SAVE_SCHEMA_VERSION}.`,
    );
  }
  if (body.expectedVersion !== undefined && body.expectedVersion !== game.version) {
    throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps : rechargez-la.');
  }
  const state = readState(save.state, save.stateHash, `sauvegarde ${save.id}`);

  const restored = await db.$transaction(async (tx) => {
    // Verrou optimiste : la mise à jour échoue si une autre écriture est passée entre-temps.
    const { count } = await tx.game.updateMany({
      where: { id: gameId, version: game.version },
      data: {
        state,
        stateHash: save.stateHash,
        phase: state.meta.phase,
        week: state.meta.week,
        date: fromIsoDate(state.meta.date),
        version: { increment: 1 },
      },
    });
    if (count !== 1) {
      throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps : rechargez-la.');
    }
    await tx.gameEvent.create({
      data: {
        gameId,
        week: state.meta.week,
        type: 'sauvegarde_restauree',
        nature: 'systeme',
        payload: { saveId: save.id, slot: save.slot, fromWeek: game.week },
      },
    });
    return tx.game.findUniqueOrThrow({ where: { id: gameId } });
  });
  return toGameDetail(restored);
}
