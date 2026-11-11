import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  PerspectiveCamera,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { dureeDuPlan, plansDuDebat, type Plan } from '../debat';
import type { Palier } from '../qualite';
import { amortir, Toile, tracer } from './Toile';

// Plateau du débat en 3D (phase 26) : une table, un pupitre par candidat présent aux couleurs de
// son camp et une colonne de lumière à sa place — aucune silhouette, aucun visage. La réalisation
// alterne plan large, plan serré, champ-contrechamp et écran partagé selon la tension ; la
// lumière passe du chaud (échanges posés) au froid (échanges vifs).

export type Pupitre = { id: string; couleur: string };

export type Debat3DProps = {
  palier: Palier;
  visible: boolean;
  pupitres: readonly Pupitre[];
  /** Candidat qui a la parole et celui qu'il vise, le cas échéant. */
  parle: string | null;
  cible: string | null;
  /** Tension du plateau (0 à 1). */
  tension: number;
};

const CHAUD = new Color('#ffd2a1');
const FROID = new Color('#a9c6ff');

/** Emplacement de chaque pupitre : en arc de cercle, face à la caméra. */
function emplacements(nombre: number): Vector3[] {
  if (nombre === 1) return [new Vector3(0, 0, 0)];
  const ouverture = Math.min(Math.PI * 0.75, 0.5 + nombre * 0.22);
  const rayon = Math.max(3.2, nombre * 0.85);
  return Array.from({ length: nombre }, (_, i) => {
    const angle = -ouverture / 2 + (ouverture * i) / (nombre - 1);
    return new Vector3(rayon * Math.sin(angle), 0, rayon * (1 - Math.cos(angle)) - 1);
  });
}

