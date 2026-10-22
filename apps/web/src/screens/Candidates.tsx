import {
  candidateName,
  type Actor,
  type GameState,
  type Ruleset,
  type UtilityFactor,
} from '@r2027/shared';
import { useRuleset } from '../api/hooks';
import { presentationSummary } from '../campaign';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { PositionMap } from '../components/PositionMap';
import {
  PersonalityFacts,
  PersonalityPhoto,
  SIMULATION_NOTICE,
} from '../components/RealPersonality';
import { card } from '../components/ui';
import {
  CANDIDATE_STATUS_LABELS,
  describePosition,
  formatCount,
  formatGameDate,
  formatResource,
  OBJECTIVE_LABELS,
  PRIORITY_LABELS,
} from '../labels';
import { portraitOf } from '../portraits';
import { useWeeklyPlan } from '../stores/plan';
import { Relations } from './candidates/Relations';
import { useCurrentGame } from './GameLayout';

const STATUS_TONES = {
  candidat: 'neutre',
  qualifie: 'succes',
  elimine: 'danger',
  elu: 'succes',
  battu: 'neutre',
  ecarte: 'danger',
  retire: 'neutre',
  ineligible: 'neutre',
} as const;

/** Valeur signée à deux décimales, sans « −0,00 ». */
const formatSigned = (value: number) => {
  const rounded = Math.round(value * 100) / 100 || 0;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(2).replace('.', ',')}`;
};

/** Candidats triés : le joueur d'abord, puis par statut et par nom. */
export function sortedActors(state: GameState): Actor[] {
  const order = [
    'elu',
    'qualifie',
    'battu',
    'candidat',
    'elimine',
    'retire',
    'ecarte',
    'ineligible',
  ];
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

/** Sources et méthode des fiches de personnalités réelles (phase 5 bis). */
function RealSources({ ruleset }: { ruleset: Ruleset }) {
  const { personnalites, personnalitesReelles } = ruleset;
  return (
    <section aria-labelledby="titre-sources-reelles" className={`${card} space-y-3 text-sm`}>
      <h2 id="titre-sources-reelles" className="text-lg font-semibold">
        Personnalités réelles : sources et méthode
      </h2>
      <p>{SIMULATION_NOTICE}</p>
      <p>
        Fiches relevées le {formatGameDate(personnalites.verifieLe)}. {personnalites.decision}
      </p>
      <dl className="space-y-2">
        <dt className="font-medium">Position sur les axes</dt>
        <dd className="text-slate-700 dark:text-slate-300">{personnalites.methode.position}</dd>
        <dt className="font-medium">Notoriété de départ</dt>
        <dd className="text-slate-700 dark:text-slate-300">{personnalites.methode.notoriete}</dd>
        <dt className="font-medium">Organisation de campagne</dt>
        <dd className="text-slate-700 dark:text-slate-300">{personnalites.methode.organisation}</dd>
        <dt className="font-medium">Ancrage local</dt>
        <dd className="text-slate-700 dark:text-slate-300">{personnalites.methode.implantation}</dd>
      </dl>
      <p className="text-slate-600 dark:text-slate-400">
        <Badge tone="alerte">Hypothèses de jeu</Badge> {personnalitesReelles.note}
      </p>
      <h3 className="font-semibold">Sources</h3>
      <ul className="list-inside list-disc space-y-1">
        {personnalites.sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} className="underline" target="_blank" rel="noreferrer">
              {source.titre}
            </a>{' '}
            — {source.version}, consulté le {formatGameDate(source.consulteLe)} ; licence :{' '}
            {source.licence}.
          </li>
        ))}
      </ul>
      {personnalites.nonIntegrees.length > 0 && (
        <>
          <h3 className="font-semibold">Candidatures déclarées non intégrées</h3>
          <ul className="list-inside list-disc space-y-1">
            {personnalites.nonIntegrees.map((n) => (
              <li key={`${n.prenom} ${n.nom}`}>
                {n.prenom} {n.nom} ({n.parti}) — {n.motif}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function Candidates() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const plan = useWeeklyPlan(game.id, game.week);
  const { state } = game;
  const actors = sortedActors(state);
  const families = new Map(ruleset.data?.candidatsFictifs.map((c) => [c.id, c.famille]) ?? []);
  const fiches = new Map(ruleset.data?.personnalites.personnalites.map((p) => [p.id, p]) ?? []);
  const hasReal = actors.some((a) => a.candidate.nature === 'reel');
  const hasFictional = actors.some((a) => a.candidate.nature === 'fictif');

  return (
    <section aria-labelledby="titre-candidats" className="space-y-6">
      <h1 id="titre-candidats" className="text-2xl font-bold">
        Candidats
      </h1>
      {hasReal && (
        <p
          role="note"
          className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
        >
          {SIMULATION_NOTICE} Fiches, sources et méthode en bas de page.
        </p>
      )}
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {hasFictional && (
          <>
            Les adversaires fictifs sont des <strong>personnages inventés</strong> : toute
            ressemblance avec des personnalités réelles serait fortuite.{' '}
          </>
        )}
        {state.campagne.parrainages === 'modelise'
          ? 'Seuls les candidats ayant réuni assez de présentations valides à la clôture figurent au premier tour ; les présentations validées sont publiques, les promesses ne le sont pas.'
          : 'Partie créée avant la phase 5 : les parrainages ne sont pas modélisés et tous les candidats figurent au premier tour.'}
      </p>

      <div className={card}>
        <h2 className="mb-3 text-lg font-semibold">Positionnements</h2>
        <PositionMap
          candidates={actors.map((actor) => ({
            id: actor.id,
            name: candidateName(actor.candidate),
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
          const fiche = actor.candidate.personnaliteId
            ? fiches.get(actor.candidate.personnaliteId)
            : undefined;
          return (
            <li
              key={actor.id}
              className={`${card} space-y-3`}
              aria-label={candidateName(actor.candidate)}
            >
              <div className="flex items-center gap-4">
                {fiche ? (
                  <PersonalityPhoto personality={fiche} ruleset={ruleset.data} />
                ) : (
                  <Avatar portrait={portraitOf(actor, ruleset.data)} size="xl" ring />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="w-full text-xl font-bold">{candidateName(actor.candidate)}</h2>
                  {player && <Badge tone="simule">Votre candidat</Badge>}
                  {actor.candidate.nature === 'reel' && (
                    <Badge tone="reel">Personnalité réelle — simulée</Badge>
                  )}
                  {actor.candidate.nature === 'fictif' && <Badge tone="fictif">Fictif</Badge>}
                  <Badge tone={STATUS_TONES[actor.status]}>
                    {CANDIDATE_STATUS_LABELS[actor.status]}
                  </Badge>
                </div>
              </div>
              <p className="text-sm">
                <span className="font-medium">{actor.candidate.parti}</span>
                {families.get(actor.id) && ` — ${families.get(actor.id)}`}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {describePosition(actor.candidate.positionnement)}
              </p>
              {actor.candidate.parcours && <p className="text-sm">{actor.candidate.parcours}</p>}
              {ruleset.data && state.campagne.parrainages === 'modelise' && (
                <p className="text-sm">
                  Présentations validées :{' '}
                  <strong>
                    {formatCount(presentationSummary(actor.parrainages, ruleset.data).validees)}
                  </strong>{' '}
                  dans {presentationSummary(actor.parrainages, ruleset.data).departements}{' '}
                  départements
                </p>
              )}
              {actor.status === 'retire' && (
                <p className="text-sm">
                  {(() => {
                    const alliance = state.alliances.find((a) => a.de === actor.id);
                    const to = alliance ? state.actors[alliance.vers] : undefined;
                    return to
                      ? `S’est rallié(e) à ${candidateName(to.candidate)} (semaine ${alliance!.semaine}).`
                      : 'S’est retiré(e).';
                  })()}
                </p>
              )}
              {actor.objectif && (
                <p className="text-sm">
                  Objectif : {OBJECTIVE_LABELS[actor.objectif]}
                  {actor.strategie && (
                    <>
                      {' '}
                      · priorité de la semaine {actor.strategie.semaine} :{' '}
                      <strong>{PRIORITY_LABELS[actor.strategie.priorite]}</strong> —{' '}
                      {actor.strategie.motif}
                    </>
                  )}
                </p>
              )}
              {fiche && ruleset.data && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Fiche sourcée et crédit photo
                  </summary>
                  <div className="mt-2">
                    <PersonalityFacts
                      personality={fiche}
                      verifieLe={ruleset.data.personnalites.verifieLe}
                    />
                  </div>
                </details>
              )}
              <p className="text-sm">
                {actor.candidate.nature === 'reel' && !player
                  ? 'Programme : aucune proposition prêtée par le jeu à une personnalité réelle (facteurs « Programme » et « Crédibilité » neutres)'
                  : `Programme : ${actor.programme.propositions.length} proposition(s)`}
                {actor.programme.revirements > 0 &&
                  ` · ${actor.programme.revirements} revirement(s)`}
                {state.medias?.indice[actor.id] !== undefined &&
                  ` · indice médiatique ${formatSigned(state.medias.indice[actor.id]!)}`}
              </p>
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

      {ruleset.data && (
        <Relations
          state={state}
          ruleset={ruleset.data}
          proposed={plan.proposer}
          onPropose={plan.togglePropose}
        />
      )}
      {ruleset.data && hasReal && <RealSources ruleset={ruleset.data} />}
    </section>
  );
}
