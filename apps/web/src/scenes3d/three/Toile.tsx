import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PCFSoftShadowMap,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SceneLightingId } from '@r2027/shared';
import { useQualiteStore } from '../../stores/qualite';
import { ECLAIRAGES, urlActif } from '../actifs';
import { creerGardeFps, REGLAGES, type Palier } from '../qualite';

// Toile commune des scènes 3D (phase 26) : canevas au palier de qualité décidé, rendu arrêté
// quand la scène n'est pas visible, garde d'images par seconde (palier abaissé, puis repli 2D).
// Rendu réaliste : matériaux physiques éclairés par un environnement (reflets), ombres douces,
// courbe de tons « cinéma » (ACES), puis post-traitement — profondeur de champ, bloom, vignette et
// grain — aux paliers qui le permettent.

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

/** Distance de mise au point demandée par chaque scène (profondeur de champ). */
const miseAuPoint = new Map<string, number>();
export const mettreAuPoint = (nom: string, distance: number) => miseAuPoint.set(nom, distance);

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
      miseAuPoint.delete(nom);
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

/**
 * Éclairage par environnement, que tous les matériaux physiques reflètent (bois verni, velours,
 * verre, métal). Aux paliers « standard » et « élevé », une photographie à grande dynamique d'un
 * vrai lieu (salle, studio) ; en attendant son chargement, au palier « éco » ou si le
 * fichier manque, une pièce aux grands panneaux lumineux calculée par le jeu.
 */
function Environnement({
  intensite,
  eclairage,
  palier,
}: {
  intensite: number;
  eclairage: SceneLightingId | undefined;
  palier: Palier;
}) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    let courant = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    let actif = true;
    scene.environment = courant;
    const photo = eclairage && REGLAGES[palier].textures >= 512 ? ECLAIRAGES[eclairage] : undefined;
    if (photo) {
      new HDRLoader().load(
        urlActif(photo.fichier),
        (image) => {
          image.mapping = EquirectangularReflectionMapping;
          if (actif) {
            const env = pmrem.fromEquirectangular(image).texture;
            courant.dispose();
            courant = env;
            scene.environment = env;
            tracer(`${eclairage}`, { eclairage: 'photographie' });
          }
          image.dispose();
        },
        undefined,
        () => {},
      );
    }
    return () => {
      actif = false;
      scene.environment = null;
      courant.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, eclairage, palier]);
  useEffect(() => {
    scene.environmentIntensity = intensite;
  }, [scene, intensite]);
  return null;
}

const VIGNETTE_GRAIN = {
  uniforms: {
    tDiffuse: { value: null },
    uTemps: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTemps; uniform float uGrain; uniform float uVignette;
    varying vec2 vUv;
    float alea(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      // Légère aberration chromatique sur les bords, comme une optique réelle.
      float bord = dot(d, d);
      vec3 c = vec3(
        texture2D(tDiffuse, vUv + d * bord * 0.012).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - d * bord * 0.012).b);
      c *= mix(1.0, 1.0 - uVignette, smoothstep(0.2, 0.9, bord * 2.0));
      c += (alea(vUv * 913.0 + fract(uTemps) * 17.0) - 0.5) * uGrain;
      gl_FragColor = vec4(c, texture2D(tDiffuse, vUv).a);
    }`,
};

export type Post = {
  /** Force du bloom (0 : aucun) et seuil de luminance à partir duquel une lumière déborde. */
  bloom?: number;
  seuil?: number;
  /** Profondeur de champ : ouverture (flou) ; la mise au point vient de `mettreAuPoint`. */
  ouverture?: number;
  vignette?: number;
  grain?: number;
};

function PostTraitement({ nom, palier, post }: { nom: string; palier: Palier; post: Post }) {
  const { gl, scene, camera, size } = useThree();
  const reglages = REGLAGES[palier];
  const { composer, grain, bokeh } = useMemo(() => {
    const cible = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: palier === 'eleve' ? 4 : 0,
    });
    const composer = new EffectComposer(gl, cible);
    composer.addPass(new RenderPass(scene, camera));
    const bokeh =
      reglages.profondeurDeChamp && post.ouverture
        ? new BokehPass(scene, camera, { focus: 10, aperture: post.ouverture, maxblur: 0.008 })
        : null;
    if (bokeh) composer.addPass(bokeh);
    // Bloom calculé à basse résolution : seules les sources lumineuses débordent.
    if (post.bloom)
      composer.addPass(
        new UnrealBloomPass(new Vector2(256, 256), post.bloom, 0.7, post.seuil ?? 0.85),
      );
    const grain = new ShaderPass(VIGNETTE_GRAIN);
    grain.uniforms.uVignette!.value = post.vignette ?? 0.5;
    grain.uniforms.uGrain!.value = post.grain ?? 0.035;
    composer.addPass(grain);
    composer.addPass(new OutputPass());
    return { composer, grain, bokeh };
  }, [gl, scene, camera, palier, reglages.profondeurDeChamp, post]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((state) => {
    grain.uniforms.uTemps!.value = state.clock.elapsedTime;
    if (bokeh)
      (bokeh.uniforms as Record<string, { value: number }>).focus!.value =
        miseAuPoint.get(nom) ?? 10;
    composer.render();
  }, 1);
  return null;
}

export function Toile({
  nom,
  palier,
  visible,
  camera,
  post,
  environnement = 1,
  eclairage,
  exposition = 1,
  fond,
  children,
}: {
  nom: string;
  palier: Palier;
  visible: boolean;
  camera: { position: [number, number, number]; fov?: number; near?: number; far?: number };
  /** Post-traitement demandé par la scène (appliqué seulement si le palier le permet). */
  post?: Post | undefined;
  /** Intensité de l'éclairage par environnement (0 : aucun, scène à ses seules lumières). */
  environnement?: number;
  /** Lieu photographié qui éclaire la scène (repli : la pièce calculée). */
  eclairage?: SceneLightingId;
  exposition?: number;
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
      shadows={reglages.ombres ? { type: PCFSoftShadowMap } : false}
      gl={{ antialias: reglages.antialias, alpha: !fond, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = exposition;
      }}
      camera={{ fov: 45, near: 0.1, far: 4000, ...camera }}
    >
      {fond && <color attach="background" args={[fond]} />}
      <GardeFps nom={nom} palier={palier} />
      {environnement > 0 && (
        <Environnement intensite={environnement} eclairage={eclairage} palier={palier} />
      )}
      {children}
      {post && reglages.postTraitement && <PostTraitement nom={nom} palier={palier} post={post} />}
    </Canvas>
  );
}

/** Rapproche `actuel` de `cible` avec un amortissement indépendant de la cadence. */
export const amortir = (actuel: number, cible: number, vitesse: number, delta: number) =>
  actuel + (cible - actuel) * (1 - Math.exp(-vitesse * delta));
