// Qualité adaptative des scènes 3D (phase 26). Trois paliers, choisis d'après l'appareil au
// lancement ou forcés dans les Paramètres ; le repli 2D reste le dernier recours. Rien ici ne
// dépend de three.js : ce module est chargé avec l'application, les scènes ne le sont qu'à la
// demande.

export const PALIERS = ['eleve', 'standard', 'eco'] as const;
export type Palier = (typeof PALIERS)[number];
/** Choix de l'utilisateur : automatique, un palier forcé, ou jamais de 3D. */
export type ChoixQualite = 'auto' | Palier | '2d';

export type ReglagesPalier = {
  libelle: string;
  aide: string;
  /** Plafond du rapport de pixels du canevas. */
  pixelRatioMax: number;
  /** Bloom, vignette et grain (soirée électorale, victoire). */
  postTraitement: boolean;
  antialias: boolean;
  /** Spectateurs d'une salle pleine (meeting). */
  fouleMax: number;
  /** Confettis de la victoire (0 : aucun). */
  confettis: number;
  /** Onde lumineuse du dépouillement depuis les préfectures. */
  vague: boolean;
  /** Particules par arc de report de voix. */
  particulesArc: number;
};

export const REGLAGES: Record<Palier, ReglagesPalier> = {
  eleve: {
    libelle: 'Élevé',
    aide: 'Tous les effets, foule complète, image fine.',
    pixelRatioMax: 2,
    postTraitement: true,
    antialias: true,
    fouleMax: 6000,
    confettis: 1600,
    vague: true,
    particulesArc: 90,
  },
  standard: {
    libelle: 'Standard',
    aide: 'Effets de lumière, foule moyenne : le réglage d’un téléphone récent.',
    pixelRatioMax: 1.5,
    postTraitement: true,
    antialias: true,
    fouleMax: 3000,
    confettis: 700,
    vague: true,
    particulesArc: 50,
  },
  eco: {
    libelle: 'Éco',
    aide: 'Sans effets de lumière, foule réduite, image allégée : ménage la batterie.',
    pixelRatioMax: 1,
    postTraitement: false,
    antialias: false,
    fouleMax: 800,
    confettis: 0,
    vague: false,
    particulesArc: 16,
  },
};

export type Appareil = {
  /** Rapport de pixels de l'écran. */
  dpr: number;
  /** Cœurs logiques (`navigator.hardwareConcurrency`), si connus. */
  coeurs: number | null;
  /** Mémoire vive en Go (`navigator.deviceMemory`), si connue. */
  memoire: number | null;
  /** Nom du processeur graphique (WEBGL_debug_renderer_info), si lisible. */
  gpu: string | null;
};

/** Rendu logiciel : pas de vraie accélération, la 3D n'y est pas proposée d'office. */
export const GPU_LOGICIEL = /swiftshader|llvmpipe|software|basic render/i;
const GPU_MODESTE =
  /mali-(4|t[0-9])|mali-g(3[0-9]|5[0-2])|adreno \(?tm\)? ?(3|4|50|51)[0-9]|powervr|videocore|intel.*(hd graphics [2-5]|gma)/i;
const GPU_PUISSANT =
  /nvidia|geforce|rtx|radeon|apple (m[0-9]|gpu)|adreno \(?tm\)? ?(7[3-9]|8)[0-9]|mali-g(7[1-9]|[89])[0-9]*|immortalis|xclipse 9|iris xe|arc/i;

/**
 * Palier conseillé pour un appareil : « éco » pour un processeur graphique modeste ou peu de
 * mémoire, « élevé » pour un processeur graphique puissant, « standard » sinon (un téléphone de
 * milieu de gamme récent, Mali-G68 et 6 Go par exemple).
 */
export function detecterPalier(appareil: Appareil): Palier {
  const { gpu, coeurs, memoire } = appareil;
  if (gpu && (GPU_LOGICIEL.test(gpu) || GPU_MODESTE.test(gpu))) return 'eco';
  if ((memoire !== null && memoire <= 3) || (coeurs !== null && coeurs <= 4)) return 'eco';
  if (gpu && GPU_PUISSANT.test(gpu) && (memoire === null || memoire >= 6)) return 'eleve';
  return 'standard';
}

/** Palier au-dessous (null : il ne reste que le repli 2D). */
export function palierInferieur(palier: Palier): Palier | null {
  return palier === 'eleve' ? 'standard' : palier === 'standard' ? 'eco' : null;
}

export type Decision3D =
  | { mode: '3d'; palier: Palier; force: boolean }
  | { mode: '2d'; raison: 'choix' | 'mouvement-reduit' | 'webgl' | 'performances' };

/**
 * Faut-il la scène 3D ou son repli 2D ? Le choix forcé d'un palier est respecté tel quel ; en
 * automatique, le palier détecté peut être abaissé en cours de partie (images par seconde trop
 * basses), jusqu'au repli 2D.
 */
export function decider(input: {
  choix: ChoixQualite;
  mouvementReduit: boolean;
  webgl: boolean;
  detecte: Palier;
  /** Abaissement décidé en cours de session par la garde d'images par seconde. */
  abaisse: Palier | '2d' | null;
}): Decision3D {
  if (input.choix === '2d') return { mode: '2d', raison: 'choix' };
  if (input.mouvementReduit) return { mode: '2d', raison: 'mouvement-reduit' };
  if (!input.webgl) return { mode: '2d', raison: 'webgl' };
  if (input.choix !== 'auto') return { mode: '3d', palier: input.choix, force: true };
  if (input.abaisse === '2d') return { mode: '2d', raison: 'performances' };
  return { mode: '3d', palier: input.abaisse ?? input.detecte, force: false };
}

/**
 * Garde d'images par seconde : nourrie à chaque image, elle signale « abaisser » quand la
 * moyenne reste sous le seuil pendant toute la durée d'observation (les premières images, où
 * les shaders se compilent, sont ignorées).
 */
export function creerGardeFps({ seuil = 30, dureeMs = 3000, graceMs = 1500 } = {}) {
  let ecoule = 0;
  let fenetre = 0;
  let images = 0;
  let moyenne = 60;
  return {
    /** Durée de l'image écoulée, en millisecondes. Renvoie vrai s'il faut abaisser la qualité. */
    image(deltaMs: number): boolean {
      // Un onglet revenu au premier plan rend une image très longue : elle ne compte pas.
      if (deltaMs > 1000) return false;
      ecoule += deltaMs;
      if (ecoule < graceMs) return false;
      fenetre += deltaMs;
      images += 1;
      if (fenetre < dureeMs) return false;
      moyenne = (images * 1000) / fenetre;
      fenetre = 0;
      images = 0;
      return moyenne < seuil;
    },
    get fps() {
      return moyenne;
    },
    reinitialiser() {
      ecoule = 0;
      fenetre = 0;
      images = 0;
    },
  };
}
