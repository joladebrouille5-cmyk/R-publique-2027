import type {
  CreateSaveRequestSchema,
  GameDetail,
  GameState,
  RestoreSaveRequestSchema,
  SaveSummary,
} from '@r2027/shared';
import type { z } from 'zod';
import { fromIsoDate, type Database } from '../db';
import { conflict, notFound } from '../errors';
import type { Prisma } from '../generated/prisma/client';
import {
  findOwnedGame,
  gameColumns,
  loadOwnedGame,
  readStoredState,
  toGameDetail,
  toSaveSummary,
} from './state';

type CreateSaveBody = z.output<typeof CreateSaveRequestSchema>;
type RestoreSaveBody = z.output<typeof RestoreSaveRequestSchema>;

/** Nombre de sauvegardes automatiques hebdomadaires conservées par partie (§12). */
export const AUTO_SAVE_RETENTION = 8;

export function saveColumns(state: GameState, stateHash: string) {
  return {
    week: state.meta.week,
    date: fromIsoDate(state.meta.date),
    state,
    stateHash,
    engineVersion: state.meta.engineVersion,
    saveSchemaVersion: state.meta.saveSchemaVersion,
  };
}

/** Sauvegarde automatique hebdomadaire, en ne gardant que les plus récentes. */
export async function writeAutoSave(
  tx: Prisma.TransactionClient,
  gameId: string,
  state: GameState,
  stateHash: string,
): Promise<string> {
  const save = await tx.gameSave.create({
    data: { gameId, kind: 'auto', slot: null, label: null, ...saveColumns(state, stateHash) },
  });
  const stale = await tx.gameSave.findMany({
    where: { gameId, kind: 'auto' },
    orderBy: [{ createdAt: 'desc' }, { week: 'desc' }],
    skip: AUTO_SAVE_RETENTION,
    select: { id: true },
  });
  if (stale.length) await tx.gameSave.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  return save.id;
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
  const { state, stateHash } = await loadOwnedGame(db, userId, gameId);

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
        ...saveColumns(state, stateHash),
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
  const { game } = await loadOwnedGame(db, userId, gameId);
  const save = await db.gameSave.findFirst({ where: { id: saveId, gameId } });
  if (!save) throw notFound('Sauvegarde introuvable');
  if (body.expectedVersion !== undefined && body.expectedVersion !== game.version) {
    throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps : rechargez-la.');
  }
  // Une sauvegarde d'un ancien format est migrée à la restauration.
  const { state, stateHash, migratedFrom } = readStoredState(
    save.state,
    save.stateHash,
    save.saveSchemaVersion,
    `sauvegarde ${save.id}`,
  );

  const restored = await db.$transaction(async (tx) => {
    // Verrou optimiste : la mise à jour échoue si une autre écriture est passée entre-temps.
    const { count } = await tx.game.updateMany({
      where: { id: gameId, version: game.version },
      data: { ...gameColumns(state, stateHash), version: { increment: 1 } },
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
        payload: {
          saveId: save.id,
          slot: save.slot,
          kind: save.kind,
          fromWeek: game.week,
          migratedFrom,
        },
      },
    });
    return tx.game.findUniqueOrThrow({ where: { id: gameId } });
  });
  return toGameDetail({ game: restored, state, stateHash });
}
