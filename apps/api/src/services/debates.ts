import { EngineInputError, inputErrorStatus, playDebate } from '@r2027/engine';
import { getRuleset } from '@r2027/rulesets';
import { snapshotState } from '@r2027/save-engine';
import type { DebateRequest, GameDetail } from '@r2027/shared';
import type { Database } from '../db';
import { conflict, HttpError } from '../errors';
import { gameColumns, loadOwnedGame, toGameDetail } from './state';

/**
 * Débat télévisé de la semaine (phase 10) : le moteur joue la demande du joueur (ouvrir,
 * refuser, jouer une carte, simuler la fin) et l'état est réenregistré sous verrou optimiste.
 * Rien n'est écrit si l'état n'a pas changé (ouverture d'un débat déjà programmé).
 */
export async function playGameDebate(
  db: Database,
  userId: string,
  gameId: string,
  debatId: string,
  request: DebateRequest,
): Promise<GameDetail> {
  const loaded = await loadOwnedGame(db, userId, gameId);
  let state;
  try {
    state = playDebate(
      loaded.state,
      getRuleset(loaded.state.meta.rulesetVersion),
      debatId,
      request,
    ).state;
  } catch (error) {
    if (error instanceof EngineInputError)
      throw new HttpError(inputErrorStatus(error.code), error.code, error.message);
    throw error;
  }
  const snapshot = snapshotState(state);
  if (snapshot.stateHash === loaded.stateHash) return toGameDetail(loaded);
  const { count } = await db.game.updateMany({
    where: { id: loaded.game.id, version: loaded.game.version },
    data: { ...gameColumns(snapshot.state, snapshot.stateHash), version: { increment: 1 } },
  });
  if (count !== 1) throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps.');
  const game = await db.game.findUniqueOrThrow({ where: { id: loaded.game.id } });
  return toGameDetail({ game, ...snapshot });
}
