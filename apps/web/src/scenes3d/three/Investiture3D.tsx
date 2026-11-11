import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { REGLAGES, type Palier } from '../qualite';
import { creerDrapeau } from './drapeau';
import { silhouette } from './foule';
import { matiere, repeter } from './textures';
import { mettreAuPoint, Toile, tracer } from './Toile';

// Investiture (phase 26) : la cour d'honneur de l'Élysée au matin — pierre de taille, toits
// d'ardoise à la Mansart, hautes fenêtres dont le verre reflète le ciel, perron, gravier, tapis
// rouge, drapeau au fronton, et la garde républicaine suggérée par deux haies de silhouettes
// immobiles (tunique sombre, casque doré, plumet rouge, sans visage). Ciel calculé (diffusion
// atmosphérique), soleil bas et ombres portées. Reconstitution stylisée, pas un relevé du palais.

type Position = [number, number, number];

/** Maillage instancié à partir de positions (fenêtres, gardes, casques…). */
function useInstances(
  geometrie: () => BufferGeometry,
  materiau: () => Material,
  positions: readonly Position[],
  ombre = false,
) {
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometrie(), materiau(), positions.length);
    const matrice = new Matrix4();
    positions.forEach((p, i) => m.setMatrixAt(i, matrice.makeTranslation(...p)));
    m.castShadow = ombre;
    m.receiveShadow = true;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return mesh;
}

/** Toit à la Mansart : un trapèze extrudé sur la longueur du bâtiment. */
function toit(largeur: number, profondeur: number, hauteur: number) {
  const forme = new Shape();
  forme.moveTo(-profondeur / 2, 0);
  forme.lineTo(profondeur / 2, 0);
  forme.lineTo(profondeur / 2 - 0.9, hauteur);
  forme.lineTo(-profondeur / 2 + 0.9, hauteur);
  forme.closePath();
  return new ExtrudeGeometry(forme, { depth: largeur, bevelEnabled: false })
    .rotateY(Math.PI / 2)
    .translate(-largeur / 2, 0, 0);
}

const FENETRES: Position[] = [];
for (const etage of [1.7, 4.5])
  for (let i = -6; i <= 6; i++) if (Math.abs(i) > 1) FENETRES.push([i * 1.55, etage, 1.53]);
const FENETRES_AILES: Position[] = [];
for (const cote of [-1, 1])
  for (const etage of [1.7, 4.5])
    for (let k = 0; k < 5; k++) FENETRES_AILES.push([cote * 9.47, etage, 3 + k * 1.8]);
const LUCARNES: Position[] = [];
for (let i = -6; i <= 6; i++) if (Math.abs(i) > 1) LUCARNES.push([i * 1.55, 7.0, 1.1]);
const GARDES: Position[] = [];
for (const cote of [-1, 1]) for (let k = 0; k < 10; k++) GARDES.push([cote * 2.4, 0, 5 + k * 1.7]);

