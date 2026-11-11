import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { REGLAGES, type Palier } from '../qualite';
import { alea, silhouette } from './foule';
import { Toile, tracer } from './Toile';

// Ralliement de l'entre-deux-tours (phase 26) : deux foules stylisées, chacune à la couleur de
// son camp, marchent l'une vers l'autre et n'en font plus qu'une ; leurs deux anneaux fusionnent.
// Aucun personnage reconnaissable : des silhouettes sans visage, une seule géométrie instanciée.

const VERTEX = /* glsl */ `
  uniform float uFusion; uniform float uTemps;
  attribute vec3 aDepart; attribute vec3 aArrivee; attribute vec3 aCouleur; attribute float aGraine;
  uniform vec3 uCommune;
  varying vec3 vCouleur; varying float vLumiere;
  void main() {
    // Chacun part à son heure : la foule s'étire puis se resserre.
    float k = clamp((uFusion - aGraine * 0.35) / 0.65, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 base = mix(aDepart, aArrivee, k);
    float pas = sin(uTemps * 9.0 + aGraine * 40.0) * 0.06 * sin(k * 3.1416);
    float joie = max(0.0, sin(uTemps * 7.0 + aGraine * 30.0)) * 0.22 * smoothstep(0.85, 1.0, uFusion);
    vec3 p = position * (0.85 + 0.3 * aGraine) + base + vec3(0.0, pas + joie, 0.0);
    vCouleur = mix(aCouleur, uCommune, smoothstep(0.55, 1.0, k));
    vLumiere = 0.6 + 0.4 * max(0.0, normal.y * 0.6 + 0.5) + joie;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FRAGMENT = /* glsl */ `
  varying vec3 vCouleur; varying float vLumiere;
  void main() { gl_FragColor = vec4(vCouleur * vLumiere, 1.0);
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
      const r0 = 1 + 5 * Math.sqrt(alea(i, 1));
      const a0 = alea(i, 2) * Math.PI * 2;
      depart.set([(gauche ? -11 : 11) + r0 * Math.cos(a0), 0, r0 * Math.sin(a0) * 0.9], i * 3);
      const r1 = 1.6 + 6.5 * Math.sqrt(alea(i, 3));
      const a1 = alea(i, 4) * Math.PI * 2;
      arrivee.set([r1 * Math.cos(a1), 0, r1 * Math.sin(a1) * 0.8], i * 3);
      couleur.set(gauche ? rallie : camp).multiplyScalar(0.75 + 0.45 * alea(i, 5));
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
  const anneaux = useRef<(Mesh | null)[]>([]);
  const eclair = useRef<Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fusion = Math.min(1, t / duree);
    materiau.uniforms.uFusion!.value = fusion;
    materiau.uniforms.uTemps!.value = t;
    const k = fusion * fusion * (3 - 2 * fusion);
    // Les deux anneaux (identités de camp) glissent l'un vers l'autre et se confondent.
    anneaux.current.forEach((anneau, i) => {
      if (!anneau) return;
      anneau.position.set((i === 0 ? -11 : 11) * (1 - k), 4.2 + Math.sin(t * 1.4 + i) * 0.2, 0);
      anneau.rotation.set(Math.PI / 2 - 0.5, t * (i === 0 ? 0.5 : -0.5), 0);
      anneau.scale.setScalar(1 + 0.5 * k);
    });
    if (eclair.current) {
      const flash = Math.exp(-((fusion - 0.97) ** 2) * 220);
      (eclair.current.material as MeshBasicMaterial).opacity = 0.75 * flash;
      eclair.current.scale.setScalar(2 + 10 * flash);
    }
    state.camera.position.set(Math.sin(t * 0.2) * 3, 7 + 4 * k, 21 - 5 * k);
    state.camera.lookAt(0, 1.6, 0);
  });

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <circleGeometry args={[40, 48]} />
        <meshBasicMaterial color="#0a0f22" />
      </mesh>
      <primitive object={mesh} />
      {[rallie, camp].map((couleur, i) => (
        <mesh key={i} ref={(m) => void (anneaux.current[i] = m)}>
          <torusGeometry args={[1.6, 0.26, 12, 48]} />
          <meshBasicMaterial color={couleur} />
        </mesh>
      ))}
      <mesh ref={eclair} position={[0, 4.2, 0]}>
        <sphereGeometry args={[0.6, 16, 12]} />
        <meshBasicMaterial
          color="#fff3c4"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export default function Ralliement3D(props: Ralliement3DProps) {
  return (
    <Toile
      nom="ralliement"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 7, 21], fov: 50 }}
      fond="#060a18"
    >
      <Fusion {...props} />
    </Toile>
  );
}
