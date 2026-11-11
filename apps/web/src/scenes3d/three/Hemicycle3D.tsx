import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  LatheGeometry,
  MeshPhysicalMaterial,
  Object3D,
  ShaderMaterial,
  Vector2,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type SpotLight,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  agitation,
  centreDuGroupe,
  RAYON_EXTERIEUR,
  rangs,
  type Reaction,
  type Siege,
} from '../hemicycle';
import { REGLAGES, type Palier } from '../qualite';
import { etendre, matiere } from './textures';
import { amortir, mettreAuPoint, Toile, tracer } from './Toile';

// Hémicycle 3D des questions au gouvernement (phase 26) : une salle en gradins de moquette rouge,
// pupitres de chêne, fauteuils de velours à la couleur de leur groupe (577, une seule géométrie
// instanciée), colonnade de pierre, tribune de bois. Trois plans de caméra, un projecteur sur le
// groupe qui interpelle, trois réactions de la salle. Aucun personnage : la salle est vide de
// députés, ses fauteuils disent les effectifs.

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

const VACANT = '#2b2d33';
/** Teinte donnée au chêne clair photographié : le bois sombre et chaud des pupitres. */
const CHENE = '#a9744c';
const GRADIN = 0.34;
const BANC = { rayon: 2.25, places: 14 };
const CIBLE_LARGE = new Vector3(0, 0.9, -3.4);
const PHI = [Math.PI / 2, Math.PI] as const;

/** Fauteuil : assise et dossier capitonnés, arrondis. Le dossier est du côté du mur. */
function fauteuil() {
  const assise = new RoundedBoxGeometry(0.25, 0.09, 0.24, 2, 0.035).translate(0, 0.2, 0.02);
  const dossier = new RoundedBoxGeometry(0.25, 0.36, 0.08, 2, 0.035)
    .rotateX(-0.12)
    .translate(0, 0.36, -0.12);
  const fusion = mergeGeometries([assise, dossier])!;
  assise.dispose();
  dossier.dispose();
  return fusion;
}

const FAISCEAU = {
  vertexShader: /* glsl */ `
    varying vec3 vNormale; varying vec3 vVue; varying float vLong;
    void main() {
      vLong = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormale = normalize(normalMatrix * normal); vVue = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uForce; varying vec3 vNormale; varying vec3 vVue; varying float vLong;
    void main() {
      float coeur = pow(abs(dot(normalize(vNormale), vVue)), 2.0);
      gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * coeur * (0.25 + 0.75 * vLong) * uForce, 1.0);
    }`,
};

