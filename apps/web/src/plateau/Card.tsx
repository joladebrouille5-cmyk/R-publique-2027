import { FAMILLE_LABELS, type ActionDefinition, type Famille, type Ruleset } from '@r2027/shared';
import { createElement, useId, type PointerEvent } from 'react';
import { formatResource, RESOURCE_LABELS } from '../labels';
import { actionIcon } from '../screens/dashboard/actionIcons';
import { effectLines } from '../screens/dashboard/ActionPlanner';

// Carte de la main (phase 25, maquette validée) : carte épaisse en carton, bandeau de famille et
// heures en tête, pictogramme rond, titre, effet principal en vert ; elle se soulève quand on la
// prend ; grisée avec sa raison quand elle n'est pas jouable ; halo doré quand elle compléterait
// un combo. Le détail complet de ses effets reste lu par les lecteurs d'écran.

const BAND: Record<Famille, string> = {
  terrain: 'bg-famille-terrain',
  medias: 'bg-famille-medias',
  numerique: 'bg-famille-numerique',
  organisation: 'bg-famille-organisation',
};
const RING: Record<Famille, string> = {
  terrain: 'ring-famille-terrain text-famille-terrain',
  medias: 'ring-famille-medias text-famille-medias',
  numerique: 'ring-famille-numerique text-famille-numerique',
  organisation: 'ring-famille-organisation text-famille-organisation',
};

/** Inclinaison de la carte vers le point touché (variables lues par `.carte-3d`). */
function pencher(event: PointerEvent<HTMLButtonElement>) {
  const carte = event.currentTarget;
  const boite = carte.getBoundingClientRect();
  if (boite.width === 0 || boite.height === 0) return;
  const x = (event.clientX - boite.left) / boite.width - 0.5;
  const y = (event.clientY - boite.top) / boite.height - 0.5;
  carte.style.setProperty('--penche-x', `${(-y * 16).toFixed(1)}deg`);
  carte.style.setProperty('--penche-y', `${(x * 20).toFixed(1)}deg`);
}
function redresser(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.style.removeProperty('--penche-x');
  event.currentTarget.style.removeProperty('--penche-y');
}

/** Effet principal, en quelques mots (« +12 implantation », « + Notoriété »). */
function headline(definition: ActionDefinition, gain: number | undefined): string {
  if (gain) return `+${gain} implantation`;
  const effect = definition.effets.find((e) => e.base > 0);
  if (effect) return `+ ${RESOURCE_LABELS[effect.ressource]}`;
  if (definition.campagne?.promesses) return '+ Parrainages';
  if (definition.campagne?.soutien) return '+ Soutien';
  return definition.cout.budgetCentimes === 0 && definition.id.includes('collecte')
    ? '+ Budget'
    : '';
}

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
  /** Carte prise, en attente de sa cible : elle se soulève. */
  armed: boolean;
  onPick: (actionId: string) => void;
}) {
  const id = useId();
  const famille: Famille = definition.famille ?? 'organisation';
  const gain = presidency
    ? definition.cible === 'departement'
      ? ruleset.implantation.deplacementPresident
      : undefined
    : ruleset.implantation.gains[definition.id];
  const hours = formatResource('tempsHeures', definition.cout.tempsHeures);
  const euros =
    presidency || definition.cout.budgetCentimes === 0
      ? null
      : formatResource('budgetCentimes', definition.cout.budgetCentimes);
  const cost = [hours, ...(euros ? [euros] : [])].join(' · ');
  const short = headline(definition, gain);
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
      data-carte={definition.id}
      // Phase 26 : la carte penche sous le doigt (ou la souris), vers le point touché.
      onPointerMove={pencher}
      onPointerDown={pencher}
      onPointerLeave={redresser}
      onPointerUp={redresser}
      onPointerCancel={redresser}
      className={`carte-3d relative flex h-40 w-28 shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-bord-carte bg-carton text-left text-encre-carton shadow-carte focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-or disabled:cursor-not-allowed sm:h-44 sm:w-32 ${
        armed ? 'carte-prise z-20 ring-4 ring-or' : ''
      } ${combo && !reason && !armed ? 'ring-4 ring-or' : ''} ${reason ? 'opacity-75 grayscale' : ''}`}
    >
      <span
        className={`flex items-center justify-between gap-1 px-2 py-1 font-display text-[0.68rem] font-extrabold text-white ${
          presidency ? 'bg-encre-carton' : BAND[famille]
        }`}
      >
        <span className="min-w-0 leading-tight">
          {presidency ? 'Agenda' : FAMILLE_LABELS[famille]}
        </span>
        <span className="shrink-0 rounded bg-black/30 px-1 tabular-nums">{hours}</span>
      </span>
      <span
        aria-hidden="true"
        className={`mx-auto mt-1.5 grid size-9 place-items-center sm:mt-2 sm:size-11 rounded-full bg-white ring-[3px] ${
          presidency ? 'text-encre-carton ring-encre-carton' : RING[famille]
        }`}
      >
        {createElement(actionIcon(definition.id), {
          className: 'size-4 sm:size-5',
          strokeWidth: 2.4,
        })}
      </span>
      {/* Titre entier, jamais tronqué : il passe à la ligne, en plus petit s'il est long. */}
      <span
        data-titre-carte=""
        lang="fr"
        className={`px-1.5 pt-1 text-center font-display leading-[1.08] font-extrabold text-balance hyphens-auto [overflow-wrap:anywhere] sm:px-2 sm:pt-1.5 ${
          definition.libelle.length > 30
            ? 'text-[0.62rem] sm:text-[0.7rem]'
            : definition.libelle.length > 20
              ? 'text-[0.68rem] sm:text-[0.76rem]'
              : 'text-[0.74rem] sm:text-[0.82rem]'
        }`}
      >
        {definition.libelle}
      </span>
      {euros && (
        <span className="px-2 pt-0.5 text-center text-[0.62rem] font-semibold text-encre-carton-2 tabular-nums">
          {euros}
        </span>
      )}
      <span
        aria-hidden="true"
        className="mt-auto px-1.5 pb-1.5 text-center text-[0.66rem] leading-tight font-extrabold text-gain sm:px-2 sm:pb-2 sm:text-[0.68rem]"
      >
        {reason ?? short}
      </span>
      <span id={`${id}-effet`} className="sr-only">
        {[
          ...(gain ? [`+${gain} d’implantation dans le département`] : []),
          ...effectLines(definition),
        ].join(' ; ')}
      </span>
      {combo && !reason && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-6 right-1 rounded-full bg-or px-1.5 text-[0.6rem] font-extrabold text-sur-or shadow-pion sm:top-7"
          >
            Combo
          </span>
          <span id={`${id}-combo`} className="sr-only">
            {combo}
          </span>
        </>
      )}
      {reason && (
        <span id={`${id}-raison`} className="sr-only">
          {reason}
        </span>
      )}
    </button>
  );
}
