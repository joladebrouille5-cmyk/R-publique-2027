import {
  CANDIDATE_PHOTO_MAX_LENGTH,
  CANDIDATE_PHOTO_SIZE,
  CANDIDATE_PHOTO_TYPES,
  parsePhotoDataUrl,
} from '@r2027/shared';

// Photo du candidat personnalisé (phase 13) : recadrée en carré et réduite sur l'appareil
// (256 × 256 px), encodée en WebP (JPEG si le navigateur ne sait pas l'écrire), puis contrôlée
// avec la règle du serveur avant l'envoi. Rien ne quitte l'appareil avant la création de la
// partie ; la photo est ensuite conservée avec elle.

/** Taille maximale du fichier choisi, avant réduction. */
export const PHOTO_FILE_MAX_BYTES = 15 * 1024 * 1024;

export class PhotoError extends Error {
  override name = 'PhotoError';
}

/**
 * Carré à découper dans l'image : le plus grand possible, centré horizontalement et placé vers
 * le haut (le visage d'un portrait s'y trouve le plus souvent).
 */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) * 0.25),
    side,
  };
}

/** Image décodée (bitmap si possible, sinon élément image). */
async function decode(
  file: File,
): Promise<{ image: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Prépare la photo choisie : URL de données acceptée par le serveur, ou erreur expliquée. */
export async function preparePhoto(file: File): Promise<string> {
  if (!(CANDIDATE_PHOTO_TYPES as readonly string[]).includes(file.type))
    throw new PhotoError('Choisissez une image JPEG, PNG ou WebP.');
  if (file.size > PHOTO_FILE_MAX_BYTES)
    throw new PhotoError('Image trop volumineuse : 15 Mo au plus avant réduction.');
  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    throw new PhotoError('Cette image ne peut pas être lue : choisissez-en une autre.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = CANDIDATE_PHOTO_SIZE;
  canvas.height = CANDIDATE_PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('Votre navigateur ne permet pas de préparer la photo.');
  const { sx, sy, side } = squareCrop(decoded.width, decoded.height);
  context.drawImage(
    decoded.image,
    sx,
    sy,
    side,
    side,
    0,
    0,
    CANDIDATE_PHOTO_SIZE,
    CANDIDATE_PHOTO_SIZE,
  );
  for (const type of ['image/webp', 'image/jpeg'])
    for (const quality of [0.86, 0.74, 0.6, 0.45]) {
      const url = canvas.toDataURL(type, quality);
      // Un navigateur qui ne sait pas écrire le WebP rend du PNG : on passe au JPEG.
      if (!url.startsWith(`data:${type};`)) break;
      if (url.length <= CANDIDATE_PHOTO_MAX_LENGTH && parsePhotoDataUrl(url)) return url;
    }
  throw new PhotoError('Impossible de réduire cette image sous 100 Ko : choisissez-en une autre.');
}
