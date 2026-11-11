import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

// Textures de matériaux fabriquées à l'ouverture de la scène (phase 26), sans aucun fichier :
// bois veiné, pierre de taille, velours, gravier, ardoise, toile. Chaque matière donne une
// couleur, un relief (carte de normales tirée de la hauteur) et une rugosité, pour un rendu
// physique : c'est le grain des matériaux qui fait le réalisme, pas la géométrie.

/** Bruit de valeur lissé, répétable sur `periode` (les textures se raccordent bord à bord). */
function bruit(periode: number, graine: number) {
  const table = new Float32Array(periode * periode);
  let etat = graine * 2654435761;
  for (let i = 0; i < table.length; i++) {
    etat = (Math.imul(etat ^ (etat >>> 15), 2246822519) + 3266489917) | 0;
    table[i] = ((etat >>> 0) % 65536) / 65536;
  }
  const lisse = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = lisse(x - x0);
    const fy = lisse(y - y0);
    const v = (i: number, j: number) =>
      table[
        (((j % periode) + periode) % periode) * periode + (((i % periode) + periode) % periode)
      ]!;
    return (
      v(x0, y0) * (1 - fx) * (1 - fy) +
      v(x0 + 1, y0) * fx * (1 - fy) +
      v(x0, y0 + 1) * (1 - fx) * fy +
      v(x0 + 1, y0 + 1) * fx * fy
    );
  };
}

/** Bruit fractal (somme d'octaves), répétable sur l'unité. */
function fractal(octaves: number, base: number, graine: number) {
  const couches = Array.from({ length: octaves }, (_, o) => bruit(base * 2 ** o, graine + o * 17));
  return (u: number, v: number) => {
    let somme = 0;
    let poids = 0;
    couches.forEach((couche, o) => {
      const p = 0.5 ** o;
      somme += couche(u * base * 2 ** o, v * base * 2 ** o) * p;
      poids += p;
    });
    return somme / poids;
  };
}

type Pixel = { r: number; g: number; b: number; hauteur: number; rugosite: number };
export type Matiere = { map: Texture; normalMap: Texture; roughnessMap: Texture };

function fabriquer(cote: number, relief: number, pixel: (u: number, v: number) => Pixel): Matiere {
  const toile = () => {
    const c = document.createElement('canvas');
    c.width = c.height = cote;
    return c;
  };
  const [cCouleur, cNormale, cRugosite] = [toile(), toile(), toile()];
  const hauteurs = new Float32Array(cote * cote);
  const couleur = new ImageData(cote, cote);
  const rugosite = new ImageData(cote, cote);
  for (let y = 0; y < cote; y++)
    for (let x = 0; x < cote; x++) {
      const p = pixel(x / cote, y / cote);
      const i = (y * cote + x) * 4;
      couleur.data.set([p.r * 255, p.g * 255, p.b * 255, 255], i);
      const r = Math.max(0, Math.min(1, p.rugosite)) * 255;
      rugosite.data.set([r, r, r, 255], i);
      hauteurs[y * cote + x] = p.hauteur;
    }
  // Carte de normales : pente de la hauteur entre pixels voisins (la texture se répète).
  const normale = new ImageData(cote, cote);
  const h = (x: number, y: number) => hauteurs[((y + cote) % cote) * cote + ((x + cote) % cote)]!;
  for (let y = 0; y < cote; y++)
    for (let x = 0; x < cote; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * relief;
      const dy = (h(x, y + 1) - h(x, y - 1)) * relief;
      const longueur = Math.hypot(dx, dy, 1);
      normale.data.set(
        [
          (-dx / longueur) * 127 + 128,
          (dy / longueur) * 127 + 128,
          (1 / longueur) * 127 + 128,
          255,
        ],
        (y * cote + x) * 4,
      );
    }
  cCouleur.getContext('2d')!.putImageData(couleur, 0, 0);
  cNormale.getContext('2d')!.putImageData(normale, 0, 0);
  cRugosite.getContext('2d')!.putImageData(rugosite, 0, 0);
  const texture = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const t = new CanvasTexture(canvas);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  return {
    map: texture(cCouleur, true),
    normalMap: texture(cNormale, false),
    roughnessMap: texture(cRugosite, false),
  };
}

const melange = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);

