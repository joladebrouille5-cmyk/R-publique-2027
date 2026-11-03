import {
  candidateName,
  REAL_MEDIA_TYPES,
  type Actor,
  type GameState,
  type RealOutlet,
  type Ruleset,
} from '@r2027/shared';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  audienceLabel,
  hoursLabel,
  MEDIA_NOTICE,
  MEDIA_TYPE_LABELS,
  OutletLogo,
} from '../components/RealMedia';
import { card } from '../components/ui';
import { formatGameDate } from '../labels';
import { useCurrentGame } from './GameLayout';
import { Reseaux } from './medias/Reseaux';
import { ScreenHeading } from '../components/Disclosure';

const ACTIVE = new Set(['candidat', 'qualifie']);
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const percent = (share: number) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(share * 100)} %`;

/** Parti des relevés de l'Arcom rattaché à un candidat (personnalité réelle), sinon null. */
function arcomParty(ruleset: Ruleset, actor: Actor): string | null {
  const id = actor.candidate.personnaliteId;
  if (!id) return null;
  return ruleset.mediasReels.rattachements.find((r) => r.personnaliteId === id)?.partiArcom ?? null;
}

/** Temps de parole de l'organe : volume, et exposition mesurée des partis des candidats. */
function SpeakingTime({
  outlet,
  ruleset,
  actors,
}: {
  outlet: RealOutlet;
  ruleset: Ruleset;
  actors: Actor[];
}) {
  const t = outlet.tempsDeParole;
  if (!t) {
    return (
      <p className="text-xs text-encre-2">
        Presse écrite : pas de relevé de temps de parole ; même traitement pour tous les candidats.
      </p>
    );
  }
  const { debut, fin } = ruleset.mediasReels.periodeArcom;
  const { min, max } = ruleset.medias.propension;
  const rows = actors
    .map((a) => ({ actor: a, party: arcomParty(ruleset, a) }))
    .filter((r): r is { actor: Actor; party: string } => r.party !== null);
  return (
    <div className="space-y-1 text-xs text-encre-2">
      <p>
        Temps de parole des partis (relevé officiel) : {hoursLabel(t.partisSecondes)} du{' '}
        {formatGameDate(debut)} au {formatGameDate(fin)} (pouvoir exécutif, compté à part :{' '}
        {hoursLabel(t.executifSecondes)}).
      </p>
      <details>
        <summary className="cursor-pointer">Exposition mesurée des partis des candidats</summary>
        {rows.length === 0 ? (
          <p className="mt-1">
            Aucun candidat de la partie n’est rattaché à un parti suivi : exposition moyenne pour
            tous.
          </p>
        ) : (
          <table className="mt-1 w-full text-left">
            <caption className="sr-only">
              Exposition mesurée sur {outlet.libelle} des partis des candidats
            </caption>
            <thead>
              <tr>
                <th scope="col" className="font-medium">
                  Candidat (parti)
                </th>
                <th scope="col" className="text-right font-medium">
                  Part du temps
                </th>
                <th scope="col" className="text-right font-medium">
                  Exposition relative
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ actor, party }) => {
                const raw = t.propension[party];
                const bounded = raw === undefined ? 1 : Math.min(max, Math.max(min, raw));
                return (
                  <tr key={actor.id} className="border-t border-slate-100 dark:border-slate-800">
                    <th scope="row" className="py-0.5 font-normal">
                      {candidateName(actor.candidate)} ({party})
                    </th>
                    <td className="py-0.5 text-right tabular-nums">
                      {percent(t.parts[party] ?? 0)}
                    </td>
                    <td className="py-0.5 text-right tabular-nums">× {decimal.format(bounded)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}

/** Couverture simulée de la semaine passée par un organe (quatre candidats les plus exposés). */
function Coverage({ outlet, state }: { outlet: RealOutlet; state: GameState }) {
  const rows = Object.entries(state.medias?.couverture[outlet.id] ?? {})
    .sort(([, a], [, b]) => b.exposition - a.exposition)
    .slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Couverture simulée des candidats par {outlet.libelle}</caption>
      <thead>
        <tr className="text-encre-3">
          <th scope="col" className="font-medium">
            Candidat
          </th>
          <th scope="col" className="text-right font-medium">
            Exposition
          </th>
          <th scope="col" className="text-right font-medium">
            Tonalité
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([actorId, c]) => (
          <tr key={actorId} className="border-t border-slate-100 dark:border-slate-800">
            <th scope="row" className="py-0.5 font-normal">
              {state.actors[actorId] ? candidateName(state.actors[actorId].candidate) : actorId}
              {actorId === state.player.actorId && ' (vous)'}
            </th>
            <td className="py-0.5 text-right tabular-nums">{Math.round(c.exposition / 100)} %</td>
            <td className="py-0.5 text-right tabular-nums">
              {c.tonalite > 0 ? '+' : ''}
              {c.tonalite}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Shows({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const outlets = new Map(ruleset.mediasReels.organes.map((o) => [o.id, o]));
  const interviews = state.medias?.interviews ?? [];
  const name = (id: string) =>
    `${state.actors[id] ? candidateName(state.actors[id].candidate) : id}${id === state.player.actorId ? ' (vous)' : ''}`;
  return (
    <section aria-labelledby="titre-emissions" className={`${card} space-y-3`}>
      <h2 id="titre-emissions" className="text-lg font-semibold">
        Émissions politiques
      </h2>
      <p className="text-sm text-encre-2">
        Émissions réelles, avec leur chaîne et leurs présentateurs. Pour y être invité, programmez «
        Invité d’une émission politique » dans le plan d’actions : l’interview est simulée et rien
        n’est attribué aux journalistes.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {ruleset.mediasReels.emissions.map((show) => {
          const guests = interviews.filter((i) => i.emissionId === show.id);
          const channels = [show.organeId, ...show.autresOrganes].map(
            (id) => outlets.get(id)?.libelle ?? id,
          );
          return (
            <li
              key={show.id}
              aria-label={show.titre}
              className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <p className="font-semibold">{show.titre}</p>
              <p className="text-xs text-encre-2">
                {channels.join(', ')}
                {show.diffusion && ` · ${show.diffusion}`}
              </p>
              <p>Présentation : {show.presentateurs.join(', ')}</p>
              {guests.length > 0 && (
                <p>
                  <Badge tone="simule">Interview simulée</Badge> Semaine {state.medias!.semaine} :{' '}
                  {guests.map((g) => name(g.acteurId)).join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Médias réels (§8, phase 5 ter) : organes, audiences, temps de parole, émissions, couverture. */
export function Medias() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const { state } = game;
  if (ruleset.isError)
    return <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />;
  if (!ruleset.data) return <p>Chargement des médias…</p>;
  const data = ruleset.data;
  const actors = Object.values(state.actors)
    .filter((a) => ACTIVE.has(a.status))
    .sort((a, b) => candidateName(a.candidate).localeCompare(candidateName(b.candidate), 'fr'));

  return (
    <section aria-labelledby="titre-medias" className="space-y-6">
      <ScreenHeading id="titre-medias">Médias</ScreenHeading>
      <p
        role="note"
        className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
      >
        {MEDIA_NOTICE}
      </p>
      <p className="text-sm text-encre-2">
        {state.medias
          ? `Couverture simulée de la semaine ${state.medias.semaine} : exposition (part de l’attention de l’organe) et tonalité (−100 à +100). Elle dépend de la notoriété, des actions de la semaine et, à la télévision et à la radio, de l’exposition mesurée du parti de chaque candidat.`
          : 'La couverture médiatique sera calculée à la résolution de la semaine.'}
      </p>

      <Reseaux state={state} ruleset={data} gameId={game.id} week={game.week} />

      <Shows state={state} ruleset={data} />

      {REAL_MEDIA_TYPES.map((type) => (
        <section
          key={type}
          aria-labelledby={`titre-medias-${type}`}
          className={`${card} space-y-3`}
        >
          <h2 id={`titre-medias-${type}`} className="text-lg font-semibold">
            {MEDIA_TYPE_LABELS[type]}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {data.mediasReels.organes
              .filter((o) => o.type === type)
              .map((outlet) => (
                <li
                  key={outlet.id}
                  aria-label={outlet.libelle}
                  className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <p className="flex items-center gap-2 font-semibold">
                    <OutletLogo outlet={outlet} />
                    {outlet.libelle}
                    {outlet.portee === 'regionale' && <Badge>régionale</Badge>}
                  </p>
                  <p className="text-xs text-encre-2">
                    Audience mesurée : {audienceLabel(outlet)}.
                  </p>
                  <SpeakingTime outlet={outlet} ruleset={data} actors={actors} />
                  <Coverage outlet={outlet} state={state} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
