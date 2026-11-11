import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  NearestFilter,
  QuadraticBezierCurve3,
  RGBAFormat,
  ShaderMaterial,
  ShapeUtils,
  Spherical,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { anneaux, HAUTEUR_SOCLE, hauteurDuRelief, type Departement3D } from '../carte';
import { REGLAGES, type Palier } from '../qualite';
import { amortir, mettreAuPoint, Toile, tracer } from './Toile';

// Carte de France 3D (phase 26) : départements extrudés (une seule géométrie, un seul appel de
// dessin), relief proportionnel au score du candidat en tête, dépouillement en onde lumineuse
// depuis la préfecture (shader), lumières des préfectures et arcs des reports de voix. Les données
// de chaque département (couleur, avancement, hauteur) voyagent dans une texture lue par le shader.

export type Forme3D = { code: string; d: string; label: [number, number] };
export type Arc3D = {
  depuis: [number, number];
  jusqua: [number, number];
  intensite: number;
  couleur: string;
};

export type France3DProps = {
  palier: Palier;
  visible: boolean;
  formes: readonly Forme3D[];
  etats: Readonly<Record<string, Departement3D>>;
  arcs?: readonly Arc3D[];
  sombre: boolean;
  /** Teinte d'un département en attente de résultat. */
  attente: string;
  /** Zoom lent sur la France à l'ouverture. */
  intro?: boolean;
  nom?: string;
};

const LARGEUR = 128;
/** Repère du plateau (1000 × 1180) recentré sur la métropole. */
const versScene = (x: number, y: number): [number, number] => [x - 500, y - 500];

function construire(formes: readonly Forme3D[]) {
  const positions: number[] = [];
  const normales: number[] = [];
  const depts: number[] = [];
  const centres: number[] = [];
  const rayons: number[] = [];
  const index: number[] = [];
  formes.forEach((forme, numero) => {
    const [cx, cz] = versScene(...forme.label);
    const tous = anneaux(forme.d);
    let rayon = 1;
    for (const anneau of tous)
      for (const [x, y] of anneau) {
        const [sx, sz] = versScene(x, y);
        rayon = Math.max(rayon, Math.hypot(sx - cx, sz - cz));
      }
    const sommet = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      positions.push(x, y, z);
      normales.push(nx, ny, nz);
      depts.push(numero);
      centres.push(cx, cz);
      rayons.push(rayon);
      return positions.length / 3 - 1;
    };
    for (const anneau of tous) {
      const points = anneau.map(([x, y]) => versScene(x, y));
      // Dessus : triangulation de l'anneau.
      const base = positions.length / 3;
      for (const [x, z] of points) sommet(x, 1, z, 0, 1, 0);
      const faces = ShapeUtils.triangulateShape(
        points.map(([x, z]) => new Vector2(x, z)),
        [],
      );
      for (const [a, b, c] of faces) index.push(base + a!, base + c!, base + b!);
      // Flancs : un quadrilatère par arête, normale vers l'extérieur.
      let aire = 0;
      points.forEach(([x, z], i) => {
        const [x1, z1] = points[(i + 1) % points.length]!;
        aire += x * z1 - x1 * z;
      });
      const sens = aire > 0 ? 1 : -1;
      points.forEach(([x, z], i) => {
        const [x1, z1] = points[(i + 1) % points.length]!;
        const longueur = Math.hypot(x1 - x, z1 - z) || 1;
        const nx = (sens * (z1 - z)) / longueur;
        const nz = (-sens * (x1 - x)) / longueur;
        const a = sommet(x, 1, z, nx, 0, nz);
        const b = sommet(x1, 1, z1, nx, 0, nz);
        const c = sommet(x1, 0, z1, nx, 0, nz);
        const e = sommet(x, 0, z, nx, 0, nz);
        index.push(a, b, c, a, c, e);
      });
    }
  });
  const geometrie = new BufferGeometry();
  geometrie.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometrie.setAttribute('normal', new BufferAttribute(new Float32Array(normales), 3));
  geometrie.setAttribute('aDept', new BufferAttribute(new Float32Array(depts), 1));
  geometrie.setAttribute('aCentre', new BufferAttribute(new Float32Array(centres), 2));
  geometrie.setAttribute('aRayon', new BufferAttribute(new Float32Array(rayons), 1));
  geometrie.setIndex(index);
  return geometrie;
}

