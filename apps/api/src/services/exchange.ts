import { buildExport, readExport, SaveFormatError } from '@r2027/save-engine';
import type { ExportDocument, GameDetail } from '@r2027/shared';
import type { Database } from '../db';
import { HttpError } from '../errors';
import { saveColumns } from './saves';
import { gameColumns, loadOwnedGame, toGameDetail } from './state';

const IMPORT_SUFFIX = ' (importée)';

/** Nom de fichier ASCII sûr : « republique-2027-ma-partie-semaine-3.json ». */
function fileName(name: string, week: number): string {
  const slug =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'partie';
  return `republique-2027-${slug}-semaine-${week}.json`;
}

export async function exportGame(
  db: Database,
  userId: string,
  gameId: string,
): Promise<{ fileName: string; document: ExportDocument }> {
  const { game, state, stateHash } = await loadOwnedGame(db, userId, gameId);
  return {
    fileName: fileName(game.name, state.meta.week),
    document: buildExport({
      name: game.name,
      state,
      stateHash,
      exportedAt: new Date().toISOString(),
    }),
  };
}

/**
 * Importe un fichier d'export dans une NOUVELLE partie : aucune partie existante n'est jamais
 * écrasée. Le fichier est entièrement vérifié avant toute écriture (§12).
 */
export async function importGame(
  db: Database,
  userId: string,
  document: unknown,
): Promise<GameDetail> {
  let read;
  try {
    read = readExport(document);
  } catch (error) {
    if (error instanceof SaveFormatError) {
      throw new HttpError(422, error.code, error.message, error.details);
    }
    throw error;
  }
  const { state, stateHash, migratedFrom } = read;
  const name = `${read.name.slice(0, 80 - IMPORT_SUFFIX.length)}${IMPORT_SUFFIX}`;

  const game = await db.$transaction(async (tx) => {
    const created = await tx.game.create({
      data: {
        userId,
        name,
        mode: state.player.mode,
        difficulty: state.meta.difficulty,
        seed: state.meta.seed,
        ...gameColumns(state, stateHash),
      },
    });
    await tx.gameSave.create({
      data: {
        gameId: created.id,
        kind: 'import',
        label: 'État importé',
        ...saveColumns(state, stateHash),
      },
    });
    await tx.gameEvent.create({
      data: {
        gameId: created.id,
        week: state.meta.week,
        type: 'partie_importee',
        nature: 'systeme',
        payload: { originalName: read.name, migratedFrom, stateHash },
      },
    });
    return created;
  });
  return toGameDetail({ game, state, stateHash });
}
