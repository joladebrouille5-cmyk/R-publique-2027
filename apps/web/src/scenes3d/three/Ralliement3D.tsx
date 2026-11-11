import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  type Mesh,
  type SpotLight,
} from 'three';
import { REGLAGES, type Palier } from '../qualite';
import { alea, silhouette } from './foule';
import { etendre } from './textures';
import { mettreAuPoint, Toile, tracer } from './Toile';

// Ralliement de l'entre-deux-tours (phase 26) : deux foules stylisées, chacune à la couleur de
// son camp, marchent l'une vers l'autre et n'en font plus qu'une ; leurs deux anneaux fusionnent.
// Aucun personnage reconnaissable : des silhouettes sans visage, une seule géométrie instanciée.

const FAISCEAU = {
  vertexShader: /* glsl */ `
    varying vec3 vNormale; varying vec3 vVue; varying float vLong;
    void main() {
      vLong = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormale = normalize(normalMatrix * normal); vVue = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uCouleur; uniform float uForce; varying vec3 vNormale; varying vec3 vVue; varying float vLong;
    void main() {
      float coeur = pow(abs(dot(normalize(vNormale), vVue)), 2.0);
      gl_FragColor = vec4(uCouleur * coeur * pow(vLong, 1.4) * uForce, 1.0);
    }`,
};

