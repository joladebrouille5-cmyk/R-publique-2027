import type { GeoManifest, TerritoryLevel, TerritorySearchResult } from '@r2027/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { Badge } from '../../components/Badge';
import { ErrorMessage } from '../../components/ErrorMessage';
import { buttonSecondary, card, input, label } from '../../components/ui';
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
export function SearchBox({ onFound }: { onFound: (result: TerritorySearchResult) => void }) {
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
    <div className="space-y-2">
      <label htmlFor={id} className={label}>
        Rechercher un territoire (nom ou code INSEE)
      </label>
      <input
        id={id}
        type="search"
        className={input}
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
        }}
        placeholder="Ex. : Mamoudzou, 97411, Ajaccio, 2A004"
        autoComplete="off"
      />
      {search.isError && <ErrorMessage error={search.error} />}
      {results && (
        <ul aria-label="Résultats de la recherche" className="max-h-60 space-y-1 overflow-y-auto">
          {results.length === 0 && (
            <li className="text-sm text-slate-500 dark:text-slate-400">Aucun territoire trouvé.</li>
          )}
          {results.map((r) => (
            <li key={`${r.level}-${r.code}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => choose(r)}
              >
                <span className="font-medium">{r.nom}</span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  ({LEVEL_LABELS[r.level].toLowerCase()} {r.code})
                </span>
              </button>
            </li>
          ))}
        </ul>
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
}: {
  entries: LegendEntry[];
  noData: string;
  title: string;
  /** Pastilles avec les motifs de la carte (option « Motifs »). */
  motifs: boolean;
  mode: Mode;
}) {
  const swatch = `inline-block ${motifs ? 'size-4' : 'size-3'} rounded-sm`;
  return (
    <section aria-label="Légende" className="space-y-1 text-xs">
      <h3 className="font-semibold">{title}</h3>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.map((entry) => (
          <li key={entry.label} className="inline-flex items-center gap-1">
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
        <li className="inline-flex items-center gap-1">
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
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Voix par candidat</caption>
      <thead>
        <tr className="text-xs text-slate-500 dark:text-slate-400">
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
        {rows.map(({ c, voix }) => (
          <tr key={c.key} className="border-t border-slate-100 dark:border-slate-800">
            <th
              scope="row"
              className={`py-1 pr-2 text-left ${c.player ? 'font-semibold' : 'font-normal'}`}
            >
              {c.label}
              {c.player && ' (vous)'}
            </th>
            <td className="py-1 text-right tabular-nums">{formatCount(voix)}</td>
            <td className="py-1 text-right tabular-nums">{formatRatio(voix, result.exprimes)}</td>
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
}: {
  info: SheetInfo;
  data: SourceData | null;
  onClose: () => void;
}) {
  const leader = leaderOf(info.result);
  return (
    <section aria-label={`Fiche : ${info.nom}`} className={`${card} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{info.nom}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {LEVEL_LABELS[info.level]} · code {info.code}
            {info.context && ` · ${info.context}`}
          </p>
        </div>
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Fermer
        </button>
      </div>
      {info.population !== null && (
        <p className="text-sm">
          Population légale : <strong>{formatCount(info.population)}</strong> habitants (INSEE, via
          IGN ADMIN EXPRESS)
        </p>
      )}
      {data && (
        <div className="flex flex-wrap items-center gap-2">
          <NatureBadge nature={data.nature} />
          {info.estimation && <Badge tone="alerte">Estimation (commune scindée depuis 2022)</Badge>}
        </div>
      )}
      {data && info.result ? (
        <>
          {leader !== null && (
            <p className="text-sm">
              En tête : <strong>{data.candidats[leader]!.label}</strong> (
              {formatRatio(info.result.voix[leader]!, info.result.exprimes)} des exprimés)
            </p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {[
              ['Inscrits', formatCount(info.result.inscrits)],
              [
                'Votants',
                `${formatCount(info.result.votants)} (${formatRatio(info.result.votants, info.result.inscrits)})`,
              ],
              ['Blancs', formatCount(info.result.blancs)],
              ['Nuls', formatCount(info.result.nuls)],
              ['Exprimés', formatCount(info.result.exprimes)],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{term}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <ResultTable result={info.result} candidats={data.candidats} />
        </>
      ) : (
        data && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pas de résultat détaillé pour ce territoire
            {data.nature === 'fictif'
              ? ' dans le jeu de démonstration (communes de l’Ain, de la Corse et des DROM uniquement).'
              : '.'}
          </p>
        )
      )}
    </section>
  );
}

/** Territoires qui votent mais ne figurent pas sur la carte (§3.1, Q4). */
export function OffMapList({ manifest, data }: { manifest: GeoManifest; data: SourceData | null }) {
  return (
    <section aria-labelledby="titre-hors-carte" className={`${card} space-y-2`}>
      <h2 id="titre-hors-carte" className="text-lg font-semibold">
        Hors carte
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Ces électeurs votent à la présidentielle et comptent dans le total national, mais leurs
        territoires ne sont pas cartographiés.
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
