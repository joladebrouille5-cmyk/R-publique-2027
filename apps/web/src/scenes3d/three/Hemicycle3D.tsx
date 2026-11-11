import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Object3D,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type PointLight,
} from 'three';
import {
  agitation,
  centreDuGroupe,
  RAYON_EXTERIEUR,
  rangs,
  type Reaction,
  type Siege,
} from '../hemicycle';
import type { Palier } from '../qualite';
import { amortir, Toile, tracer } from './Toile';

// Hémicycle 3D des questions au gouvernement (phase 26) : 577 sièges en gradins (une seule
// géométrie instanciée), trois plans de caméra, halo sur le groupe qui interpelle et trois
// réactions de la salle. Salle stylisée, sans personnage : un siège est un pavé de couleur.

export type PlanHemicycle = 'large' | 'question' | 'reponse';

export type Hemicycle3DProps = {
  palier: Palier;
  visible: boolean;
  sieges: readonly Siege[];
  /** Couleur de chaque groupe (convention du jeu), en hexadécimal. */
  couleurs: Readonly<Record<string, string>>;
  alignements: Readonly<Record<string, 'soutien' | 'independant' | 'opposition'>>;
  /** Groupe qui interpelle le gouvernement. */
  orateur: string | null;
  plan: PlanHemicycle;
  reaction: Reaction | null;
  /** Tension parlementaire de la partie (0 à 100). */
  tension: number;
  sombre: boolean;
};

const VACANT = '#5b6477';
const BANC = { rayon: 2.3, places: 14 };
const CIBLE_LARGE = new Vector3(0, 0.6, -3.6);

