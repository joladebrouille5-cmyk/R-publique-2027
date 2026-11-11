import type { ScenePlate } from '@r2027/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  Matrix4,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector4,
  type PerspectiveCamera,
} from 'three';
import { urlActif } from '../actifs';
import { REGLAGES, type Palier } from '../qualite';
import { matiere } from './textures';
import { Toile, tracer } from './Toile';

// Investiture (phase 26) : la cour d'honneur de l'Élysée, la vraie. Une photographie de la façade
// (Wikimedia Commons, licence libre) est remise en perspective sur deux plans — le sol de la cour
// et la façade — depuis le point de vue du photographe ; la caméra peut alors avancer dans la
// cour, et le gravier défile sous elle avec la bonne parallaxe. Le drapeau de la photographie
// ondule (légère déformation de l'image), et un tapis rouge mène au perron : il prend la lumière
// et les ombres de la photographie qu'il recouvre. Aucun personnage : la cour est vide.

const PROJETE = /* glsl */ `
  uniform mat4 uProjecteur; varying vec4 vProj; varying vec2 vUv;
  void main() {
    vec4 monde = modelMatrix * vec4(position, 1.0);
    vProj = uProjecteur * monde; vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * monde;
  }`;

/** La photographie, vue depuis la caméra de la scène ; le drapeau ondule autour de son mât. */
const PHOTO = /* glsl */ `
  uniform sampler2D uPhoto; uniform float uTemps; uniform vec4 uDrapeau; uniform float uMatADroite;
  varying vec4 vProj;
  void main() {
    vec2 uv = vProj.xy / vProj.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec2 q = (vec2(uv.x, 1.0 - uv.y) - uDrapeau.xy) / uDrapeau.zw;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
      float libre = mix(q.x, 1.0 - q.x, uMatADroite);
      float bord = smoothstep(0.0, 0.2, q.y) * smoothstep(1.0, 0.8, q.y)
        * smoothstep(0.0, 0.12, q.x) * smoothstep(1.0, 0.88, q.x);
      uv.y += sin(uTemps * 5.0 + libre * 8.0) * 0.0045 * libre * bord;
      uv.x += sin(uTemps * 3.4 + q.y * 7.0) * 0.003 * libre * bord;
    }
    gl_FragColor = texture2D(uPhoto, uv);
    #include <colorspace_fragment>
  }`;

/** Tapis rouge : velours photographié, éclairé par la photographie qu'il recouvre. */
const TAPIS = /* glsl */ `
  uniform sampler2D uPhoto; uniform sampler2D uVelours; uniform vec3 uTeinte;
  uniform vec2 uRepetition; uniform float uReference;
  varying vec4 vProj; varying vec2 vUv;
  void main() {
    vec2 uv = clamp(vProj.xy / vProj.w * 0.5 + 0.5, 0.0, 1.0);
    // Lumière du lieu : la luminance du sol photographié sous le tapis (soleil, ombre portée).
    float lumiere = dot(texture2D(uPhoto, uv).rgb, vec3(0.2126, 0.7152, 0.0722)) / uReference;
    vec3 velours = texture2D(uVelours, vUv * uRepetition).rgb;
    // Le poil du velours accroche la lumière par plages : nuances lentes, à l'échelle du pas.
    float poil = texture2D(uVelours, vUv * uRepetition * 0.07).r;
    // Lisières : un galon plus sombre, et un bord adouci sur le gravier.
    float galon = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
    float bord = smoothstep(0.0, 0.006, vUv.x) * smoothstep(1.0, 0.994, vUv.x);
    vec3 c = uTeinte * velours * mix(0.82, 1.12, poil) * clamp(lumiere, 0.3, 1.25) * mix(0.6, 1.0, galon);
    // La teinte s'éteint un peu dans l'ombre, comme le reste de la photographie.
    c = mix(vec3(dot(c, vec3(0.3, 0.6, 0.1))), c, mix(0.8, 1.0, clamp(lumiere, 0.0, 1.0)));
    gl_FragColor = vec4(c, bord);
    #include <colorspace_fragment>
  }`;

