import { z } from 'zod';

// Photo d'un candidat personnalisé (phase 13) : image choisie par le joueur à la création de la
// partie, recadrée et réduite sur son appareil, puis conservée dans l'état de la partie (export
// et import compris). Le serveur, comme le moteur local, contrôle le type annoncé, la taille et
// la signature du fichier : une image d'un autre type, ou un contenu qui n'est pas une image,
// est refusé.

/** Côté du carré produit par l'interface (pixels). */
export const CANDIDATE_PHOTO_SIZE = 256;
/** Longueur maximale de l'URL de données (≈ 100 Ko d'image). */
export const CANDIDATE_PHOTO_MAX_LENGTH = 140_000;
export const CANDIDATE_PHOTO_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type CandidatePhotoType = (typeof CANDIDATE_PHOTO_TYPES)[number];

const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Premiers octets d'un contenu base64 (au plus `count`), sans dépendre de l'environnement. */
function leadingBytes(base64: string, count: number): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    if (char === '=' || bytes.length >= count) break;
    // Seuls les derniers bits non lus comptent : le tampon reste sur 16 bits.
    buffer = ((buffer << 6) | ALPHABET.indexOf(char)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

const startsWith = (bytes: readonly number[], expected: readonly number[], offset = 0) =>
  expected.every((b, i) => bytes[offset + i] === b);

/** La signature du fichier correspond-elle au type annoncé ? */
export function photoSignatureMatches(type: CandidatePhotoType, base64: string): boolean {
  const bytes = leadingBytes(base64, 12);
  switch (type) {
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      // « RIFF » … « WEBP »
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
  }
}

/** Analyse une URL de données d'image ; null si elle n'est pas acceptable. */
export function parsePhotoDataUrl(
  value: string,
): { type: CandidatePhotoType; base64: string } | null {
  if (value.length > CANDIDATE_PHOTO_MAX_LENGTH) return null;
  const match = DATA_URL.exec(value);
  if (!match) return null;
  const type = match[1] as CandidatePhotoType;
  const base64 = match[2]!;
  if (base64.length % 4 !== 0) return null;
  return photoSignatureMatches(type, base64) ? { type, base64 } : null;
}

export const CandidatePhotoSchema = z
  .string()
  .max(CANDIDATE_PHOTO_MAX_LENGTH, 'Photo trop lourde (100 Ko au plus après réduction)')
  .refine((value) => DATA_URL.test(value), {
    message: 'Photo attendue au format WebP, JPEG ou PNG (URL de données)',
  })
  .refine((value) => parsePhotoDataUrl(value) !== null, {
    message: 'Le contenu de la photo ne correspond pas à son type',
  });
export type CandidatePhoto = z.infer<typeof CandidatePhotoSchema>;

/**
 * Identité d'un candidat telle que la consigne le journal des événements : la photo n'y est pas
 * recopiée (elle reste dans l'état de la partie), seule sa présence est notée.
 */
export function candidateForJournal<T extends { photo: string | null }>(
  candidate: T,
): Omit<T, 'photo'> & { photo: boolean } {
  const { photo, ...rest } = candidate;
  return { ...rest, photo: photo !== null };
}
