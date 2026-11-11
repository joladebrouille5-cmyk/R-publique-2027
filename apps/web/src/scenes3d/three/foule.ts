import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Foule procédurale (phase 26) : des milliers de silhouettes humaines (tête, buste, bras, jambes,
// sans visage) dans un seul maillage instancié, donc un seul appel de dessin. Rendu de salle de
// spectacle : la foule est sombre, découpée à contre-jour par les lumières de la scène, noyée
// dans la brume. L'animation (houle, applaudissements, bras levés de la vague) est calculée dans
// le shader de sommets : ni squelette ni matrice recalculée à chaque image.

const VERTEX = /* glsl */ `
  uniform float uTemps; uniform float uFerveur; uniform float uVague; uniform float uLargeur;
  attribute vec3 aCouleur; attribute float aGraine; attribute float aBras;
  varying vec3 vCouleur; varying vec3 vNormale; varying vec3 vMonde;
  vec3 tourner(vec3 p, float angle) {
    float c = cos(angle); float s = sin(angle);
    return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  }
  void main() {
    vec4 pied = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Vague (ola) : un front traverse la salle ; à son passage, on se dresse et on lève les bras.
    float front = (pied.x / uLargeur + 0.5) - (uVague * 1.6 - 0.3);
    float ola = exp(-front * front * 40.0) * step(0.0, uVague);
    // Applaudissements : les plus fervents lèvent les bras et sautent, chacun à son rythme.
    float fervent = step(1.0 - uFerveur * 0.4, fract(aGraine * 7.31));
    float battement = 0.5 + 0.5 * sin(uTemps * (6.0 + aGraine * 5.0) + aGraine * 40.0);
    float lever = max(ola, fervent * (0.65 + 0.35 * battement));
    vec3 p = position;
    vec3 n = normal;
    if (aBras != 0.0) {
      vec3 epaule = vec3(aBras * 0.21, 1.4, 0.0);
      float angle = -lever * (2.5 + 0.4 * sin(aGraine * 90.0));
      p = tourner(p - epaule, angle) + epaule;
      p.x += aBras * lever * 0.06;
      n = tourner(n, angle);
    }
    // Houle : la salle se balance doucement, d'un pied sur l'autre.
    float balance = sin(uTemps * 1.7 + aGraine * 30.0 + pied.x * 0.3) * 0.035 * (0.4 + uFerveur);
    p.x += balance * p.y;
    vec4 monde = instanceMatrix * vec4(p, 1.0);
    monde.y += ola * 0.22 + fervent * battement * 0.1 * uFerveur;
    vCouleur = aCouleur;
    vNormale = normalize(mat3(instanceMatrix) * n);
    vMonde = monde.xyz;
    gl_Position = projectionMatrix * viewMatrix * monde;
  }`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uScene; uniform vec3 uLumiere; uniform vec3 uBrume; uniform float uDensite;
  uniform float uAmbiance;
  varying vec3 vCouleur; varying vec3 vNormale; varying vec3 vMonde;
  void main() {
    vec3 n = normalize(vNormale);
    vec3 vue = normalize(cameraPosition - vMonde);
    // Lumière de la scène : elle vient de devant et de haut ; vue de dos, la foule est à contre-jour.
    vec3 versScene = normalize(uScene - vMonde);
    float distance2 = dot(uScene - vMonde, uScene - vMonde);
    float portee = 1.0 / (1.0 + distance2 * 0.004);
    float face = max(0.0, dot(n, versScene));
    // Liseré de contre-jour : seulement sur les bords tournés vers la scène (épaules, têtes).
    float bord = pow(1.0 - max(0.0, dot(n, vue)), 4.0);
    float contour = bord * smoothstep(0.0, 0.6, dot(n, versScene));
    vec3 c = vCouleur * (uAmbiance + face * portee * 1.1) * mix(vec3(1.0), uLumiere, 0.5);
    c += uLumiere * contour * portee * 1.5;
    // Brume de salle : le fond se fond dans l'air chargé de lumière.
    float loin = length(cameraPosition - vMonde);
    c = mix(c, uBrume, 1.0 - exp(-loin * uDensite));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * Silhouette humaine : tête, cou, buste tourné au profil (épaules, taille, hanches), bras le long
 * du corps et jambes. L'attribut `aBras` (−1 gauche, +1 droite, 0 ailleurs) permet au shader de
 * faire pivoter chaque bras autour de l'épaule.
 */
export function silhouette(): BufferGeometry {
  const profil = [
    [0.001, 0.86],
    [0.15, 0.88],
    [0.165, 0.98],
    [0.14, 1.12],
    [0.17, 1.3],
    [0.2, 1.4],
    [0.17, 1.46],
    [0.06, 1.5],
    [0.05, 1.56],
  ].map(([x, y]) => new Vector2(x, y));
  const buste = new LatheGeometry(profil, 8).scale(1, 1, 0.62);
  const tete = new SphereGeometry(0.105, 8, 6).scale(0.92, 1.1, 1).translate(0, 1.67, 0.01);
  const jambe = (x: number) =>
    new CylinderGeometry(0.078, 0.06, 0.88, 5, 1, true).translate(x, 0.44, 0);
  const bras = (cote: number) =>
    new CapsuleGeometry(0.048, 0.5, 1, 5).translate(cote * 0.235, 1.1, 0);
  const pieces: [BufferGeometry, number][] = [
    [buste, 0],
    [tete, 0],
    [jambe(-0.085), 0],
    [jambe(0.085), 0],
    [bras(-1), -1],
    [bras(1), 1],
  ];
  for (const [piece, cote] of pieces) {
    const sommets = piece.getAttribute('position').count;
    piece.setAttribute('aBras', new BufferAttribute(new Float32Array(sommets).fill(cote), 1));
    piece.deleteAttribute('uv');
  }
  const fusion = mergeGeometries(pieces.map(([piece]) => piece))!;
  for (const [piece] of pieces) piece.dispose();
  return fusion;
}

/** Suite pseudo-aléatoire stable (même foule d'une image à l'autre et d'un essai à l'autre). */
export const alea = (i: number, sel: number) => {
  const x = Math.sin(i * 127.1 + sel * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export type Place = { x: number; y: number; z: number };

/** Vêtements d'une foule : teintes sourdes, quelques clairs. */
export const VETEMENTS = [
  '#1b2233',
  '#2a2f3a',
  '#3a3f4b',
  '#20304a',
  '#4a3b33',
  '#5a5f6b',
  '#6b2a2a',
  '#243a2e',
  '#8b8f98',
  '#c9c4b8',
];

/**
 * Maillage instancié d'une foule : une silhouette par place, tournée vers la scène. `uFerveur`
 * (0 à 1) et `uVague` (−1 : aucune ; 0 à 1 : passage de la vague) se pilotent par les uniformes.
 */
export function creerFoule(
  places: readonly Place[],
  options: { scene: Vector3; lumiere: string; brume: string; densite?: number; ambiance?: number },
) {
  const geometrie = silhouette();
  const materiau = new ShaderMaterial({
    uniforms: {
      uTemps: { value: 0 },
      uFerveur: { value: 0 },
      uVague: { value: -1 },
      uLargeur: { value: 1 },
      uScene: { value: options.scene },
      uLumiere: { value: new Color(options.lumiere) },
      uBrume: { value: new Color(options.brume) },
      uDensite: { value: options.densite ?? 0.02 },
      uAmbiance: { value: options.ambiance ?? 0.1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  const mesh = new InstancedMesh(geometrie, materiau, Math.max(1, places.length));
  mesh.count = places.length;
  mesh.frustumCulled = false;
  const couleurs = new Float32Array(Math.max(1, places.length) * 3);
  const graines = new Float32Array(Math.max(1, places.length));
  const matrice = new Matrix4();
  const tourne = new Matrix4();
  const couleur = new Color();
  let largeur = 1;
  places.forEach((place, i) => {
    const taille = 0.92 + 0.16 * alea(i, 1);
    // Chacun regarde la scène, à quelques degrés près.
    const cap =
      Math.atan2(options.scene.x - place.x, options.scene.z - place.z) + (alea(i, 7) - 0.5) * 0.5;
    matrice
      .makeScale(taille * (0.92 + 0.2 * alea(i, 8)), taille, taille)
      .premultiply(tourne.makeRotationY(cap))
      .setPosition(place.x, place.y, place.z);
    mesh.setMatrixAt(i, matrice);
    couleur.set(VETEMENTS[Math.floor(alea(i, 2) * VETEMENTS.length)]!);
    couleur.multiplyScalar(0.7 + 0.6 * alea(i, 3));
    couleurs.set([couleur.r, couleur.g, couleur.b], i * 3);
    graines[i] = alea(i, 4);
    largeur = Math.max(largeur, Math.abs(place.x) * 2);
  });
  geometrie.setAttribute('aCouleur', new InstancedBufferAttribute(couleurs, 3));
  geometrie.setAttribute('aGraine', new InstancedBufferAttribute(graines, 1));
  materiau.uniforms.uLargeur!.value = largeur;
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    materiau,
    liberer() {
      geometrie.dispose();
      materiau.dispose();
      mesh.dispose();
    },
  };
}

/**
 * Places d'une salle debout face à la scène, remplies de l'avant vers le fond : `presents`
 * spectateurs sur `capacite` places, serrés devant, plus épars derrière. Une salle à moitié vide
 * se voit : le fond reste désert.
 */
export function placesDeSalle(capacite: number, presents: number): Place[] {
  const colonnes = Math.max(8, Math.round(Math.sqrt(capacite * 2.4)));
  const pas = 0.58;
  const places: Place[] = [];
  for (let i = 0; i < capacite && places.length < presents; i++) {
    const rangee = Math.floor(i / colonnes);
    const colonne = i % colonnes;
    // Quelques trous dans les rangées : une foule, pas un damier.
    if (alea(i, 9) < 0.07) continue;
    places.push({
      x: (colonne - (colonnes - 1) / 2) * pas + (alea(i, 5) - 0.5) * 0.4,
      y: 0,
      z: 4.5 + rangee * 0.62 + (alea(i, 6) - 0.5) * 0.45,
    });
  }
  return places;
}

/** Profondeur de la salle (dernière rangée possible), pour le cadrage. */
export const profondeurDeSalle = (capacite: number) =>
  4.5 + Math.ceil(capacite / Math.max(8, Math.round(Math.sqrt(capacite * 2.4)))) * 0.62;
