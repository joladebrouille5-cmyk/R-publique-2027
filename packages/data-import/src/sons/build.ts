import { FREE_LICENSES, MusicTrackSchema, type MusicTrack } from '@r2027/shared';
import { parseAuthor, parseLicenses, type CommonsLicense } from '../personnalites/commons';
import { FADE_OUT_SECONDS, LOUDNESS, MP3_KBPS, type MusicSelection } from './selection';

// Fonctions pures de l'import de la musique (phase 19) : lecture des mesures de ffmpeg et de
// ffprobe, filtres de normalisation, texte des modifications, fiche du manifeste.

/** Mesures du premier passage du filtre `loudnorm` de ffmpeg (sortie JSON). */
export type LoudnormMeasure = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

/** Dernier objet JSON écrit par `loudnorm` sur la sortie d'erreur de ffmpeg. */
export function parseLoudnorm(stderr: string): LoudnormMeasure {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start)
    throw new Error('mesure de sonie introuvable dans la sortie de ffmpeg');
  const parsed = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormMeasure>;
  const keys = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'] as const;
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value !== 'string' || !Number.isFinite(Number(value)))
      throw new Error(`mesure de sonie invalide : ${key} = ${String(value)}`);
  }
  return parsed as LoudnormMeasure;
}

/** Licence sans condition : domaine public ou CC0. */
const UNCONDITIONAL = /^(CC0( 1\.0)?|Public domain|Domaine public)$/i;

/**
 * Licence d'un enregistrement (phase 21). Une page de Commons licencie souvent à part l'œuvre
 * (« For the Original Composition » : domaine public) et l'interprétation (« For the
 * Performance » : CC BY-SA…). C'est la licence à conditions qui s'applique au fichier : elle
 * l'emporte sur le domaine public de la partition. Sans licence à conditions, le domaine public ou
 * CC0 suffit. Si les seules licences à conditions ne sont pas libres, le morceau est refusé.
 */
export function recordingLicense(html: string): CommonsLicense | { refus: string } {
  const licenses = parseLicenses(html);
  if (licenses.length === 0) return { refus: 'aucune licence lisible sur la page du fichier' };
  const conditional = licenses.filter((l) => !UNCONDITIONAL.test(l.licence));
  const pool = conditional.length > 0 ? conditional : licenses;
  const free = pool.find((l) => FREE_LICENSES.test(l.licence));
  if (!free)
    return {
      refus: `licence de l’enregistrement non reconnue comme libre (${pool.map((l) => l.licence).join(', ')})`,
    };
  const auteur = parseAuthor(html);
  if (!auteur) return { refus: 'auteur non indiqué sur la page du fichier' };
  return { ...free, auteur };
}

/**
 * Nom de l'auteur tel que le crédit l'affiche : le modèle « Creator » de Commons fait suivre le
 * nom des années de vie (« Kevin MacLeod (1972–) »), qui ne font pas partie de l'attribution ; le
 * champ « Composition: … Performance: … » d'un enregistrement est rendu en français.
 */
export function creditedAuthor(author: string): string {
  const name = author.replace(/\s*\(\d{4}\s*[–-]\s*(\d{4})?\)\s*$/, '').trim();
  // Enregistrement d'une œuvre ancienne : Commons sépare, en anglais, compositeur et interprète.
  const split = /^Compos(?:ition|er):\s*(.+?)\s+Perform(?:ance|er):\s*(.+)$/.exec(name);
  return split ? `${split[1]!.trim()} (composition), ${split[2]!.trim()} (interprétation)` : name;
}

/** Durée de l'extrait : le morceau entier, ou au plus `extraitMax` secondes. */
export function extractSeconds(originalSeconds: number, extraitMax: number | null): number {
  return extraitMax === null ? originalSeconds : Math.min(originalSeconds, extraitMax);
}

const loudnormBase = `loudnorm=I=${LOUDNESS.lufs}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.range}`;

/** Filtre du premier passage (mesure seulement). */
export const MEASURE_FILTER = `${loudnormBase}:print_format=json`;

/**
 * Filtre du second passage : normalisation linéaire d'après la mesure, fondu de sortie si le
 * morceau est coupé, rééchantillonnage à 44,1 kHz (`loudnorm` travaille à 192 kHz).
 */
export function encodeFilter(measure: LoudnormMeasure, seconds: number, trimmed: boolean): string {
  const normalize =
    `${loudnormBase}:measured_I=${measure.input_i}:measured_TP=${measure.input_tp}` +
    `:measured_LRA=${measure.input_lra}:measured_thresh=${measure.input_thresh}` +
    `:offset=${measure.target_offset}:linear=true:print_format=summary`;
  const fade = trimmed
    ? `,afade=t=out:st=${(seconds - FADE_OUT_SECONDS).toFixed(3)}:d=${FADE_OUT_SECONDS}`
    : '';
  return `${normalize}${fade},aresample=44100`;
}

/** Durée (secondes) lue dans la sortie JSON de `ffprobe -show_format`. */
export function parseFfprobeDuration(json: string): number {
  const duration = Number(
    (JSON.parse(json) as { format?: { duration?: string } }).format?.duration,
  );
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('durée illisible (ffprobe)');
  return duration;
}

/** Modifications apportées à l'œuvre, déclarées dans les crédits (exigence de la licence CC BY). */
export function modificationsText(originalSeconds: number, seconds: number): string {
  const trimmed = seconds < originalSeconds - 0.5;
  const parts = [
    trimmed
      ? `extrait des ${Math.round(seconds)} premières secondes (sur ${Math.round(originalSeconds)}), fondu de sortie de ${FADE_OUT_SECONDS} s`
      : 'morceau entier',
    `volume normalisé (EBU R128, ${String(LOUDNESS.lufs).replace('-', '−')} LUFS)`,
    `réencodé en MP3 ${MP3_KBPS} kbit/s stéréo`,
  ];
  return `${parts.join(', ')}.`;
}

/** Fiche d'un morceau du manifeste, validée par le schéma partagé. */
export function buildTrack(input: {
  selection: MusicSelection;
  auteur: string;
  licence: string;
  licenceUrl: string | null;
  source: string;
  original: { url: string; sha256: string; octets: number; dureeSecondes: number };
  output: { sha256: string; octets: number; dureeSecondes: number };
}): MusicTrack {
  const { selection, original, output } = input;
  return MusicTrackSchema.parse({
    id: selection.id,
    titre: selection.titre,
    auteur: creditedAuthor(input.auteur),
    ambiance: selection.ambiance,
    fichier: `sons/${selection.id}.mp3`,
    dureeSecondes: Math.round(output.dureeSecondes * 1000) / 1000,
    octets: output.octets,
    sha256: output.sha256,
    licence: input.licence,
    licenceUrl: input.licenceUrl,
    source: input.source,
    original: { ...original, dureeSecondes: Math.round(original.dureeSecondes * 1000) / 1000 },
    modifications: modificationsText(original.dureeSecondes, output.dureeSecondes),
  });
}