function Salle(props: Hemicycle3DProps) {
  const { sieges, couleurs, alignements, orateur, plan, reaction, tension, sombre } = props;
  const mesh = useRef<InstancedMesh>(null);
  const halo = useRef<Mesh>(null);
  const lampe = useRef<PointLight>(null);
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const centre = useMemo(
    () => (orateur ? centreDuGroupe(sieges, orateur) : null),
    [sieges, orateur],
  );
  const gradins = useMemo(() => rangs(sieges.length), [sieges.length]);
  const tampon = useMemo(() => ({ objet: new Object3D(), couleur: new Color() }), []);
  const regard = useRef(CIBLE_LARGE.clone());
  const eclat = useRef(0);

  useEffect(() => {
    tracer('hemicycle', { instances: sieges.length, plan, reaction });
  }, [sieges.length, plan, reaction]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // Caméra : plan large, plongée sur le groupe qui interpelle, retour sur le banc du gouvernement.
    // Sur un écran étroit, le plan large recule pour garder toute la salle.
    const recul = Math.max(1, 1.75 / aspect);
    const position = new Vector3(0, 9.5 * recul, 7.5 * recul);
    const cible = CIBLE_LARGE.clone();
    if (plan === 'question' && centre) {
      position.set(centre.x * 0.45, centre.y + 5.2, centre.z + 6.4);
      cible.set(centre.x, centre.y, centre.z);
    } else if (plan === 'reponse') {
      position.set(Math.sin(t * 0.2) * 0.8, 4.6, -9.2);
      cible.set(0, 0.4, -1.4);
    }
    const v = 2.2;
    camera.position.set(
      amortir(camera.position.x, position.x, v, delta),
      amortir(camera.position.y, position.y, v, delta),
      amortir(camera.position.z, position.z, v, delta),
    );
    regard.current.set(
      amortir(regard.current.x, cible.x, v, delta),
      amortir(regard.current.y, cible.y, v, delta),
      amortir(regard.current.z, cible.z, v, delta),
    );
    camera.lookAt(regard.current);

    // Sièges : couleur du groupe, surbrillance du groupe qui interpelle, micro-mouvements selon
    // la réaction et la tension parlementaire.
    const instances = mesh.current;
    if (!instances) return;
    const surbrillance = orateur !== null && plan !== 'reponse';
    eclat.current = amortir(eclat.current, surbrillance ? 1 : 0, 3, delta);
    const { objet, couleur } = tampon;
    sieges.forEach((siege, i) => {
      const alignement = siege.groupe
        ? (alignements[siege.groupe] ?? 'independant')
        : 'independant';
      const amplitude = siege.groupe ? agitation(reaction, tension, alignement) : 0;
      const phase = i * 2.399;
      const saut = Math.max(0, Math.sin(t * (3 + amplitude * 7) + phase));
      const parle = siege.groupe !== null && siege.groupe === orateur;
      const pouls = parle ? 0.05 * eclat.current * (1 + Math.sin(t * 4 + siege.rang)) : 0;
      objet.position.set(siege.x, siege.y + 0.16 + amplitude * 0.22 * saut + pouls, siege.z);
      objet.rotation.set(0, siege.angle - Math.PI / 2, amplitude * 0.25 * Math.sin(t * 9 + phase));
      objet.scale.setScalar(1 + (parle ? 0.18 * eclat.current : 0));
      objet.updateMatrix();
      instances.setMatrixAt(i, objet.matrix);
      couleur.set(siege.groupe ? (couleurs[siege.groupe] ?? VACANT) : VACANT);
      if (!siege.groupe) couleur.multiplyScalar(0.5);
      else if (parle) couleur.multiplyScalar(1 + 0.9 * eclat.current);
      else couleur.multiplyScalar(1 - 0.62 * eclat.current);
      instances.setColorAt(i, couleur);
    });
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;

    if (halo.current && lampe.current) {
      const force = eclat.current * (0.75 + 0.25 * Math.sin(t * 3));
      halo.current.visible = force > 0.01 && centre !== null;
      (halo.current.material as { opacity: number }).opacity = 0.5 * force;
      halo.current.scale.setScalar(1 + 0.08 * Math.sin(t * 3));
      lampe.current.intensity = 26 * force;
    }
  });

  const pierre = sombre ? '#1c2440' : '#d9d2c3';
  const bois = sombre ? '#3a2416' : '#7a4a2b';
  const rayonHalo = centre
    ? Math.max(1.1, Math.sqrt(sieges.filter((s) => s.groupe === orateur).length) * 0.2)
    : 1;
  return (
    <>
      <ambientLight intensity={sombre ? 1.1 : 1.6} />
      <directionalLight position={[4, 12, 6]} intensity={1.8} />
      <directionalLight position={[-6, 6, -8]} intensity={0.5} color="#9db4ff" />
      {/* Gradins : un demi-anneau par rang, de plus en plus haut vers le fond. */}
      {gradins.map(({ rayon }, rang) => (
        <mesh key={rang} rotation-x={-Math.PI / 2} position-y={rang * 0.34}>
          <ringGeometry args={[rayon - 0.34, rayon + 0.34, 48, 1, 0, Math.PI]} />
          <meshLambertMaterial color={pierre} side={DoubleSide} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <circleGeometry args={[RAYON_EXTERIEUR + 1.6, 64]} />
        <meshLambertMaterial color={sombre ? '#0d1226' : '#bfb6a3'} />
      </mesh>
      {/* Fond de salle : colonnade stylisée. */}
      {Array.from({ length: 13 }, (_, i) => {
        const angle = (Math.PI * (i + 0.5)) / 13;
        const r = RAYON_EXTERIEUR + 1.1;
        return (
          <mesh key={i} position={[r * Math.cos(angle), 3.2, -r * Math.sin(angle)]}>
            <cylinderGeometry args={[0.22, 0.26, 6.4, 10]} />
            <meshLambertMaterial color={pierre} />
          </mesh>
        );
      })}
      {/* Tribune (perchoir) et banc du gouvernement, au pied des gradins. */}
      <mesh position={[0, 0.9, 1.5]}>
        <boxGeometry args={[4.2, 1.8, 1.1]} />
        <meshLambertMaterial color={bois} />
      </mesh>
      <mesh position={[0, 0.45, 0.55]}>
        <boxGeometry args={[2.2, 0.9, 0.7]} />
        <meshLambertMaterial color={bois} />
      </mesh>
      {Array.from({ length: BANC.places }, (_, i) => {
        const angle = Math.PI * (0.3 + (0.4 * i) / (BANC.places - 1));
        return (
          <mesh
            key={i}
            position={[BANC.rayon * Math.cos(angle), 0.17, -BANC.rayon * Math.sin(angle)]}
            rotation-y={angle - Math.PI / 2}
          >
            <boxGeometry args={[0.24, 0.3, 0.24]} />
            <meshLambertMaterial
              color="#e3c46c"
              emissive="#e3c46c"
              emissiveIntensity={plan === 'reponse' ? 0.9 : 0.15}
            />
          </mesh>
        );
      })}
      <instancedMesh ref={mesh} args={[undefined, undefined, sieges.length]} frustumCulled={false}>
        <boxGeometry args={[0.2, 0.26, 0.2]} />
        <meshLambertMaterial />
      </instancedMesh>
      {/* Halo lumineux sur le groupe qui interpelle. */}
      <mesh
        ref={halo}
        visible={false}
        rotation-x={-Math.PI / 2}
        position={centre ? [centre.x, centre.y + 0.75, centre.z] : [0, 0, 0]}
      >
        <ringGeometry args={[rayonHalo * 0.55, rayonHalo * 1.25, 48]} />
        <meshBasicMaterial
          color="#fff3c4"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <pointLight
        ref={lampe}
        position={centre ? [centre.x, centre.y + 2.2, centre.z] : [0, 3, 0]}
        color="#ffe9a8"
        intensity={0}
        distance={7}
      />
    </>
  );
}

export default function Hemicycle3D(props: Hemicycle3DProps) {
  return (
    <Toile
      nom="hemicycle"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 9.5, 7.5], fov: 45 }}
    >
      <Salle {...props} />
    </Toile>
  );
}
