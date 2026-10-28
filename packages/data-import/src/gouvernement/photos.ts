// Photos des figures du gouvernement (phase 14) : candidates dans l'ordre (photo choisie à la
// main après revue visuelle, photos de Wikidata P18 au rang préféré puis normal, fichiers de la
// catégorie Commons P373 dont le titre porte le nom de la personne), licence et auteur lus dans
// les métadonnées de Wikimedia Commons (API `imageinfo`, champs `extmetadata` tirés des modèles
// de licence de la page du fichier). Seule une licence libre reconnue est retenue. Fonctions
// pures ; les requêtes sont faites par `pnpm data:gouvernement`.
import { FREE_LICENSES } from '@r2027/shared';
import { decodeHtml, type CommonsLicense } from '../personnalites/commons';

const IMAGE = /\.(jpe?g|png|webp)$/i;
/** Titre qui annonce plusieurs personnes (« A et B », « A with B ») : écarté d'office. */
const SEVERAL = /\b(and|et|with|avec|und)\b|&/i;
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const latestYear = (title: string) =>
  Math.max(0, ...[...title.matchAll(/(?<!\d)(?:19|20)\d\d(?!\d)/g)].map((m) => Number(m[0])));

/**
 * Fichiers d'une catégorie Commons retenus comme candidats : images (JPEG, PNG, WebP) dont le
 * titre porte le nom de la personne et n'annonce pas plusieurs personnes ; année la plus récente
 * du titre d'abord, puis ordre alphabétique ; au plus `max`.
 */
export function categoryCandidates(files: string[], nom: string, max = 6): string[] {
  const name = fold(nom);
  return files
    .map((f) => f.replace(/^(File|Fichier):/, ''))
    .filter((f) => IMAGE.test(f) && fold(f).includes(name) && !SEVERAL.test(f.replace(IMAGE, '')))
    .sort((a, b) => latestYear(b) - latestYear(a) || a.localeCompare(b))
    .slice(0, max);
}

/** Métadonnées d'un fichier de Commons (API `imageinfo`). */
export type ImageInfo = {
  /** Titre réel du fichier, sans le préfixe « File: » (après redirection). */
  fichier: string;
  mime: string;
  largeur: number;
  /** Original sur upload.wikimedia.org. */
  url: string;
  /** Vignette de 500 pixels de large sur upload.wikimedia.org, ou null si l'original est plus petit. */
  vignette: string | null;
  licence: string | null;
  licenceUrl: string | null;
  auteur: string | null;
};