const TAPIS_LARGEUR = 2.8;

function Cour({ plan, duree, palier }: { plan: ScenePlate; duree: number; palier: Palier }) {
  const { camera, size } = useThree();
  // Géométrie du lieu, en mètres, d'après les repères lus sur la photographie.
  const lieu = useMemo(() => {
    const { focale, horizon, pied, oeilM } = plan.repere;
    const hauteur = plan.hauteur / plan.largeur;
    const distance = (focale * oeilM) / ((pied - horizon) * hauteur);
    const metresParLargeur = distance / focale;
    const projection = new Matrix4().makePerspective(
      -0.5 / focale,
      0.5 / focale,
      (horizon * hauteur) / focale,
      (-(1 - horizon) * hauteur) / focale,
      1,
      2000,
    );
    return {
      focale,
      horizon,
      oeilM,
      hauteur,
      distance,
      demiLargeur: 0.5 * metresParLargeur,
      sommet: oeilM + horizon * hauteur * metresParLargeur,
      // Le bas de la photographie touche le sol à cette distance du photographe.
      proche: (focale * oeilM) / ((1 - horizon) * hauteur),
      projecteur: projection.multiply(new Matrix4().makeTranslation(0, -oeilM, 0)),
    };
  }, [plan]);

  const m = useMemo(() => {
    const photo = new TextureLoader().load(urlActif(plan.fichier));
    photo.colorSpace = SRGBColorSpace;
    photo.anisotropy = 8;
    const drapeau = plan.drapeaux[0];
    const velours = matiere('velours', REGLAGES[palier].textures).map;
    const commun = { uProjecteur: { value: lieu.projecteur }, uPhoto: { value: photo } };
    return {
      photo,
      plan: new ShaderMaterial({
        vertexShader: PROJETE,
        fragmentShader: PHOTO,
        toneMapped: false,
        uniforms: {
          ...commun,
          uTemps: { value: 0 },
          uDrapeau: {
            value: drapeau
              ? new Vector4(drapeau.x, drapeau.y, drapeau.largeur, drapeau.hauteur)
              : new Vector4(2, 2, 1, 1),
          },
          uMatADroite: { value: drapeau?.mat === 'droite' ? 1 : 0 },
        },
      }),
      tapis: new ShaderMaterial({
        vertexShader: PROJETE,
        fragmentShader: TAPIS,
        toneMapped: false,
        transparent: true,
        uniforms: {
          ...commun,
          uVelours: { value: velours },
          uTeinte: { value: new Color('#96101f') },
          uRepetition: { value: [TAPIS_LARGEUR / 0.5, lieu.distance / 0.5] },
          // Luminance (linéaire) du gravier au soleil sur la photographie.
          uReference: { value: 0.42 },
        },
      }),
    };
  }, [plan, lieu, palier]);
  useEffect(
    () => () => {
      m.photo.dispose();
      m.plan.dispose();
      m.tapis.dispose();
    },
    [m],
  );
  useEffect(() => {
    // La caméra est réglée à la main : sa projection est celle de l'appareil du photographe.
    (camera as PerspectiveCamera & { manual?: boolean }).manual = true;
    tracer('investiture', { plan: plan.id, distanceM: Math.round(lieu.distance) });
  }, [camera, plan, lieu]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    m.plan.uniforms.uTemps!.value = t;
    const cam = camera as PerspectiveCamera;
    // Cadre : le plus grand rectangle aux proportions de l'écran dans la photographie — toute sa
    // hauteur sur un téléphone, toute sa largeur sur un écran large (du toit au perron).
    const ecran = size.width / Math.max(1, size.height);
    const large = ecran > 1 / lieu.hauteur;
    const cw = large ? 1 : ecran * lieu.hauteur;
    const ch = large ? 1 / ecran : lieu.hauteur;
    const x0 = 0.5 - cw / 2;
    const y0 = Math.max(0, Math.min(lieu.hauteur - ch, 0.45 * lieu.hauteur - ch / 2));
    // Image entière de l'appareil, symétrique autour de l'horizon ; la photographie en est une part.
    const demi = Math.max(lieu.horizon, 1 - lieu.horizon) * lieu.hauteur;
    const haut = demi - lieu.horizon * lieu.hauteur;
    cam.fov = (2 * Math.atan(demi / lieu.focale) * 180) / Math.PI;
    cam.aspect = 1 / (2 * demi);
    const S = 4096;
    cam.setViewOffset(S, 2 * demi * S, x0 * S, (haut + y0) * S, cw * S, ch * S);
    cam.near = 0.3;
    cam.far = 2000;
    cam.updateProjectionMatrix();
    // Travelling avant, à hauteur d'homme, sur le quart de la cour ; léger balancement du pas.
    const k = Math.min(1, t / duree);
    const avance = k * k * (3 - 2 * k) * 0.24 * lieu.distance;
    cam.position.set(
      Math.sin(t * 0.9) * 0.05,
      lieu.oeilM + Math.abs(Math.sin(t * 1.8)) * 0.02,
      -avance,
    );
    // En avançant, la façade grandit : la caméra se relève juste assez pour garder le drapeau du
    // toit dans le cadre (une rotation ne fausse pas la perspective de la photographie).
    const hautDuCadre = Math.atan((lieu.horizon * lieu.hauteur - y0) / lieu.focale);
    const drapeau = Math.atan((lieu.sommet * 0.93 - lieu.oeilM) / (lieu.distance - avance));
    // Sur un écran large, le perron passe avant le drapeau : la caméra ne se relève pas au point
    // de le sortir du cadre.
    const basDuCadre = Math.atan((y0 + ch - lieu.horizon * lieu.hauteur) / lieu.focale);
    const perron = Math.atan((lieu.oeilM * 1.6) / (lieu.distance - avance));
    cam.rotation.set(Math.max(0, Math.min(drapeau - hautDuCadre, basDuCadre - perron)), 0, 0);
  });

  const profondeur = lieu.distance - lieu.proche * 0.5;
  return (
    <>
      {/* Façade : un plan vertical au pied du perron, à la distance estimée. */}
      <mesh position={[0, lieu.sommet / 2, -lieu.distance]} material={m.plan}>
        <planeGeometry args={[lieu.demiLargeur * 2.2, lieu.sommet]} />
      </mesh>
      {/* Sol de la cour : du photographe au pied de la façade. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0, -(lieu.distance + lieu.proche * 0.5) / 2]}
        material={m.plan}
      >
        <planeGeometry args={[lieu.demiLargeur * 2.2, profondeur]} />
      </mesh>
      {/* Tapis rouge : du premier plan au perron, puis sur les marches. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, -lieu.distance / 2]} material={m.tapis}>
        <planeGeometry args={[TAPIS_LARGEUR, lieu.distance]} />
      </mesh>
      <mesh position={[0, 0.5, -lieu.distance + 0.03]} material={m.tapis}>
        <planeGeometry args={[TAPIS_LARGEUR, 1.0]} />
      </mesh>
      {/* Ombre portée du tapis sur le gravier, le long de ses deux lisières. */}
      {[-1, 1].map((cote) => (
        <mesh
          key={cote}
          rotation-x={-Math.PI / 2}
          position={[cote * (TAPIS_LARGEUR / 2 + 0.06), 0.015, -lieu.distance / 2]}
        >
          <planeGeometry args={[0.12, lieu.distance]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.22} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

export default function Investiture3D({
  palier,
  visible,
  duree,
  plan,
}: {
  palier: Palier;
  visible: boolean;
  duree: number;
  plan: ScenePlate;
}) {
  return (
    <Toile
      nom="investiture"
      palier={palier}
      visible={visible}
      camera={{ position: [0, 1.6, 0], fov: 50, near: 0.3, far: 2000 }}
      environnement={0}
    >
      <Cour plan={plan} duree={duree} palier={palier} />
    </Toile>
  );
}
