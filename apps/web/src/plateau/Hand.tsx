import type { ActionDefinition, Famille, Ruleset } from '@r2027/shared';
import { Card } from './Card';

// La main (phase 25, maquette validée) : les cartes jouables de la semaine en éventail, rangées
// par famille, qui défilent sous le pouce ; la carte prise se soulève. Pendant le quinquennat,
// l'agenda du président.

export type HandCard = {
  definition: ActionDefinition;
  reason: string | null;
  combo: string | null;
};

const ORDER: Famille[] = ['terrain', 'medias', 'numerique', 'organisation'];
const TILTS = ['-rotate-6', '-rotate-3', 'rotate-0', 'rotate-3', 'rotate-6'];

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
  return (
    <section aria-label="Main" className="relative">
      <h2 className="sr-only">Votre main</h2>
      <ul className="-mx-3 flex snap-x overflow-x-auto px-4 pt-6 pb-1 [scrollbar-width:none]">
        {ordered.map((card, i) => (
          <li key={card.definition.id} className="-ml-5 flex snap-center first:ml-0">
            <Card
              definition={card.definition}
              ruleset={ruleset}
              presidency={presidency}
              reason={card.reason}
              combo={card.combo}
              armed={armed === card.definition.id}
              tilt={TILTS[i % TILTS.length]}
              onPick={onPlay}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