const RELIEF_VERTEX = /* glsl */ `
  uniform sampler2D uDonnees;
  attribute float aDept; attribute vec2 aCentre; attribute float aRayon;
  varying vec3 vCouleur; varying float vAvancement; varying float vDistance;
  varying vec3 vNormale; varying float vHaut; varying vec3 vMonde;
  void main() {
    vec4 etat = texelFetch(uDonnees, ivec2(int(aDept), 0), 0);
    float hauteur = texelFetch(uDonnees, ivec2(int(aDept), 1), 0).r;
    vCouleur = etat.rgb; vAvancement = etat.a;
    vDistance = distance(position.xz, aCentre) / aRayon;
    vNormale = normal; vHaut = position.y;
    vec3 p = vec3(position.x, position.y * hauteur, position.z);
    vMonde = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const RELIEF_FRAGMENT = /* glsl */ `
  uniform vec3 uAttente; uniform float uVague; uniform float uTemps;
  varying vec3 vCouleur; varying float vAvancement; varying float vDistance;
  varying vec3 vNormale; varying float vHaut; varying vec3 vMonde;
  float grain(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    // Onde du dépouillement : le résultat gagne le département depuis sa préfecture.
    float front = vAvancement * 1.35;
    float revele = mix(step(0.5, vAvancement), smoothstep(front, front - 0.18, vDistance), uVague);
    float enCours = step(0.002, vAvancement) * step(vAvancement, 0.998);
    float crete = uVague * enCours * exp(-pow((vDistance - front) / 0.045, 2.0));
    float ressac = uVague * enCours * 0.05 * sin(vDistance * 22.0 - uTemps * 6.0) * revele;
    vec3 teinte = mix(uAttente, vCouleur, revele);
    // Maquette de résine teintée : dessus satiné à grain fin, flancs plus sombres vers le socle
    // (occlusion), arête supérieure accrochée par la lumière.
    vec3 n = normalize(vNormale);
    vec3 vue = normalize(cameraPosition - vMonde);
    vec3 lampe = normalize(vec3(-0.35, 0.8, 0.45));
    float dessus = step(0.5, n.y);
    float diffus = max(0.0, dot(n, lampe));
    float matiere = 0.94 + 0.06 * grain(vMonde.xz * 1.7);
    float bordure = mix(1.0, 0.82, smoothstep(0.75, 1.05, vDistance)) ;
    float occlusion = mix(0.35 + 0.65 * smoothstep(0.0, 1.0, vHaut), 1.0, dessus);
    float arete = (1.0 - dessus) * smoothstep(0.93, 1.0, vHaut) * 0.08;
    float reflet = pow(max(0.0, dot(n, normalize(lampe + vue))), 40.0) * 0.1 * dessus;
    float fresnel = pow(1.0 - max(0.0, dot(n, vue)), 4.0) * 0.08;
    vec3 c = teinte * matiere * bordure * occlusion * (0.16 + 0.7 * diffus + ressac);
    c += vec3(1.0) * (reflet + arete) + vec3(0.5, 0.6, 0.9) * fresnel * 0.4;
    c += vec3(1.0, 0.82, 0.5) * crete * 0.5;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const LUMIERES_VERTEX = /* glsl */ `
  uniform sampler2D uDonnees; uniform float uTaille; uniform float uTemps;
  attribute float aDept; varying float vForce;
  void main() {
    float avancement = texelFetch(uDonnees, ivec2(int(aDept), 0), 0).a;
    float hauteur = texelFetch(uDonnees, ivec2(int(aDept), 1), 0).r;
    vForce = smoothstep(0.9, 1.0, avancement) * (0.5 + 0.12 * sin(uTemps * 3.0 + aDept));
    vec4 mv = modelViewMatrix * vec4(position.x, hauteur + 4.0, position.z, 1.0);
    gl_PointSize = uTaille * vForce / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const LUMIERES_FRAGMENT = /* glsl */ `
  varying float vForce;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float halo = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.72) * (halo * halo * 2.2) * vForce, halo * vForce);
  }`;

const FLUX_VERTEX = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uTemps; uniform float uTaille;
  attribute float aT; varying float vT;
  void main() {
    float t = fract(aT + uTemps * 0.22);
    vT = t;
    vec3 p = mix(mix(uA, uB, t), mix(uB, uC, t), t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uTaille * (0.6 + 0.4 * sin(aT * 91.0)) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FLUX_FRAGMENT = /* glsl */ `
  uniform vec3 uCouleur; varying float vT;
  void main() {
    float halo = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    float bord = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.9, vT);
    gl_FragColor = vec4(mix(uCouleur, vec3(1.0), 0.45) * halo * 1.8, halo * bord);
  }`;

function Arc({ arc, particules }: { arc: Arc3D; particules: number }) {
  const { tube, flux, tubeMat, fluxMat } = useMemo(() => {
    const [ax, az] = versScene(...arc.depuis);
    const [cx, cz] = versScene(...arc.jusqua);
    const a = new Vector3(ax, hauteurDuRelief(0.3), az);
    const c = new Vector3(cx, hauteurDuRelief(0.3), cz);
    const b = a.clone().lerp(c, 0.5);
    b.y += 70 + a.distanceTo(c) * 0.45;
    const tube = new TubeGeometry(
      new QuadraticBezierCurve3(a, b, c),
      40,
      1 + 4.5 * arc.intensite,
      6,
    );
    const nombre = Math.max(4, Math.round(particules * (0.2 + 0.8 * arc.intensite)));
    const flux = new BufferGeometry();
    flux.setAttribute('position', new BufferAttribute(new Float32Array(nombre * 3), 3));
    flux.setAttribute(
      'aT',
      new BufferAttribute(
        Float32Array.from({ length: nombre }, (_, i) => i / nombre),
        1,
      ),
    );
    const couleur = new Color(arc.couleur);
    const tubeMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uCouleur: { value: couleur }, uTrace: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCouleur; uniform float uTrace; varying vec2 vUv;
        void main(){ gl_FragColor = vec4(uCouleur * 0.9, 0.5 * step(vUv.x, uTrace)); }`,
    });
    const fluxMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uA: { value: a },
        uB: { value: b },
        uC: { value: c },
        uTemps: { value: 0 },
        uTaille: { value: 5200 + 9000 * arc.intensite },
        uCouleur: { value: couleur },
      },
      vertexShader: FLUX_VERTEX,
      fragmentShader: FLUX_FRAGMENT,
    });
    return { tube, flux, tubeMat, fluxMat };
  }, [arc, particules]);
  useEffect(
    () => () => {
      tube.dispose();
      flux.dispose();
      tubeMat.dispose();
      fluxMat.dispose();
    },
    [tube, flux, tubeMat, fluxMat],
  );
  useFrame((state, delta) => {
    fluxMat.uniforms.uTemps!.value = state.clock.elapsedTime;
    tubeMat.uniforms.uTrace!.value = Math.min(1, tubeMat.uniforms.uTrace!.value + delta * 0.7);
  });
  return (
    <>
      <mesh geometry={tube} material={tubeMat} frustumCulled={false} />
      <points geometry={flux} material={fluxMat} frustumCulled={false} />
    </>
  );
}

