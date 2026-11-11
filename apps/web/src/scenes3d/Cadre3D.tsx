import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDecision3D } from './appareil';
import type { Palier } from './qualite';

// Cadre d'une scène 3D (phase 26) : décide entre la scène et son repli 2D (WebGL indisponible,
// mouvement réduit, choix de l'utilisateur, images par seconde trop basses), garde le repli
// pendant le chargement à la demande de three.js et sur toute erreur de rendu, et met le rendu en
// pause quand la scène n'est pas à l'écran. La scène est une image pour les lecteurs d'écran :
// tout texte reste en HTML, par-dessus.

class Garde extends Component<{ repli: ReactNode; children: ReactNode }, { echec: boolean }> {
  override state = { echec: false };
  static getDerivedStateFromError() {
    return { echec: true };
  }
  override render() {
    return this.state.echec ? this.props.repli : this.props.children;
  }
}

/** Vrai tant que l'élément est à l'écran dans un onglet visible. */
function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let aLEcran = true;
    const maj = () => setVisible(aLEcran && document.visibilityState !== 'hidden');
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            aLEcran = entry?.isIntersecting ?? true;
            maj();
          });
    observer?.observe(element);
    document.addEventListener('visibilitychange', maj);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', maj);
    };
  }, []);
  return { ref, visible };
}

export function Cadre3D({
  nom,
  label,
  repli,
  className = '',
  children,
}: {
  /** Nom de la scène (attribut `data-scene3d`, mesures). */
  nom: string;
  /** Description de l'image pour les lecteurs d'écran. */
  label: string;
  /** Version 2D ou écran statique, affiché à la place de la scène quand elle ne peut pas l'être. */
  repli: ReactNode;
  className?: string;
  /** La scène (composant chargé à la demande), au palier décidé. */
  children: (palier: Palier, visible: boolean) => ReactNode;
}) {
  const decision = useDecision3D();
  const { ref, visible } = useVisible<HTMLDivElement>();
  if (decision.mode === '2d') return <>{repli}</>;
  return (
    <Garde repli={repli}>
      <Suspense fallback={repli}>
        <div
          ref={ref}
          role="img"
          aria-label={label}
          data-scene3d={nom}
          data-palier={decision.palier}
          data-rendu={visible ? 'actif' : 'pause'}
          className={`relative overflow-hidden ${className}`}
        >
          {children(decision.palier, visible)}
        </div>
      </Suspense>
    </Garde>
  );
}