function Plateau({ pupitres, parle, cible, tension }: Debat3DProps) {
  const { gl, scene, camera, size } = useThree();
  const places = useMemo(() => emplacements(pupitres.length), [pupitres.length]);
  const seconde = useMemo(() => new PerspectiveCamera(38, 1, 0.1, 200), []);
  const ambiance = useRef<AmbientLight>(null);
  const cle = useRef<DirectionalLight>(null);
  const colonnes = useRef<(Mesh | null)[]>([]);
  const ecrans = useRef<(Mesh | null)[]>([]);
  const etat = useRef({ tension, regard: new Vector3(0, 1.2, 0), plan: 'large' as Plan });
  const teinte = useMemo(() => new Color(), []);
  const iParle = Math.max(
    0,
    pupitres.findIndex((p) => p.id === parle),
  );
  const iCible =
    cible && pupitres.some((p) => p.id === cible)
      ? pupitres.findIndex((p) => p.id === cible)
      : (iParle + 1) % pupitres.length;
  const envergure = Math.max(4, ...places.map((p) => Math.abs(p.x))) + 1.5;

  /** Cadre serré sur un pupitre : la caméra se place face à lui, légèrement de côté. */
  const serrer = (cam: PerspectiveCamera, index: number, cote: number, delta: number) => {
    const p = places[index]!;
    const cibleCam = new Vector3(p.x + cote * 0.9, 1.9, p.z + 4.2);
    cam.position.set(
      amortir(cam.position.x, cibleCam.x, 3, delta),
      amortir(cam.position.y, cibleCam.y, 3, delta),
      amortir(cam.position.z, cibleCam.z, 3, delta),
    );
    return new Vector3(p.x, 1.35, p.z);
  };

  // Le rendu est pris en charge ici (priorité 1) : l'écran partagé dessine deux vues côte à côte.
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const e = etat.current;
    e.tension = amortir(e.tension, tension, 1.5, delta);
    const plans = plansDuDebat(e.tension);
    e.plan = plans[Math.floor(t / dureeDuPlan(e.tension)) % plans.length]!;
    const cam = camera as PerspectiveCamera;
    let regard: Vector3;
    if (e.plan === 'large') {
      const recul = Math.max(1, (envergure * 1.15) / (size.width / size.height) / 4.4);
      cam.position.set(
        amortir(cam.position.x, Math.sin(t * 0.18) * 1.2, 2, delta),
        amortir(cam.position.y, 2.6 + recul, 2, delta),
        amortir(cam.position.z, 6.5 * recul + 2, 2, delta),
      );
      regard = new Vector3(0, 1.1, 0.5);
    } else if (e.plan === 'champ-contrechamp') regard = serrer(cam, iCible, -1, delta);
    else regard = serrer(cam, iParle, 1, delta);
    e.regard.lerp(regard, 1 - Math.exp(-4 * delta));
    cam.lookAt(e.regard);

    // Lumière : chaude et enveloppante quand le ton est posé, froide et contrastée quand il monte.
    teinte.copy(CHAUD).lerp(FROID, e.tension);
    if (ambiance.current) {
      ambiance.current.color.copy(teinte);
      ambiance.current.intensity = 1.5 - 0.9 * e.tension;
    }
    if (cle.current) {
      cle.current.color.copy(teinte);
      cle.current.intensity = 1.6 + 2.4 * e.tension;
    }
    colonnes.current.forEach((colonne, i) => {
      if (!colonne) return;
      const actif = i === iParle && parle !== null;
      (colonne.material as MeshBasicMaterial).opacity = amortir(
        (colonne.material as MeshBasicMaterial).opacity,
        actif ? 0.55 + 0.15 * Math.sin(t * 5) : 0.14,
        4,
        delta,
      );
    });
    ecrans.current.forEach((ecran, i) => {
      if (ecran)
        (ecran.material as MeshBasicMaterial).color
          .copy(teinte)
          .multiplyScalar(0.25 + 0.2 * Math.sin(t * (0.8 + e.tension * 3) + i * 1.7) ** 2);
    });

    gl.setScissorTest(false);
    if (e.plan !== 'ecran-partage') {
      cam.aspect = size.width / size.height;
      cam.updateProjectionMatrix();
      gl.setViewport(0, 0, size.width, size.height);
      gl.render(scene, cam);
      return;
    }
    // Écran partagé : celui qui parle à gauche, celui qu'il vise à droite, séparés par un filet.
    const moitie = size.width / 2;
    gl.clear();
    gl.setScissorTest(true);
    cam.aspect = seconde.aspect = (moitie - 1) / size.height;
    cam.updateProjectionMatrix();
    seconde.updateProjectionMatrix();
    seconde.lookAt(serrer(seconde, iCible, -1, delta));
    gl.setViewport(0, 0, moitie - 1, size.height);
    gl.setScissor(0, 0, moitie - 1, size.height);
    gl.render(scene, cam);
    gl.setViewport(moitie + 1, 0, moitie - 1, size.height);
    gl.setScissor(moitie + 1, 0, moitie - 1, size.height);
    gl.render(scene, seconde);
    gl.setScissorTest(false);
  }, 1);

  useEffect(() => {
    const releve = window.setInterval(
      () => tracer('debat', { plan: etat.current.plan, tension: etat.current.tension }),
      250,
    );
    return () => window.clearInterval(releve);
  }, []);

  return (
    <>
      <ambientLight ref={ambiance} intensity={1.2} />
      <directionalLight ref={cle} position={[3, 8, 6]} intensity={2} />
      {/* Sol du studio et anneau lumineux. */}
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[envergure + 6, 64]} />
        <meshStandardMaterial color="#0b1024" roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <ringGeometry args={[envergure + 1.2, envergure + 1.4, 96]} />
        <meshBasicMaterial color="#e3c46c" />
      </mesh>
      {/* Table de l'arbitrage, au centre, sans personne autour. */}
      <mesh position={[0, 0.5, 3.4]}>
        <cylinderGeometry args={[1.5, 1.3, 1, 40]} />
        <meshStandardMaterial color="#1a2247" roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.02, 3.4]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.25, 1.5, 48]} />
        <meshBasicMaterial color="#e3c46c" />
      </mesh>
      {/* Fond de studio : écrans dont la lumière suit la tension. */}
      {Array.from({ length: 7 }, (_, i) => {
        const angle = Math.PI * (0.2 + (0.6 * i) / 6);
        const r = envergure + 4.5;
        return (
          <mesh
            key={i}
            ref={(m) => void (ecrans.current[i] = m)}
            position={[r * Math.cos(angle), 3.4, 3 - r * Math.sin(angle)]}
            rotation-y={Math.PI / 2 - angle}
          >
            <planeGeometry args={[r * 0.26, 6.2]} />
            <meshBasicMaterial color="#223" />
          </mesh>
        );
      })}
      {pupitres.map((pupitre, i) => {
        const p = places[i]!;
        const orientation = Math.atan2(-p.x, 6 - p.z);
        return (
          <group key={pupitre.id} position={p} rotation-y={orientation}>
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[1.05, 1.24, 0.6]} />
              <meshStandardMaterial color="#141a36" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.66, 0.31]}>
              <planeGeometry args={[0.92, 1.05]} />
              <meshBasicMaterial color={pupitre.couleur} />
            </mesh>
            <mesh position={[0, 1.27, 0.04]} rotation-x={-0.28}>
              <boxGeometry args={[1.15, 0.05, 0.7]} />
              <meshStandardMaterial color="#e3c46c" roughness={0.3} metalness={0.7} />
            </mesh>
            {/* La place du candidat : une colonne de lumière à sa couleur, pas une silhouette. */}
            <mesh ref={(m) => void (colonnes.current[i] = m)} position={[0, 2.6, -0.75]}>
              <cylinderGeometry args={[0.34, 0.5, 5.2, 24, 1, true]} />
              <meshBasicMaterial
                color={pupitre.couleur}
                transparent
                opacity={0.14}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export default function Debat3D(props: Debat3DProps) {
  return (
    <Toile
      nom="debat"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 3.6, 10], fov: 38 }}
      fond="#050814"
    >
      <Plateau {...props} />
    </Toile>
  );
}
