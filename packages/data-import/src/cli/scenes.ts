// Import des actifs photographiques des scènes 3D (phase 26) : `pnpm data:scenes`.
// Sources : Poly Haven (polyhaven.com), textures de matériaux et éclairages par environnement dans
// le domaine public (CC0 1.0), nom et auteurs lus dans la fiche de chaque actif ; Wikimedia
// Commons, photographies de lieux réels, licence libre et auteur lus sur la page de chaque fichier
// (une photographie sans licence libre est refusée). Réseau requis (api.polyhaven.com,
// dl.polyhaven.org, commons.wikimedia.org, upload.wikimedia.org) ; ImageMagick (`convert`) requis.
// Copies brutes : data/raw/scenes (jamais commitées). Sorties commitées :
// apps/web/public/scenes3d/ et apps/web/src/scenes3d/actifs.json. Décor seulement : le jeu de
// règles ne change pas.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SceneAssetsSchema,
  type SceneLighting,
  type SceneMaterial,
  type ScenePlate,
} from '@r2027/shared';
import { commonsPageUrl, freeLicense, originalUrl } from '../personnalites/commons';
import { authorsText, sizeMeters } from '../scenes/build';
import {
  LIGHTING_SELECTION,
  MATERIAL_SELECTION,
  PLATE_SELECTION,
  TEXTURE_PX,
  type LightingSelection,
  type MaterialSelection,
  type PlateSelection,
} from '../scenes/selection';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RAW = join(ROOT, 'data/raw/scenes');
const PUBLIC = join(ROOT, 'apps/web/public');
const OUT_JSON = join(ROOT, 'apps/web/src/scenes3d/actifs.json');

