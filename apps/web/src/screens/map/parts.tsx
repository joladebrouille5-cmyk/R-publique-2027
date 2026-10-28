import type { GeoManifest, TerritoryLevel, TerritorySearchResult } from '@r2027/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Badge } from '../../components/Badge';
import { ErrorMessage } from '../../components/ErrorMessage';
import { card } from '../../components/ui';
import { formatCount, formatRatio } from '../../labels';
import type { LegendEntry, Mode } from '../../map/colors';
import { leaderOf, motifBackground } from '../../map/colors';
import {
  searchTerritories,
  type ResultCandidate,
  type SourceData,
  type TerritoryResult,
} from '../../map/data';

export const LEVEL_LABELS: Record<TerritoryLevel, string> = {
  region: 'Région',
  departement: 'Département',
  commune: 'Commune',
};

export function NatureBadge({ nature }: { nature: SourceData['nature'] }) {
  if (nature === 'reel') return <Badge tone="succes">Résultat officiel</Badge>;
  if (nature === 'fictif') return <Badge tone="fictif">Démonstration fictive</Badge>;
  if (nature === 'simule') return <Badge tone="simule">Résultat simulé</Badge>;
  return <Badge>Géographie seule</Badge>;
}

/** Recherche d'une commune, d'un département ou d'une région, par nom ou par code. */
export function SearchBox({
  onFound,
  className,
}: {
  onFound: (result: TerritorySearchResult) => void;
  className?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({
    queryKey: ['geo', 'recherche', debounced],
    enabled: debounced.length >= 2,
    staleTime: Infinity,
    queryFn: () => searchTerritories(debounced),
  });
  const results = !hidden && query.trim().length >= 2 ? search.data : undefined;
  const choose = (result: TerritorySearchResult) => {
    onFound(result);
    setHidden(true);
    setQuery(result.nom);
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      <label htmlFor={id} className="sr-only">
        Rechercher un territoire (nom ou code INSEE)
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400"
        />
        <input
          id={id}
          type="search"
          className="min-h-11 w-full rounded-full border border-slate-200/80 bg-white/95 py-2 pr-4 pl-10 text-sm shadow-raised placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-900/95 dark:placeholder:text-slate-400"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHidden(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results?.[0]) {
              event.preventDefault();
              choose(results[0]);
            }
            if (event.key === 'Escape') setHidden(true);
          }}
          placeholder="Ajaccio, 2A004, Guyane…"
          autoComplete="off"
        />
      </div>
      {(search.isError || results) && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 animate-apparait">
          {search.isError && <ErrorMessage error={search.error} />}
          {results && (
            <ul
              aria-label="Résultats de la recherche"
              className="max-h-72 space-y-0.5 overflow-y-auto rounded-card border border-slate-200/80 bg-white p-1.5 shadow-raised dark:border-slate-700 dark:bg-slate-900"
            >
              {results.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">
                  Aucun territoire trouvé.
                </li>
              )}
              {results.map((r) => (
                <li key={`${r.level}-${r.code}`}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-republique-50 focus-visible:bg-republique-50 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
                    onClick={() => choose(r)}
                  >
                    <span className="font-semibold">{r.nom}</span>{' '}
                    <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">
                      ({LEVEL_LABELS[r.level].toLowerCase()} {r.code})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Legend({
  entries,
  noData,
  title,
  motifs,
  mode,
  className,
}: {
  entries: LegendEntry[];
  noData: string;
  title: string;
  /** Pastilles avec les motifs de la carte (option « Motifs »). */
  motifs: boolean;
  mode: Mode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(true);
  const swatch = `inline-block shrink-0 ${motifs ? 'size-4' : 'size-3'} rounded-[4px]`;
  return (
    <section aria-label="Légende" className={`text-xs ${className ?? ''}`}>
      <h3 className="font-sans text-xs font-bold tracking-normal">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-8 w-full items-center justify-between gap-3 text-left"
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <ul
        id={id}
        hidden={!open}
        className="mt-1 flex max-h-36 flex-wrap gap-x-3 gap-y-1.5 overflow-y-auto pb-0.5"
      >
        {entries.map((entry) => (
          <li key={entry.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              data-motif={motifs ? entry.motif : 'aucun'}
              className={swatch}
              style={{
                backgroundColor: entry.color,
                backgroundImage: motifs ? motifBackground(entry.motif, mode) : undefined,
              }}
            />
            {entry.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`${swatch} border border-slate-300 dark:border-slate-600`}
            style={{ backgroundColor: noData }}
          />
          Pas de résultat
        </li>
      </ul>
    </section>
  );
}

/** Tableau des voix d'un territoire. */
export function ResultTable({
  result,
  candidats,
}: {
  result: TerritoryResult;
  candidats: readonly ResultCandidate[];
}) {
  const rows = candidats
    .map((c, i) => ({ c, voix: result.voix[i] ?? 0 }))
    .sort((a, b) => b.voix - a.voix);
  const best = rows[0]?.voix ?? 0;
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Voix par candidat</caption>
      <thead>
        <tr className="text-xs text-slate-600 dark:text-slate-400">
          <th scope="col" className="py-1 font-medium">
            Candidat
          </th>
          <th scope="col" className="py-1 pl-3 text-right font-medium">
            Voix
          </th>
          <th scope="col" className="py-1 pl-3 text-right font-medium">
            % exprimés
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ c, voix }, index) => (
          <tr key={c.key} className="border-t border-slate-100 dark:border-slate-800">
            <th
              scope="row"
              className={`py-1.5 pr-2 text-left ${c.player ? 'font-bold' : 'font-normal'}`}
            >
              {c.label}
              {c.player && ' (vous)'}
              <span
                aria-hidden="true"
                className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <span
                  className={`block h-full rounded-full ${index === 0 ? 'bg-republique-500' : c.player ? 'bg-or-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  style={{ width: `${best > 0 ? (voix / best) * 100 : 0}%` }}
                />
              </span>
            </th>
            <td className="py-1.5 text-right align-top tabular-nums">{formatCount(voix)}</td>
            <td className="py-1.5 text-right align-top font-semibold tabular-nums">
              {formatRatio(voix, result.exprimes)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type SheetInfo = {
  level: TerritoryLevel;
  code: string;
  nom: string;
  context: string;
  population: number | null;
  result: TerritoryResult | undefined;
  estimation: boolean;
};

/** Fiche territoriale : identité, population, résultats et nature des données. */
export function TerritorySheet({
  info,
  data,
  onClose,
  className = card,
}: {
  info: SheetInfo;
  data: SourceData | null;
  onClose: () => void;
  className?: string;
}) {
  const leader = leaderOf(info.result);
  return (
    <section aria-label={`Fiche : ${info.nom}`} className={`space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {LEVEL_LABELS[info.level]} · code {info.code}
            {info.context && ` · ${info.context}`}
          </p>
          <h2 className="mt-0.5 font-display text-2xl leading-tight font-bold tracking-tight">
            {info.nom}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Fermer la fiche</span>
        </button>
      </div>
      {data && (
        <div className="flex flex-wrap items-center gap-2">
          <NatureBadge nature={data.nature} />
          {info.estimation && <Badge tone="alerte">Estimation (commune scindée depuis 2022)</Badge>}
        </div>
      )}
      {info.population !== null && (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Population légale : <strong>{formatCount(info.population)}</strong> habitants
        </p>
      )}
      {data && info.result ? (
        <>
          {leader !== null && (
            <p className="rounded-2xl bg-republique-50 px-4 py-3 text-sm text-republique-950 dark:bg-republique-950 dark:text-republique-100">
              En tête : <strong>{data.candidats[leader]!.label}</strong> (
              {formatRatio(info.result.voix[leader]!, info.result.exprimes)} des exprimés)
            </p>
          )}
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[
              ['Inscrits', formatCount(info.result.inscrits)],
              [
                'Votants',
                `${formatCount(info.result.votants)} (${formatRatio(info.result.votants, info.result.inscrits)})`,
              ],
              ['Exprimés', formatCount(info.result.exprimes)],
              // Législatives : blancs et nuls ne sont pas distingués par circonscription.
              ...(data.legislatives
                ? [['Blancs et nuls', formatCount(info.result.blancs + info.result.nuls)]]
                : [
                    ['Blancs', formatCount(info.result.blancs)],
                    ['Nuls', formatCount(info.result.nuls)],
                  ]),
            ].map(([term, value]) => (
              <div
                key={term}
                className={`rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60 ${term === 'Votants' ? 'col-span-2' : ''}`}
              >
                <dt className="text-xs text-slate-600 dark:text-slate-400">{term}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <ResultTable result={info.result} candidats={data.candidats} />
          {data.legislatives && <LegislativeDetail info={info} data={data} />}
        </>
      ) : (
        data && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pas de résultat détaillé pour ce territoire
            {data.nature === 'fictif'
              ? ' dans le jeu de démonstration (communes de l’Ain, de la Corse, de la Somme et des DROM uniquement).'
              : '.'}
          </p>
        )
      )}
    </section>
  );
}

/** Législatives (phase 13) : sièges par bloc et circonscriptions du département, sans nom. */
function LegislativeDetail({ info, data }: { info: SheetInfo; data: SourceData }) {
  const labels = new Map(data.candidats.map((c) => [c.key, c.label]));
  const seats = data.legislatives!.sieges.get(info.code);
  const districts = data.legislatives!.circonscriptions.get(info.code) ?? [];
  if (info.level !== 'departement') return null;
  const elected = Object.entries(seats ?? {}).filter(([, n]) => n > 0);
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="font-semibold">Sièges</h3>
        {elected.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {elected
              .sort((a, b) => b[1] - a[1])
              .map(([bloc, n]) => (
                <li
                  key={bloc}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs dark:bg-slate-800"
                >
                  {labels.get(bloc) ?? bloc} : <strong className="tabular-nums">{n}</strong>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-slate-600 dark:text-slate-400">Aucun élu à ce tour.</p>
        )}
      </div>
      {districts.length > 0 && (
        <div className="space-y-1">
          <h3 className="font-semibold">Circonscriptions ({districts.length})</h3>
          <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {districts.map((d) => (
              <li key={d.code} className="py-1">
                <span className="font-medium">{d.libelle}</span>
                <span className="block text-slate-600 dark:text-slate-400">
                  {d.tete
                    ? `En tête : ${labels.get(d.tete.bloc) ?? d.tete.bloc} (${Math.round(d.tete.part * 100)} %)`
                    : 'Pas de vote à ce tour'}
                  {d.elu
                    ? ` · élu : ${labels.get(d.elu.bloc) ?? d.elu.bloc} (${d.elu.tour === 1 ? 'premier tour' : 'second tour'})`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Résultats par bloc, sans aucun nom de candidat ;{' '}
        {data.nature === 'reel'
          ? 'nuances officielles de 2024 regroupées par bloc (hypothèse de jeu).'
          : 'scrutin simulé par le jeu, jamais une prévision.'}
      </p>
    </div>
  );
}

/** Territoires qui votent mais ne figurent pas sur la carte (§3.1, Q4). */
export function OffMapList({ manifest, data }: { manifest: GeoManifest; data: SourceData | null }) {
  return (
    <section aria-labelledby="titre-hors-carte" className={`${card} space-y-2`}>
      <h2 id="titre-hors-carte" className="text-xl font-bold">
        Hors carte
      </h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Ces électeurs votent à la présidentielle et comptent dans le total national, mais leurs
        territoires ne sont pas cartographiés.
        {data?.legislatives &&
          ' Législatives : les Français de l’étranger élisent onze députés ; Saint-Barthélemy et Saint-Martin forment une seule circonscription, comptée ici avec Saint-Martin.'}
      </p>
      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {manifest.horsCarte.map((area) => {
          const result = data?.horsCarte.get(area.code);
          const leader = leaderOf(result);
          return (
            <li key={area.code} className="flex flex-wrap justify-between gap-2 py-1">
              <span>{area.nom}</span>
              <span className="text-slate-600 dark:text-slate-400">
                {result
                  ? `${formatCount(result.inscrits)} inscrits${leader !== null ? ` · en tête : ${data!.candidats[leader]!.label}` : ''}`
                  : 'pas de résultat'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
