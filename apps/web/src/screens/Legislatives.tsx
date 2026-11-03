import {
  addDays,
  type DistrictOutcome,
  type ElectoralPact,
  type GameState,
  type LegislativeOutcome,
  type Ruleset,
} from '@r2027/shared';
import { Link } from 'react-router';
import { useId, useState } from 'react';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { BlocFigures } from '../components/BlocFigures';
import { ErrorMessage } from '../components/ErrorMessage';
import { card, inputCompact } from '../components/ui';
import { DATA_STATUS_LABELS, formatCount, formatGameDate, formatRatio } from '../labels';
import { useCurrentGame } from './GameLayout';
import { ScreenHeading } from '../components/Disclosure';

// Législatives (phase 6, P6-07 ; vivantes en phase 13) : calendrier, campagne et accords entre
// blocs, dissolution, composition issue des dernières élections, figures des blocs (phase 14) et
// résultats par circonscription (désistements, candidatures communes). Les élections de 2024 sont réelles
// (ministère de l'Intérieur, sans nom de candidat) ; les suivantes sont simulées et étiquetées
// comme telles, comme les accords prêtés aux blocs.

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
  /** Candidatures communes et désistements de la circonscription (simulation). */
  accords: string | null;
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
      accords: null,
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
      accords:
        [
          ...d.communs.map((b) => `candidature commune (sans ${blocs.get(b) ?? b})`),
          ...d.retraits.map((b) => `désistement : ${blocs.get(b) ?? b}`),
        ].join(' ; ') || null,
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
      {prochaine && !legislatives.campagne && !premierTour && (
        <p>
          La campagne (accords entre blocs, mobilisation par les déplacements du président) s’ouvre{' '}
          {rules.alliances.campagneSemaines} semaines avant le premier tour, aussitôt après une
          dissolution.
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
      {!state.quinquennat ? (
        <p>
          Campagne présidentielle en cours : l’Assemblée n’est pas simulée (simplification du jeu)
          et aucune dissolution n’est possible avant le quinquennat suivant.
        </p>
      ) : (
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
      )}
      <p className="text-xs text-encre-3">{rules.regles.regle}</p>
    </section>
  );
}

const PACT_LABELS: Record<ElectoralPact['type'], string> = {
  investitures: 'Investitures communes',
  desistements: 'Désistements réciproques',
  'front-republicain': 'Front républicain',
};

/** Accord électoral en clair (blocs, bloc visé, origine). */
export function pactText(ruleset: Ruleset, pact: ElectoralPact): string {
  const blocs = blocLabels(ruleset);
  const names = pact.blocs.map((b) => `« ${blocs.get(b) ?? b} »`).join(', ');
  return pact.type === 'front-republicain'
    ? `${PACT_LABELS[pact.type]} de ${names} face au bloc « ${blocs.get(pact.contre ?? '') ?? pact.contre} »`
    : `${PACT_LABELS[pact.type]} entre ${names}`;
}

