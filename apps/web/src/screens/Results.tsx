import { candidateName, type GameState, type RoundResult, type Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ShareBar } from '../components/ShareBar';
import { card } from '../components/ui';
import { DATA_STATUS_LABELS, formatCount, formatGameDate, formatRatio } from '../labels';
import { useCurrentGame } from './GameLayout';

const nameOf = (state: GameState, id: string) => {
  const actor = state.actors[id];
  return actor ? candidateName(actor.candidate) : id;
};

function RoundCard({
  result,
  state,
  ruleset,
}: {
  result: RoundResult;
  state: GameState;
  ruleset: Ruleset | undefined;
}) {
  const ranking = Object.entries(result.voix).sort((a, b) => b[1] - a[1]);
  const max = ranking[0]?.[1] ?? 0;
  const groups = new Map(ruleset?.electorat.groupes.map((g) => [g.id, g.libelle]) ?? []);
  const roundLabel = result.round === 1 ? 'Premier tour' : 'Second tour';
  const facts = [
    ['Inscrits', formatCount(result.inscrits)],
    ['Votants', `${formatCount(result.votants)} (${formatRatio(result.votants, result.inscrits)})`],
    [
      'Abstentions',
      `${formatCount(result.abstentions)} (${formatRatio(result.abstentions, result.inscrits)})`,
    ],
    [
      'Blancs',
      `${formatCount(result.blancs)} (${formatRatio(result.blancs, result.votants)} des votants)`,
    ],
    [
      'Nuls',
      `${formatCount(result.nuls)} (${formatRatio(result.nuls, result.votants)} des votants)`,
    ],
    ['Exprimés', formatCount(result.exprimes)],
  ];

  return (
    <section aria-label={roundLabel} className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">
          {roundLabel} — {formatGameDate(result.date)}
        </h2>
        <Badge tone="simule">Résultat simulé</Badge>
        <Link
          to={`../soiree/${result.round}`}
          className="ml-auto rounded-full px-2 py-1 text-sm font-semibold text-republique-700 underline-offset-2 hover:bg-republique-50 hover:underline dark:text-republique-300 dark:hover:bg-slate-800"
        >
          Revivre la soirée électorale
        </Link>
      </div>
      {result.winner ? (
        <p className="font-semibold">
          {nameOf(state, result.winner)} est élu(e) président(e) de la République
          {result.round === 1 && ' dès le premier tour (majorité absolue des suffrages exprimés)'}.
        </p>
      ) : (
        <p className="font-semibold">
          Qualifiés pour le second tour :{' '}
          {result.qualified.map((id) => nameOf(state, id)).join(' et ')}.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{`${roundLabel} : voix par candidat`}</caption>
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th scope="col" className="py-1 pr-2 font-medium">
                Candidat
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">
                Voix
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">
                % exprimés
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">
                % inscrits
              </th>
              <th scope="col" className="w-1/4 py-1 font-medium">
                <span className="sr-only">Barre</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.map(([id, voix]) => {
              const player = id === state.player.actorId;
              const outcome =
                result.winner === id
                  ? 'Élu(e)'
                  : !result.winner && result.qualified.includes(id)
                    ? 'Qualifié(e)'
                    : null;
              return (
                <tr key={id} className="border-t border-slate-100 dark:border-slate-800">
                  <th
                    scope="row"
                    className={`py-1 pr-2 text-left ${player ? 'font-semibold' : 'font-normal'}`}
                  >
                    {nameOf(state, id)}
                    {player && ' (vous)'}
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {state.actors[id]?.candidate.parti}
                      {outcome && ` · ${outcome}`}
                    </span>
                  </th>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatCount(voix)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatRatio(voix, result.exprimes)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatRatio(voix, result.inscrits)}
                  </td>
                  <td className="py-1">
                    <ShareBar value={voix} max={max} emphasis={player} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Par groupe d’électeurs (hypothèse de jeu)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{`${roundLabel} : résultats par groupe d’électeurs`}</caption>
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Groupe
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Participation
                </th>
                <th scope="col" className="py-1 font-medium">
                  En tête
                </th>
              </tr>
            </thead>
            <tbody>
              {result.groups.map((group) => {
                const [leader, leaderVoix] = Object.entries(group.voix).sort(
                  (a, b) => b[1] - a[1],
                )[0] ?? ['', 0];
                return (
                  <tr
                    key={group.groupId}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <th scope="row" className="py-1 pr-2 text-left font-normal">
                      {groups.get(group.groupId) ?? group.groupId}
                    </th>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatRatio(group.votants, group.inscrits)}
                    </td>
                    <td className="py-1">
                      {nameOf(state, leader)} ({formatRatio(leaderVoix, group.exprimes)})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function Results() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const { state } = game;
  const { t1, t2, consignes, debate, debateDetail } = state.elections;
  const scrutins = ruleset.data?.calendrier.scrutins ?? [];

  return (
    <section aria-labelledby="titre-resultats" className="space-y-6">
      <h1 id="titre-resultats" className="text-2xl font-bold">
        Résultats
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Résultats <strong>simulés</strong> par le moteur de jeu, à partir de groupes d’électeurs
        nationaux (hypothèse de jeu). Les inscrits reprennent le chiffre officiel du second tour de
        2022 (
        {ruleset.data ? DATA_STATUS_LABELS[ruleset.data.electorat.inscrits.statut] : 'estimation'}).
        Le détail par commune, département et région est consultable sur la carte électorale. Seuls
        les candidats ayant réuni leurs parrainages figurent au premier tour.
      </p>

      {!t1 && (
        <p className={card}>
          Aucun scrutin dépouillé pour l’instant.
          {scrutins.map((s) => (
            <span key={s.id} className="block text-sm">
              {s.libelle} : {formatGameDate(s.date)} (date {DATA_STATUS_LABELS[s.statut]}).
            </span>
          ))}
        </p>
      )}

      {t2 && <RoundCard result={t2} state={state} ruleset={ruleset.data} />}

      {t1 && !t1.winner && (consignes.length > 0 || debate) && (
        <section aria-labelledby="titre-entre-deux" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-entre-deux" className="text-lg font-semibold">
            Entre-deux-tours
          </h2>
          <ul className="space-y-1">
            {consignes.map((c) => (
              <li key={c.fromActorId}>
                {nameOf(state, c.fromActorId)} :{' '}
                {c.toActorId
                  ? `appelle à voter pour ${nameOf(state, c.toActorId)}`
                  : 'aucune consigne de vote'}
                {!c.automatic && ' (votre choix)'}
              </li>
            ))}
            {debate &&
              Object.entries(debate).map(([id, score]) => (
                <li key={id}>
                  Débat : prestation de {nameOf(state, id)} jugée{' '}
                  {score >= 0.3 ? 'convaincante' : score <= -0.3 ? 'décevante' : 'moyenne'} (
                  {score >= 0 ? '+' : '−'}
                  {Math.abs(score).toFixed(2).replace('.', ',')} sur une échelle de −1 à +1,
                  simulée)
                </li>
              ))}
          </ul>
          {debateDetail && (
            <table className="w-full text-left text-xs">
              <caption className="mb-1 text-left font-medium">
                Composantes de la prestation au débat (0 à 1)
              </caption>
              <thead>
                <tr className="text-slate-500 dark:text-slate-400">
                  <th scope="col" className="py-1 font-medium">
                    Finaliste
                  </th>
                  {['Préparation', 'Maîtrise', 'Cohérence', 'Réponse'].map((h) => (
                    <th key={h} scope="col" className="py-1 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(debateDetail).map(([id, d]) => (
                  <tr key={id} className="border-t border-slate-100 dark:border-slate-800">
                    <th scope="row" className="py-1 font-normal">
                      {nameOf(state, id)}
                    </th>
                    {[d.preparation, d.maitrise, d.coherence, d.reponse].map((v, i) => (
                      <td key={i} className="py-1 text-right tabular-nums">
                        {v.toFixed(2).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Une consigne de vote ne transfère qu’une partie des électeurs du candidat éliminé. La
            prestation au débat combine la préparation (heures consacrées), la maîtrise (notoriété
            et équipe), la cohérence du programme et la qualité des réponses (part d’aléa).
          </p>
        </section>
      )}

      {t1 && <RoundCard result={t1} state={state} ruleset={ruleset.data} />}
    </section>
  );
}
