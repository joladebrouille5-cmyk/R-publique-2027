import { Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';

// Drapeau en shader de tissu (phase 26) : le drapé est simulé dans le shader de sommets (ondes
// qui s'amplifient en s'éloignant de la hampe), l'ombrage suit les plis, et un toucher fait
// partir une onde circulaire depuis le point touché.

const VERTEX = /* glsl */ `
  uniform float uTemps; uniform vec3 uTouche; uniform float uVent;
  varying vec2 vUv; varying float vPli;
  float drape(vec2 uv, float t) {
    float prise = smoothstep(0.0, 0.25, uv.x);
    float onde = sin(uv.x * 9.0 - t * 2.6 + uv.y * 2.2) * 0.11
      + sin(uv.x * 17.0 - t * 4.1 - uv.y * 3.4) * 0.045
      + sin(uv.y * 6.0 + t * 1.3 + uv.x * 3.0) * 0.05;
    // Onde du toucher : un anneau qui s'élargit et s'éteint.
    float age = t - uTouche.z;
    float d = distance(uv, uTouche.xy);
    float anneau = sin((d - age * 0.7) * 34.0) * exp(-age * 1.6) * exp(-pow(d - age * 0.7, 2.0) * 30.0);
    return (onde * prise * uVent) + anneau * 0.16 * step(0.0, age);
  }
  void main() {
    vUv = uv;
    float e = 0.01;
    float z = drape(uv, uTemps);
    // Pente du tissu : sert à l'ombrage des plis.
    vPli = (drape(uv + vec2(e, 0.0), uTemps) - z) / e;
    vec3 p = position + vec3(0.0, 0.0, z * 2.0);
    p.y += sin(uv.x * 5.0 - uTemps * 1.7) * 0.03 * uv.x * uVent;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uBleu; uniform vec3 uBlanc; uniform vec3 uRouge; uniform float uDrame;
  varying vec2 vUv; varying float vPli;
  void main() {
    vec3 c = vUv.x < 1.0 / 3.0 ? uBleu : (vUv.x < 2.0 / 3.0 ? uBlanc : uRouge);
    // Trame du tissu, plis éclairés d'un côté et ombrés de l'autre.
    float trame = 0.97 + 0.03 * sin(vUv.x * 900.0) * sin(vUv.y * 600.0);
    float pli = clamp(0.82 - vPli * 0.55, 0.35, 1.25);
    // Éclairage dramatique : un projecteur en haut à gauche, le reste dans la pénombre.
    float projecteur = mix(1.0, smoothstep(1.25, 0.1, distance(vUv, vec2(0.3, 0.75))), uDrame);
    gl_FragColor = vec4(c * trame * pli * (0.35 + 0.85 * projecteur), 1.0);
    #include <colorspace_fragment>
  }`;

/** Matériau de drapeau tricolore. `uTouche` : (u, v, instant du toucher). */
export function creerDrapeau({ drame = 1, vent = 1 } = {}) {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uTemps: { value: 0 },
      uTouche: { value: new Vector3(0.5, 0.5, -100) },
      uVent: { value: vent },
      uDrame: { value: drame },
      uBleu: { value: new Color('#1f3a93') },
      uBlanc: { value: new Color('#f4f1ea') },
      uRouge: { value: new Color('#d0312d') },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}
