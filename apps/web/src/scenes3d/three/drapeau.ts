import { Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';

// Drapeau en shader de tissu (phase 26) : le drapé est simulé dans le shader de sommets (ondes
// qui s'amplifient en s'éloignant de la hampe), les normales suivent les plis, et l'éclairage est
// celui d'une étoffe — lumière rasante, ombre au creux des plis, léger satiné, trame du tissage,
// un peu de lumière qui traverse la toile. Un toucher fait partir une onde depuis le point touché.

const VERTEX = /* glsl */ `
  uniform float uTemps; uniform vec3 uTouche; uniform float uVent;
  varying vec2 vUv; varying vec3 vNormale; varying vec3 vVue; varying float vCreux;
  float drape(vec2 uv, float t) {
    float prise = smoothstep(0.0, 0.3, uv.x);
    float onde = sin(uv.x * 7.0 - t * 2.4 + uv.y * 2.4) * 0.12
      + sin(uv.x * 15.0 - t * 3.9 - uv.y * 3.1) * 0.04
      + sin(uv.x * 29.0 - t * 5.5 + uv.y * 6.0) * 0.012
      + sin(uv.y * 5.0 + t * 1.1 + uv.x * 2.5) * 0.05;
    // Onde du toucher : un anneau qui s'élargit et s'éteint.
    float age = t - uTouche.z;
    float d = distance(uv, uTouche.xy);
    float anneau = sin((d - age * 0.7) * 34.0) * exp(-age * 1.6) * exp(-pow(d - age * 0.7, 2.0) * 30.0);
    return (onde * prise * uVent) + anneau * 0.14 * step(0.0, age);
  }
  void main() {
    vUv = uv;
    float e = 0.004;
    float z = drape(uv, uTemps);
    float dx = (drape(uv + vec2(e, 0.0), uTemps) - z) / e;
    float dy = (drape(uv + vec2(0.0, e), uTemps) - z) / e;
    vec3 p = position + vec3(0.0, 0.0, z * 2.0);
    // Le tissu pend un peu sous son poids, loin de la hampe.
    p.y -= 0.035 * uv.x * uv.x * uVent + sin(uv.x * 5.0 - uTemps * 1.7) * 0.02 * uv.x * uVent;
    vNormale = normalize(normalMatrix * vec3(-dx * 2.0, -dy * 2.0, 1.0));
    vCreux = z;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vVue = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uBleu; uniform vec3 uBlanc; uniform vec3 uRouge; uniform float uDrame;
  varying vec2 vUv; varying vec3 vNormale; varying vec3 vVue; varying float vCreux;
  void main() {
    // Bandes aux bords nets mais sans crénelage.
    float l = fwidth(vUv.x);
    vec3 teinte = mix(uBleu, uBlanc, smoothstep(1.0 / 3.0 - l, 1.0 / 3.0 + l, vUv.x));
    teinte = mix(teinte, uRouge, smoothstep(2.0 / 3.0 - l, 2.0 / 3.0 + l, vUv.x));
    vec3 n = normalize(vNormale) * (gl_FrontFacing ? 1.0 : -1.0);
    // Trame du tissage : fils de chaîne et de trame, à peine visibles.
    float trame = 0.955 + 0.045 * sin(vUv.x * 1100.0) * sin(vUv.y * 720.0);
    vec3 lampe = normalize(vec3(-0.55, 0.6, 0.75));
    float diffus = max(0.0, dot(n, lampe));
    // Un peu de lumière traverse la toile quand elle tourne le dos à la lampe.
    float travers = max(0.0, dot(-n, lampe)) * 0.22;
    float satin = pow(max(0.0, dot(n, normalize(lampe + vVue))), 22.0) * 0.16;
    float ombre = smoothstep(-0.16, 0.12, vCreux);
    float lumiere = 0.16 + (diffus * (0.45 + 0.55 * ombre) + travers) * 0.95;
    // Éclairage dramatique : un projecteur en haut à gauche, le reste dans la pénombre.
    float projecteur = mix(1.0, smoothstep(1.2, 0.05, distance(vUv, vec2(0.3, 0.72))), uDrame);
    vec3 c = teinte * trame * lumiere * (0.3 + 0.9 * projecteur) + vec3(satin) * projecteur;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
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
      uBleu: { value: new Color('#16327a') },
      uBlanc: { value: new Color('#efebe2') },
      uRouge: { value: new Color('#c21a26') },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}
