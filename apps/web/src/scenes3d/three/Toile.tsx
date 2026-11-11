import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useQualiteStore } from '../../stores/qualite';
import { creerGardeFps, REGLAGES, type Palier } from '../qualite';

// Toile commune des scènes 3D (phase 26) : canevas au palier de qualité décidé, rendu arrêté
// quand la scène n'est pas visible, garde d'images par seconde (palier abaissé, puis repli 2D) et
// post-traitement sélectif (bloom, vignette, grain) aux paliers qui le permettent.

export type Mesure = {
  fps: number;
  /** Appels de dessin et triangles de la dernière image. */
  appels: number;
  triangles: number;
  palier: Palier;
  [cle: string]: unknown;
};

declare global {
  interface Window {
    /** Mesures des scènes à l'écran (images par seconde, appels de dessin), lues par les essais. */
    __r2027Scenes?: Record<string, Mesure>;
  }
}

/** Ajoute des valeurs à la mesure d'une scène (nombre d'instances, objets à sonder). */
export function tracer(nom: string, valeurs: Record<string, unknown>) {
  const scenes = (window.__r2027Scenes ??= {});
  scenes[nom] = { fps: 0, appels: 0, triangles: 0, palier: 'standard', ...scenes[nom], ...valeurs };
}

function GardeFps({ nom, palier }: { nom: string; palier: Palier }) {
  const gl = useThree((s) => s.gl);
  const garde = useMemo(() => creerGardeFps(), []);
  useEffect(() => {
    gl.info.autoReset = false;
    const perdu = () => useQualiteStore.setState({ abaisse: '2d' });
    gl.domElement.addEventListener('webglcontextlost', perdu);
    tracer(nom, { palier });
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', perdu);
      delete window.__r2027Scenes?.[nom];
    };
  }, [gl, nom, palier]);
  // Priorité négative : avant le rendu, sans le prendre en charge. Les compteurs lus sont ceux de
  // l'image précédente, toutes passes comprises.
  useFrame((_, delta) => {
    tracer(nom, { appels: gl.info.render.calls, triangles: gl.info.render.triangles });
    gl.info.reset();
    const abaisser = garde.image(delta * 1000);
    tracer(nom, { fps: garde.fps });
    // Un palier forcé dans les Paramètres est respecté ; sinon, palier inférieur puis repli 2D.
    if (abaisser && useQualiteStore.getState().choix === 'auto')
      useQualiteStore.getState().abaisser(palier);
  }, -1);
  return null;
}

const VIGNETTE_GRAIN = {
  uniforms: { tDiffuse: { value: null }, uTemps: { value: 0 }, uGrain: { value: 0.05 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTemps; uniform float uGrain; varying vec2 vUv;
    float alea(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= mix(1.0, 0.42, smoothstep(0.25, 0.85, dot(d, d) * 2.0));
      c.rgb += (alea(vUv * 913.0 + fract(uTemps) * 17.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

/** Bloom léger, vignette et grain « soirée télévisée ». */
function PostTraitement({ palier, bloom }: { palier: Palier; bloom: number }) {
  const { gl, scene, camera, size } = useThree();
  const { composer, grain } = useMemo(() => {
    const cible = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: palier === 'eleve' ? 4 : 0,
    });
    const composer = new EffectComposer(gl, cible);
    composer.addPass(new RenderPass(scene, camera));
    // Bloom calculé à demi-résolution : seuls les points lumineux (préfectures, halos) débordent.
    composer.addPass(new UnrealBloomPass(new Vector2(256, 256), bloom, 0.6, 0.82));
    const grain = new ShaderPass(VIGNETTE_GRAIN);
    composer.addPass(grain);
    composer.addPass(new OutputPass());
    return { composer, grain };
  }, [gl, scene, camera, palier, bloom]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((state) => {
    grain.uniforms.uTemps!.value = state.clock.elapsedTime;
    composer.render();
  }, 1);
  return null;
}

export function Toile({
  nom,
  palier,
  visible,
  camera,
  post = false,
  bloom = 0.55,
  fond,
  children,
}: {
  nom: string;
  palier: Palier;
  visible: boolean;
  camera: { position: [number, number, number]; fov?: number; near?: number; far?: number };
  /** Post-traitement demandé par la scène (appliqué seulement si le palier le permet). */
  post?: boolean;
  bloom?: number;
  /** Couleur de fond (transparente par défaut : le décor HTML se voit derrière). */
  fond?: string;
  children: ReactNode;
}) {
  const reglages = REGLAGES[palier];
  return (
    <Canvas
      aria-hidden="true"
      className="!absolute inset-0"
      frameloop={visible ? 'always' : 'never'}
      dpr={Math.min(window.devicePixelRatio || 1, reglages.pixelRatioMax)}
      gl={{ antialias: reglages.antialias, alpha: !fond, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.1, far: 4000, ...camera }}
    >
      {fond && <color attach="background" args={[fond]} />}
      <GardeFps nom={nom} palier={palier} />
      {children}
      {post && reglages.postTraitement && <PostTraitement palier={palier} bloom={bloom} />}
    </Canvas>
  );
}

/** Rapproche `actuel` de `cible` avec un amortissement indépendant de la cadence. */
export const amortir = (actuel: number, cible: number, vitesse: number, delta: number) =>
  actuel + (cible - actuel) * (1 - Math.exp(-vitesse * delta));
