import {
  addDays,
  type DistrictOutcome,
  type GameState,
  type LegislativeOutcome,
  type Ruleset,
} from '@r2027/shared';
import { useId, useState } from 'react';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card, input } from '../components/ui';
import { DATA_STATUS_LABELS, formatCount, formatGameDate, formatRatio } from '../labels';
import { useCurrentGame } from './GameLayout';

// Législatives (phase 6, P6-07) : calendrier, dissolution, composition issue des dernières
// élections et résultats par circonscription. Les élections de 2024 sont réelles (ministère de
// l'Intérieur, sans nom de candidat) ; les suivantes sont simulées et étiquetées comme telles.

const MOTIF_LABELS: Record<LegislativeOutcome['motif'], string> = {
  'reelles-2024': 'Élections législatives des 30 juin et 7 juillet 2024 (résultats réels)',
  dissolution: 'Élections législatives anticipées après dissolution (résultats simulés)',
  'fin-de-legislature': 'Élections législatives de fin de législature (résultats simulés)',
};

const ALL = 'toutes';

type Row = {
  code: string;
  libelle: string;
  inscrits: number;
  votants: number;
  exprimes: number;
  /** Premier en voix au premier tour (nuance pour 2024, bloc pour la simulation). */
  tete: { label: string; voix: number } | null;
  elu: { label: string; tour: 1 | 2 } | null;
};

function leader(voix: Record<string, number>): [string, number] | null {
  const sorted = Object.entries(voix).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted[0] ?? null;
}

function realRows(ruleset: Ruleset): Row[] {
  const blocs = blocLabels(ruleset);
  const blocOf = new Map(ruleset.legislatives.blocs.flatMap((b) => b.nuances.map((n) => [n, b])));
  return ruleset.legislatives2024.circonscriptions.map((d) => {
    const first = leader(d.voix);
    return {
      code: d.code,
      libelle: d.libelle,
      inscrits: d.inscrits,
      votants: d.votants,
      exprimes: d.exprimes,
      tete: first ? { label: first[0], voix: first[1] } : null,
      elu: {
        label: `${d.elu.nuance} (${blocs.get(blocOf.get(d.elu.nuance)?.id ?? '') ?? 'bloc inconnu'})`,
        tour: d.elu.tour,
      },
    };
  });
}

function simulatedRows(ruleset: Ruleset, districts: readonly DistrictOutcome[]): Row[] {
  const blocs = blocLabels(ruleset);
  const names = new Map(ruleset.legislatives2024.circonscriptions.map((d) => [d.code, d.libelle]));
  return districts.map((d) => {
    const first = leader(d.t1.voix);
    return {
      code: d.code,
      libelle: names.get(d.code) ?? d.code,
      inscrits: d.inscrits,
      votants: d.t1.votants,
      exprimes: d.t1.exprimes,
      tete: first ? { label: blocs.get(first[0]) ?? first[0], voix: first[1] } : null,
      elu: d.elu ? { label: blocs.get(d.elu) ?? d.elu, tour: d.tour } : null,
    };
  });
}

function blocLabels(ruleset: Ruleset): Map<string, string> {
  return new Map(ruleset.legislatives.blocs.map((b) => [b.id, b.libelle]));
}

