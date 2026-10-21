import { candidateName, relationKey, type GameState, type Ruleset } from '@r2027/shared';
import { Badge } from '../../components/Badge';
import { buttonSecondary, card } from '../../components/ui';
import { formatGameDate } from '../../labels';

const ACTIVE = new Set(['candidat', 'qualifie']);

/** Semaines entières entre la date de jeu et le premier tour. */
function weeksBeforeFirstRound(state: GameState, ruleset: Ruleset): number {
  const t1 = ruleset.calendrier.scrutins[0]!.date;
  const days =
    (Date.parse(`${t1}T00:00:00Z`) - Date.parse(`${state.meta.date}T00:00:00Z`)) / 86_400_000;
  return Math.floor(days / 7);
}

type Props = {
  state: GameState;
  ruleset: Ruleset;
  proposed: readonly string[];
  onPropose: (actorId: string) => void;
};

/**
 * Relations entre candidats (§7) : proximité, confiance, rivalité et dernier fait marquant.
 * Le joueur peut proposer un ralliement dans les semaines qui précèdent le premier tour ; le
 * candidat sollicité décide.
 */
export function Relations({ state, ruleset, proposed, onPropose }: Props) {
  const playerId = state.player.actorId;
  const player = playerId ? state.actors[playerId] : undefined;
  const weeks = weeksBeforeFirstRound(state, ruleset);
  const open =
    state.meta.phase === 'campagne' && weeks >= 1 && weeks <= ruleset.alliances.fenetreSemaines;
  const relations = Object.values(state.relations)
    .filter((r) => !playerId || r.a === playerId || r.b === playerId)
    .sort((x, y) => y.proximite - x.proximite);
  const name = (id: string) => (state.actors[id] ? candidateName(state.actors[id].candidate) : id);
  const canPropose = (other: string) =>
    open &&
    player !== undefined &&
    ACTIVE.has(player.status) &&
    ACTIVE.has(state.actors[other]?.status ?? '');

  return (
    <section aria-labelledby="titre-relations" className={`${card} space-y-3`}>
      <h2 id="titre-relations" className="text-lg font-semibold">
        {player ? 'Vos relations avec les autres candidats' : 'Relations entre candidats'}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Proximité : distance des positionnements (0 à 100). Confiance (−100 à +100) : elle suit la
        proximité au départ, baisse avec la rivalité et les refus, monte avec les accords. Rivalité
        (0 à 100) : intentions de vote proches sur un électorat commun.{' '}
        {open
          ? `Les ralliements sont possibles jusqu’au premier tour (${weeks} semaine(s)) : le candidat sollicité accepte ou refuse selon la relation et le rapport de forces.`
          : `Les ralliements sont possibles dans les ${ruleset.alliances.fenetreSemaines} semaines qui précèdent le premier tour (${formatGameDate(ruleset.calendrier.scrutins[0]!.date)}).`}
      </p>
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Relations, tableau défilant"
      >
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Relations entre candidats</caption>
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th scope="col" className="py-1 font-medium">
                {player ? 'Candidat' : 'Paire'}
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Proximité
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Confiance
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Rivalité
              </th>
              <th scope="col" className="py-1 pl-3 font-medium">
                Dernier fait
              </th>
              {player && (
                <th scope="col" className="py-1 font-medium">
                  <span className="sr-only">Ralliement</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {relations.map((r) => {
              const other = r.a === playerId ? r.b : r.a;
              const last = r.historique.at(-1);
              return (
                <tr
                  key={relationKey(r.a, r.b)}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <th scope="row" className="py-1 pr-2 font-normal">
                    {player ? name(other) : `${name(r.a)} — ${name(r.b)}`}
                  </th>
                  <td className="py-1 pl-3 text-right tabular-nums">{r.proximite}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">
                    {r.confiance > 0 ? '+' : ''}
                    {r.confiance}
                  </td>
                  <td className="py-1 pl-3 text-right tabular-nums">{r.rivalite}</td>
                  <td className="py-1 pl-3 text-xs">
                    {last ? `${last.libelle} (semaine ${last.semaine})` : '—'}
                  </td>
                  {player && (
                    <td className="py-1 pl-2 text-right">
                      <button
                        type="button"
                        className={`${buttonSecondary} px-2 py-1 text-xs`}
                        disabled={!proposed.includes(other) && !canPropose(other)}
                        onClick={() => onPropose(other)}
                        aria-label={
                          proposed.includes(other)
                            ? `Annuler la proposition à ${name(other)}`
                            : `Proposer un ralliement à ${name(other)}`
                        }
                      >
                        {proposed.includes(other) ? 'Annuler' : 'Proposer un ralliement'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {state.alliances.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Ralliements">
          {state.alliances.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <Badge tone="simule">Simulé</Badge>
              {name(a.de)} s’est rallié(e) à {name(a.vers)} (semaine {a.semaine}
              {a.origine === 'joueur' ? ', à votre proposition' : ''}).
            </li>
          ))}
        </ul>
      )}
      {proposed.length > 0 && (
        <p className="text-sm text-amber-800 dark:text-amber-300" aria-live="polite">
          Proposition(s) envoyée(s) à la résolution de la semaine : {proposed.map(name).join(', ')}.
        </p>
      )}
    </section>
  );
}
