import {
  EXPORT_FORMAT,
  ExportDocumentSchema,
  type ExportDocument,
  type GameState,
} from '@r2027/shared';
import { z } from 'zod';
import { loadStoredState, SaveFormatError, type LoadedState } from './versions';

export function buildExport(input: {
  name: string;
  state: GameState;
  stateHash: string;
  exportedAt: string;
}): ExportDocument {
  const { state } = input;
  return {
    format: EXPORT_FORMAT,
    formatVersion: 1,
    exportedAt: input.exportedAt,
    name: input.name,
    mode: state.player.mode,
    difficulty: state.meta.difficulty,
    seed: state.meta.seed,
    engineVersion: state.meta.engineVersion,
    rulesetVersion: state.meta.rulesetVersion,
    saveSchemaVersion: state.meta.saveSchemaVersion,
    stateHash: input.stateHash,
    state,
  };
}

/**
 * Lit un fichier d'export : format, empreinte (avant migration), schéma de sa version,
 * migration, puis cohérence entre l'en-tête et l'état. Toute anomalie refuse le fichier.
 */
export function readExport(document: unknown): LoadedState & { name: string } {
  const parsed = ExportDocumentSchema.safeParse(document);
  if (!parsed.success) {
    throw new SaveFormatError(
      'format_inconnu',
      'Ce fichier n’est pas un export de partie RÉPUBLIQUE 2027 valide.',
      z.treeifyError(parsed.error),
    );
  }
  const header = parsed.data;
  const loaded = loadStoredState(header.state, header.stateHash, header.saveSchemaVersion);
  const { meta, player } = loaded.state;
  if (
    meta.seed !== header.seed ||
    meta.difficulty !== header.difficulty ||
    player.mode !== header.mode
  ) {
    throw new SaveFormatError(
      'incoherence',
      'L’en-tête du fichier ne correspond pas à l’état exporté.',
    );
  }
  return { ...loaded, name: header.name };
}
