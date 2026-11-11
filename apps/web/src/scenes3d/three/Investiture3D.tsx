import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { InstancedMesh, Matrix4, MeshLambertMaterial, BoxGeometry, CapsuleGeometry } from 'three';
import type { Palier } from '../qualite';
import { creerDrapeau } from './drapeau';
import { Toile, tracer } from './Toile';

// Investiture (phase 26) : la cour d'honneur de l'Élysée, stylisée — un corps central à
// colonnes, deux ailes, le perron, le tapis rouge, le drapeau, et la garde républicaine suggérée
// par deux haies de plots (bleu nuit, plumet rouge). Architecture seulement : personne dans la cour.

const PIERRE = '#e9e1cf';
const ARDOISE = '#4a5468';

/** Petit maillage instancié à partir de positions (fenêtres, gardes, plumets). */
function useInstances(
  fabrique: () => [BoxGeometry | CapsuleGeometry, string],
  positions: readonly [number, number, number][],
) {
  const mesh = useMemo(() => {
    const [geometrie, couleur] = fabrique();
    const m = new InstancedMesh(
      geometrie,
      new MeshLambertMaterial({ color: couleur }),
      positions.length,
    );
    const matrice = new Matrix4();
    positions.forEach((p, i) => m.setMatrixAt(i, matrice.makeTranslation(...p)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return mesh;
}

const FENETRES: [number, number, number][] = [];
for (const etage of [1.5, 4])
  for (let i = -6; i <= 6; i++) if (Math.abs(i) > 1) FENETRES.push([i * 1.55, etage, 1.52]);
for (const cote of [-1, 1])
  for (const etage of [1.5, 4])
    for (let k = 0; k < 4; k++) FENETRES.push([cote * 9.45, etage, 3.2 + k * 1.9]);
const GARDES: [number, number, number][] = [];
for (const cote of [-1, 1])
  for (let k = 0; k < 9; k++) GARDES.push([cote * 2.3, 0.75, 4 + k * 1.9]);
const PLUMETS = GARDES.map(([x, , z]) => [x, 1.72, z] as [number, number, number]);

function Cour({ duree }: { duree: number }) {
  const drapeau = useMemo(() => creerDrapeau({ drame: 0, vent: 1.2 }), []);
  useEffect(() => () => drapeau.dispose(), [drapeau]);
  const fenetres = useInstances(() => [new BoxGeometry(0.7, 1.5, 0.06), '#27324a'], FENETRES);
  const gardes = useInstances(() => [new CapsuleGeometry(0.22, 1, 3, 8), '#16213f'], GARDES);
  const plumets = useInstances(() => [new BoxGeometry(0.12, 0.5, 0.12), '#c8102e'], PLUMETS);
  useEffect(() => {
    tracer('investiture', { gardes: GARDES.length });
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    drapeau.uniforms.uTemps!.value = t;
    // Travelling avant sur le tapis rouge, de la grille au perron.
    const k = Math.min(1, t / duree);
    const avance = k * k * (3 - 2 * k);
    // Sur un écran en hauteur, la caméra recule pour garder le pavillon et ses ailes dans le cadre.
    const recul = Math.max(1, 1.05 / (state.size.width / Math.max(1, state.size.height)));
    state.camera.position.set(
      Math.sin(t * 0.3) * 0.25,
      1.9 + 1.6 * avance,
      16 * recul + 14 * (1 - avance),
    );
    state.camera.lookAt(0, 4.2, 0);
  });
  return (
    <>
      <ambientLight intensity={1.4} color="#ffe9d2" />
      <directionalLight position={[8, 14, 12]} intensity={2.2} color="#fff1dd" />
      {/* Cour gravillonnée et tapis rouge. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 12]}>
        <planeGeometry args={[60, 50]} />
        <meshLambertMaterial color="#cdbfa3" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 13.5]}>
        <planeGeometry args={[2.6, 24]} />
        <meshLambertMaterial color="#a3122a" />
      </mesh>
      {/* Corps central, pavillon à colonnes, toits d'ardoise. */}
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[21, 5.8, 3]} />
        <meshLambertMaterial color={PIERRE} />
      </mesh>
      <mesh position={[0, 6.3, 0]}>
        <boxGeometry args={[21.4, 1, 3.3]} />
        <meshLambertMaterial color={ARDOISE} />
      </mesh>
      <mesh position={[0, 3.6, 0.7]}>
        <boxGeometry args={[5.2, 7.2, 3]} />
        <meshLambertMaterial color={PIERRE} />
      </mesh>
      <mesh position={[0, 8, 0.7]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[4, 1.8, 4]} />
        <meshLambertMaterial color={ARDOISE} />
      </mesh>
      {[-1.8, -0.6, 0.6, 1.8].map((x) => (
        <mesh key={x} position={[x, 2.9, 2.5]}>
          <cylinderGeometry args={[0.2, 0.24, 5.2, 12]} />
          <meshLambertMaterial color="#f6f0e2" />
        </mesh>
      ))}
      <mesh position={[0, 5.75, 2.5]}>
        <boxGeometry args={[4.6, 0.5, 0.7]} />
        <meshLambertMaterial color="#f6f0e2" />
      </mesh>
      {/* Perron. */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.12 + i * 0.22, 3.6 - i * 0.35]}>
          <boxGeometry args={[6 - i * 0.5, 0.24, 1.4]} />
          <meshLambertMaterial color="#f1ead9" />
        </mesh>
      ))}
      {/* Ailes de la cour d'honneur. */}
      {[-1, 1].map((cote) => (
        <group key={cote}>
          <mesh position={[cote * 11.5, 2.9, 5.5]}>
            <boxGeometry args={[4, 5.8, 11]} />
            <meshLambertMaterial color={PIERRE} />
          </mesh>
          <mesh position={[cote * 11.5, 6.3, 5.5]}>
            <boxGeometry args={[4.3, 1, 11.3]} />
            <meshLambertMaterial color={ARDOISE} />
          </mesh>
        </group>
      ))}
      <primitive object={fenetres} />
      <primitive object={gardes} />
      <primitive object={plumets} />
      {/* Drapeau au fronton, en tissu animé. */}
      <mesh position={[0, 10.6, 0.7]}>
        <cylinderGeometry args={[0.05, 0.05, 4.4, 8]} />
        <meshLambertMaterial color="#d9d9d9" />
      </mesh>
      <mesh material={drapeau} position={[1.35, 11.8, 0.7]} scale={[2.6, 1.7, 1]}>
        <planeGeometry args={[1, 1, 32, 18]} />
      </mesh>
    </>
  );
}

export default function Investiture3D({
  palier,
  visible,
  duree,
}: {
  palier: Palier;
  visible: boolean;
  duree: number;
}) {
  return (
    <Toile
      nom="investiture"
      palier={palier}
      visible={visible}
      camera={{ position: [0, 1.9, 30], fov: 50 }}
    >
      <Cour duree={duree} />
    </Toile>
  );
}