function Cour({ duree, palier }: { duree: number; palier: Palier }) {
  const reglages = REGLAGES[palier];
  const { scene } = useThree();
  const soleil = useMemo(() => {
    const direction = new Vector3().setFromSphericalCoords(
      1,
      MathUtils.degToRad(90 - 17),
      MathUtils.degToRad(148),
    );
    return direction;
  }, []);
  const ciel = useMemo(() => {
    const c = new Sky();
    c.scale.setScalar(4000);
    const u = c.material.uniforms;
    u.turbidity!.value = 3;
    u.rayleigh!.value = 1.1;
    u.mieCoefficient!.value = 0.006;
    u.mieDirectionalG!.value = 0.85;
    u.sunPosition!.value.copy(soleil);
    return c;
  }, [soleil]);
  useEffect(() => {
    scene.add(ciel);
    return () => {
      scene.remove(ciel);
      ciel.geometry.dispose();
      ciel.material.dispose();
    };
  }, [scene, ciel]);

  const m = useMemo(() => {
    const cote = reglages.textures;
    const pierre = matiere('pierre', cote);
    return {
      mur: repeter(pierre, 5, 1.5),
      aile: repeter(pierre, 3, 1.5),
      colonne: repeter(pierre, 1, 2),
      ardoise: repeter(matiere('ardoise', cote), 5, 1),
      gravier: repeter(matiere('gravier', cote), 14, 12),
      tapis: repeter(matiere('velours', cote), 2, 16),
    };
  }, [reglages.textures]);
  const g = useMemo(
    () => ({
      toit: toit(21.4, 3.4, 1.9),
      toitAile: toit(11.4, 4.4, 1.9),
      fronton: toit(5.6, 3.4, 1.4),
    }),
    [],
  );
  const drapeau = useMemo(() => creerDrapeau({ drame: 0, vent: 1.15 }), []);
  useEffect(
    () => () => {
      drapeau.dispose();
      Object.values(g).forEach((x) => x.dispose());
    },
    [drapeau, g],
  );

  const verre = () =>
    new MeshStandardMaterial({
      color: '#141c28',
      metalness: 0.95,
      roughness: 0.08,
      envMapIntensity: 2.2,
    });
  const cadre = () => new MeshStandardMaterial({ color: '#f1ebdd', roughness: 0.7 });
  const fenetres = useInstances(() => new BoxGeometry(0.72, 1.75, 0.05), verre, FENETRES);
  const cadres = useInstances(
    () => new BoxGeometry(0.92, 2.0, 0.06).translate(0, 0, -0.03),
    cadre,
    FENETRES,
    true,
  );
  const fenetresAiles = useInstances(
    () => new BoxGeometry(0.05, 1.75, 0.72),
    verre,
    FENETRES_AILES,
  );
  const lucarnes = useInstances(() => new BoxGeometry(0.7, 0.9, 0.7), cadre, LUCARNES, true);
  const vitresLucarnes = useInstances(
    () => new BoxGeometry(0.44, 0.6, 0.04).translate(0, 0, 0.36),
    verre,
    LUCARNES,
  );
  const gardes = useInstances(
    silhouette,
    () => new MeshStandardMaterial({ color: '#10182c', roughness: 0.75 }),
    GARDES,
    true,
  );
  const casques = useInstances(
    () =>
      new SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, 1.69, 0.01),
    () => new MeshStandardMaterial({ color: '#c9a44a', metalness: 1, roughness: 0.22 }),
    GARDES,
  );
  const plumets = useInstances(
    () => new BoxGeometry(0.035, 0.34, 0.07).translate(0, 1.95, -0.03),
    () => new MeshStandardMaterial({ color: '#b3121f', roughness: 0.9 }),
    GARDES,
  );
  const baudriers = useInstances(
    () => new BoxGeometry(0.34, 0.045, 0.24).translate(0, 1.02, 0),
    () => new MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.6 }),
    GARDES,
  );
  useEffect(() => {
    tracer('investiture', { gardes: GARDES.length });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    drapeau.uniforms.uTemps!.value = t;
    // Travelling avant sur le tapis rouge, à hauteur d'homme, de la grille au perron. Sur un
    // écran en hauteur, la caméra recule pour garder le pavillon et ses ailes dans le cadre.
    const k = Math.min(1, t / duree);
    const avance = k * k * (3 - 2 * k);
    const recul = Math.max(1, 1.05 / (state.size.width / Math.max(1, state.size.height)));
    state.camera.position.set(
      Math.sin(t * 0.3) * 0.2,
      1.7 + 1.0 * avance,
      15 * recul + 14 * (1 - avance),
    );
    state.camera.lookAt(0, 4.4, 0);
    mettreAuPoint('investiture', state.camera.position.z);
  });

  const pierreMat = <meshStandardMaterial {...m.mur} />;
  return (
    <>
      <hemisphereLight args={['#bcd3ff', '#bfae90', 0.55]} />
      <directionalLight
        position={soleil.clone().multiplyScalar(60)}
        intensity={4.2}
        color="#ffe2bd"
        castShadow={reglages.ombres}
        shadow-mapSize={palier === 'eleve' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {/* Cour gravillonnée et tapis rouge. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 16]} receiveShadow>
        <planeGeometry args={[70, 60]} />
        <meshStandardMaterial {...m.gravier} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 15]} receiveShadow>
        <planeGeometry args={[2.7, 26]} />
        <meshStandardMaterial {...m.tapis} color="#9c1220" roughness={1} />
      </mesh>
      {/* Corps central : deux niveaux, bandeau, corniche, toit d'ardoise. */}
      <mesh position={[0, 3.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[21, 6.2, 3]} />
        {pierreMat}
      </mesh>
      <mesh position={[0, 3.05, 1.53]} castShadow>
        <boxGeometry args={[21.1, 0.16, 0.1]} />
        <meshStandardMaterial color="#f1ebdd" roughness={0.7} />
      </mesh>
      <mesh position={[0, 6.3, 0]} castShadow>
        <boxGeometry args={[21.5, 0.3, 3.5]} />
        <meshStandardMaterial color="#f1ebdd" roughness={0.7} />
      </mesh>
      <mesh geometry={g.toit} position={[0, 6.45, 0]} castShadow>
        <meshStandardMaterial {...m.ardoise} metalness={0.25} />
      </mesh>
      {/* Pavillon d'entrée : avant-corps, quatre colonnes, entablement, fronton. */}
      <mesh position={[0, 3.6, 0.9]} castShadow receiveShadow>
        <boxGeometry args={[5.4, 7.2, 3]} />
        {pierreMat}
      </mesh>
      {[-1.9, -0.65, 0.65, 1.9].map((x) => (
        <group key={x} position={[x, 0.66, 2.75]}>
          <mesh position-y={2.5} castShadow>
            <cylinderGeometry args={[0.2, 0.25, 5, 20]} />
            <meshStandardMaterial {...m.colonne} color="#f4efe3" />
          </mesh>
          <mesh position-y={-0.05}>
            <boxGeometry args={[0.62, 0.22, 0.62]} />
            <meshStandardMaterial {...m.colonne} />
          </mesh>
          <mesh position-y={5.1}>
            <boxGeometry args={[0.6, 0.2, 0.6]} />
            <meshStandardMaterial {...m.colonne} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 6.1, 2.75]} castShadow>
        <boxGeometry args={[4.8, 0.55, 0.8]} />
        <meshStandardMaterial {...m.colonne} color="#f4efe3" />
      </mesh>
      <mesh geometry={g.fronton} position={[0, 7.2, 0.9]} castShadow>
        <meshStandardMaterial {...m.ardoise} metalness={0.25} />
      </mesh>
      {/* Grande porte vitrée. */}
      <mesh position={[0, 1.95, 2.41]}>
        <boxGeometry args={[1.5, 2.6, 0.05]} />
        <meshStandardMaterial
          color="#141c28"
          metalness={0.95}
          roughness={0.08}
          envMapIntensity={2.2}
        />
      </mesh>
      {/* Perron de cinq marches. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, 0.066 + i * 0.132, 4.3 - i * 0.3]} castShadow receiveShadow>
          <boxGeometry args={[6.4 - i * 0.25, 0.132, 1.6]} />
          <meshStandardMaterial {...m.colonne} color="#ece5d4" />
        </mesh>
      ))}
      {/* Ailes de la cour d'honneur. */}
      {[-1, 1].map((cote) => (
        <group key={cote}>
          <mesh position={[cote * 11.5, 3.1, 6.5]} castShadow receiveShadow>
            <boxGeometry args={[4, 6.2, 11]} />
            <meshStandardMaterial {...m.aile} />
          </mesh>
          <mesh position={[cote * 11.5, 6.3, 6.5]} castShadow>
            <boxGeometry args={[4.5, 0.3, 11.5]} />
            <meshStandardMaterial color="#f1ebdd" roughness={0.7} />
          </mesh>
          <mesh
            geometry={g.toitAile}
            position={[cote * 11.5, 6.45, 6.5]}
            rotation-y={Math.PI / 2}
            castShadow
          >
            <meshStandardMaterial {...m.ardoise} metalness={0.25} />
          </mesh>
          {/* Lanterne de la cour. */}
          <mesh position={[cote * 4.6, 1.6, 6]} castShadow>
            <cylinderGeometry args={[0.05, 0.08, 3.2, 8]} />
            <meshStandardMaterial color="#14161a" metalness={0.8} roughness={0.4} />
          </mesh>
          <mesh position={[cote * 4.6, 3.35, 6]}>
            <boxGeometry args={[0.3, 0.42, 0.3]} />
            <meshStandardMaterial
              color="#fff3cf"
              emissive="#ffd98a"
              emissiveIntensity={0.6}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}
      <primitive object={cadres} />
      <primitive object={fenetres} />
      <primitive object={fenetresAiles} />
      <primitive object={lucarnes} />
      <primitive object={vitresLucarnes} />
      <primitive object={gardes} />
      <primitive object={casques} />
      <primitive object={plumets} />
      <primitive object={baudriers} />
      {/* Drapeau au fronton, en tissu animé. */}
      <mesh position={[0, 10.4, 0.9]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 4.4, 8]} />
        <meshStandardMaterial color="#d9d9d9" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh material={drapeau} position={[1.34, 11.7, 0.9]} scale={[2.6, 1.7, 1]}>
        <planeGeometry args={[1, 1, 48, 28]} />
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
      camera={{ position: [0, 1.7, 30], fov: 46, near: 0.3, far: 6000 }}
      environnement={0.45}
      exposition={0.36}
      post={{ ouverture: 0.00012, vignette: 0.35, grain: 0.025 }}
    >
      <Cour duree={duree} palier={palier} />
    </Toile>
  );
}
