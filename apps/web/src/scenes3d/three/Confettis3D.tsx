import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial } from 'three';
import { REGLAGES, type Palier } from '../qualite';
import { alea } from './foule';
import { Toile, tracer } from './Toile';

// Confettis de la victoire (phase 26) : particules animées sur le processeur graphique. Chaque
// confetti suit une trajectoire balistique calculée dans le shader à partir de sa graine et du
// temps ; aucune position n'est recalculée en JavaScript.

const VERTEX = /* glsl */ `
  uniform float uTemps; uniform float uTaille;
  attribute vec3 aGraine; attribute vec3 aCouleur;
  varying vec3 vCouleur; varying float vFace;
  void main() {
    // Salves successives : chaque confetti repart après sa chute.
    float duree = 3.6 + aGraine.x * 2.4;
    float t = mod(uTemps + aGraine.y * duree, duree);
    float cote = aGraine.z < 0.5 ? -1.0 : 1.0;
    vec3 depart = vec3(cote * 3.4, -2.6, 0.0);
    vec3 vitesse = vec3(-cote * (1.2 + aGraine.x * 3.2), 6.5 + aGraine.y * 4.5, (aGraine.z - 0.5) * 3.0);
    vec3 p = depart + vitesse * t + vec3(0.0, -4.6, 0.0) * t * t * 0.5;
    // Le papier freine et papillonne en retombant.
    p.x += sin(t * 5.0 + aGraine.y * 30.0) * 0.25 * smoothstep(0.6, 2.0, t);
    p.y = max(p.y, -2.6 - aGraine.x) + 0.0;
    vFace = 0.55 + 0.45 * sin(t * (9.0 + aGraine.x * 8.0) + aGraine.z * 20.0);
    vCouleur = aCouleur;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uTaille * (0.6 + aGraine.x * 0.8) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAGMENT = /* glsl */ `
  varying vec3 vCouleur; varying float vFace;
  void main() {
    vec2 c = abs(gl_PointCoord - 0.5);
    // Un rectangle de papier vu de biais : sa largeur apparente varie quand il tourne.
    if (c.x > 0.5 * vFace || c.y > 0.3) discard;
    gl_FragColor = vec4(vCouleur * (0.75 + 0.35 * vFace), 1.0);
    #include <colorspace_fragment>
  }`;

function Pluie({ couleurs, nombre }: { couleurs: readonly string[]; nombre: number }) {
  const { geometrie, materiau } = useMemo(() => {
    const geometrie = new BufferGeometry();
    const graines = new Float32Array(nombre * 3);
    const teintes = new Float32Array(nombre * 3);
    const couleur = new Color();
    for (let i = 0; i < nombre; i++) {
      graines.set([alea(i, 1), alea(i, 2), alea(i, 3)], i * 3);
      couleur.set(couleurs[i % couleurs.length] ?? '#ffffff');
      teintes.set([couleur.r, couleur.g, couleur.b], i * 3);
    }
    geometrie.setAttribute('position', new BufferAttribute(new Float32Array(nombre * 3), 3));
    geometrie.setAttribute('aGraine', new BufferAttribute(graines, 3));
    geometrie.setAttribute('aCouleur', new BufferAttribute(teintes, 3));
    const materiau = new ShaderMaterial({
      uniforms: { uTemps: { value: 0 }, uTaille: { value: 150 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    return { geometrie, materiau };
  }, [couleurs, nombre]);
  useEffect(() => {
    tracer('confettis', { particules: nombre });
    return () => {
      geometrie.dispose();
      materiau.dispose();
    };
  }, [geometrie, materiau, nombre]);
  useFrame((state) => {
    materiau.uniforms.uTemps!.value = state.clock.elapsedTime;
    materiau.uniforms.uTaille!.value = state.size.height * 0.2;
  });
  return <points geometry={geometrie} material={materiau} frustumCulled={false} />;
}

export default function Confettis3D({
  palier,
  visible,
  couleurs,
}: {
  palier: Palier;
  visible: boolean;
  /** Couleurs du camp du joueur (avec du blanc et de l'or). */
  couleurs: readonly string[];
}) {
  const nombre = REGLAGES[palier].confettis;
  if (nombre === 0) return null;
  return (
    <Toile
      nom="confettis"
      palier={palier}
      visible={visible}
      camera={{ position: [0, 0, 7], fov: 50 }}
    >
      <Pluie couleurs={couleurs} nombre={nombre} />
    </Toile>
  );
}
