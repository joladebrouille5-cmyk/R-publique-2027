// Pose d'une carte sur la carte de France (phase 26, CSS 3D) : un double de la carte quitte la
// main, se couche en perspective et vient se poser sur le département visé. Décor seulement : la
// pose elle-même est déjà enregistrée dans le plan ; rien ne s'anime en mouvement réduit.

export function animerPose(actionId: string, code: string): void {
  if (typeof document === 'undefined' || typeof CSS === 'undefined' || !CSS.escape) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const carte = document.querySelector<HTMLElement>(`[data-carte="${CSS.escape(actionId)}"]`);
  const cible = document.querySelector(`[data-dept="${CSS.escape(code)}"]`);
  if (!carte || !cible || typeof carte.animate !== 'function') return;
  const depart = carte.getBoundingClientRect();
  const arrivee = cible.getBoundingClientRect();
  if (depart.width === 0 || arrivee.width === 0) return;
  const double = carte.cloneNode(true) as HTMLElement;
  double.setAttribute('aria-hidden', 'true');
  double.setAttribute('inert', '');
  double.removeAttribute('data-carte');
  for (const element of [double, ...double.querySelectorAll('[id]')]) element.removeAttribute('id');
  Object.assign(double.style, {
    position: 'fixed',
    left: `${depart.left}px`,
    top: `${depart.top}px`,
    width: `${depart.width}px`,
    height: `${depart.height}px`,
    margin: '0',
    zIndex: '80',
    pointerEvents: 'none',
    transformOrigin: '50% 50%',
  });
  document.body.append(double);
  const dx = arrivee.left + arrivee.width / 2 - (depart.left + depart.width / 2);
  const dy = arrivee.top + arrivee.height / 2 - (depart.top + depart.height / 2);
  const vol = double.animate(
    [
      { transform: 'perspective(900px) translate3d(0, 0, 0) rotateX(0deg) scale(1)', opacity: 1 },
      {
        transform: `perspective(900px) translate3d(${dx * 0.5}px, ${dy * 0.5 - 70}px, 140px) rotateX(32deg) rotateZ(-8deg) scale(0.85)`,
        opacity: 1,
        offset: 0.45,
      },
      {
        transform: `perspective(900px) translate3d(${dx}px, ${dy}px, 0) rotateX(64deg) rotateZ(0deg) scale(0.16)`,
        opacity: 0.15,
      },
    ],
    { duration: 520, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
  const retirer = () => double.remove();
  vol.addEventListener('finish', retirer);
  vol.addEventListener('cancel', retirer);
}
