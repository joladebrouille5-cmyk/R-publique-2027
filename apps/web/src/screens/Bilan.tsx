import {
  candidateName,
  ECONOMIC_INDICATORS,
  type GameState,
  type PresidentialArchive,
  type QuinquennatSummary,
  type Ruleset,
} from '@r2027/shared';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card } from '../components/ui';
import {
  formatGameDate,
  formatIndicator,
  formatIndicatorDelta,
  formatRatio,
  formatShare,
  INDICATOR_LABELS,
} from '../labels';
import { useCurrentGame } from './GameLayout';
import { memberInfo } from './Government';
import { ScreenHeading } from '../components/Disclosure';

// Bilan des quinquennats achevés (phase 6, P6-08) et présidentielles archivées. Le bilan est
// arrêté par le moteur au début de la campagne présidentielle suivante ; l'écran ne fait que
// l'afficher. Tout y est simulé, sauf les valeurs de départ sourcées de l'économie.

const CONSEQUENCE_ORIGINS = {
  crise: 'séquelle d’une crise',
  decision: 'suite d’une décision',
  scenario: 'scénario de départ',
} as const;

const MOTIF_LABELS = {
  'reelles-2024': 'élections de 2024 (réelles)',
  dissolution: 'élections anticipées après dissolution (simulées)',
  'fin-de-legislature': 'élections de fin de législature (simulées)',
} as const;

