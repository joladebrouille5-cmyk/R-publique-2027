import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fichier `.env` à la racine du dépôt (jamais commité, modèle : `.env.example`). */
export const ROOT_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');

/** Charge `.env` s'il existe ; les variables déjà définies dans l'environnement priment. */
export function loadRootEnv(file = ROOT_ENV_FILE): void {
  if (existsSync(file)) process.loadEnvFile(file);
}