const RECETTES = {
  /** Chêne verni : cernes étirés dans le fil du bois, pores sombres. */
  bois(cote: number) {
    const large = fractal(4, 3, 11);
    const fin = fractal(3, 48, 23);
    return fabriquer(cote, 2.2, (u, v) => {
      const onde = large(u * 0.35, v * 2.2) * 9 + u * 1.5;
      const cerne = 0.5 + 0.5 * Math.sin(onde * 6.283);
      const pore = fin(u * 0.2, v * 3);
      const t = 0.55 * cerne + 0.45 * pore;
      const [r, g, b] = melange([0.2, 0.1, 0.05], [0.5, 0.29, 0.14], t);
      return {
        r: r!,
        g: g!,
        b: b!,
        hauteur: cerne * 0.5 + pore * 0.5,
        rugosite: 0.32 + 0.3 * pore,
      };
    });
  },
  /** Pierre de taille claire : grain fin, nuages de teinte, quelques veines. */
  pierre(cote: number) {
    const nuage = fractal(5, 3, 31);
    const grain = fractal(2, 96, 37);
    return fabriquer(cote, 3, (u, v) => {
      const n = nuage(u, v);
      const veine = Math.pow(1 - Math.abs(2 * nuage(u * 1.7 + 0.3, v * 1.7) - 1), 14);
      const g = grain(u, v);
      const t = 0.7 * n + 0.3 * g - 0.5 * veine;
      const [r, gg, b] = melange(
        [0.62, 0.57, 0.48],
        [0.9, 0.86, 0.77],
        Math.max(0, Math.min(1, t)),
      );
      return { r: r!, g: gg!, b: b!, hauteur: g * 0.7 + n * 0.3 - veine, rugosite: 0.72 + 0.2 * g };
    });
  },
  /** Velours : fibres couchées, teinte neutre (la couleur vient du matériau). */
  velours(cote: number) {
    const fibre = fractal(3, 64, 41);
    const pli = fractal(3, 4, 43);
    return fabriquer(cote, 4, (u, v) => {
      const f = fibre(u, v * 0.4);
      const p = pli(u, v);
      const t = 0.72 + 0.28 * (0.6 * f + 0.4 * p);
      return { r: t, g: t, b: t, hauteur: f, rugosite: 0.85 + 0.15 * f };
    });
  },
  /** Gravier de cour : petits cailloux clairs, joints sombres. */
  gravier(cote: number) {
    const caillou = fractal(2, 56, 53);
    const teinte = fractal(3, 6, 59);
    return fabriquer(cote, 6, (u, v) => {
      const c = caillou(u, v);
      const bosse = Math.pow(c, 1.6);
      const t = 0.35 + 0.65 * bosse;
      const [r, g, b] = melange(
        [0.52, 0.47, 0.38],
        [0.86, 0.8, 0.68],
        t * (0.8 + 0.2 * teinte(u, v)),
      );
      return { r: r!, g: g!, b: b!, hauteur: bosse, rugosite: 0.95 };
    });
  },
  /** Ardoise des toits : rangs d'écailles décalés, reflets bleutés. */
  ardoise(cote: number) {
    const tache = fractal(3, 12, 61);
    return fabriquer(cote, 5, (u, v) => {
      const rangs = 14;
      const rang = Math.floor(v * rangs);
      const x = (u * rangs * 0.6 + (rang % 2) * 0.5) % 1;
      const y = (v * rangs) % 1;
      const joint = Math.min(x, 1 - x) < 0.04 || y < 0.07 ? 0 : 1;
      const n = tache(u, v);
      const t = joint * (0.55 + 0.45 * n);
      const [r, g, b] = melange([0.1, 0.11, 0.14], [0.3, 0.33, 0.4], t);
      return { r: r!, g: g!, b: b!, hauteur: joint * (1 - y * 0.6), rugosite: 0.45 + 0.3 * n };
    });
  },
  /** Sol de béton ciré sombre (salle, plateau). */
  beton(cote: number) {
    const nuage = fractal(5, 4, 67);
    const grain = fractal(2, 128, 71);
    return fabriquer(cote, 1.5, (u, v) => {
      const t = 0.6 * nuage(u, v) + 0.4 * grain(u, v);
      const c = 0.06 + 0.09 * t;
      return {
        r: c,
        g: c * 1.02,
        b: c * 1.1,
        hauteur: grain(u, v),
        rugosite: 0.25 + 0.4 * nuage(u, v),
      };
    });
  },
} as const;

export type NomMatiere = keyof typeof RECETTES;
const cache = new Map<string, Matiere>();

/** Matière fabriquée une fois par taille, puis partagée entre les scènes (jamais libérée). */
export function matiere(nom: NomMatiere, cote: number): Matiere {
  const cle = `${nom}:${cote}`;
  let m = cache.get(cle);
  if (!m) {
    m = RECETTES[nom](cote);
    cache.set(cle, m);
  }
  return m;
}

/** La même matière, répétée `u` × `v` fois sur la surface (textures clonées, image partagée). */
export function repeter(m: Matiere, u: number, v: number): Matiere {
  const clone = (t: Texture) => {
    const c = t.clone();
    c.repeat.set(u, v);
    c.needsUpdate = true;
    return c;
  };
  return { map: clone(m.map), normalMap: clone(m.normalMap), roughnessMap: clone(m.roughnessMap) };
}
