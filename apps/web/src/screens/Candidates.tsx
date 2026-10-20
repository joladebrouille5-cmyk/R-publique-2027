import { candidateName, type Actor, type GameState, type UtilityFactor } from '@r2027/shared';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { PositionMap } from '../components/PositionMap';
import { card } from '../components/ui';
import { CANDIDATE_STATUS_LABELS, describePosition, formatResource } from '../labels';
import { useCurrentGame } from './GameLayout';

const STATUS_TONES = {
  candidat: 'neutre',
  qualifie: 'succes',
  elimine: 'danger',
  elu: 'succes',
  battu: 'neutre',
} as const;

/** Candidats triés : le joueur d'abord, puis par statut et par nom. */
export function sortedActors(state: GameState): Actor[] {
  const order = ['elu', 'qualifie', 'battu', 'candidat', 'elimine'];
  return Object.values(state.actors).sort(
    (a, b) =>
      Number(b.id === state.player.actorId) - Number(a.id === state.player.actorId) ||
      order.indexOf(a.status) - order.indexOf(b.status) ||
      candidateName(a.candidate).localeCompare(candidateName(b.candidate), 'fr'),
  );
}

function Breakdown({ factors }: { factors: UtilityFactor[] }) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Décomposition du score moyen auprès des électeurs</caption>
      <tbody>
        {factors.map((factor) => (
          <tr key={factor.label} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1 pr-2">{factor.label}</td>
            <td className="py-1 text-right font-mono whitespace-nowrap">
              {factor.value > 0 ? '+' : factor.value < 0 ? '−' : '±'}
              {Math.abs(factor.value).toFixed(2).replace('.', ',')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Candidates() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion);
  const { state } = game;
  const actors = sortedActors(state);
  const families = new Map(ruleset.data?.candidatsFictifs.map((c) => [c.id, c.famille]) ?? []);

  return (
    <section aria-labelledby="titre-candidats" className="space-y-6">
      <h1 id="titre-candidats" className="text-2xl font-bold">
        Candidats
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Les adversaires sont des <strong>personnages fictifs</strong> : toute ressemblance avec des
        personnalités réelles serait fortuite. Les personnalités réelles nécessitent des profils
        sourcés et une validation juridique (question Q2 du plan). Les parrainages et le dépôt des
        candidatures sont modélisés en phase 5 : tous les candidats sont considérés présents au
        premier tour.
      </p>

      <div className={card}>
        <h2 className="mb-3 text-lg font-semibold">Positionnements</h2>
        <PositionMap
          candidates={actors.map((actor) => ({
            id: actor.id,
            label:
              actor.id === state.player.actorId
                ? `${actor.candidate.parti} (vous)`
                : actor.candidate.parti,
            title: `${candidateName(actor.candidate)} (${actor.candidate.parti}) — ${describePosition(actor.candidate.positionnement)}`,
            position: actor.candidate.positionnement,
            player: actor.id === state.player.actorId,
          }))}
          groups={(ruleset.data?.electorat.groupes ?? []).map((group) => ({
            id: group.id,
            label: group.libelle,
            share: group.part,
            position: group.position,
          }))}
        />
      </div>

      <ul className="grid gap-4 lg:grid-cols-2">
        {actors.map((actor) => {
          const player = actor.id === state.player.actorId;
          const breakdown = state.opinion?.breakdown[actor.id];
          return (
            <li
              key={actor.id}
              className={`${card} space-y-3`}
              aria-label={candidateName(actor.candidate)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{candidateName(actor.candidate)}</h2>
                {player ? (
                  <Badge tone="simule">Votre candidat</Badge>
                ) : (
                  <Badge tone="fictif">Fictif</Badge>
                )}
                <Badge tone={STATUS_TONES[actor.status]}>
                  {CANDIDATE_STATUS_LABELS[actor.status]}
                </Badge>
              </div>
              <p className="text-sm">
                <span className="font-medium">{actor.candidate.parti}</span>
                {families.get(actor.id) && ` — ${families.get(actor.id)}`}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {describePosition(actor.candidate.positionnement)}
              </p>
              {actor.candidate.parcours && <p className="text-sm">{actor.candidate.parcours}</p>}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Notoriété</dt>
                  <dd className="font-semibold">
                    {formatResource('notoriete', actor.resources.notoriete)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Popularité</dt>
                  <dd className="font-semibold">
                    {formatResource('popularite', actor.resources.popularite)}
                  </dd>
                </div>
              </dl>
              {breakdown && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Pourquoi les électeurs le choisissent (ou non)
                  </summary>
                  <p className="my-2 text-xs text-slate-500 dark:text-slate-400">
                    Contribution moyenne de chaque facteur au score du candidat dans le modèle de
                    vote simulé (semaine {state.opinion!.week}), pondérée par le poids des groupes
                    d’électeurs. Plus le total est élevé, plus le candidat est choisi.
                  </p>
                  <Breakdown factors={breakdown} />
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
