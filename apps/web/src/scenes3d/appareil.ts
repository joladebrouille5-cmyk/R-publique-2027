import { useSyncExternalStore } from 'react';
import { useMediaQuery } from '../map/useMode';
import { useQualiteStore } from '../stores/qualite';
import { decider, detecterPalier, GPU_LOGICIEL, type Appareil, type Decision3D } from './qualite';

// Lecture de l'appareil (phase 26) : WebGL disponible, accéléré ou logiciel, palier conseillé.
// Sondé une seule fois, à la première scène ; le contexte d'essai est aussitôt rendu.

type Sonde = { webgl: boolean; logiciel: boolean; appareil: Appareil };

let sonde: Sonde | null = null;

function sonder(): Sonde {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const appareil: Appareil = {
    dpr: window.devicePixelRatio || 1,
    coeurs: nav.hardwareConcurrency ?? null,
    memoire: nav.deviceMemory ?? null,
    gpu: null,
  };
  // Sans WebGL déclaré (vieux navigateur, environnement d'essai) : inutile de créer un canevas.
  if (typeof WebGLRenderingContext === 'undefined')
    return { webgl: false, logiciel: false, appareil };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      WebGL2RenderingContext | WebGLRenderingContext | null;
    if (!gl) return { webgl: false, logiciel: false, appareil };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    appareil.gpu = String(
      info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl: true, logiciel: GPU_LOGICIEL.test(appareil.gpu), appareil };
  } catch {
    return { webgl: false, logiciel: false, appareil };
  }
}

export function lireAppareil(): Sonde {
  sonde ??= sonder();
  return sonde;
}

/** Pour les tests : oublie la sonde (WebGL simulé absent ou présent). */
export function oublierAppareil(): void {
  sonde = null;
}

const abonner = () => () => {};

/**
 * Scène 3D ou repli 2D, et à quel palier. En automatique, un rendu logiciel (sans accélération
 * matérielle) vaut WebGL indisponible ; un palier forcé dans les Paramètres passe outre.
 */
export function useDecision3D(): Decision3D {
  const choix = useQualiteStore((s) => s.choix);
  const abaisse = useQualiteStore((s) => s.abaisse);
  const mouvementReduit = useMediaQuery('(prefers-reduced-motion: reduce)');
  const lu = useSyncExternalStore(abonner, lireAppareil, () => null);
  if (!lu) return { mode: '2d', raison: 'webgl' };
  return decider({
    choix,
    mouvementReduit,
    webgl: lu.webgl && (choix !== 'auto' || !lu.logiciel),
    detecte: detecterPalier(lu.appareil),
    abaisse,
  });
}
