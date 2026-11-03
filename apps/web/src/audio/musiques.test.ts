import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMBIANCES, FREE_LICENSES } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { MUSIC } from './manifest';

// Phase 19 : la musique embarquée est exactement celle du manifeste produit par `pnpm data:sons`
// (même empreinte, même taille), sous licence libre, créditée et sourcée.

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../public');

describe('musique embarquée', () => {
  it('correspond octet pour octet aux fichiers commités, sans fichier en trop', () => {
    for (const track of MUSIC.morceaux) {
      const data = readFileSync(join(PUBLIC, track.fichier));
      expect(data.length, track.id).toBe(track.octets);
      expect(createHash('sha256').update(data).digest('hex'), track.id).toBe(track.sha256);
    }
    expect(readdirSync(join(PUBLIC, 'sons')).sort()).toEqual(
      MUSIC.morceaux.map((t) => t.fichier.slice('sons/'.length)).sort(),
    );
    // Taille raisonnable pour l'application Android.
    expect(MUSIC.morceaux.reduce((n, t) => n + t.octets, 0)).toBeLessThan(10_000_000);
  });

  it('est sous licence libre, créditée, sourcée sur Commons, avec ses modifications déclarées', () => {
    for (const track of MUSIC.morceaux) {
      expect(track.licence).toMatch(FREE_LICENSES);
      expect(track.auteur).toBe('Kevin MacLeod');
      expect(track.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(track.original.url).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
      expect(track.modifications).toMatch(/volume normalisé.*MP3/);
      expect(track.dureeSecondes).toBeLessThanOrEqual(track.original.dureeSecondes + 0.2);
    }
    for (const ambiance of AMBIANCES)
      expect(MUSIC.morceaux.some((t) => t.ambiance === ambiance)).toBe(true);
  });
});
