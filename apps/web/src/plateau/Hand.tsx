import { FAMILLE_LABELS, type ActionDefinition, type Famille, type Ruleset } from '@r2027/shared';
import { Card } from './Card';

// La main (phase 25) : toutes les cartes jouables de la semaine, rangées par famille, en
// défilement horizontal. Pendant le quinquennat, l'agenda du président en une seule rangée.

export type HandCard = {
  definition: ActionDefinition;
  reason: string | null;
  combo: string | null;
};

const ORDER: Famille[] = ['terrain', 'medias', 'numerique', 'organisation'];

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
  const rows = presidency
    ? [{ id: 'agenda', label: 'Agenda du président', cards }]
    : ORDER.map((famille) => ({
        id: famille,
        label: FAMILLE_LABELS[famille],
        cards: cards.filter((c) => (c.definition.famille ?? 'organisation') === famille),
      })).filter((row) => row.cards.length > 0);
  return (
    <section aria-label="Main" className="space-y-3">
      <h2 className="font-display text-xl text-craie">Votre main</h2>
      {rows.map((row) => (
        <section key={row.id} aria-label={`Main : ${row.label}`} className="space-y-1.5">
          <h3 className="font-display text-sm font-bold text-craie-2">{row.label}</h3>
          <ul className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pt-2 pb-3">
            {row.cards.map((card) => (
              <li key={card.definition.id} className="flex">
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
      ))}
    </section>
  );
}
