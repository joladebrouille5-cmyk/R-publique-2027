import { EngineInputError, inputErrorStatus, playerSupportProspects } from '@r2027/engine';
import { getRuleset } from '@r2027/rulesets';
import type { SupportProspects } from '@r2027/shared';
import type { Database } from '../db';
import { HttpError } from '../errors';
import { loadOwnedGame } from './state';

/**
 * Vivier des négociations de soutien du candidat du joueur (phase 15), calculé par le moteur :
 * l'interface l'affiche sans rien recalculer. Refus (409) hors campagne ou sans candidat en lice.
 */
export async function gameSupports(
  db: Database,
  userId: string,
  gameId: string,
): Promise<SupportProspects> {
  const { state } = await loadOwnedGame(db, userId, gameId);
  try {
    return playerSupportProspects(state, getRuleset(state.meta.rulesetVersion));
  } catch (error) {
    if (error instanceof EngineInputError)
      throw new HttpError(inputErrorStatus(error.code), error.code, error.message);
    throw error;
  }
}
