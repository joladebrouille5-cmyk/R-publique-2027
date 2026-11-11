import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, DoubleSide, type Mesh } from 'three';
import type { Foule } from '../foule';
import type { Palier } from '../qualite';
import { creerFoule, placesDeSalle } from './foule';
import { Toile, tracer } from './Toile';

// Scène de meeting (phase 26) : une salle, une scène aux couleurs du camp et une foule instanciée
// dont la taille et la ferveur viennent de la partie. Aucun personnage sur scène : un pupitre et
// des faisceaux de lumière.

export type Meeting3DProps = {
  palier: Palier;
  visible: boolean;
  foule: Foule;
  /** Couleur du camp du joueur. */
  couleur: string;
};

const PALETTE = ['#e8ecf5', '#c9a36a', '#8d9ab8', '#d7c9b8', '#6f7c99', '#b4553d', '#3f5aa8'];

function Salle({ foule, couleur }: Meeting3DProps) {
  const places = useMemo(
    () => placesDeSalle(foule.capacite, foule.spectateurs),
    [foule.capacite, foule.spectateurs],
  );
  const public_ = useMemo(() => creerFoule(places, PALETTE, couleur), [places, couleur]);
  useEffect(() => () => public_.liberer(), [public_]);
  useEffect(() => {
    tracer('meeting', {
      instances: public_.mesh.count,
      capacite: foule.capacite,
      ferveur: foule.ferveur,
      vagues: foule.vagues,
      objets: { foule: public_.mesh },
    });
  }, [public_, foule]);
  const faisceaux = useRef<(Mesh | null)[]>([]);
  const largeur = (public_.materiau.uniforms.uLargeur!.value as number) + 4;
  const profondeur = 3 + Math.ceil(foule.capacite / Math.sqrt(foule.capacite * 2.2)) * 0.66 + 3;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const u = public_.materiau.uniforms;
    u.uTemps!.value = t;
    // La ferveur monte pendant la première seconde ; les vagues passent ensuite, l'une après l'autre.
    u.uFerveur!.value = foule.ferveur * Math.min(1, t / 1.2);
    const cycle = 3.2;
    const passage = t - 1.5;
    u.uVague!.value =
      foule.vagues > 0 && passage > 0 && passage < cycle * foule.vagues
        ? (passage % cycle) / (cycle * 0.75)
        : -1;
    // Caméra : depuis le fond de la salle, au-dessus des têtes, lente avancée vers la scène.
    const k = 1 - Math.exp(-t * 0.3);
    state.camera.position.set(
      Math.sin(t * 0.25) * largeur * 0.08,
      3 + profondeur * (0.42 - 0.14 * k),
      2 + profondeur * (1.15 - 0.3 * k),
    );
    state.camera.lookAt(0, 2.2, 0);
    faisceaux.current.forEach((f, i) => {
      if (f) f.rotation.z = Math.sin(t * (0.6 + i * 0.13) + i) * 0.35 * (0.4 + foule.ferveur);
    });
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      {/* Sol de la salle et scène. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, profondeur / 2]}>
        <planeGeometry args={[largeur + 8, profondeur + 10]} />
        <meshBasicMaterial color="#0d1226" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[largeur * 0.7, 1, 3]} />
        <meshBasicMaterial color="#1a2140" />
      </mesh>
      <mesh position={[0, 1.55, 0.4]}>
        <boxGeometry args={[0.7, 1.1, 0.5]} />
        <meshBasicMaterial color={couleur} />
      </mesh>
      {/* Fond de scène aux couleurs du camp, sans emblème de parti réel. */}
      <mesh position={[0, 4.2, -1.6]}>
        <planeGeometry args={[largeur * 0.7, 6.4]} />
        <meshBasicMaterial color={couleur} />
      </mesh>
      <mesh position={[0, 4.2, -1.55]}>
        <ringGeometry args={[1.1, 1.5, 48]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {[-1, -0.5, 0, 0.5, 1].map((x, i) => (
        <mesh
          key={i}
          ref={(m) => void (faisceaux.current[i] = m)}
          position={[x * largeur * 0.3, 7.5, 0.5]}
        >
          <coneGeometry args={[1.6, 15, 20, 1, true]} />
          <meshBasicMaterial
            color={i % 2 ? '#ffffff' : couleur}
            transparent
            opacity={0.05 + 0.09 * foule.ferveur}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
      <primitive object={public_.mesh} />
    </>
  );
}

export default function Meeting3D(props: Meeting3DProps) {
  return (
    <Toile
      nom="meeting"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 2.2, 1.5], fov: 55 }}
      fond="#060a18"
    >
      <Salle {...props} />
    </Toile>
  );
}