function Pacts({ ruleset, pacts }: { ruleset: Ruleset; pacts: readonly ElectoralPact[] }) {
  if (pacts.length === 0) return <p>Aucun accord entre blocs : un candidat par bloc partout.</p>;
  return (
    <ul className="space-y-1" aria-label="Accords électoraux">
      {pacts.map((pact) => (
        <li
          key={`${pact.type}-${pact.blocs.join('-')}`}
          className="flex flex-wrap items-center gap-2"
        >
          <span>{pactText(ruleset, pact)}</span>
          <Badge tone={pact.origine === 'joueur' ? 'succes' : 'simule'}>
            {pact.origine === 'joueur' ? 'Votre camp' : 'Règle de l’IA'}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Campagne des législatives (phase 13) : stratégie du camp du joueur, accords, mobilisation. */
function Campaign({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const campagne = state.legislatives!.campagne!;
  const departements = ruleset.parrainages.reservoir.departements;
  const mobilised = Object.entries(campagne.mobilisation).sort((a, b) => b[1] - a[1]);
  const pending = state.pendingDecisions.find((d) => d.kind === 'alliance');
  return (
    <section aria-labelledby="titre-campagne-legislatives" className={`${card} space-y-3 text-sm`}>
      <h2 id="titre-campagne-legislatives" className="text-lg font-semibold">
        Campagne en cours
      </h2>
      {pending ? (
        <p className="rounded-xl bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="font-semibold">Stratégie à arrêter : </span>
          {pending.label}.{' '}
          <Link to="../tableau-de-bord" className="font-semibold underline underline-offset-2">
            Décider au QG
          </Link>
        </p>
      ) : (
        <p>
          <Badge tone="succes">Stratégie arrêtée</Badge>{' '}
          {state.player.actorId ? 'Votre camp a choisi sa stratégie.' : 'Mode observateur.'}
        </p>
      )}
      <Pacts ruleset={ruleset} pacts={campagne.alliances} />
      <div className="space-y-1">
        <h3 className="font-semibold">Mobilisation du camp présidentiel</h3>
        {mobilised.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Mobilisation par département">
            {mobilised.map(([code, value]) => (
              <li
                key={code}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800"
              >
                {departements[code]?.nom ?? code} ({code}) : +{Math.round(value / 100)} %
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-encre-2">
            Aucun déplacement du président dans un département depuis l’ouverture de la campagne.
          </p>
        )}
      </div>
      <p className="text-xs text-encre-3">
        Accords simulés, acceptés par les partenaires selon la proximité des positions : ils ne
        décrivent aucun accord réel. Les blocs conduits par l’IA ne concluent aucun accord avec le
        bloc visé par le front républicain (convention du jeu). Chaque déplacement du président dans
        un département y renforce son camp au premier tour (hypothèse de jeu).
      </p>
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
      {!real && (
        <div className="space-y-1">
          <h3 className="font-semibold">Accords de ce scrutin</h3>
          <Pacts ruleset={ruleset} pacts={outcome.alliances} />
          <p>
            {outcome.circonscriptions.reduce((n, d) => n + d.communs.length, 0)} candidature(s)
            commune(s) au premier tour ;{' '}
            {outcome.circonscriptions.reduce((n, d) => n + d.retraits.length, 0)} désistement(s)
            avant le second tour.
          </p>
        </div>
      )}
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Sièges par bloc, tableau défilant"
      >
        <table className="w-full min-w-[30rem] text-left">
          <caption className="sr-only">Sièges et voix du premier tour par bloc</caption>
          <thead className="text-xs text-encre-3">
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
      <p className="text-xs text-encre-3">
        {real
          ? 'Sièges : composition actuelle de l’Assemblée (groupes et députés en exercice, sans aucun nom), rattachée aux blocs. Voix : premier tour de 2024, nuances du ministère de l’Intérieur regroupées par bloc.'
          : 'Résultats simulés : un candidat par bloc dans chaque circonscription (un seul pour deux blocs liés par des investitures communes), voix de 2024 modulées par l’élan présidentiel, la popularité du président, la mobilisation de campagne et un aléa ; désistements au second tour selon les accords, reports de voix selon la proximité des blocs ; sièges d’un bloc répartis entre ses groupes au prorata de leurs sièges sortants. Aucun résultat simulé n’est une prévision.'}{' '}
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
          className={inputCompact}
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
          <thead className="text-encre-3">
            <tr>
              <th scope="col">Circonscription</th>
              <th scope="col">Inscrits</th>
              <th scope="col">Participation au premier tour</th>
              <th scope="col">En tête au premier tour</th>
              <th scope="col">Élu(e)</th>
              {rows.some((r) => r.accords) && <th scope="col">Accords</th>}
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
                {rows.some((row) => row.accords) && <td>{r.accords ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-encre-3">{note}</p>
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
  const realNote =
    'Résultats officiels de 2024 par circonscription : nuance en tête au premier tour et nuance de l’élu(e), sans aucun nom de candidat.';
  const simulatedNote =
    'Résultats simulés par bloc (un candidat par bloc) : aucun nom, aucun résultat attribué à une personne réelle.';
  return (
    <>
      <Calendar state={state} ruleset={ruleset} />
      {legislatives.campagne && <Campaign state={state} ruleset={ruleset} />}
      <Composition outcome={derniere} ruleset={ruleset} />
      <BlocFigures ruleset={ruleset} />
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
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  return (
    <section aria-labelledby="titre-ecran-legislatives" className="space-y-6">
      <ScreenHeading id="titre-ecran-legislatives">Législatives</ScreenHeading>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
