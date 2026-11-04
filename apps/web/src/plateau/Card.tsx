import { FAMILLE_LABELS, type ActionDefinition, type Ruleset } from '@r2027/shared';
import { useId } from 'react';
import { bandeauFamille, carte } from '../components/ui';
import { formatResource } from '../labels';
import { effectLines } from '../screens/dashboard/ActionPlanner';

// Carte de la main (phase 25) : bandeau de famille, coût en heures et en euros, effet principal ;
// grisée avec sa raison quand elle n'est pas jouable ; halo doré quand elle compléterait un combo.

export function Card({
  definition,
  ruleset,
  presidency,
  reason,
  combo,
  armed,
  onPick,
}: {
  definition: ActionDefinition;
  ruleset: Ruleset;
  presidency: boolean;
  /** Raison qui empêche de la jouer cette semaine (null : jouable). */
  reason: string | null;
  /** Combo que la carte compléterait (annoncé avant la pose). */
  combo: string | null;
  /** Carte touchée, en attente de sa cible. */
  armed: boolean;
  onPick: (actionId: string) => void;
}) {
  const id = useId();
  const famille = definition.famille ?? 'organisation';
  const gain = presidency
    ? definition.cible === 'departement'
      ? ruleset.implantation.deplacementPresident
      : undefined
    : ruleset.implantation.gains[definition.id];
  const cost = [
    formatResource('tempsHeures', definition.cout.tempsHeures),
    ...(presidency || definition.cout.budgetCentimes === 0
      ? []
      : [formatResource('budgetCentimes', definition.cout.budgetCentimes)]),
  ].join(' · ');
  const effects = [
    ...(gain ? [`+${gain} d’implantation dans le département`] : []),
    ...effectLines(definition).slice(0, gain ? 1 : 2),
  ];
  return (
    <button
      type="button"
      draggable={reason === null}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/x-r2027-carte', definition.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onPick(definition.id)}
      disabled={reason !== null}
      aria-pressed={armed}
      aria-label={`Carte « ${definition.libelle} », ${cost}`}
      aria-describedby={`${id}-effet${reason ? ` ${id}-raison` : ''}${combo ? ` ${id}-combo` : ''}`}
      className={`${carte} w-40 shrink-0 snap-start text-left sm:w-44 ${
        combo && !reason ? 'ring-4 ring-or ring-offset-2 ring-offset-feutrine' : ''
      } ${armed ? '-translate-y-2 ring-4 ring-craie' : ''} ${reason ? 'grayscale' : ''}`}
    >
      <span
        className={`px-2.5 py-1 font-display text-[0.7rem] font-extrabold tracking-[0.02em] ${
          presidency ? 'bg-encre-carton text-carton' : bandeauFamille[famille]
        }`}
      >
        {presidency ? 'Agenda du président' : FAMILLE_LABELS[famille]}
      </span>
      <span className="px-2.5 pt-2 font-display text-[0.95rem] leading-tight font-bold">
        {definition.libelle}
      </span>
      <span className="px-2.5 pt-1 text-xs font-semibold tabular-nums text-encre-carton-2">
        {cost}
      </span>
      <span id={`${id}-effet`} className="px-2.5 pt-1 pb-2 text-xs leading-snug">
        {effects.join(' ; ')}
      </span>
      {combo && !reason && (
        <span
          id={`${id}-combo`}
          className="mx-2 mb-2 rounded-md bg-or px-2 py-0.5 text-[0.7rem] font-extrabold text-sur-or"
        >
          {combo}
        </span>
      )}
      {reason && (
        <span id={`${id}-raison`} className="mx-2 mb-2 text-[0.72rem] font-bold text-red-800">
          {reason}
        </span>
      )}
    </button>
  );
}