const VERTEX = /* glsl */ `
  uniform float uFusion; uniform float uTemps; uniform vec3 uCommune;
  attribute vec3 aDepart; attribute vec3 aArrivee; attribute vec3 aCouleur; attribute float aGraine;
  attribute float aBras;
  varying vec3 vCouleur; varying vec3 vCamp; varying vec3 vNormale; varying vec3 vMonde; varying float vTissu;
  vec3 tourner(vec3 p, float angle) {
    float c = cos(angle); float s = sin(angle);
    return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  }
  void main() {
    // Chacun part à son heure : la foule s'étire puis se resserre.
    float k = clamp((uFusion - aGraine * 0.35) / 0.65, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 base = mix(aDepart, aArrivee, k);
    float marche = sin(k * 3.1416);
    // À la jonction, les bras se lèvent.
    float joie = smoothstep(0.85, 1.0, uFusion) * (0.6 + 0.4 * sin(uTemps * 6.0 + aGraine * 30.0));
    vec3 p = position; vec3 n = normal;
    if (aBras != 0.0) {
      vec3 epaule = vec3(aBras * 0.21, 1.4, 0.0);
      float angle = -joie * 2.6 * step(0.4, fract(aGraine * 5.7))
        + sin(uTemps * 8.0 + aGraine * 40.0 + aBras) * 0.5 * marche;
      p = tourner(p - epaule, angle) + epaule; n = tourner(n, angle);
    }
    // On marche vers l'autre camp : le corps se tourne dans le sens de la marche.
    vec3 sens = normalize(vec3(aArrivee.x - aDepart.x, 0.0, aArrivee.z - aDepart.z) + vec3(0.0001));
    mat3 cap = mat3(vec3(sens.z, 0.0, -sens.x), vec3(0.0, 1.0, 0.0), sens);
    float taille = 0.92 + 0.16 * aGraine;
    vec3 monde = cap * (p * taille) + base;
    monde.y += abs(sin(uTemps * 8.0 + aGraine * 40.0)) * 0.035 * marche + joie * 0.06;
    vTissu = fract(aGraine * 13.7); vCamp = aCouleur; vCouleur = mix(aCouleur, uCommune, smoothstep(0.55, 1.0, k));
    vNormale = cap * n; vMonde = monde;
    gl_Position = projectionMatrix * viewMatrix * vec4(monde, 1.0);
  }`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uBrume;
  varying vec3 vCouleur; varying vec3 vNormale; varying vec3 vMonde; varying float vTissu;
  void main() {
    vec3 n = normalize(vNormale);
    vec3 vue = normalize(cameraPosition - vMonde);
    // Vêtements sombres, éclairés d'en haut par le projecteur de leur camp, puis par la lumière
    // commune ; un liseré sur les épaules et les têtes seulement.
    float haut = max(0.0, n.y * 0.6 + 0.4);
    float bord = pow(1.0 - max(0.0, dot(n, vue)), 4.0) * smoothstep(0.0, 0.7, n.y + 0.2);
    vec3 habit = mix(vec3(0.05, 0.055, 0.07), vec3(0.3, 0.3, 0.32), vTissu);
    vec3 c = habit * (0.1 + haut * 1.1) * mix(vec3(1.0), vCouleur, 0.7) + vCouleur * bord * 0.35;
    float loin = length(cameraPosition - vMonde);
    c = mix(c, uBrume, 1.0 - exp(-loin * 0.022));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export type Ralliement3DProps = {
  palier: Palier;
  visible: boolean;
  /** Couleur du camp rallié (le premier, s'il y en a plusieurs) et couleur du camp du joueur. */
  rallie: string;
  camp: string;
  /** Durée de la fusion, en secondes. */
  duree: number;
};

function Fusion({ palier, rallie, camp, duree }: Ralliement3DProps) {
  const nombre = Math.round(REGLAGES[palier].fouleMax / 3);
  const { mesh, materiau } = useMemo(() => {
    const geometrie = silhouette();
    const materiau = new ShaderMaterial({
      uniforms: {
        uFusion: { value: 0 },
        uTemps: { value: 0 },
        uCommune: { value: new Color(camp).lerp(new Color('#ffffff'), 0.15) },
        uBrume: { value: new Color('#070b18') },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const mesh = new InstancedMesh(geometrie, materiau, nombre);
    mesh.frustumCulled = false;
    const depart = new Float32Array(nombre * 3);
    const arrivee = new Float32Array(nombre * 3);
    const couleurs = new Float32Array(nombre * 3);
    const graines = new Float32Array(nombre);
    const identite = new Matrix4();
    const couleur = new Color();
    for (let i = 0; i < nombre; i++) {
      const gauche = i % 2 === 0;
      // Départ : deux foules séparées ; arrivée : un seul disque, les deux camps mêlés.
      const r0 = 7 * Math.sqrt(alea(i, 1));
      const a0 = alea(i, 2) * Math.PI * 2;
      depart.set([(gauche ? -13 : 13) + r0 * Math.cos(a0), 0, r0 * Math.sin(a0) * 0.9], i * 3);
      const r1 = 10.5 * Math.sqrt(alea(i, 3));
      const a1 = alea(i, 4) * Math.PI * 2;
      arrivee.set([r1 * Math.cos(a1), 0, r1 * Math.sin(a1) * 0.8], i * 3);
      couleur.set(gauche ? rallie : camp).multiplyScalar(0.8 + 0.4 * alea(i, 5));
      couleurs.set([couleur.r, couleur.g, couleur.b], i * 3);
      graines[i] = alea(i, 6);
      mesh.setMatrixAt(i, identite);
    }
    geometrie.setAttribute('aDepart', new InstancedBufferAttribute(depart, 3));
    geometrie.setAttribute('aArrivee', new InstancedBufferAttribute(arrivee, 3));
    geometrie.setAttribute('aCouleur', new InstancedBufferAttribute(couleurs, 3));
    geometrie.setAttribute('aGraine', new InstancedBufferAttribute(graines, 1));
    return { mesh, materiau };
  }, [nombre, rallie, camp]);
  useEffect(() => {
    tracer('ralliement', { instances: nombre });
    return () => {
      mesh.geometry.dispose();
      materiau.dispose();
      mesh.dispose();
    };
  }, [mesh, materiau, nombre]);
  const lampes = useRef<(SpotLight | null)[]>([]);
  const faisceaux = useRef<(Mesh | null)[]>([]);
  const sol = useMemo(() => etendre('beton', REGLAGES[palier].textures, 120, 120), [palier]);
  const lumieres = useMemo(
    () =>
      [rallie, camp].map(
        (couleur) =>
          new ShaderMaterial({
            ...FAISCEAU,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            blending: AdditiveBlending,
            uniforms: { uCouleur: { value: new Color(couleur) }, uForce: { value: 0.3 } },
          }),
      ),
    [rallie, camp],
  );
  useEffect(() => () => lumieres.forEach((l) => l.dispose()), [lumieres]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fusion = Math.min(1, t / duree);
    materiau.uniforms.uFusion!.value = fusion;
    materiau.uniforms.uTemps!.value = t;
    const k = fusion * fusion * (3 - 2 * fusion);
    // Deux projecteurs de place, un par camp : ils suivent leur foule et se rejoignent au centre.
    [0, 1].forEach((i) => {
      const x = (i === 0 ? -13 : 13) * (1 - k);
      const lampe = lampes.current[i];
      if (lampe) {
        lampe.position.set(x, 14, 3);
        lampe.target.position.set(x, 0, 0);
        lampe.target.updateMatrixWorld();
        lampe.intensity = 900 + 900 * k;
      }
      const faisceau = faisceaux.current[i];
      if (faisceau) {
        faisceau.position.set(x, 14, 3);
        faisceau.rotation.z =
          (i === 0 ? 1 : -1) * 0.25 * (1 - k) + Math.sin(t * 0.8 + i * 2) * 0.05;
      }
      lumieres[i]!.uniforms.uForce!.value = 0.22 + 0.3 * k;
    });
    // Grue : la caméra part à hauteur d'homme entre les deux foules et s'élève quand elles se rejoignent.
    state.camera.position.set(Math.sin(t * 0.2) * 2.5, 2.2 + 8 * k, 22 - 6 * k);
    state.camera.lookAt(0, 1.4, 0);
    mettreAuPoint('ralliement', 18);
  });

  return (
    <>
      <fogExp2 attach="fog" args={['#070b18', 0.022]} />
      <ambientLight intensity={0.12} />
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial {...sol} metalness={0.3} />
      </mesh>
      <primitive object={mesh} />
      {[rallie, camp].map((couleur, i) => (
        <group key={i}>
          <spotLight
            ref={(l) => void (lampes.current[i] = l)}
            angle={0.55}
            penumbra={0.9}
            intensity={900}
            color={couleur}
            distance={40}
          />
          <group ref={(m) => void (faisceaux.current[i] = m as unknown as Mesh)}>
            <mesh material={lumieres[i]!} position={[0, -7.5, 0]}>
              <coneGeometry args={[7, 15, 32, 1, true]} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}

export default function Ralliement3D(props: Ralliement3DProps) {
  return (
    <Toile
      nom="ralliement"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 2.2, 22], fov: 50 }}
      fond="#070b18"
      environnement={0.1}
      post={{ bloom: 0.6, seuil: 0.6, ouverture: 0.0003, vignette: 0.6, grain: 0.05 }}
    >
      <Fusion {...props} />
    </Toile>
  );
}
