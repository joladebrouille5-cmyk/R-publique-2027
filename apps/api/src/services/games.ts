import { randomBytes } from 'node:crypto';
import { createGame, GameCreationError } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { snapshotState } from '@r2027/save-engine';
import type { CreateGameRequestSchema, GameDetail, GameState, GameSummary } from '@r2027/shared';
import type { z } from 'zod';
import type { Database } from '../db';
import { HttpError } from '../errors';
import { gameColumns, loadOwnedGame, toGameDetail, toGameSummary } from './state';

type CreateGameBody = z.output<typeof CreateGameRequestSchema>;

/** Graine aléatoire générée côté serveur quand le joueur n'en fournit pas. */
export function randomSeed(): string {
  return randomBytes(12).toString('base64url');
}

export async function listGames(db: Database, userId: string): Promise<GameSummary[]> {
  const games = await db.game.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return games.map(toGameSummary);
}

export async function getGame(db: Database, userId: string, gameId: string): Promise<GameDetail> {
  return toGameDetail(await loadOwnedGame(db, userId, gameId));
}

export async function createNewGame(
  db: Database,
  userId: string,
  body: CreateGameBody,
): Promise<GameDetail> {
  const seed = body.seed ?? randomSeed();
  let initial: GameState;
  try {
    initial = createGame(
      { seed, mode: body.mode, difficulty: body.difficulty, startDate: body.startDate },
      getRuleset(CURRENT_RULESET_KEY),
    );
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
        ...gameColumns(state, stateHash),
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
  return toGameDetail({ game, state, stateHash });
}
