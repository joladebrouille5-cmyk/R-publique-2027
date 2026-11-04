import type { Ambiance, GamePhase, MusicTrack, RoundResult } from '@r2027/shared';
import type { Cue } from './jingles';

// Choix de la musique et des jingles (phase 19) : fonctions pures, testées sans navigateur.

/** Ambiance demandée par un écran : une musique, ou le silence (soirée électorale, débat). */
export type AmbianceRequest = Ambiance | 'silence';

/** Musique d'une partie selon sa phase : campagne jusqu'au second tour, mandat ensuite. */
export function ambianceForPhase(phase: GamePhase): Ambiance {
  return phase === 'campagne' || phase === 'entre_deux_tours' ? 'campagne' : 'mandat';
}

/**
 * Demandes des écrans affichés : la priorité la plus haute l'emporte (accueil 0, partie 1,
 * soirée ou débat 2) ; à priorité égale, la plus récente. Aucune demande : le silence.
 */
export type AmbianceEntry = { ambiance: AmbianceRequest; priorite: number; ordre: number };

export function resolveAmbiance(entries: Iterable<AmbianceEntry>): AmbianceRequest {
  let best: AmbianceEntry | null = null;
  for (const entry of entries)
    if (
      !best ||
      entry.priorite > best.priorite ||
      (entry.priorite === best.priorite && entry.ordre > best.ordre)
    )
      best = entry;
  return best?.ambiance ?? 'silence';
}

/** Morceaux d'une ambiance, dans l'ordre du manifeste ; le silence n'en a aucun. */
export function playlistFor(
  ambiance: AmbianceRequest,
  tracks: readonly MusicTrack[],
): MusicTrack[] {
  return ambiance === 'silence' ? [] : tracks.filter((t) => t.ambiance === ambiance);
}

/**
 * Jingle de la fin du dépouillement pour le candidat du joueur : victoire s'il est qualifié au
 * premier tour ou élu au second, défaite sinon ; rien en observateur.
 */
export function verdictCue(
  result: Pick<RoundResult, 'round' | 'qualified' | 'winner'>,
  playerId: string | null,
): Extract<Cue, 'victoire' | 'defaite'> | null {
  if (!playerId) return null;
  const won =
    result.round === 1
      ? result.qualified.includes(playerId) || result.winner === playerId
      : result.winner === playerId;
  return won ? 'victoire' : 'defaite';
}
