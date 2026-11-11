import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Foule procédurale (phase 26) : des milliers de silhouettes stylisées (un corps, une tête, sans
// visage) dans un seul maillage instancié, donc un seul appel de dessin. L'animation (houle,
// applaudissements, vague) est calculée dans le shader de sommets à partir de la position de
// chaque instance : ni squelette ni matrice recalculée à chaque image.

const VERTEX = /* glsl */ `
  uniform float uTemps; uniform float uFerveur; uniform float uVague; uniform float uLargeur;
  attribute vec3 aCouleur; attribute float aGraine;
  varying vec3 vCouleur; varying float vLumiere;
  void main() {
    vec4 monde = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Houle : la salle ondule doucement, de plus en plus fort avec la ferveur.
    float houle = sin(uTemps * 1.6 + monde.x * 0.35 + monde.z * 0.2) * 0.05 * (0.3 + uFerveur);
    // Applaudissements : petits bonds rapides, déphasés d'un spectateur à l'autre.
    float bond = max(0.0, sin(uTemps * (7.0 + aGraine * 5.0) + aGraine * 40.0));
    float applaudit = bond * 0.16 * uFerveur * step(0.35, fract(aGraine * 7.3 + uFerveur));
    // Vague (ola) : un front traverse la salle de gauche à droite et soulève chaque rangée.
    float front = (monde.x / uLargeur + 0.5) - (uVague * 1.6 - 0.3);
    float ola = exp(-front * front * 40.0) * step(0.0, uVague) * 0.75;
    vec3 p = position;
    p.y *= 1.0 + ola * 0.35 * step(0.8, position.y);
    p.x += sin(uTemps * 2.0 + aGraine * 30.0) * 0.04 * uFerveur * position.y;
    vec4 local = instanceMatrix * vec4(p, 1.0);
    local.y += houle + applaudit + ola;
    vCouleur = aCouleur;
    vLumiere = 0.55 + 0.45 * max(0.0, normalize(mat3(instanceMatrix) * normal).y * 0.6 + 0.5)
      + ola * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uTeinte;
  varying vec3 vCouleur; varying float vLumiere;
  void main() {
    gl_FragColor = vec4(mix(vCouleur, uTeinte, 0.18) * vLumiere, 1.0);
    #include <colorspace_fragment>
  }`;

/** Silhouette : un corps en capsule et une tête ronde, fusionnés en une géométrie. */
export function silhouette(): BufferGeometry {
  const corps = new CapsuleGeometry(0.2, 0.55, 2, 6).translate(0, 0.5, 0);
  const tete = new SphereGeometry(0.17, 6, 5).translate(0, 1.12, 0);
  const fusion = mergeGeometries([corps, tete])!;
  corps.dispose();
  tete.dispose();
  return fusion;
}

/** Suite pseudo-aléatoire stable (même foule d'une image à l'autre et d'un essai à l'autre). */
export const alea = (i: number, sel: number) => {
  const x = Math.sin(i * 127.1 + sel * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export type Place = { x: number; y: number; z: number };

/**
 * Maillage instancié d'une foule : une silhouette par place, teintes tirées de la palette.
 * `uFerveur` (0 à 1) et `uVague` (−1 : aucune ; 0 à 1 : passage de la vague) se pilotent par les
 * uniformes du matériau.
 */
export function creerFoule(places: readonly Place[], palette: readonly string[], teinte: string) {
  const geometrie = silhouette();
  const materiau = new ShaderMaterial({
    uniforms: {
      uTemps: { value: 0 },
      uFerveur: { value: 0 },
      uVague: { value: -1 },
      uLargeur: { value: 1 },
      uTeinte: { value: new Color(teinte) },
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
  const couleur = new Color();
  let largeur = 1;
  places.forEach((place, i) => {
    const taille = 0.85 + 0.3 * alea(i, 1);
    matrice.makeScale(taille, taille, taille).setPosition(place.x, place.y, place.z);
    mesh.setMatrixAt(i, matrice);
    couleur.set(palette[Math.floor(alea(i, 2) * palette.length)] ?? '#888888');
    couleur.multiplyScalar(0.7 + 0.5 * alea(i, 3));
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
 * Places d'une salle en gradins face à la scène, remplies de l'avant vers le fond : `presents`
 * spectateurs sur `capacite` places. Une salle à moitié vide se voit : le fond reste désert.
 */
export function placesDeSalle(capacite: number, presents: number): Place[] {
  const colonnes = Math.max(8, Math.round(Math.sqrt(capacite * 2.2)));
  const pas = 0.62;
  const places: Place[] = [];
  for (let i = 0; i < capacite && places.length < presents; i++) {
    const rangee = Math.floor(i / colonnes);
    const colonne = i % colonnes;
    // Quelques trous dans les rangées : une foule, pas un damier.
    if (alea(i, 9) < 0.06) continue;
    places.push({
      x: (colonne - (colonnes - 1) / 2) * pas + (alea(i, 5) - 0.5) * 0.2,
      y: rangee * 0.11,
      z: 3 + rangee * 0.66 + (alea(i, 6) - 0.5) * 0.2,
    });
  }
  return places;
}