type ApiImagePage = {
  title: string;
  missing?: boolean;
  imageinfo?: {
    mime: string;
    width: number;
    url: string;
    thumburl?: string;
    thumbwidth?: number;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
};

/**
 * Adresse servie par upload.wikimedia.org : l'API renvoie parfois l'hôte des vignettes
 * (thumb.wikimedia.org), au même chemin ; les paramètres de suivi (`utm_…`) sont retirés.
 */
export function uploadUrl(url: string): string {
  const u = new URL(url);
  return `https://upload.wikimedia.org${u.pathname}`;
}

/**
 * Réponse de l'API `action=query&prop=imageinfo` (formatversion 2) → métadonnées par fichier
 * demandé (titre sans « File: »), titres normalisés et redirections suivis.
 */
export function parseImageInfo(json: string, requested: string[]): Map<string, ImageInfo> {
  const data = JSON.parse(json) as {
    query?: {
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
      pages?: ApiImagePage[];
    };
  };
  const normalized = new Map(data.query?.normalized?.map((n) => [n.from, n.to]));
  const redirects = new Map(data.query?.redirects?.map((r) => [r.from, r.to]));
  const pages = new Map(data.query?.pages?.map((p) => [p.title, p]));
  const result = new Map<string, ImageInfo>();
  for (const file of requested) {
    const asked = `File:${file}`;
    const title = normalized.get(asked) ?? asked;
    const page = pages.get(redirects.get(title) ?? title);
    const info = page?.imageinfo?.[0];
    if (!page || page.missing || !info) continue;
    const meta = (key: string) => {
      const value = info.extmetadata?.[key]?.value;
      const text = value === undefined ? '' : decodeHtml(value);
      return text.length > 0 ? text : null;
    };
    result.set(file, {
      fichier: page.title.replace(/^File:/, ''),
      mime: info.mime,
      largeur: info.width,
      url: uploadUrl(info.url),
      vignette:
        info.thumburl && info.thumbwidth !== undefined && info.thumbwidth < info.width
          ? uploadUrl(info.thumburl)
          : null,
      licence: meta('LicenseShortName'),
      licenceUrl: meta('LicenseUrl'),
      auteur: meta('Artist'),
    });
  }
  return result;
}

/** Formats acceptés et largeur minimale d'une photo (portrait lisible en avatar). */
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const LARGEUR_MIN = 150;

/** Licence libre et auteur d'un fichier, ou motif du refus. */
export function imageLicense(info: ImageInfo): CommonsLicense | { refus: string } {
  if (!MIMES.has(info.mime)) return { refus: `format non retenu (${info.mime})` };
  if (info.largeur < LARGEUR_MIN)
    return { refus: `image trop petite (${info.largeur} pixels de large)` };
  if (!info.licence) return { refus: 'aucune licence lisible dans les métadonnées du fichier' };
  if (!FREE_LICENSES.test(info.licence))
    return { refus: `licence non reconnue comme libre (${info.licence})` };
  if (!info.auteur) return { refus: 'auteur non indiqué dans les métadonnées du fichier' };
  return { licence: info.licence, licenceUrl: info.licenceUrl, auteur: info.auteur };
}

/** Candidate à la photo d'une figure, avec l'origine qui en motive le choix. */
export type PhotoCandidate = {
  fichier: string;
  origine: 'main' | 'wikidata' | 'categorie';
  /** Motif d'un choix à la main (revue visuelle), consigné dans le crédit. */
  motif?: string;
};

/** Candidates dans l'ordre d'essai : choix à la main, Wikidata (P18), catégorie Commons. */
export function photoCandidates(
  manual: { fichier: string; motif: string } | undefined,
  images: string[],
  category: string[],
): PhotoCandidate[] {
  const seen = new Set<string>();
  const list: PhotoCandidate[] = [];
  const add = (candidate: PhotoCandidate) => {
    if (seen.has(candidate.fichier)) return;
    seen.add(candidate.fichier);
    list.push(candidate);
  };
  if (manual) add({ fichier: manual.fichier, origine: 'main', motif: manual.motif });
  for (const fichier of images) add({ fichier, origine: 'wikidata' });
  for (const fichier of category) add({ fichier, origine: 'categorie' });
  return list;
}

/**
 * Première candidate acceptée (licence libre, auteur, format, taille) et motif du choix quand ce
 * n'est pas la première photo de Wikidata ; sinon motif du refus de toutes les candidates.
 */
export function choosePhoto(
  candidates: PhotoCandidate[],
  infos: Map<string, ImageInfo>,
  categorie: string | null,
):
  | { candidate: PhotoCandidate; info: ImageInfo; licence: CommonsLicense; choix: string | null }
  | { refus: string } {
  const refused: string[] = [];
  for (const candidate of candidates) {
    const info = infos.get(candidate.fichier);
    if (!info) {
      refused.push(`${candidate.fichier} : fichier introuvable sur Wikimedia Commons`);
      continue;
    }
    const licence = imageLicense(info);
    if ('refus' in licence) {
      refused.push(`${candidate.fichier} : ${licence.refus}`);
      continue;
    }
    const before = refused.length ? ` ; écartées avant elle : ${refused.join(' ; ')}` : '';
    const choix =
      candidate.origine === 'main'
        ? `Choisie à la main après revue visuelle : ${candidate.motif}${before}.`
        : candidate.origine === 'categorie'
          ? `Fichier de la catégorie Commons « ${categorie} »${refused.length ? '' : ' (aucune photo dans Wikidata)'}${before}.`
          : refused.length
            ? `Autre photo de Wikidata (P18)${before}.`
            : null;
    return { candidate, info, licence, choix };
  }
  return {
    refus: refused.length
      ? refused.join(' ; ')
      : 'aucune photo dans Wikidata ni dans la catégorie Commons de la personne',
  };
}
