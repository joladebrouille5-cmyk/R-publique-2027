import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CircleGeometry,
  Color,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
  type AmbientLight,
  type Mesh,
  type MeshStandardMaterial,
  type SpotLight,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { dureeDuPlan, plansDuDebat, type Plan } from '../debat';
import { REGLAGES, type Palier } from '../qualite';
import { matiere, repeter } from './textures';
import { amortir, mettreAuPoint, Toile, tracer } from './Toile';

// Plateau du débat en 3D (phase 26) : un studio de télévision — sol noir laqué qui reflète le
// décor, mur d'écrans, pupitres de métal brossé à face lumineuse aux couleurs de chaque camp,
// table de l'arbitrage, projecteurs. Aucune silhouette, aucun visage : des places vides. La
// réalisation alterne plan large, plan serré, champ-contrechamp et écran partagé selon la
// tension ; la lumière passe du chaud (échanges posés) au froid (échanges vifs).

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

const CHAUD = new Color('#ffcf9a');
const FROID = new Color('#9fc0ff');
const MUR_CHAUD = new Color('#ff8a3a');
const MUR_FROID = new Color('#2f6bff');

/** Mur d'écrans du studio : bandes de lumière verticales qui dérivent, joints de dalles. */
const ECRAN = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uTeinte; uniform float uTemps; uniform float uTension; varying vec2 vUv;
    void main() {
      float x = vUv.x * 9.0 + uTemps * (0.08 + uTension * 0.5);
      float bande = pow(0.5 + 0.5 * sin(x * 6.2832), 24.0);
      float voile = 0.5 + 0.5 * sin(vUv.x * 3.0 - uTemps * 0.2 + vUv.y * 2.0);
      float haut = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
      vec2 dalle = abs(fract(vUv * vec2(24.0, 4.0)) - 0.5);
      float joint = smoothstep(0.5, 0.47, max(dalle.x, dalle.y));
      vec3 c = uTeinte * (0.015 + 0.07 * voile * haut) + mix(uTeinte, vec3(1.0), 0.5) * 1.4 * bande * haut;
      gl_FragColor = vec4(c * (0.7 + 0.3 * joint), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

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

function Plateau({ pupitres, parle, cible, tension, palier }: Debat3DProps) {
  const reglages = REGLAGES[palier];
  const { gl, scene, camera, size } = useThree();
  const places = useMemo(() => emplacements(pupitres.length), [pupitres.length]);
  const seconde = useMemo(() => new PerspectiveCamera(32, 1, 0.1, 200), []);
  const ambiance = useRef<AmbientLight>(null);
  const projecteurs = useRef<(SpotLight | null)[]>([]);
  const faces = useRef<(Mesh | null)[]>([]);
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

  const ecran = useMemo(
    () =>
      new ShaderMaterial({
        ...ECRAN,
        uniforms: {
          uTeinte: { value: new Color() },
          uTemps: { value: 0 },
          uTension: { value: 0 },
        },
      }),
    [],
  );
  // Sol laqué : un miroir sombre (la scène y est dessinée une seconde fois), ou un vernis simple.
  const miroir = useMemo(() => {
    if (!reglages.reflets) return null;
    const m = new Reflector(new CircleGeometry(envergure + 9, 64), {
      textureWidth: 512,
      textureHeight: 512,
      color: 0x30333a,
      clipBias: 0.003,
    });
    m.rotation.x = -Math.PI / 2;
    return m;
  }, [reglages.reflets, envergure]);
  const metal = useMemo(
    () => repeter(matiere('beton', reglages.textures), 1, 1),
    [reglages.textures],
  );
  useEffect(
    () => () => {
      ecran.dispose();
      miroir?.geometry.dispose();
      miroir?.dispose();
    },
    [ecran, miroir],
  );

  /** Cadre serré sur un pupitre : la caméra se place face à lui, légèrement de côté. */
  const serrer = (cam: PerspectiveCamera, index: number, cote: number, delta: number) => {
    const p = places[index]!;
    const cibleCam = new Vector3(p.x + cote * 1.1, 1.75, p.z + 4.4);
    cam.position.set(
      amortir(cam.position.x, cibleCam.x, 3, delta),
      amortir(cam.position.y, cibleCam.y, 3, delta),
      amortir(cam.position.z, cibleCam.z, 3, delta),
    );
    return new Vector3(p.x, 1.25, p.z);
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
        amortir(cam.position.x, Math.sin(t * 0.18) * 1.6, 2, delta),
        amortir(cam.position.y, 2.6 + recul * 0.9, 2, delta),
        amortir(cam.position.z, 6.5 * recul + 2.5, 2, delta),
      );
      regard = new Vector3(0, 1.2, 0.5);
    } else if (e.plan === 'champ-contrechamp') regard = serrer(cam, iCible, -1, delta);
    else regard = serrer(cam, iParle, 1, delta);
    e.regard.lerp(regard, 1 - Math.exp(-4 * delta));
    cam.lookAt(e.regard);
    mettreAuPoint('debat', cam.position.distanceTo(e.regard));

    // Lumière : chaude et enveloppante quand le ton est posé, froide et contrastée quand il monte.
    teinte.copy(CHAUD).lerp(FROID, e.tension);
    if (ambiance.current) {
      ambiance.current.color.copy(teinte);
      ambiance.current.intensity = 0.5 - 0.35 * e.tension;
    }
    ecran.uniforms.uTeinte!.value.copy(MUR_CHAUD).lerp(MUR_FROID, e.tension);
    ecran.uniforms.uTemps!.value = t;
    ecran.uniforms.uTension!.value = e.tension;
    projecteurs.current.forEach((lampe, i) => {
      if (!lampe) return;
      lampe.color.copy(teinte);
      const actif = parle !== null && i === iParle;
      lampe.intensity = amortir(lampe.intensity, (actif ? 520 : 200) * (1 + e.tension), 4, delta);
    });
    faces.current.forEach((face, i) => {
      if (!face) return;
      const actif = parle !== null && i === iParle;
      const materiau = face.material as MeshStandardMaterial;
      materiau.emissiveIntensity = amortir(
        materiau.emissiveIntensity,
        actif ? 1.5 + 0.2 * Math.sin(t * 5) : 0.75,
        4,
        delta,
      );
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

  const r = envergure + 5;
  return (
    <>
      <fogExp2 attach="fog" args={['#04060c', 0.018]} />
      <ambientLight ref={ambiance} intensity={0.4} />
      {miroir ? (
        <primitive object={miroir} />
      ) : (
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[envergure + 9, 64]} />
          <meshStandardMaterial {...metal} roughness={0.2} metalness={0.5} />
        </mesh>
      )}
      {/* Voile sombre sur le miroir : un sol laqué, pas une glace. */}
      {miroir && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
          <circleGeometry args={[envergure + 9, 64]} />
          <meshStandardMaterial color="#05070c" transparent opacity={0.55} roughness={0.3} />
        </mesh>
      )}
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <ringGeometry args={[envergure + 1.2, envergure + 1.28, 128]} />
        <meshBasicMaterial color="#ffe2a8" />
      </mesh>
      {/* Table de l'arbitrage : plateau de verre fumé sur socle, sans personne autour. */}
      <mesh position={[0, 0.4, 4.2]} castShadow>
        <cylinderGeometry args={[0.35, 0.55, 0.8, 40]} />
        <meshStandardMaterial color="#0b0d13" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.83, 4.2]} castShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.05, 64]} />
        <meshPhysicalMaterial color="#10141d" roughness={0.08} metalness={0.2} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.86, 4.2]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.0, 1.05, 64]} />
        <meshBasicMaterial color="#ffe2a8" />
      </mesh>
      {/* Mur d'écrans en arc, derrière les candidats. */}
      <mesh position={[0, 3.6, 3]}>
        <cylinderGeometry args={[r, r, 7.2, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
        <primitive object={ecran} attach="material" side={1} />
      </mesh>
      {/* Poutre de projecteurs. */}
      <mesh position={[0, 7.4, 4]}>
        <boxGeometry args={[envergure * 2 + 4, 0.25, 0.25]} />
        <meshStandardMaterial color="#0a0b0e" metalness={0.9} roughness={0.4} />
      </mesh>
      {pupitres.map((pupitre, i) => {
        const p = places[i]!;
        const orientation = Math.atan2(-p.x, 6 - p.z);
        return (
          <group key={pupitre.id}>
            <spotLight
              ref={(l) => void (projecteurs.current[i] = l)}
              position={[p.x * 0.8, 7.2, p.z + 4]}
              target-position={[p.x, 1, p.z]}
              angle={0.3}
              penumbra={0.8}
              intensity={200}
              castShadow={reglages.ombres}
              shadow-mapSize={[512, 512]}
              shadow-bias={-0.001}
            />
            <group position={p} rotation-y={orientation}>
              {/* Fût de métal brossé, face de verre lumineuse à la couleur du camp, tablette. */}
              <mesh position={[0, 0.6, 0]} castShadow>
                <boxGeometry args={[0.9, 1.2, 0.5]} />
                <meshStandardMaterial {...metal} color="#8a8f9a" roughness={0.35} metalness={0.9} />
              </mesh>
              <mesh ref={(m) => void (faces.current[i] = m)} position={[0, 0.62, 0.256]}>
                <planeGeometry args={[0.74, 1.02]} />
                <meshStandardMaterial
                  color="#000000"
                  emissive={pupitre.couleur}
                  emissiveIntensity={0.75}
                  roughness={0.2}
                />
              </mesh>
              <mesh position={[0, 1.24, 0.02]} rotation-x={-0.22} castShadow>
                <boxGeometry args={[1.08, 0.045, 0.66]} />
                <meshPhysicalMaterial color="#0d1017" roughness={0.15} clearcoat={1} />
              </mesh>
              {/* Deux micros sur col de cygne. */}
              {[-0.16, 0.16].map((x) => (
                <group key={x} position={[x, 1.28, 0.1]} rotation-x={0.5}>
                  <mesh position-y={0.17}>
                    <cylinderGeometry args={[0.008, 0.008, 0.34, 6]} />
                    <meshStandardMaterial color="#111" metalness={0.8} roughness={0.4} />
                  </mesh>
                  <mesh position-y={0.36}>
                    <capsuleGeometry args={[0.018, 0.05, 2, 8]} />
                    <meshStandardMaterial color="#1b1b1e" roughness={0.9} />
                  </mesh>
                </group>
              ))}
              {/* Liseré lumineux au sol : la place du candidat. */}
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.014, -0.75]}>
                <ringGeometry args={[0.5, 0.55, 48]} />
                <meshBasicMaterial color={pupitre.couleur} />
              </mesh>
            </group>
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
      camera={{ position: [0, 3.2, 10], fov: 32 }}
      fond="#04060c"
      environnement={0.25}
    >
      <Plateau {...props} />
    </Toile>
  );
}
