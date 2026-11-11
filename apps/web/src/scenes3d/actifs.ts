import {
  SceneAssetsSchema,
  type SceneLighting,
  type SceneLightingId,
  type SceneMaterial,
  type SceneMaterialId,
  type ScenePlate,
  type ScenePlateId,
} from '@r2027/shared';
import manifeste from './actifs.json';

// Actifs photographiques des scènes 3D (phase 26) : manifeste écrit par `pnpm data:scenes`
// (Poly Haven, domaine public). Sans three.js : ce module sert aussi aux crédits.

export const ACTIFS = SceneAssetsSchema.parse(manifeste);

export const MATIERES = Object.fromEntries(ACTIFS.matieres.map((m) => [m.id, m])) as Partial<
  Record<SceneMaterialId, SceneMaterial>
>;
export const ECLAIRAGES = Object.fromEntries(ACTIFS.eclairages.map((e) => [e.id, e])) as Partial<
  Record<SceneLightingId, SceneLighting>
>;

export const PLANS = Object.fromEntries(ACTIFS.plans.map((p) => [p.id, p])) as Partial<
  Record<ScenePlateId, ScenePlate>
>;

/** Adresse d'un fichier d'actif, servi avec l'application (aucune connexion). */
export const urlActif = (fichier: string) => `${import.meta.env.BASE_URL}${fichier}`;