function Review({
  summary,
  state,
  ruleset,
}: {
  summary: QuinquennatSummary;
  state: GameState;
  ruleset: Ruleset;
}) {
  const { mandat, bilan, gouvernements } = summary;
  const president = state.actors[mandat.presidentId];
  const name = president ? candidateName(president.candidate) : mandat.presidentId;
  const proposals = new Map(ruleset.programme.propositions.map((p) => [p.id, p.libelle]));
  const blocs = new Map(ruleset.legislatives.blocs.map((b) => [b.id, b.libelle]));
  const years = `${mandat.debut.slice(0, 4)}–${mandat.fin.slice(0, 4)}`;
  const { debut, fin, reformes } = bilan;
  const titleId = `titre-bilan-${mandat.debut}`;
  return (
    <section aria-labelledby={titleId} className={`${card} space-y-4 text-sm`}>
      <h2 id={titleId} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        Quinquennat {years} <Badge tone="simule">Simulation</Badge>
      </h2>
      <p>
        {name}, président(e) de la République (mandat n° {mandat.numero}) du{' '}
        {formatGameDate(mandat.debut)} au {formatGameDate(mandat.fin)}. Bilan arrêté le{' '}
        {formatGameDate(fin.date)}, au début de la campagne présidentielle suivante.
      </p>

      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={`Indicateurs du quinquennat ${years}, tableau défilant`}
      >
        <table className="w-full min-w-[30rem] text-left">
          <caption className="sr-only">Indicateurs au début et à la fin du quinquennat</caption>
          <thead className="text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th scope="col">Indicateur</th>
              <th scope="col">Début ({formatGameDate(debut.date)})</th>
              <th scope="col">Fin</th>
              <th scope="col">Évolution</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200 dark:border-slate-800">
              <th scope="row" className="py-1 pr-2 font-normal">
                Popularité du président
              </th>
              <td className="tabular-nums">
                {debut.popularite === null ? 'non enregistrée' : formatShare(debut.popularite)}
              </td>
              <td className="tabular-nums">
                {fin.popularite === null ? '—' : formatShare(fin.popularite)}
              </td>
              <td className="tabular-nums">
                {debut.popularite === null || fin.popularite === null
                  ? '—'
                  : `${formatIndicatorDelta(fin.popularite - debut.popularite)} pt`}
              </td>
            </tr>
            {debut.indicateurs &&
              fin.indicateurs &&
              ECONOMIC_INDICATORS.map((indicator) => {
                const a = debut.indicateurs![indicator] ?? 0;
                const b = fin.indicateurs![indicator] ?? 0;
                return (
                  <tr key={indicator} className="border-t border-slate-200 dark:border-slate-800">
                    <th scope="row" className="py-1 pr-2 font-normal">
                      {INDICATOR_LABELS[indicator].label}
                    </th>
                    <td className="tabular-nums">{formatIndicator(indicator, a)}</td>
                    <td className="tabular-nums">{formatIndicator(indicator, b)}</td>
                    <td className="tabular-nums">{formatIndicatorDelta(b - a)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {debut.popularite === null && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Popularité de départ non enregistrée : partie reprise d’un format de sauvegarde antérieur
          au bilan du quinquennat.
        </p>
      )}

      <div className="space-y-1">
        <h3 className="font-semibold">Réformes</h3>
        <p>
          {reformes.adoptees.length} réforme(s) adoptée(s), dont {reformes.enVigueur} en vigueur à
          la fin du mandat ; {reformes.rejetees} texte(s) rejeté(s), {reformes.retirees} retiré(s),{' '}
          {reformes.caducs} devenu(s) caduc(s) à la fin du quinquennat ; {reformes.engagements49_3}{' '}
          recours à l’article 49 alinéa 3 ; {reformes.censures} motion(s) de censure adoptée(s).
        </p>
        {reformes.adoptees.length > 0 && (
          <ul className="list-inside list-disc">
            {reformes.adoptees.map((id) => (
              <li key={id}>{proposals.get(id) ?? id}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Gouvernements</h3>
        <ol className="list-inside list-decimal">
          {gouvernements.map((g) => (
            <li key={g.numero}>
              {memberInfo(state, ruleset, g.premierMinistre).name}, Premier ministre du{' '}
              {formatGameDate(g.debut)} au {formatGameDate(g.fin)} ({g.motif})
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Assemblée nationale</h3>
        <p>
          {bilan.legislatives
            ? `Dernières législatives du quinquennat : ${MOTIF_LABELS[bilan.legislatives.motif]}, second tour le ${formatGameDate(bilan.legislatives.t2)}${bilan.legislatives.cohabitation ? ', cohabitation' : ''} — ${Object.entries(
                bilan.legislatives.siegesParBloc,
              )
                .map(([bloc, seats]) => `${blocs.get(bloc) ?? bloc} ${seats}`)
                .join(' ; ')}.`
            : 'Aucune élection législative pendant ce quinquennat.'}
        </p>
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold">Conséquences durables</h3>
        {bilan.consequences.length > 0 ? (
          <ul className="list-inside list-disc">
            {bilan.consequences.map((c) => (
              <li key={`${c.libelle}-${c.debut}`}>
                {c.libelle} ({CONSEQUENCE_ORIGINS[c.origine]}, semaines {c.debut} à {c.fin})
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucune conséquence durable née pendant ce quinquennat.</p>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Valeurs simulées par le jeu (aucune n’est une prévision) ; seules les valeurs de départ de
        l’économie sont des données réelles. Pendant la campagne qui suit, l’action du gouvernement
        sortant, le Parlement et l’économie ne sont pas simulés (simplification du jeu).
      </p>
    </section>
  );
}

function Presidentials({ archives, state }: { archives: PresidentialArchive[]; state: GameState }) {
  const nameOf = (id: string) =>
    state.actors[id] ? candidateName(state.actors[id].candidate) : id;
  return (
    <section aria-labelledby="titre-presidentielles" className={`${card} space-y-2 text-sm`}>
      <h2 id="titre-presidentielles" className="text-lg font-semibold">
        Présidentielles précédentes
      </h2>
      <ul className="space-y-1">
        {archives.map((archive) => {
          const top = Object.entries(archive.t1.voix)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id, votes]) => `${nameOf(id)} ${formatRatio(votes, archive.t1.exprimes)}`)
            .join(' · ');
          return (
            <li key={archive.annee}>
              <span className="font-semibold">{archive.annee}</span> : {nameOf(archive.eluId)}{' '}
              élu(e) {archive.t2 ? 'au second tour' : 'au premier tour'} ; premier tour : {top}.{' '}
              <Badge tone="simule">Résultat simulé</Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const { quinquennats, presidentielles } = state.historique;
  if (quinquennats.length === 0) {
    return (
      <p className={`${card} text-sm`}>
        {state.quinquennat
          ? 'Le quinquennat est en cours : son bilan sera arrêté à la fin du mandat, au début de la campagne présidentielle suivante.'
          : 'Aucun quinquennat achevé : le bilan est arrêté à la fin d’un mandat, au début de la campagne présidentielle suivante.'}
      </p>
    );
  }
  return (
    <>
      {[...quinquennats].reverse().map((summary) => (
        <Review key={summary.mandat.debut} summary={summary} state={state} ruleset={ruleset} />
      ))}
      {presidentielles.length > 0 && (
        <Presidentials archives={[...presidentielles].reverse()} state={state} />
      )}
    </>
  );
}

export function Bilan() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  return (
    <section aria-labelledby="titre-ecran-bilan" className="space-y-6">
      <ScreenHeading id="titre-ecran-bilan">Bilan du quinquennat</ScreenHeading>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
