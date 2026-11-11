import type { ActionDefinition, Famille, Ruleset } from '@r2027/shared';
import { useEffect, useRef } from 'react';
import { Card } from './Card';

// La main (phase 25, maquette validée ; phase 26 : en CSS 3D, sans WebGL) : les cartes jouables
// de la semaine en éventail, rangées par famille, qui défilent sous le pouce. L'éventail suit le
// défilement : la carte au centre est droite et levée, ses voisines s'inclinent et tournent vers
// les bords (rotation et profondeur en transformations CSS 3D). La carte prise se soulève. Pendant
// le quinquennat, l'agenda du président.

export type HandCard = {
  definition: ActionDefinition;
  reason: string | null;
  combo: string | null;
};

const ORDER: Famille[] = ['terrain', 'medias', 'numerique', 'organisation'];

/** Place de chaque carte dans l'éventail : −1 au bord gauche de la main, +1 au bord droit. */
function ouvrirEventail(liste: HTMLUListElement) {
  const cadre = liste.getBoundingClientRect();
  const milieu = cadre.left + cadre.width / 2;
  for (const item of liste.children) {
    const boite = item.getBoundingClientRect();
    const ecart = (boite.left + boite.width / 2 - milieu) / Math.max(1, cadre.width / 2);
    (item as HTMLElement).style.setProperty(
      '--eventail',
      String(Math.max(-1.2, Math.min(1.2, ecart))),
    );
  }
}

export function Hand({
  cards,
  ruleset,
  presidency,
  armed,
  onPlay,
}: {
  cards: readonly HandCard[];
  ruleset: Ruleset;
  presidency: boolean;
  armed: string | null;
  onPlay: (actionId: string) => void;
}) {
  const ordered = presidency
    ? cards
    : [...cards].sort(
        (a, b) =>
          ORDER.indexOf(a.definition.famille ?? 'organisation') -
          ORDER.indexOf(b.definition.famille ?? 'organisation'),
      );
  const liste = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const element = liste.current;
    if (!element) return;
    let attente = 0;
    const maj = () => {
      cancelAnimationFrame(attente);
      attente = requestAnimationFrame(() => ouvrirEventail(element));
    };
    ouvrirEventail(element);
    element.addEventListener('scroll', maj, { passive: true });
    window.addEventListener('resize', maj);
    return () => {
      cancelAnimationFrame(attente);
      element.removeEventListener('scroll', maj);
      window.removeEventListener('resize', maj);
    };
  }, [ordered.length]);
  return (
    <section aria-label="Main" className="relative">
      <h2 className="sr-only">Votre main</h2>
      <ul
        ref={liste}
        data-eventail="3d"
        className="-mx-3 flex snap-x overflow-x-auto px-7 pt-7 pb-2 [perspective:900px] [scrollbar-width:none]"
      >
        {ordered.map((card) => (
          <li key={card.definition.id} className="eventail-carte -ml-4 flex snap-center first:ml-0">
            <Card
              definition={card.definition}
              ruleset={ruleset}
              presidency={presidency}
              reason={card.reason}
              combo={card.combo}
              armed={armed === card.definition.id}
              onPick={onPlay}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
