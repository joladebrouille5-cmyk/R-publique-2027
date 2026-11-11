import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { Palier } from '../qualite';
import { creerDrapeau } from './drapeau';
import { Toile, tracer } from './Toile';

// Écran-titre (phase 26) : le drapeau tricolore en shader de tissu, qui ondule et répond au
// toucher par une onde. Fond de l'en-tête seulement : le titre et le menu restent en HTML.

function Drapeau() {
  const materiau = useMemo(() => creerDrapeau({ drame: 1 }), []);
  const { viewport } = useThree();
  useEffect(() => () => materiau.dispose(), [materiau]);
  useFrame((state) => {
    materiau.uniforms.uTemps!.value = state.clock.elapsedTime;
  });
  // Le drapeau déborde légèrement du cadre : ses bords ondulants ne laissent pas de vide.
  return (
    <mesh
      material={materiau}
      scale={[viewport.width * 1.12, viewport.height * 1.2, 1]}
      onPointerDown={(event) => {
        if (!event.uv) return;
        materiau.uniforms.uTouche!.value.set(
          event.uv.x,
          event.uv.y,
          materiau.uniforms.uTemps!.value as number,
        );
        tracer('drapeau', {
          touches: ((window.__r2027Scenes?.drapeau?.touches as number) ?? 0) + 1,
        });
      }}
    >
      <planeGeometry args={[1, 1, 160, 90]} />
    </mesh>
  );
}

export default function Drapeau3D({ palier, visible }: { palier: Palier; visible: boolean }) {
  return (
    <Toile
      nom="drapeau"
      palier={palier}
      visible={visible}
      camera={{ position: [0, 0, 6], fov: 40 }}
    >
      <Drapeau />
    </Toile>
  );
}
