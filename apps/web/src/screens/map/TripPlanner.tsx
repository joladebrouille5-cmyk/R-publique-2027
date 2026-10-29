import { presidentialActionBlocked, type GameDetail, type Ruleset } from '@r2027/shared';
import { MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { buttonSecondary } from '../../components/ui';
import { useWeeklyPlan } from '../../stores/plan';
import { remainingAfter } from '../dashboard/ActionPlanner';

// Déplacements choisis sur la carte (phase 15, idée I6) : pendant le mandat, la fiche d'un
// département propose d'ajouter une visite du président à l'agenda de la semaine (validée au QG
// et revalidée par le serveur), et rappelle les déplacements du mandat dans ce département.

export function TripPlanner({
  game,
  ruleset,
  code,
  nom,
}: {
  game: GameDetail;
  ruleset: Ruleset;
  code: string;
  nom: string;
}) {
  const plan = useWeeklyPlan(game.id, game.week);
  const [added, setAdded] = useState<string | null>(null);
  const { state } = game;
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const visits = state.quinquennat?.deplacements[code] ?? 0;
  if (!actor) return null;
  const catalog = ruleset.quinquennat.actions;
  const left = remainingAfter(plan.actions, catalog, actor, 0);
  const full = plan.actions.length >= ruleset.jeu.actionsMaxParSemaine;
  const trips = catalog.filter((a) => a.cible === 'departement' && !a.institution);
  return (
    <section
      aria-label={`Déplacement du président : ${nom}`}
      className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MapPin aria-hidden="true" className="size-4 text-amber-700 dark:text-amber-300" />
        Programmer un déplacement
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {visits > 0
          ? `${visits} déplacement(s) du président ici pendant le mandat (trace en pointillés sur la carte).`
          : 'Aucun déplacement du président ici pendant le mandat.'}
      </p>
      <ul className="space-y-1.5">
        {trips.map((action) => {
          const reason = full
            ? 'Agenda de la semaine complet.'
            : action.cout.tempsHeures > left.time
              ? 'Temps restant insuffisant cette semaine.'
              : action.delaiSemaines !== undefined &&
                  plan.actions.some((p) => p.actionId === action.id)
                ? 'Une seule fois par semaine.'
                : presidentialActionBlocked(state, action);
          return (
            <li key={action.id}>
              <button
                type="button"
                className={`${buttonSecondary} w-full justify-start`}
                disabled={reason !== null}
                onClick={() => {
                  plan.addTargeted(action.id, code);
                  setAdded(action.libelle);
                }}
              >
                <Plus aria-hidden="true" className="size-4" />
                {action.libelle} ({action.cout.tempsHeures} h)
              </button>
              {reason && (
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{reason}</p>
              )}
            </li>
          );
        })}
      </ul>
      {added && (
        <p role="status" className="text-xs font-semibold">
          « {added} » ajouté à l’agenda de la semaine.{' '}
          <Link
            to="../tableau-de-bord"
            className="text-republique-700 underline dark:text-republique-300"
          >
            Voir l’agenda au QG
          </Link>
        </p>
      )}
    </section>
  );
}