/** En-tête : nom de l'outil seulement (aucune donnée personnelle). */
const HEADERS = { 'user-agent': 'republique-2027-import/1.0' };
const CC0 = {
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
} as const;

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** Fichier brut, téléchargé une fois puis relu. */
async function brut(url: string, path: string): Promise<string> {
  if (existsSync(path) && statSync(path).size > 0) return path;
  mkdirSync(dirname(path), { recursive: true });
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

function convert(args: string[]): string {
  const run = spawnSync('convert', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`convert a échoué : ${run.stderr.slice(-400)}`);
  return `${run.stdout}${run.stderr}`;
}

type Info = { name: string; authors: Record<string, string>; dimensions?: number[] };
type Fichier = { url: string };
type TextureFiles = Record<'Diffuse' | 'nor_gl' | 'arm', Record<string, { jpg: Fichier }>>;
type HdriFiles = { hdri: Record<string, { hdr: Fichier }> };

const taille = (fichier: string) => statSync(join(PUBLIC, fichier)).size;

async function importMaterial(selection: MaterialSelection): Promise<SceneMaterial> {
  console.log(`matière ${selection.id} ← ${selection.actif}`);
  const info = await json<Info>(`https://api.polyhaven.com/info/${selection.actif}`);
  const files = await json<TextureFiles>(`https://api.polyhaven.com/files/${selection.actif}`);
  const source = (carte: keyof TextureFiles) =>
    brut(files[carte]['1k']!.jpg.url, join(RAW, selection.actif, `${carte}.jpg`));
  const sortie = (carte: string) => `scenes3d/textures/${selection.id}-${carte}.webp`;
  const reduire = ['-resize', `${TEXTURE_PX}x${TEXTURE_PX}`, '-strip'];
  const couleur = await source('Diffuse');
  if (selection.neutre) {
    // Gris clair de même luminosité moyenne d'un import à l'autre : la scène donne la teinte.
    const moyenne = Number(
      convert([couleur, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:']),
    );
    convert([
      couleur,
      ...reduire,
      '-colorspace',
      'Gray',
      '-evaluate',
      'Multiply',
      (0.8 / moyenne).toFixed(4),
      '-quality',
      '82',
      join(PUBLIC, sortie('couleur')),
    ]);
  } else convert([couleur, ...reduire, '-quality', '82', join(PUBLIC, sortie('couleur'))]);
  convert([await source('nor_gl'), ...reduire, '-quality', '90', join(PUBLIC, sortie('normale'))]);
  // Carte « arm » de Poly Haven : occlusion, rugosité, métal ; seule la rugosité (vert) est gardée.
  convert([
    await source('arm'),
    ...reduire,
    '-channel',
    'G',
    '-separate',
    '-quality',
    '82',
    join(PUBLIC, sortie('rugosite')),
  ]);
  return {
    id: selection.id,
    titre: info.name,
    auteurs: authorsText(info.authors),
    ...CC0,
    source: `https://polyhaven.com/a/${selection.actif}`,
    modifications: `Cartes de couleur, de relief et de rugosité réduites à ${TEXTURE_PX} px et converties en WebP${selection.neutre ? ' ; couleur ramenée au gris (la scène la teinte)' : ''}.`,
    octets: taille(sortie('couleur')) + taille(sortie('normale')) + taille(sortie('rugosite')),
    tailleM: sizeMeters(info.dimensions),
    couleur: sortie('couleur'),
    normale: sortie('normale'),
    rugosite: sortie('rugosite'),
  };
}

async function importLighting(selection: LightingSelection): Promise<SceneLighting> {
  console.log(`éclairage ${selection.id} ← ${selection.actif}`);
  const info = await json<Info>(`https://api.polyhaven.com/info/${selection.actif}`);
  const files = await json<HdriFiles>(`https://api.polyhaven.com/files/${selection.actif}`);
  const fichier = `scenes3d/hdri/${selection.id}.hdr`;
  copyFileSync(
    await brut(files.hdri['1k']!.hdr.url, join(RAW, selection.actif, 'env.hdr')),
    join(PUBLIC, fichier),
  );
  return {
    id: selection.id,
    titre: info.name,
    auteurs: authorsText(info.authors),
    ...CC0,
    source: `https://polyhaven.com/a/${selection.actif}`,
    modifications: 'Image à grande dynamique de 1024 px, inchangée.',
    octets: taille(fichier),
    fichier,
  };
}

async function importPlate(selection: PlateSelection): Promise<ScenePlate> {
  console.log(`plan ${selection.id} ← ${selection.fichier}`);
  const source = commonsPageUrl(selection.fichier);
  const page = await fetch(source, { headers: HEADERS });
  if (!page.ok) throw new Error(`${source} : HTTP ${page.status}`);
  const licence = freeLicense(await page.text());
  if ('refus' in licence) throw new Error(`${selection.fichier} : ${licence.refus}`);
  const original = await brut(
    originalUrl(selection.fichier),
    join(RAW, 'plans', `${selection.id}.jpg`),
  );
  const fichier = `scenes3d/plans/${selection.id}.webp`;
  convert([
    original,
    '-auto-orient',
    '-resize',
    `${selection.largeurPx}x`,
    '-strip',
    '-quality',
    '86',
    join(PUBLIC, fichier),
  ]);
  const [largeur, hauteur] = convert([join(PUBLIC, fichier), '-format', '%w %h', 'info:'])
    .trim()
    .split(' ')
    .map(Number);
  return {
    id: selection.id,
    titre: selection.titre,
    auteur: licence.auteur,
    licence: licence.licence,
    licenceUrl: licence.licenceUrl,
    source,
    modifications: `Réduite à ${selection.largeurPx} px de large et convertie en WebP ; dans le jeu, recadrée selon l’écran, remise en perspective (la caméra avance dans la cour), drapeau animé, tapis rouge ajouté.`,
    octets: taille(fichier),
    fichier,
    largeur: largeur!,
    hauteur: hauteur!,
    repere: selection.repere,
    drapeaux: selection.drapeaux,
  };
}

async function main() {
  if (spawnSync('convert', ['-version']).status !== 0)
    throw new Error('ImageMagick (convert) est requis par pnpm data:scenes.');
  for (const dossier of ['textures', 'hdri', 'plans']) {
    rmSync(join(PUBLIC, 'scenes3d', dossier), { recursive: true, force: true });
    mkdirSync(join(PUBLIC, 'scenes3d', dossier), { recursive: true });
  }
  const matieres: SceneMaterial[] = [];
  for (const selection of MATERIAL_SELECTION) matieres.push(await importMaterial(selection));
  const eclairages: SceneLighting[] = [];
  for (const selection of LIGHTING_SELECTION) eclairages.push(await importLighting(selection));
  const plans: ScenePlate[] = [];
  for (const selection of PLATE_SELECTION) plans.push(await importPlate(selection));
  const manifest = SceneAssetsSchema.parse({
    verifieLe: new Date().toISOString().slice(0, 10),
    note: 'Scènes 3D : textures de matériaux et éclairages par environnement de Poly Haven (polyhaven.com), dans le domaine public (CC0 1.0), nom et auteurs lus dans la fiche de chaque actif ; photographies de lieux réels de Wikimedia Commons, licence et auteur lus sur la page de chaque fichier, modifications déclarées. Import par pnpm data:scenes. Les autres décors (salles, plateau, foules) sont construits par le jeu : aucun modèle 3D n’est emprunté, aucune personne réelle n’est représentée.',
    matieres,
    eclairages,
    plans,
  });
  writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = [...matieres, ...eclairages, ...plans].reduce((n, a) => n + a.octets, 0);
  console.log(
    `${matieres.length} matières, ${eclairages.length} éclairages, ${plans.length} plans, ${(total / 1e6).toFixed(1)} Mo → ${OUT_JSON}`,
  );
}

await main();
