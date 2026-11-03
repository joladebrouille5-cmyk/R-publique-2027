import { AMBIANCES } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import {
  buildTrack,
  creditedAuthor,
  encodeFilter,
  extractSeconds,
  MEASURE_FILTER,
  modificationsText,
  parseFfprobeDuration,
  parseLoudnorm,
} from './build';
import { FADE_OUT_SECONDS, LOUDNESS, MUSIC_SELECTION } from './selection';

// Phase 19 : fonctions pures de l'import de la musique (aucun accès réseau ni appel à ffmpeg).

/** Fin de sortie réelle de ffmpeg 6 avec `loudnorm=…:print_format=json`. */
const STDERR = `Input #0, mp3, from 'inspired.mp3':
  Duration: 00:04:46.07, start: 0.025057, bitrate: 256 kb/s
[Parsed_loudnorm_0 @ 0x55d0c7a8a6c0]
{
	"input_i" : "-14.32",
	"input_tp" : "-0.41",
	"input_lra" : "7.80",
	"input_thresh" : "-24.55",
	"output_i" : "-18.03",
	"output_tp" : "-3.92",
	"output_lra" : "7.10",
	"output_thresh" : "-28.24",
	"normalization_type" : "dynamic",
	"target_offset" : "0.03"
}
`;

const measure = parseLoudnorm(STDERR);

describe('import de la musique (phase 19)', () => {
  it('lit la mesure de sonie de ffmpeg et refuse une sortie sans mesure', () => {
    expect(measure).toMatchObject({
      input_i: '-14.32',
      input_tp: '-0.41',
      input_lra: '7.80',
      input_thresh: '-24.55',
      target_offset: '0.03',
    });
    expect(() => parseLoudnorm('Input #0, mp3')).toThrow(/introuvable/);
    expect(() => parseLoudnorm('{ "input_i" : "inf" }')).toThrow(/invalide/);
  });

  it('normalise d’après la mesure et ne coupe en fondu qu’un extrait', () => {
    expect(MEASURE_FILTER).toBe(
      `loudnorm=I=${LOUDNESS.lufs}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.range}:print_format=json`,
    );
    const trimmed = encodeFilter(measure, 150, true);
    expect(trimmed).toContain('measured_I=-14.32:measured_TP=-0.41');
    expect(trimmed).toContain(':linear=true');
    expect(trimmed).toContain(`afade=t=out:st=${(150 - FADE_OUT_SECONDS).toFixed(3)}`);
    expect(trimmed.endsWith(',aresample=44100')).toBe(true);
    expect(encodeFilter(measure, 93.5, false)).not.toContain('afade');
  });

  it('borne l’extrait et lit la durée donnée par ffprobe', () => {
    expect(extractSeconds(286.07, 150)).toBe(150);
    expect(extractSeconds(93.5, 150)).toBe(93.5);
    expect(extractSeconds(93.5, null)).toBe(93.5);
    expect(parseFfprobeDuration('{"format":{"duration":"149.995102"}}')).toBeCloseTo(149.995, 3);
    expect(() => parseFfprobeDuration('{"format":{}}')).toThrow(/illisible/);
  });

  it('déclare chaque modification de l’œuvre, comme l’exige la licence CC BY', () => {
    expect(modificationsText(286.07, 150)).toBe(
      `extrait des 150 premières secondes (sur 286), fondu de sortie de ${FADE_OUT_SECONDS} s, volume normalisé (EBU R128, −18 LUFS), réencodé en MP3 96 kbit/s stéréo.`,
    );
    expect(modificationsText(93.5, 93.4)).toMatch(/^morceau entier, volume normalisé/);
  });

  it('crédite l’auteur sans les années de vie ajoutées par le modèle « Creator »', () => {
    expect(creditedAuthor('Kevin MacLeod (1972–)')).toBe('Kevin MacLeod');
    expect(creditedAuthor('Kevin MacLeod')).toBe('Kevin MacLeod');
    expect(creditedAuthor('Erik Satie (1866–1925)')).toBe('Erik Satie');
    expect(creditedAuthor('Orchestre (2004) live')).toBe('Orchestre (2004) live');
  });

  it('valide la fiche du manifeste et refuse une licence non libre', () => {
    const input = {
      selection: MUSIC_SELECTION[0]!,
      auteur: 'Kevin MacLeod',
      licence: 'CC BY 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Inspired_(ISRC_USUAN1600022).mp3',
      original: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Inspired.mp3',
        sha256: 'a'.repeat(64),
        octets: 9_156_393,
        dureeSecondes: 286.06696875,
      },
      output: { sha256: 'b'.repeat(64), octets: 1_800_000, dureeSecondes: 150.0237 },
    };
    expect(buildTrack(input)).toMatchObject({
      id: 'inspired',
      fichier: 'sons/inspired.mp3',
      dureeSecondes: 150.024,
      original: { dureeSecondes: 286.067 },
    });
    expect(() => buildTrack({ ...input, licence: 'Tous droits réservés' })).toThrow();
  });

  it('couvre chaque ambiance avec des morceaux distincts', () => {
    const ids = MUSIC_SELECTION.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ambiance of AMBIANCES)
      expect(MUSIC_SELECTION.some((m) => m.ambiance === ambiance)).toBe(true);
    for (const m of MUSIC_SELECTION) expect(m.fichier).toMatch(/\.(mp3|ogg|oga)$/);
  });
});
