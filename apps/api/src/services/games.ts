import { randomBytes } from 'node:crypto';
import { createGame, GameCreationError } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { snapshotState } from '@r2027/save-engine';
import {
  candidateForJournal,
  CreationRefusal,
  creationParameters,
  mayBeLocked,
  parisDate,
  type CreateGameRequestSchema,
  type GameDetail,
  type GameState,
  type GameSummary,
} from '@r2027/shared';
import type { z } from 'zod';
import type { Database } from '../db';
import { HttpError } from '../errors';
import { progressionOf } from './progression';
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
  request: CreateGameBody,
  now: Date = new Date(),
): Promise<GameDetail> {
  // Phase 20 : défi du jour (paramètres imposés), graine réservée, contenus verrouillés.
  const ruleset = getRuleset(CURRENT_RULESET_KEY);
  let body: CreateGameBody;
  const progression = mayBeLocked(request, ruleset.progression)
    ? await progressionOf(db, userId, now)
    : { deblocages: [] };
  try {
    body = creationParameters(request, ruleset.progression, parisDate(now), () => progression);
  } catch (error) {
    if (error instanceof CreationRefusal)
      throw new HttpError(error.status, error.code, error.message);
    throw error;
  }
  const seed = body.seed ?? randomSeed();
  let initial: GameState;
  try {
    initial = createGame(
      {
        seed,
        mode: body.mode,
        difficulty: body.difficulty,
        startDate: body.startDate,
        candidate: body.candidate,
        personnaliteId: body.personnaliteId,
        adversaires: body.adversaires,
        scenarioId: body.scenarioId,
        orientationId: body.orientationId,
        format: body.format,
        depart: body.depart,
      },
      ruleset,
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
        payload: {
          mode: body.mode,
          difficulty: body.difficulty,
          seed,
          adversaires: state.player.adversaires,
          scenario: state.scenario,
          orientation: state.player.orientation,
          defi: body.defi,
          startDate: state.meta.date,
          candidat: state.player.actorId
            ? candidateForJournal(state.actors[state.player.actorId]!.candidate)
            : null,
        },
      },
    });
    return created;
  });
  return toGameDetail({ game, state, stateHash });
}
