import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { computeProgression, parisDate, type Progression } from '@r2027/shared';
import type { Database } from '../db';
import { readStoredState } from './state';

// Progression entre les parties (phase 20) : palmarès, niveau, déblocages et défi du jour,
// calculés à partir des parties du joueur (même fonction que le moteur local). La date du défi
// est celle de Paris, lue sur l'horloge du serveur.

/** Parties du joueur relues (empreinte, schéma, migration), réduites à la graine et à l'état. */
async function gamesOf(db: Database, userId: string) {
  const rows = await db.game.findMany({
    where: { userId },
    select: { id: true, seed: true, state: true, stateHash: true, saveSchemaVersion: true },
  });
  return rows.map((row) => ({
    seed: row.seed,
    state: readStoredState(row.state, row.stateHash, row.saveSchemaVersion, `partie ${row.id}`)
      .state,
  }));
}

export async function progressionOf(db: Database, userId: string, now: Date): Promise<Progression> {
  return computeProgression(
    await gamesOf(db, userId),
    getRuleset(CURRENT_RULESET_KEY),
    parisDate(now),
  );
}
