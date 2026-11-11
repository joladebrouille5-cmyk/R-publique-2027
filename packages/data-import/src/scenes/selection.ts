import type { SceneLightingId, SceneMaterialId, ScenePlate } from '@r2027/shared';

// Actifs photographiques des scènes 3D (phase 26) : textures et éclairages choisis chez Poly
// Haven (polyhaven.com), tous dans le domaine public (CC0). Les auteurs ne sont pas recopiés ici :
// l'importeur les lit dans la fiche de chaque actif.

export type MaterialSelection = {
  id: SceneMaterialId;
  /** Identifiant de l'actif chez Poly Haven. */
  actif: string;
  /**
   * Couleur ramenée au gris clair : le velours prend ensuite la teinte que la scène lui donne
   * (rouge des gradins et du tapis, couleur de chaque groupe pour les fauteuils).
   */
  neutre?: true;
};

export const MATERIAL_SELECTION: readonly MaterialSelection[] = [
  { id: 'bois', actif: 'oak_veneer_01' },
  { id: 'parquet', actif: 'herringbone_parquet' },
  { id: 'pierre', actif: 'marble_01' },
  { id: 'velours', actif: 'velour_velvet', neutre: true },
  { id: 'beton', actif: 'gravel_concrete_03' },
];

export type LightingSelection = { id: SceneLightingId; actif: string };

export const LIGHTING_SELECTION: readonly LightingSelection[] = [
  { id: 'salle', actif: 'dancing_hall' },
  { id: 'studio', actif: 'studio_small_09' },
];

/** Côté des textures importées, en pixels. */
export const TEXTURE_PX = 1024;

export type PlateSelection = Pick<ScenePlate, 'id' | 'titre' | 'repere' | 'drapeaux'> & {
  /** Nom du fichier sur Wikimedia Commons (sans le préfixe « File: »). */
  fichier: string;
  /** Largeur de l'image importée, en pixels. */
  largeurPx: number;
};

/**
 * Plans photographiques : la licence et l'auteur ne sont pas recopiés ici, l'importeur les lit sur
 * la page du fichier et refuse une photographie sans licence libre. Les repères sont lus à la main
 * sur l'image (estimations) : ils servent à remettre la photographie en perspective, rien d'autre.
 */
export const PLATE_SELECTION: readonly PlateSelection[] = [
  {
    id: 'elysee',
    fichier: "Cour de l'Elysée 3.JPG",
    titre: 'Cour d’honneur du palais de l’Élysée, façade du corps de logis',
    largeurPx: 1600,
    // Canon PowerShot S3 IS à 6 mm, cadré en hauteur : focale ≈ 1,4 largeur d'image. Horizon à
    // hauteur d'œil sur la façade ; pied de la façade au bas du perron.
    repere: { focale: 1.4, horizon: 0.692, pied: 0.741, oeilM: 1.6 },
    drapeaux: [{ x: 0.455, y: 0.105, largeur: 0.045, hauteur: 0.062, mat: 'droite' }],
  },
];
