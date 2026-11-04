import { describe, expect, it } from 'vitest';
import { CandidateIdentitySchema } from './politics';
import {
  CANDIDATE_PHOTO_MAX_LENGTH,
  CandidatePhotoSchema,
  parsePhotoDataUrl,
  photoSignatureMatches,
} from './portrait';

// Phase 13 : photo du candidat personnalisé, contrôlée par le serveur comme par le moteur local.

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encodage base64 de référence, par groupes de trois octets (sans dépendre de Node). */
function base64(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [18, 12, 6, 0].map((shift) => ALPHABET[(n >> shift) & 63]!);
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out.padEnd(Math.ceil(out.length / 4) * 4, '=');
}

/** Décodage de référence, par groupes de quatre caractères. */
function decode(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const group = text.slice(i, i + 4);
    const n = [...group].reduce((acc, c) => (acc << 6) | Math.max(0, ALPHABET.indexOf(c)), 0);
    const kept = 3 - (group.match(/=/g)?.length ?? 0);
    bytes.push(...[(n >> 16) & 255, (n >> 8) & 255, n & 255].slice(0, kept));
  }
  return bytes;
}
const dataUrl = (type: string, bytes: readonly number[]) =>
  `data:${type};base64,${base64([...bytes, 1, 2, 3, 4, 5, 6])}`;
const message = (value: unknown) => CandidatePhotoSchema.safeParse(value).error?.issues[0]?.message;

describe('photo du candidat (phase 13)', () => {
  it('accepte une image WebP, JPEG ou PNG dont la signature correspond au type annoncé', () => {
    for (const [type, bytes] of [
      ['image/png', PNG],
      ['image/jpeg', JPEG],
      ['image/webp', WEBP],
    ] as const) {
      const url = dataUrl(type, bytes);
      expect(parsePhotoDataUrl(url)).toMatchObject({ type });
      expect(CandidatePhotoSchema.safeParse(url).success).toBe(true);
    }
  });

  it('refuse un contenu qui ne correspond pas à son type, un autre format ou une image trop lourde', () => {
    expect(message(dataUrl('image/png', JPEG))).toBe(
      'Le contenu de la photo ne correspond pas à son type',
    );
    expect(
      message(dataUrl('image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49])),
    ).toBe('Le contenu de la photo ne correspond pas à son type');
    for (const other of ['image/gif', 'image/svg+xml', 'text/html'])
      expect(message(dataUrl(other, PNG))).toBe(
        'Photo attendue au format WebP, JPEG ou PNG (URL de données)',
      );
    expect(message('https://exemple.fr/photo.png')).toBe(
      'Photo attendue au format WebP, JPEG ou PNG (URL de données)',
    );
    const heavy = `data:image/png;base64,${base64(PNG)}${'A'.repeat(CANDIDATE_PHOTO_MAX_LENGTH)}`;
    expect(message(heavy)).toBe('Photo trop lourde (100 Ko au plus après réduction)');
    expect(parsePhotoDataUrl(heavy)).toBeNull();
    // Base64 tronqué : longueur qui n'est pas un multiple de quatre.
    expect(parsePhotoDataUrl(`data:image/png;base64,${base64(PNG)}A`)).toBeNull();
  });

  it('la signature lue sans dépendance concorde avec un décodage de référence (500 contenus)', () => {
    // Générateur congruentiel : contenus variés, reproductibles.
    let seed = 2027;
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648);
    for (let n = 0; n < 500; n++) {
      const bytes = Array.from({ length: next() % 25 }, () => next() % 256);
      const content = n % 2 === 0 ? [...PNG.slice(0, next() % (PNG.length + 1)), ...bytes] : bytes;
      const decoded = decode(base64(content));
      expect(decoded).toEqual(content);
      // Signature PNG : les huit premiers octets.
      const expected = PNG.slice(0, 8).every((b, i) => decoded[i] === b);
      expect(photoSignatureMatches('image/png', base64(content))).toBe(expected);
    }
  });

  it('seul un candidat personnalisé porte une photo', () => {
    const identity = {
      prenom: 'Camille',
      nom: 'Test',
      parti: 'Parti du test',
      positionnement: { economie: 0, societe: 0 },
      parcours: '',
      profilId: null,
      nature: 'personnalise' as const,
      personnaliteId: null,
      photo: dataUrl('image/png', PNG),
    };
    expect(CandidateIdentitySchema.safeParse(identity).success).toBe(true);
    expect(CandidateIdentitySchema.safeParse({ ...identity, photo: null }).success).toBe(true);
    expect(CandidateIdentitySchema.safeParse({ ...identity, nature: 'fictif' }).success).toBe(
      false,
    );
  });
});
