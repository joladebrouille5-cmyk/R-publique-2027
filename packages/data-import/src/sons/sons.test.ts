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
  recordingLicense,
} from './build';
import { FADE_OUT_SECONDS, LOUDNESS, MUSIC_SELECTION } from './selection';

// Phase 19 : fonctions pures de l'import de la musique (aucun accès réseau ni appel à ffmpeg).

/** Fin de sortie réelle de ffmpeg 6 avec `loudnorm=…:print_format=json`. */
const STDERR = `Input #0, mp3, from 'orient-et-occident.mp3':
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

/** Bloc de licence tel que Commons l'affiche (classes `licensetpl`). */
const licence = (short: string, link?: string) =>
  `<div class="layouttemplate licensetpl">${link ? `<span class="licensetpl&#95;link">${link}</span>` : ''}<span class="licensetpl&#95;short" style="display:none;">${short}</span></div>`;
const page = (author: string, ...licences: string[]) =>
  `<table><tr><td id="fileinfotpl&#95;aut" class="fileinfo-paramfield">Author</td><td>${author}</td></tr></table>${licences.join('')}`;
const PD_MARK = 'https://creativecommons.org/publicdomain/mark/1.0/';

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
    expect(
      creditedAuthor('Composition: Camille Saint-Saëns Performance: United States Marine Band'),
    ).toBe('Camille Saint-Saëns (composition), United States Marine Band (interprétation)');
    expect(creditedAuthor('Composer: Erik Satie Performer: La Pianista')).toBe(
      'Erik Satie (composition), La Pianista (interprétation)',
    );
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
      id: 'orient-et-occident',
      fichier: 'sons/orient-et-occident.mp3',
      dureeSecondes: 150.024,
      original: { dureeSecondes: 286.067 },
    });
    expect(() => buildTrack({ ...input, licence: 'Tous droits réservés' })).toThrow();
  });

  it('applique à un enregistrement la licence de l’interprétation, pas celle de la partition', () => {
    // Partition dans le domaine public, interprétation sous CC BY-SA 3.0 ou GFDL (cas réel de
    // Commons) : le fichier est sous CC BY-SA 3.0, jamais « domaine public ».
    const piano = page(
      'Composer: Erik Satie Performer: La Pianista',
      licence('Public domain', PD_MARK),
      licence('CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0'),
      licence('GFDL', 'http://www.gnu.org/copyleft/fdl.html'),
    );
    expect(recordingLicense(piano)).toEqual({
      licence: 'CC BY-SA 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      auteur: 'Composer: Erik Satie Performer: La Pianista',
    });
    // Partition et interprétation dans le domaine public (orchestre d'une administration).
    const fanfare = page(
      'Composition: Camille Saint-Saëns Performance: United States Marine Band',
      licence('Public domain', PD_MARK),
      licence('Public domain'),
    );
    expect(recordingLicense(fanfare)).toMatchObject({
      licence: 'Public domain',
      licenceUrl: PD_MARK,
    });
    // Interprétation sous licence non libre : refus, même si la partition est libre.
    expect(
      recordingLicense(
        page('Orchestre', licence('Public domain'), licence('Tous droits réservés')),
      ),
    ).toEqual({
      refus: 'licence de l’enregistrement non reconnue comme libre (Tous droits réservés)',
    });
    expect(recordingLicense(page('Scott Buckley', licence('CC BY 4.0')))).toMatchObject({
      licence: 'CC BY 4.0',
      auteur: 'Scott Buckley',
    });
    expect(recordingLicense('<p>sans licence</p>')).toEqual({
      refus: 'aucune licence lisible sur la page du fichier',
    });
    expect(recordingLicense(licence('CC0'))).toEqual({
      refus: 'auteur non indiqué sur la page du fichier',
    });
  });

  it('couvre chaque ambiance avec des morceaux distincts', () => {
    const ids = MUSIC_SELECTION.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ambiance of AMBIANCES)
      expect(MUSIC_SELECTION.some((m) => m.ambiance === ambiance)).toBe(true);
    for (const m of MUSIC_SELECTION) expect(m.fichier).toMatch(/\.(mp3|ogg|oga)$/);
  });
});
