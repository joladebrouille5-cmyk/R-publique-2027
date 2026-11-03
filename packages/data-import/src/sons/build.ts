import { MusicTrackSchema, type MusicTrack } from '@r2027/shared';
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

/**
 * Nom de l'auteur tel que le crédit l'affiche : le modèle « Creator » de Commons fait suivre le
 * nom des années de vie (« Kevin MacLeod (1972–) »), qui ne font pas partie de l'attribution.
 */
export function creditedAuthor(author: string): string {
  return author.replace(/\s*\(\d{4}\s*[–-]\s*(\d{4})?\)\s*$/, '').trim();
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
