import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three';
import type { Foule } from '../foule';
import { REGLAGES, type Palier } from '../qualite';
import { alea, creerFoule, placesDeSalle, profondeurDeSalle } from './foule';
import { matiere, repeter } from './textures';
import { mettreAuPoint, Toile, tracer } from './Toile';

// Scène de meeting (phase 26) : une grande salle dans la pénombre, un mur d'écrans à la couleur
// du camp, une rampe de projecteurs dont les faisceaux percent la brume, et la foule à contre-jour,
// instanciée, dont la taille et la ferveur viennent de la partie. Personne sur scène : un pupitre.

export type Meeting3DProps = {
  palier: Palier;
  visible: boolean;
  foule: Foule;
  /** Couleur du camp du joueur. */
  couleur: string;
};

const BRUME = '#0a1020';

/** Mur d'écrans : nappes de lumière lentes, trame de diodes, sans texte ni emblème. */
const ECRAN = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uCouleur; uniform float uTemps; uniform float uForce; varying vec2 vUv;
    void main() {
      float nappe = 0.5 + 0.5 * sin(vUv.x * 5.0 + uTemps * 0.5 + sin(vUv.y * 3.0 + uTemps * 0.3) * 1.6);
      float rayon = smoothstep(0.75, 0.0, distance(vUv, vec2(0.5, 0.42)));
      // Dalles d'écran : joints fins entre les panneaux.
      vec2 dalle = abs(fract(vUv * vec2(12.0, 5.0)) - 0.5);
      float joint = smoothstep(0.5, 0.485, max(dalle.x, dalle.y));
      vec3 c = mix(uCouleur * 0.12, mix(uCouleur, vec3(1.0), 0.25), rayon * (0.45 + 0.55 * nappe));
      gl_FragColor = vec4(c * (0.75 + 0.25 * joint) * uForce, 1.0);
    }`,
};

/** Faisceau de projecteur dans la brume : dense près de la lampe, fondu sur ses bords. */
const FAISCEAU = {
  vertexShader: /* glsl */ `
    varying vec3 vNormale; varying vec3 vVue; varying float vLong;
    void main() {
      vLong = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormale = normalize(normalMatrix * normal); vVue = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uCouleur; uniform float uForce; varying vec3 vNormale; varying vec3 vVue; varying float vLong;
    void main() {
      float coeur = pow(abs(dot(normalize(vNormale), vVue)), 2.2);
      float chute = pow(vLong, 1.6);
      gl_FragColor = vec4(uCouleur * coeur * chute * uForce, 1.0);
    }`,
};

function Salle({ foule, couleur, palier }: Meeting3DProps) {
  const reglages = REGLAGES[palier];
  const profondeur = profondeurDeSalle(foule.capacite);
  const places = useMemo(
    () => placesDeSalle(foule.capacite, foule.spectateurs),
    [foule.capacite, foule.spectateurs],
  );
  const lumiere = useMemo(
    () => `#${new Color(couleur).lerp(new Color('#ffffff'), 0.55).getHexString()}`,
    [couleur],
  );
  const public_ = useMemo(
    () =>
      creerFoule(places, {
        scene: new Vector3(0, 5.5, -1),
        lumiere,
        brume: BRUME,
        densite: 0.022,
        ambiance: 0.13,
      }),
    [places, lumiere],
  );
  useEffect(() => () => public_.liberer(), [public_]);
  const largeur = (public_.materiau.uniforms.uLargeur!.value as number) + 6;

  // Téléphones levés : des points de lumière qui scintillent au-dessus des têtes.
  const telephones = useMemo(() => {
    const nombre = Math.round(places.length * 0.05 * (0.4 + foule.ferveur));
    const g = new BufferGeometry();
    const positions = new Float32Array(nombre * 3);
    const graines = new Float32Array(nombre);
    for (let i = 0; i < nombre; i++) {
      const place = places[Math.floor(alea(i, 21) * places.length)]!;
      positions.set([place.x, 1.95 + alea(i, 22) * 0.2, place.z], i * 3);
      graines[i] = alea(i, 23);
    }
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('aGraine', new BufferAttribute(graines, 1));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTemps: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTemps; attribute float aGraine; varying float vEclat;
        void main() {
          vEclat = 0.55 + 0.45 * sin(uTemps * (1.5 + aGraine * 3.0) + aGraine * 50.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 150.0 * vEclat / -mv.z; gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vEclat;
        void main() {
          float h = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * h * h * vEclat * 1.6, 1.0);
        }`,
    });
    return { g, m };
  }, [places, foule.ferveur]);
  useEffect(
    () => () => {
      telephones.g.dispose();
      telephones.m.dispose();
    },
    [telephones],
  );

  const sol = useMemo(
    () => repeter(matiere('beton', reglages.textures), largeur / 6, (profondeur + 14) / 6),
    [reglages.textures, largeur, profondeur],
  );
  const bois = useMemo(() => matiere('bois', reglages.textures), [reglages.textures]);
  const materiaux = useMemo(() => {
    const teinte = new Color(couleur);
    return {
      ecran: new ShaderMaterial({
        ...ECRAN,
        uniforms: { uCouleur: { value: teinte }, uTemps: { value: 0 }, uForce: { value: 1.15 } },
      }),
      faisceaux: [0, 1, 2, 3, 4, 5, 6].map(
        (i) =>
          new ShaderMaterial({
            ...FAISCEAU,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            blending: AdditiveBlending,
            uniforms: {
              uCouleur: {
                value: i % 2 ? new Color('#ffffff') : teinte.clone().lerp(new Color('#fff'), 0.3),
              },
              uForce: { value: 0.3 },
            },
          }),
      ),
    };
  }, [couleur]);
  useEffect(
    () => () => {
      materiaux.ecran.dispose();
      materiaux.faisceaux.forEach((m) => m.dispose());
    },
    [materiaux],
  );
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

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const u = public_.materiau.uniforms;
    u.uTemps!.value = t;
    telephones.m.uniforms.uTemps!.value = t;
    materiaux.ecran.uniforms.uTemps!.value = t;
    // La ferveur monte pendant la première seconde ; les vagues passent ensuite, l'une après l'autre.
    u.uFerveur!.value = foule.ferveur * Math.min(1, t / 1.2);
    const cycle = 3.2;
    const passage = t - 1.5;
    u.uVague!.value =
      foule.vagues > 0 && passage > 0 && passage < cycle * foule.vagues
        ? (passage % cycle) / (cycle * 0.75)
        : -1;
    // Caméra à l'épaule dans la foule, puis grue : elle s'élève au-dessus des têtes vers la scène.
    const k = 1 - Math.exp(-t * 0.28);
    const recul = Math.min(profondeur, 16 + foule.remplissage * (profondeur - 16));
    state.camera.position.set(
      Math.sin(t * 0.22) * largeur * 0.06,
      2.4 + k * 4.2,
      recul * (1.0 - 0.28 * k) + 1.5,
    );
    state.camera.lookAt(0, 3.2 - k * 0.6, 0);
    mettreAuPoint('meeting', state.camera.position.z * 0.6);
    faisceaux.current.forEach((f, i) => {
      if (!f) return;
      f.rotation.z = Math.sin(t * (0.5 + i * 0.11) + i * 1.3) * 0.4 * (0.35 + foule.ferveur);
      f.rotation.x = 0.55 + Math.sin(t * (0.35 + i * 0.07) + i) * 0.25;
      materiaux.faisceaux[i]!.uniforms.uForce!.value =
        (0.07 + 0.1 * foule.ferveur) * (0.8 + 0.2 * Math.sin(t * 2.0 + i * 2.0));
    });
  });

  const largeurScene = Math.min(largeur * 0.8, 26);
  return (
    <>
      <fogExp2 attach="fog" args={[BRUME, 0.02]} />
      <ambientLight intensity={0.15} color={lumiere} />
      {/* La lumière de la scène retombe sur les premiers rangs et sur le sol. */}
      <spotLight
        position={[0, 9, -1]}
        target-position={[0, 0, 10]}
        angle={1}
        penumbra={0.9}
        intensity={260}
        color={lumiere}
        distance={profondeur + 20}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, profondeur / 2]}>
        <planeGeometry args={[largeur + 10, profondeur + 24]} />
        <meshStandardMaterial {...sol} metalness={0.2} />
      </mesh>
      {/* Scène : plateau de bois sombre, jupe noire, pupitre éclairé. */}
      <mesh position={[0, 0.65, -0.5]}>
        <boxGeometry args={[largeurScene, 1.3, 5]} />
        <meshStandardMaterial color="#07080c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.31, -0.5]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[largeurScene, 5]} />
        <meshStandardMaterial {...bois} color="#6b6b6b" />
      </mesh>
      <mesh position={[0, 1.9, 0.6]}>
        <boxGeometry args={[0.62, 1.15, 0.42]} />
        <meshStandardMaterial color="#0c0d12" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, 2.5, 0.6]} rotation-x={-0.3}>
        <boxGeometry args={[0.7, 0.04, 0.5]} />
        <meshStandardMaterial color="#111" emissive={lumiere} emissiveIntensity={0.6} />
      </mesh>
      {/* Mur d'écrans et cadre de scène. */}
      <mesh position={[0, 6.2, -3]} material={materiaux.ecran}>
        <planeGeometry args={[largeurScene, 9]} />
      </mesh>
      {[-1, 1].map((cote) => (
        <mesh key={cote} position={[cote * (largeurScene / 2 + 0.6), 6, -1.5]}>
          <boxGeometry args={[1.2, 12, 3.2]} />
          <meshStandardMaterial color="#050608" roughness={0.8} />
        </mesh>
      ))}
      {/* Rampe de projecteurs : poutre, lampes et faisceaux dans la brume. */}
      <mesh position={[0, 11.4, 1.5]}>
        <boxGeometry args={[largeurScene + 3, 0.35, 0.35]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.5} metalness={0.8} />
      </mesh>
      {materiaux.faisceaux.map((materiau, i) => {
        const x = ((i - 3) / 3) * (largeurScene / 2);
        return (
          <group key={i} position={[x, 11.2, 1.5]}>
            <mesh>
              <sphereGeometry args={[0.16, 12, 8]} />
              <meshBasicMaterial color={i % 2 ? '#ffffff' : lumiere} toneMapped={false} />
            </mesh>
            <group ref={(m) => void (faisceaux.current[i] = m as unknown as Mesh)}>
              <mesh material={materiau} position={[0, -9, 0]}>
                <coneGeometry args={[2.6, 18, 24, 1, true]} />
              </mesh>
            </group>
          </group>
        );
      })}
      <primitive object={public_.mesh} />
      <points geometry={telephones.g} material={telephones.m} frustumCulled={false} />
    </>
  );
}

export default function Meeting3D(props: Meeting3DProps) {
  return (
    <Toile
      nom="meeting"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 2.4, 20], fov: 50, near: 0.3, far: 300 }}
      fond={BRUME}
      environnement={0.15}
      post={{ bloom: 0.45, seuil: 0.7, ouverture: 0.00035, vignette: 0.6, grain: 0.05 }}
    >
      <Salle {...props} />
    </Toile>
  );
}