function Carte({
  formes,
  etats,
  arcs = [],
  sombre,
  attente,
  intro = true,
  palier,
  nom = 'carte',
}: France3DProps) {
  const reglages = REGLAGES[palier];
  const { camera, gl, size } = useThree();
  const geometrie = useMemo(() => construire(formes), [formes]);
  const lumieres = useMemo(() => {
    const g = new BufferGeometry();
    const positions = new Float32Array(formes.length * 3);
    formes.forEach((forme, i) => {
      const [x, z] = versScene(...forme.label);
      positions.set([x, 0, z], i * 3);
    });
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute(
      'aDept',
      new BufferAttribute(
        Float32Array.from(formes, (_, i) => i),
        1,
      ),
    );
    return g;
  }, [formes]);
  const donnees = useMemo(() => {
    const texture = new DataTexture(
      new Float32Array(LARGEUR * 2 * 4),
      LARGEUR,
      2,
      RGBAFormat,
      FloatType,
    );
    texture.minFilter = texture.magFilter = NearestFilter;
    return texture;
  }, []);
  const materiaux = useMemo(
    () => ({
      relief: new ShaderMaterial({
        uniforms: {
          uDonnees: { value: donnees },
          uAttente: { value: new Color(attente) },
          uVague: { value: reglages.vague ? 1 : 0 },
          uTemps: { value: 0 },
        },
        vertexShader: RELIEF_VERTEX,
        fragmentShader: RELIEF_FRAGMENT,
        side: DoubleSide,
      }),
      lumieres: new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uDonnees: { value: donnees }, uTaille: { value: 5200 }, uTemps: { value: 0 } },
        vertexShader: LUMIERES_VERTEX,
        fragmentShader: LUMIERES_FRAGMENT,
      }),
    }),
    [donnees, attente, reglages.vague],
  );
  useEffect(
    () => () => {
      geometrie.dispose();
      lumieres.dispose();
    },
    [geometrie, lumieres],
  );
  useEffect(
    () => () => {
      donnees.dispose();
      materiaux.relief.dispose();
      materiaux.lumieres.dispose();
    },
    [donnees, materiaux],
  );

  // Navigation au doigt : rotation et zoom ; tant qu'on n'y touche pas, léger travelling.
  const touche = useRef(false);
  const debut = useRef<number | null>(null);
  const controles = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.enablePan = false;
    c.minPolarAngle = 0.15;
    c.maxPolarAngle = 1.25;
    c.target.set(0, 0, 60);
    return c;
  }, [camera, gl]);
  useEffect(() => {
    const debuter = () => (touche.current = true);
    controles.addEventListener('start', debuter);
    return () => {
      controles.removeEventListener('start', debuter);
      controles.dispose();
    };
  }, [controles]);
  const distance = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    return Math.max(1500, 1000 / aspect);
  }, [size]);
  useEffect(() => {
    controles.minDistance = distance * 0.3;
    controles.maxDistance = distance * 1.6;
  }, [controles, distance]);
  useEffect(() => {
    tracer(nom, { departements: formes.length, arcs: arcs.length, vague: reglages.vague });
  }, [nom, formes.length, arcs.length, reglages.vague]);

  const courant = useRef(new Map<string, { avancement: number; hauteur: number }>());
  const spherique = useMemo(() => new Spherical(), []);
  const couleur = useMemo(() => new Color(), []);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    debut.current ??= t;
    const data = donnees.image.data as Float32Array;
    formes.forEach((forme, i) => {
      const etat = etats[forme.code];
      const c = courant.current.get(forme.code) ?? { avancement: 0, hauteur: HAUTEUR_SOCLE };
      const cible = etat?.avancement ?? 0;
      // L'onde avance à vitesse bornée ; un retour en arrière (« revoir depuis 20 h ») est immédiat.
      c.avancement = cible < c.avancement ? cible : Math.min(cible, c.avancement + delta * 0.9);
      const relief = etat ? hauteurDuRelief(etat.score) : HAUTEUR_SOCLE;
      const leve = c.avancement * c.avancement * (3 - 2 * c.avancement);
      c.hauteur = amortir(c.hauteur, HAUTEUR_SOCLE + (relief - HAUTEUR_SOCLE) * leve, 6, delta);
      courant.current.set(forme.code, c);
      couleur.set(etat?.couleur ?? attente);
      data.set([couleur.r, couleur.g, couleur.b, c.avancement], i * 4);
      data[(LARGEUR + i) * 4] = c.hauteur;
    });
    donnees.needsUpdate = true;
    materiaux.relief.uniforms.uTemps!.value = t;
    materiaux.lumieres.uniforms.uTemps!.value = t;

    mettreAuPoint(nom, camera.position.distanceTo(controles.target));
    if (touche.current) {
      controles.update();
      return;
    }
    // Zoom lent d'ouverture, puis léger travelling autour de la France.
    const ecoule = t - debut.current;
    const approche = intro ? 1 - Math.exp(-ecoule * 0.9) : 1;
    spherique.set(
      distance * (1.9 - 0.9 * approche),
      0.62 + 0.1 * (1 - approche),
      Math.sin(ecoule * 0.16) * 0.22,
    );
    camera.position.setFromSpherical(spherique).add(controles.target);
    camera.lookAt(controles.target);
  });

  return (
    <>
      {/* Table laquée sombre sur laquelle la maquette est posée : elle reflète la pièce. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.5}>
        <circleGeometry args={[2600, 64]} />
        <meshStandardMaterial
          color={sombre ? '#04070f' : '#27324a'}
          roughness={0.18}
          metalness={0.6}
          envMapIntensity={sombre ? 0.5 : 0.9}
        />
      </mesh>
      <directionalLight position={[-300, 700, 400]} intensity={1.2} />
      <mesh geometry={geometrie} material={materiaux.relief} frustumCulled={false} />
      <points geometry={lumieres} material={materiaux.lumieres} frustumCulled={false} />
      {arcs.map((arc, i) => (
        <Arc key={i} arc={arc} particules={reglages.particulesArc} />
      ))}
    </>
  );
}

export default function France3D(props: France3DProps) {
  return (
    <Toile
      nom={props.nom ?? 'carte'}
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 2400, 1700], fov: 45, near: 10, far: 9000 }}
      environnement={0.6}
      post={{ bloom: 0.35, seuil: 0.93, vignette: 0.55, grain: 0.04 }}
      fond={props.sombre ? '#03050b' : '#1b2438'}
    >
      <Carte {...props} />
    </Toile>
  );
}