function Calendar({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const legislatives = state.legislatives!;
  const { prochaine, derniere, premierTour } = legislatives;
  const rules = ruleset.legislatives;
  const first = legislatives.finLegislature === rules.finLegislature.date;
  const dissolutionFrom = addDays(derniere.t2, rules.regles.moratoireJours);
  const playerPresides =
    state.player.actorId !== null && state.quinquennat?.mandat.presidentId === state.player.actorId;
  return (
    <section
      aria-labelledby="titre-calendrier-legislatives"
      className={`${card} space-y-2 text-sm`}
    >
      <h2 id="titre-calendrier-legislatives" className="text-lg font-semibold">
        Calendrier
      </h2>
      {prochaine && (
        <p>
          {prochaine.motif === 'dissolution'
            ? 'Élections anticipées après la dissolution'
            : 'Prochaines élections générales (fin de législature)'}{' '}
          : premier tour le {formatGameDate(prochaine.t1)}, second tour le{' '}
          {formatGameDate(prochaine.t2)}{' '}
          {prochaine.motif === 'dissolution' ? (
            <Badge tone="simule">Dates fixées par la dissolution simulée</Badge>
          ) : (
            <Badge tone="alerte">Hypothèse : dates réelles fixées par décret</Badge>
          )}
        </p>
      )}
      {premierTour && (
        <p>
          Premier tour dépouillé : {premierTour.filter((d) => d.elu).length} député(s) élu(s) dès le
          premier tour ; les autres circonscriptions votent au second tour.
        </p>
      )}
      <p>
        Fin des pouvoirs de l’Assemblée : {formatGameDate(legislatives.finLegislature)} (
        {first
          ? `${DATA_STATUS_LABELS[rules.finLegislature.statut]} : ${rules.finLegislature.regle}`
          : 'déduite : troisième mardi de juin, cinq ans après son élection'}
        ).
      </p>
      <p>
        Dissolution (Constitution, art. 12) :{' '}
        {prochaine?.motif === 'dissolution' || premierTour
          ? 'des élections législatives sont en cours.'
          : state.meta.date < dissolutionFrom
            ? `impossible dans l’année qui suit les dernières élections, soit avant le ${formatGameDate(dissolutionFrom)}.`
            : `possible depuis le ${formatGameDate(dissolutionFrom)}.`}{' '}
        {playerPresides
          ? 'Le président la décide par l’action « Dissoudre l’Assemblée nationale » du plan d’actions ; les élections ont lieu 20 à 40 jours plus tard et les travaux parlementaires sont suspendus d’ici là.'
          : 'Le président (IA) dissout si ses soutiens sont trop minoritaires et sa popularité suffisante (règle de jeu, hypothèse).'}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{rules.regles.regle}</p>
    </section>
  );
}

function Composition({ outcome, ruleset }: { outcome: LegislativeOutcome; ruleset: Ruleset }) {
  const groups = new Map(ruleset.assemblee.groupes.map((g) => [g.id, g]));
  const seats = Object.values(outcome.siegesParBloc).reduce((a, b) => a + b, 0);
  const votes = Object.values(outcome.voixT1).reduce((a, b) => a + b, 0);
  const real = outcome.motif === 'reelles-2024';
  return (
    <section aria-labelledby="titre-composition" className={`${card} space-y-3 text-sm`}>
      <h2 id="titre-composition" className="text-lg font-semibold">
        Dernières élections
      </h2>
      <p className="flex flex-wrap items-center gap-2">
        <span>{MOTIF_LABELS[outcome.motif]}</span>
        {real ? (
          <Badge tone="reel">Résultats réels</Badge>
        ) : (
          <Badge tone="simule">Simulation</Badge>
        )}
        {outcome.cohabitation && <Badge tone="alerte">Cohabitation</Badge>}
      </p>
      <p>
        Premier tour le {formatGameDate(outcome.t1)}, second tour le {formatGameDate(outcome.t2)}.
        Majorité absolue : {Math.floor(seats / 2) + 1} sièges sur {seats}.
        {outcome.cohabitation &&
          ' L’opposition au président détient la majorité des sièges : un président IA nomme un Premier ministre (profil fictif) proche de cette majorité (hypothèse de jeu) ; un président joueur choisit librement, mais ses textes dépendent de cette majorité.'}
      </p>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Sièges par bloc, tableau défilant"
      >
        <table className="w-full min-w-[30rem] text-left">
          <caption className="sr-only">Sièges et voix du premier tour par bloc</caption>
          <thead className="text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th scope="col">Bloc</th>
              <th scope="col">Sièges</th>
              <th scope="col">Voix au premier tour</th>
              <th scope="col">Groupes</th>
            </tr>
          </thead>
          <tbody>
            {ruleset.legislatives.blocs.map((bloc) => (
              <tr key={bloc.id} className="border-t border-slate-200 dark:border-slate-800">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {bloc.libelle}
                </th>
                <td className="tabular-nums">{outcome.siegesParBloc[bloc.id] ?? 0}</td>
                <td className="tabular-nums">{formatRatio(outcome.voixT1[bloc.id] ?? 0, votes)}</td>
                <td className="text-xs">
                  {bloc.groupes
                    .filter((g) => outcome.siegesParGroupe[g] !== undefined)
                    .map((g) => `${groups.get(g)?.sigle ?? g} ${outcome.siegesParGroupe[g]}`)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {real
          ? 'Sièges : composition actuelle de l’Assemblée (groupes et députés en exercice, sans aucun nom), rattachée aux blocs. Voix : premier tour de 2024, nuances du ministère de l’Intérieur regroupées par bloc.'
          : 'Résultats simulés : un candidat par bloc dans chaque circonscription, voix de 2024 modulées par l’élan présidentiel, la popularité du président et un aléa ; reports de voix au second tour selon la proximité des blocs ; sièges d’un bloc répartis entre ses groupes au prorata de leurs sièges sortants. Les désistements ne sont pas simulés. Aucun résultat simulé n’est une prévision.'}{' '}
        Rattachement des nuances et des groupes aux blocs : hypothèse de jeu.
      </p>
    </section>
  );
}

function Districts({ rows, title, note }: { rows: Row[]; title: string; note: string }) {
  const selectId = useId();
  const departements = [
    ...new Map(rows.map((r) => [r.code.slice(0, -2), r.libelle.split(' — ')[0]!])).entries(),
  ];
  const [departement, setDepartement] = useState(departements[0]?.[0] ?? ALL);
  const shown =
    departement === ALL ? rows : rows.filter((r) => r.code.slice(0, -2) === departement);
  return (
    <section aria-labelledby="titre-circonscriptions" className={`${card} space-y-3 text-sm`}>
      <h2 id="titre-circonscriptions" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId}>Département</label>
        <select
          id={selectId}
          className={`${input} w-auto py-1.5`}
          value={departement}
          onChange={(event) => setDepartement(event.target.value)}
        >
          {departements.map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
          <option value={ALL}>Toutes les circonscriptions ({rows.length})</option>
        </select>
      </p>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Résultats par circonscription, tableau défilant"
      >
        <table className="w-full min-w-[36rem] text-left text-xs">
          <caption className="sr-only">{title}</caption>
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th scope="col">Circonscription</th>
              <th scope="col">Inscrits</th>
              <th scope="col">Participation au premier tour</th>
              <th scope="col">En tête au premier tour</th>
              <th scope="col">Élu(e)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} className="border-t border-slate-200 dark:border-slate-800">
                <th scope="row" className="py-1 pr-2 font-normal">
                  {r.libelle}
                </th>
                <td className="tabular-nums">{formatCount(r.inscrits)}</td>
                <td className="tabular-nums">{formatRatio(r.votants, r.inscrits)}</td>
                <td>{r.tete ? `${r.tete.label} ${formatRatio(r.tete.voix, r.exprimes)}` : '—'}</td>
                <td>
                  {r.elu
                    ? `${r.elu.label}, ${r.elu.tour === 1 ? 'premier tour' : 'second tour'}`
                    : 'Second tour à venir'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
    </section>
  );
}

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const legislatives = state.legislatives;
  if (!legislatives || !state.parlement) {
    return (
      <p className={`${card} text-sm`}>
        Les élections législatives entrent en jeu avec le quinquennat, après l’élection
        présidentielle : l’Assemblée élue en 2024 siège jusqu’à la fin de sa législature ou jusqu’à
        une dissolution.
      </p>
    );
  }
  const { derniere, premierTour } = legislatives;
  const sources = ruleset.legislatives2024.sources;
  const realNote = `Résultats officiels de 2024 par circonscription (${sources
    .map((s) => s.titre.split(' — ')[0])
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(
      ', ',
    )}, ${sources[0]?.licence ?? ''}, consultés le ${formatGameDate(ruleset.legislatives2024.verifieLe)}) : nuance en tête au premier tour et nuance de l’élu(e), sans aucun nom de candidat.`;
  const simulatedNote =
    'Résultats simulés par bloc (un candidat par bloc) : aucun nom, aucun résultat attribué à une personne réelle.';
  return (
    <>
      <Calendar state={state} ruleset={ruleset} />
      <Composition outcome={derniere} ruleset={ruleset} />
      {premierTour ? (
        <Districts
          key="premier-tour"
          rows={simulatedRows(ruleset, premierTour)}
          title="Premier tour en cours (résultats simulés)"
          note={simulatedNote}
        />
      ) : derniere.circonscriptions.length > 0 ? (
        <Districts
          key={`${derniere.motif}-${derniere.t2}`}
          rows={simulatedRows(ruleset, derniere.circonscriptions)}
          title="Résultats par circonscription (simulés)"
          note={simulatedNote}
        />
      ) : (
        <Districts
          key="reelles-2024"
          rows={realRows(ruleset)}
          title="Résultats par circonscription en 2024 (réels)"
          note={realNote}
        />
      )}
    </>
  );
}

export function Legislatives() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion);
  return (
    <section aria-labelledby="titre-ecran-legislatives" className="space-y-6">
      <h1 id="titre-ecran-legislatives" className="text-2xl font-bold">
        Législatives
      </h1>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