function Salle(props: Hemicycle3DProps) {
  const { sieges, couleurs, alignements, orateur, plan, reaction, tension, palier } = props;
  const reglages = REGLAGES[palier];
  const mesh = useRef<InstancedMesh>(null);
  const projecteur = useRef<SpotLight>(null);
  const faisceau = useRef<Mesh>(null);
  const lampeBanc = useRef<SpotLight>(null);
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
  const hauteur = gradins.length * GRADIN;

  const g = useMemo(() => {
    // Gradins : un profil en escalier tourné sur un demi-cercle.
    const profil: Vector2[] = [new Vector2(gradins[0]!.rayon - 0.36, 0)];
    gradins.forEach(({ rayon }, i) => {
      profil.push(new Vector2(rayon - 0.36, i * GRADIN), new Vector2(rayon + 0.32, i * GRADIN));
      profil.push(new Vector2(rayon + 0.32, (i + 1) * GRADIN));
    });
    profil.push(new Vector2(RAYON_EXTERIEUR + 1.7, gradins.length * GRADIN));
    // Pupitres : une tablette de chêne devant chaque rang.
    const pupitres = mergeGeometries(
      gradins.map(({ rayon }, i) => {
        const y = i * GRADIN;
        return new LatheGeometry(
          [
            new Vector2(rayon - 0.3, y),
            new Vector2(rayon - 0.3, y + 0.34),
            new Vector2(rayon - 0.2, y + 0.36),
            new Vector2(rayon - 0.17, y + 0.3),
            new Vector2(rayon - 0.24, y),
          ],
          72,
          ...PHI,
        );
      }),
    )!;
    return {
      gradins: new LatheGeometry(profil, 72, ...PHI),
      pupitres,
      fauteuil: fauteuil(),
    };
  }, [gradins]);
  const m = useMemo(() => {
    const cote = reglages.textures;
    const velours = matiere('velours', cote);
    return {
      // Surfaces à leur vraie échelle, en mètres (arc moyen des gradins, hauteur des murs…).
      moquette: etendre('velours', cote, 22, 11),
      bois: etendre('bois', cote, 20, 0.9, true),
      boiserie: etendre('bois', cote, 5, 2.3),
      lambris: etendre('bois', cote, 35, 1.8),
      parquet: etendre('parquet', cote, 23, 23),
      pierre: etendre('pierre', cote, 35, 11),
      colonne: etendre('pierre', cote, 1.7, 7),
      tenture: etendre('velours', cote, 6.4, 5.6),
      fauteuil: new MeshPhysicalMaterial({
        map: velours.map,
        normalMap: velours.normalMap,
        roughness: 0.9,
        sheen: 0.35,
        sheenRoughness: 0.6,
        sheenColor: new Color('#ffd9c0'),
        envMapIntensity: 0.35,
      }),
      faisceau: new ShaderMaterial({
        ...FAISCEAU,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        uniforms: { uForce: { value: 0 } },
      }),
    };
  }, [reglages.textures]);
  useEffect(
    () => () => {
      g.gradins.dispose();
      g.pupitres.dispose();
      g.fauteuil.dispose();
      m.fauteuil.dispose();
      m.faisceau.dispose();
    },
    [g, m],
  );

  useEffect(() => {
    tracer('hemicycle', { instances: sieges.length, plan, reaction });
  }, [sieges.length, plan, reaction]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // Caméra : plan large, plongée sur le groupe qui interpelle, retour sur le banc du gouvernement.
    // Sur un écran étroit, le plan large recule pour garder toute la salle.
    const recul = Math.max(1, 1.75 / aspect);
    const position = new Vector3(Math.sin(t * 0.12) * 0.6, 8.6 * recul, 8.4 * recul);
    const cible = CIBLE_LARGE.clone();
    if (plan === 'question' && centre) {
      const versCentre = new Vector3(-centre.x, 0, -centre.z).normalize();
      position.set(
        centre.x + versCentre.x * 4.6 + Math.sin(t * 0.3) * 0.2,
        centre.y + 2.6,
        centre.z + versCentre.z * 4.6 + 1.2,
      );
      cible.set(centre.x, centre.y + 0.3, centre.z);
    } else if (plan === 'reponse') {
      position.set(Math.sin(t * 0.2) * 0.7, 2.9, -7.2);
      cible.set(0, 0.9, -0.6);
    }
    const v = 2.0;
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
    mettreAuPoint('hemicycle', camera.position.distanceTo(regard.current));

    // Fauteuils : velours à la couleur du groupe ; le groupe qui interpelle est sous le projecteur,
    // le reste de la salle dans la pénombre ; micro-mouvements selon la réaction et la tension.
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
      objet.position.set(siege.x, siege.y + amplitude * 0.16 * saut, siege.z);
      objet.rotation.set(
        -amplitude * 0.5 * saut,
        siege.angle - Math.PI / 2,
        amplitude * 0.2 * Math.sin(t * 9 + phase),
        'YXZ',
      );
      objet.scale.setScalar(1);
      objet.updateMatrix();
      instances.setMatrixAt(i, objet.matrix);
      // Teinte du velours : la couleur du groupe, plus dense (le velours boit la lumière).
      couleur.set(siege.groupe ? (couleurs[siege.groupe] ?? VACANT) : VACANT);
      couleur.offsetHSL(0, 0.12, -0.04);
      if (siege.groupe && parle) couleur.multiplyScalar(1 + 0.5 * eclat.current);
      else couleur.multiplyScalar(1 - 0.8 * eclat.current);
      instances.setColorAt(i, couleur);
    });
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;

    const force = eclat.current * (0.9 + 0.1 * Math.sin(t * 2.5));
    if (projecteur.current) projecteur.current.intensity = 1500 * force;
    m.faisceau.uniforms.uForce!.value = 0.22 * force;
    if (faisceau.current) faisceau.current.visible = force > 0.01 && centre !== null;
    if (lampeBanc.current)
      lampeBanc.current.intensity = amortir(
        lampeBanc.current.intensity,
        plan === 'reponse' ? 420 : 40,
        3,
        delta,
      );
  });

  const mur = RAYON_EXTERIEUR + 1.7;
  const plafond = hauteur + 7.5;
  const rayonGroupe = centre
    ? Math.max(1.2, Math.sqrt(sieges.filter((s) => s.groupe === orateur).length) * 0.22)
    : 1;
  const source = centre ? new Vector3(centre.x * 0.5, plafond - 0.5, centre.z * 0.5) : null;
  const longueur =
    source && centre ? source.distanceTo(new Vector3(centre.x, centre.y, centre.z)) : 1;
  return (
    <>
      <ambientLight intensity={0.25} color="#ffe6c4" />
      {/* Verrière : une grande lumière chaude tombe du plafond, avec ses ombres. */}
      <directionalLight
        position={[3, plafond + 6, 5]}
        intensity={2.6}
        color="#fff0d8"
        castShadow={reglages.ombres}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={40}
        shadow-bias={-0.0006}
      />
      <pointLight position={[0, plafond - 1, -4]} intensity={160} color="#ffdcae" distance={30} />

      <mesh geometry={g.gradins} receiveShadow>
        <meshStandardMaterial {...m.moquette} color="#8c1c22" roughness={1} side={DoubleSide} />
      </mesh>
      <mesh geometry={g.pupitres} castShadow receiveShadow>
        <meshStandardMaterial {...m.bois} color={CHENE} side={DoubleSide} />
      </mesh>
      {/* Parquet du centre de la salle. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <circleGeometry args={[mur, 64]} />
        <meshStandardMaterial {...m.parquet} envMapIntensity={0.1} />
      </mesh>
      {/* Mur de pierre en demi-cercle, soubassement de bois, corniche. */}
      <mesh position-y={plafond / 2}>
        <cylinderGeometry args={[mur, mur, plafond, 72, 1, true, ...PHI]} />
        <meshStandardMaterial {...m.pierre} side={BackSide} />
      </mesh>
      <mesh position-y={hauteur + 0.9}>
        <cylinderGeometry args={[mur - 0.04, mur - 0.04, 1.8, 72, 1, true, ...PHI]} />
        <meshStandardMaterial {...m.lambris} color={CHENE} side={BackSide} />
      </mesh>
      <mesh position-y={plafond - 0.6}>
        <cylinderGeometry args={[mur - 0.25, mur - 0.02, 0.5, 72, 1, true, ...PHI]} />
        <meshStandardMaterial {...m.pierre} color="#d8c9a8" side={BackSide} />
      </mesh>
      {/* Mur de la tribune : visible depuis la salle seulement (la caméra du plan large est derrière). */}
      <mesh position={[0, plafond / 2, 2.6]} rotation-y={Math.PI}>
        <planeGeometry args={[mur * 2, plafond]} />
        <meshStandardMaterial {...m.pierre} />
      </mesh>
      {/* Colonnade : fût, base et chapiteau. */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (Math.PI * (i + 0.5)) / 12;
        const r = mur - 0.55;
        const h = plafond - hauteur - 1.2;
        return (
          <group key={i} position={[r * Math.cos(angle), hauteur, -r * Math.sin(angle)]}>
            <mesh position-y={h / 2 + 0.3} castShadow>
              <cylinderGeometry args={[0.26, 0.31, h, 20]} />
              <meshStandardMaterial {...m.colonne} color="#efe7d6" roughness={0.5} />
            </mesh>
            <mesh position-y={0.15}>
              <boxGeometry args={[0.8, 0.3, 0.8]} />
              <meshStandardMaterial {...m.colonne} />
            </mesh>
            <mesh position-y={h + 0.42}>
              <boxGeometry args={[0.78, 0.24, 0.78]} />
              <meshStandardMaterial {...m.colonne} color="#e7d9b4" />
            </mesh>
          </group>
        );
      })}
      {/* Tribune : perchoir et tribune de l'orateur, en chêne, sous une tenture. */}
      <mesh position={[0, 1.15, 1.9]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 2.3, 1.2]} />
        <meshStandardMaterial {...m.boiserie} color={CHENE} />
      </mesh>
      <mesh position={[0, 2.36, 1.9]}>
        <boxGeometry args={[5.4, 0.12, 1.4]} />
        <meshStandardMaterial {...m.boiserie} color="#6e4a30" />
      </mesh>
      <mesh position={[0, 0.6, 0.85]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 1.2, 0.8]} />
        <meshStandardMaterial {...m.boiserie} color={CHENE} />
      </mesh>
      <mesh position={[0, 5.4, 2.5]} rotation-y={Math.PI}>
        <planeGeometry args={[6.4, 5.6]} />
        <meshStandardMaterial {...m.tenture} color="#1d3a36" roughness={1} />
      </mesh>
      <mesh position={[0, 5.4, 2.55]} rotation-y={Math.PI}>
        <planeGeometry args={[6.8, 6]} />
        <meshStandardMaterial
          color="#8a6a2c"
          metalness={0.8}
          roughness={0.55}
          envMapIntensity={0.5}
        />
      </mesh>
      {/* Banc du gouvernement : pupitre courbe et fauteuils de cuir vert, au pied des gradins. */}
      {Array.from({ length: BANC.places }, (_, i) => {
        const angle = Math.PI * (0.3 + (0.4 * i) / (BANC.places - 1));
        return (
          <mesh
            key={i}
            geometry={g.fauteuil}
            position={[BANC.rayon * Math.cos(angle), 0, -BANC.rayon * Math.sin(angle)]}
            rotation-y={angle - Math.PI / 2}
            castShadow
          >
            <meshPhysicalMaterial color="#1f4a3a" roughness={0.45} clearcoat={0.4} />
          </mesh>
        );
      })}
      <spotLight
        ref={lampeBanc}
        position={[0, plafond - 1, -1]}
        target-position={[0, 0, -BANC.rayon]}
        angle={0.32}
        penumbra={0.7}
        intensity={40}
        color="#fff1d0"
      />
      <instancedMesh
        ref={mesh}
        args={[g.fauteuil, m.fauteuil, sieges.length]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      {/* Projecteur sur le groupe qui interpelle : cône de lumière dans l'air de la salle. */}
      {centre && source && (
        <>
          <spotLight
            ref={projecteur}
            position={source}
            target-position={[centre.x, centre.y, centre.z]}
            angle={Math.atan((rayonGroupe * 1.5) / longueur)}
            penumbra={0.6}
            intensity={0}
            color="#fff0cc"
            distance={longueur * 1.8}
          />
          <mesh
            ref={faisceau}
            material={m.faisceau}
            position={source.clone().lerp(new Vector3(centre.x, centre.y, centre.z), 0.5)}
            onUpdate={(self) => {
              self.lookAt(source);
              self.rotateX(Math.PI / 2);
            }}
          >
            <coneGeometry args={[rayonGroupe * 1.5, longueur, 28, 1, true]} />
          </mesh>
        </>
      )}
    </>
  );
}

export default function Hemicycle3D(props: Hemicycle3DProps) {
  return (
    <Toile
      nom="hemicycle"
      palier={props.palier}
      visible={props.visible}
      camera={{ position: [0, 8.6, 8.4], fov: 45, near: 0.2, far: 120 }}
      fond="#1a1410"
      environnement={0.5}
      eclairage="salle"
      exposition={0.78}
      post={{ ouverture: 0.00025, vignette: 0.45, grain: 0.03 }}
    >
      <Salle {...props} />
    </Toile>
  );
}
