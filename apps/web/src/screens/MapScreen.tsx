import {
  DROM_LABELS,
  type DepartementInfo,
  type GeoManifest,
  type MapZone,
  type TerritoryLevel,
  type TerritorySearchResult,
} from '@r2027/shared';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonSecondary, card, input, label } from '../components/ui';
import { formatCount, formatRatio } from '../labels';
import { colorScheme, leaderOf, type Coloring, type Mode } from '../map/colors';
import {
  availableSources,
  fetchCommuneResults,
  topologyQuery,
  useGeoManifest,
  useHistoricalStatus,
  useSourceData,
  useTopology,
  type SourceData,
  type TerritoryCollection,
  type TerritoryResult,
} from '../map/data';
import { ElectionMap, type BBox, type MapSelection } from '../map/ElectionMap';
import { useThemeStore } from '../stores/theme';
import { useCurrentGame } from './GameLayout';
import {
  Legend,
  LEVEL_LABELS,
  NatureBadge,
  OffMapList,
  SearchBox,
  TerritorySheet,
  type SheetInfo,
} from './map/parts';

const DROM_ZONES = ['971', '972', '973', '974', '976'] as const satisfies readonly MapZone[];
const MAX_LOADED = 6;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Thème de la carte : choix de l'utilisateur, ou préférence du système suivie en direct. */
function useMode(): Mode {
  const theme = useThemeStore((s) => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return theme === 'sombre' || (theme === 'systeme' && systemDark) ? 'dark' : 'light';
}

const intersects = (a: BBox, b: BBox) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const expand = (b: BBox, f: number): BBox => {
  const [w, s, e, n] = b;
  const dx = (e - w) * f;
  const dy = (n - s) * f;
  return [w - dx, s - dy, e + dx, n + dy];
};

function sumResults(results: Iterable<TerritoryResult>): TerritoryResult | null {
  let total: TerritoryResult | null = null;
  for (const r of results) {
    total = total
      ? {
          inscrits: total.inscrits + r.inscrits,
          votants: total.votants + r.votants,
          blancs: total.blancs + r.blancs,
          nuls: total.nuls + r.nuls,
          exprimes: total.exprimes + r.exprimes,
          voix: total.voix.map((v, i) => v + (r.voix[i] ?? 0)),
        }
      : { ...r, voix: [...r.voix] };
  }
  return total;
}

/** Géométries des communes d'un ensemble de départements (fichiers du référentiel). */
function useCommunes(manifest: GeoManifest | undefined, codes: readonly string[]) {
  const departements = codes
    .map((code) => manifest?.departements.find((d) => d.code === code))
    .filter((d): d is DepartementInfo => !!d && d.fichier !== null);
  const geometries = useQueries({ queries: departements.map((d) => topologyQuery(d.fichier!)) });
  const stamp = geometries.map((q) => q.dataUpdatedAt).join(',');
  const features = useMemo(
    () => geometries.flatMap((q) => (q.data ? Object.values(q.data)[0]!.features : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp],
  );
  return { departements, features };
}

function legendTitle(coloring: Coloring, data: SourceData): string {
  if (coloring.kind === 'vainqueur') return 'Candidat en tête';
  if (coloring.kind === 'participation') return 'Participation (votants / inscrits)';
  if (coloring.kind === 'score')
    return `Score de ${data.candidats[coloring.candidate]!.label} (% des exprimés)`;
  return `Écart entre ${data.candidats[coloring.a]!.label} et ${data.candidats[coloring.b]!.label} (points de % des exprimés)`;
}

/** Écran Carte électorale (§3) : métropole, cinq encarts DROM, recherche, fiche, tableau. */
export function MapScreen() {
  const game = useCurrentGame();
  const mode = useMode();
  const mobile = useMediaQuery('(max-width: 767px)');
  const manifest = useGeoManifest();
  const overview = useTopology(manifest.data?.apercu ?? null);
  const history = useHistoricalStatus();
  const sources = availableSources(game.state, history.data);
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[Math.min(sourceIndex, sources.length - 1)]!;
  const sourceData = useSourceData(game.state, source, history.data);
  const data: SourceData | null = sourceData.data;
  const [coloring, setColoring] = useState<Coloring>({ kind: 'vainqueur' });
  const [motifs, setMotifs] = useState(false);
  const [level, setLevel] = useState<TerritoryLevel>('departement');
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [focus, setFocus] = useState<{ zone: MapZone; bbox: BBox; key: string } | null>(null);
  const [view, setView] = useState<{ bounds: BBox; zoom: number } | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [openDrom, setOpenDrom] = useState<MapZone | null>(null);
  const [filter, setFilter] = useState('');

  const m = manifest.data;
  const departementsByCode = useMemo(
    () => new Map(m?.departements.map((d) => [d.code, d]) ?? []),
    [m],
  );
  const zoneOfRegion = (code: string) =>
    m?.departements.find((d) => d.region === code)?.zone ?? 'metropole';

  // Départements dont les communes sont chargées : vue de la carte principale (assez zoomée),
  // DROM (petits), et départements épinglés par une recherche ou une sélection.
  const loadedCodes = useMemo(() => {
    if (!m || level !== 'commune') return pinned;
    const inView =
      view && view.zoom >= 6.5
        ? m.departements
            .filter((d) => d.zone === 'metropole' && d.fichier && intersects(d.bbox, view.bounds))
            .map((d) => d.code)
        : [];
    return [...new Set([...pinned, ...DROM_ZONES, ...inView.slice(0, MAX_LOADED)])];
  }, [m, level, view, pinned]);
  const candidateKeys = data?.candidats.map((c) => c.key) ?? [];
  const communes = useCommunes(m, loadedCodes);

  const selectedDepartement =
    selected?.level === 'commune'
      ? (communes.features.find((f) => f.properties.code === selected.code)?.properties.dep ?? null)
      : selected?.level === 'departement'
        ? selected.code
        : null;
  // Résultats communaux : département sélectionné (prioritaire) et départements chargés.
  const resultQueries = [
    ...new Set([selectedDepartement, ...loadedCodes].filter((c): c is string => !!c)),
  ];
  const communeResults = useQueries({
    queries: resultQueries.map((dep) => ({
      queryKey: [
        'carte',
        'communes-de',
        game.id,
        source.kind,
        'tour' in source ? source.tour : 0,
        dep,
      ],
      enabled: source.kind !== 'aucune' && departementsByCode.get(dep)?.fichier !== null,
      staleTime: Infinity,
      queryFn: () => fetchCommuneResults(game.id, source, candidateKeys, dep),
    })),
  });
  const resultsStamp = communeResults.map((q) => q.dataUpdatedAt).join(',');
  // Une seule erreur affichée pour tous les départements (souvent la même : base électorale).
  const communeError = communeResults.find((q) => q.isError);
  const communeResultMap = useMemo(() => {
    const map = new Map<string, TerritoryResult>();
    const estimations = new Set<string>();
    for (const q of communeResults) {
      q.data?.results.forEach((r, code) => map.set(code, r));
      q.data?.estimations.forEach((code) => estimations.add(code));
    }
    return { map, estimations };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsStamp]);

  const national = useMemo(
    () => (data ? sumResults([...data.departements.values(), ...data.horsCarte.values()]) : null),
    [data],
  );
  const topTwo = useMemo(() => {
    const order = (national?.voix ?? []).map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v);
    return { a: order[0]?.i ?? 0, b: order[1]?.i ?? 1 };
  }, [national]);
  const scheme = useMemo(
    () => colorScheme(coloring, data?.candidats ?? [], national, mode),
    [coloring, data, national, mode],
  );
  const resultOf = (lvl: TerritoryLevel, code: string): TerritoryResult | undefined =>
    !data
      ? undefined
      : lvl === 'region'
        ? data.regions.get(code)
        : lvl === 'departement'
          ? data.departements.get(code)
          : communeResultMap.map.get(code);
  const colorOf = (lvl: TerritoryLevel, code: string) => scheme.colorOf(resultOf(lvl, code));
  const motifOf = motifs
    ? (lvl: TerritoryLevel, code: string) => scheme.motifOf(resultOf(lvl, code))
    : undefined;
  const colorKey = `${source.label}|${JSON.stringify(coloring)}|${mode}|${motifs}|${communeResultMap.map.size}|${data ? 'd' : 'n'}`;

  const nameOf = (lvl: TerritoryLevel, code: string): string => {
    if (lvl === 'region') return m?.regions.find((r) => r.code === code)?.nom ?? code;
    if (lvl === 'departement') return departementsByCode.get(code)?.nom ?? code;
    return communes.features.find((f) => f.properties.code === code)?.properties.nom ?? code;
  };
  const describe = (lvl: TerritoryLevel, code: string) => {
    const result = resultOf(lvl, code);
    const leader = leaderOf(result);
    return `${nameOf(lvl, code)} — ${
      leader !== null && data
        ? `en tête : ${data.candidats[leader]!.label} (${formatRatio(result!.voix[leader]!, result!.exprimes)})`
        : 'pas de résultat'
    }`;
  };

  // Couches par zone.
  const layersFor = useMemo(() => {
    const departements = overview.data?.departements;
    const regions = overview.data?.regions;
    return (zone: MapZone): Partial<Record<TerritoryLevel, TerritoryCollection>> => {
      if (!departements || !regions || !m) return {};
      const inZone = (dep: string | undefined) => departementsByCode.get(dep ?? '')?.zone === zone;
      return {
        departement: {
          type: 'FeatureCollection',
          features: departements.features.filter((f) => inZone(f.properties.code)),
        },
        region: {
          type: 'FeatureCollection',
          features: regions.features.filter((f) => zoneOfRegion(f.properties.code) === zone),
        },
        commune: {
          type: 'FeatureCollection',
          features: communes.features.filter((f) => inZone(f.properties.dep)),
        },
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.data, m, communes.features]);
  const metropoleLayers = useMemo(() => layersFor('metropole'), [layersFor]);
  const dromLayers = useMemo(
    () => Object.fromEntries(DROM_ZONES.map((z) => [z, layersFor(z)])),
    [layersFor],
  );

  const zoneBounds = (zone: MapZone): BBox => {
    const boxes = m?.departements.filter((d) => d.zone === zone).map((d) => d.bbox) ?? [];
    if (boxes.length === 0) return [-5.2, 41.3, 9.6, 51.1];
    return [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ];
  };

  const select = (selection: MapSelection) => {
    setSelected(selection);
    if (selection.level === 'departement')
      setPinned((p) => [...new Set([selection.code, ...p])].slice(0, MAX_LOADED));
  };
  const onFound = (found: TerritorySearchResult) => {
    setLevel(found.level);
    setSelected({ level: found.level, code: found.code });
    if (found.departement)
      setPinned((p) => [...new Set([found.departement!, ...p])].slice(0, MAX_LOADED));
    setFocus({
      zone: found.zone,
      bbox: found.bbox,
      key: `${found.level}-${found.code}-${Date.now()}`,
    });
    if (found.zone !== 'metropole' && mobile) setOpenDrom(found.zone);
  };

  const sheet: SheetInfo | null = useMemo(() => {
    if (!selected || !m) return null;
    const { level: lvl, code } = selected;
    let population: number | null;
    let context = '';
    if (lvl === 'commune') {
      const feature = communes.features.find((f) => f.properties.code === code);
      population = feature?.properties.population ?? null;
      const dep = feature?.properties.dep;
      context = dep ? `${departementsByCode.get(dep)?.nom ?? dep} (${dep})` : '';
    } else if (lvl === 'departement') {
      const d = departementsByCode.get(code);
      population = d?.population ?? null;
      context = m.regions.find((r) => r.code === d?.region)?.nom ?? '';
    } else {
      population = m.departements
        .filter((d) => d.region === code)
        .reduce((s, d) => s + d.population, 0);
    }
    return {
      level: lvl,
      code,
      nom: nameOf(lvl, code),
      context,
      population,
      result: resultOf(lvl, code),
      estimation: lvl === 'commune' && communeResultMap.estimations.has(code),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, m, communes.features, data, communeResultMap]);

  if (manifest.isError)
    return <ErrorMessage error={manifest.error} onRetry={() => void manifest.refetch()} />;
  if (!m || overview.isPending) return <p>Chargement de la carte…</p>;
  if (overview.isError)
    return <ErrorMessage error={overview.error} onRetry={() => void overview.refetch()} />;

  const mapProps = {
    level,
    colorOf,
    motifOf,
    colorKey,
    selected,
    onSelect: select,
    describe,
    mode,
  };
  const focusFor = (zone: MapZone) =>
    focus && focus.zone === zone ? { bbox: focus.bbox, key: focus.key } : null;

  // Tableau alternatif (accessibilité) : territoires du niveau affiché.
  const tableRows = (() => {
    const rows =
      level === 'region'
        ? m.regions.map((r) => ({ code: r.code, nom: r.nom }))
        : level === 'departement'
          ? m.departements.map((d) => ({ code: d.code, nom: d.nom }))
          : communes.features
              .filter((f) => !selectedDepartement || f.properties.dep === selectedDepartement)
              .map((f) => ({
                code: f.properties.code,
                nom: f.properties.nom ?? f.properties.code,
              }));
    const q = filter.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.nom.toLowerCase().includes(q) || r.code.toLowerCase().startsWith(q))
      .slice(0, 120);
  })();

  return (
    <section aria-labelledby="titre-carte" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="titre-carte" className="text-2xl font-bold">
          Carte électorale
        </h1>
        <NatureBadge nature={data?.nature ?? null} />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {m.effectifs.communes === m.effectifs.communesDuReferentiel
          ? `Les ${formatCount(m.effectifs.communes)} communes de métropole et des DROM (${m.millesime}).`
          : `Jeu de démonstration : ${formatCount(m.effectifs.communes)} communes détaillées (Ain, Corse, DROM) sur ${formatCount(m.effectifs.communesDuReferentiel)} ; les autres départements apparaissent en entier. Le référentiel complet s’obtient avec « pnpm data:geo ».`}{' '}
        Contours : IGN ADMIN EXPRESS ; codes : INSEE (Licence Ouverte).
        {history.data && !history.data.disponible && ` ${history.data.raison}`}
      </p>

      <div className={`${card} grid gap-4 md:grid-cols-4`}>
        <div className="space-y-1 md:col-span-2">
          <label htmlFor="carte-source" className={label}>
            Résultats affichés
          </label>
          <select
            id="carte-source"
            className={input}
            value={sourceIndex}
            onChange={(e) => setSourceIndex(Number(e.target.value))}
          >
            {sources.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="carte-couleur" className={label}>
            Couleurs
          </label>
          <select
            id="carte-couleur"
            className={input}
            disabled={!data}
            value={coloring.kind === 'score' ? `score-${coloring.candidate}` : coloring.kind}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith('score-'))
                setColoring({ kind: 'score', candidate: Number(v.slice(6)) });
              else if (v === 'ecart') setColoring({ kind: 'ecart', ...topTwo });
              else setColoring({ kind: v as 'vainqueur' | 'participation' });
            }}
          >
            <option value="vainqueur">Candidat en tête</option>
            <option value="participation">Participation</option>
            <option value="ecart">Écart entre deux candidats</option>
            {data?.candidats.map((c, i) => (
              <option key={c.key} value={`score-${i}`}>
                Score de {c.label}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={motifs}
              disabled={!data}
              onChange={(e) => setMotifs(e.target.checked)}
            />
            Motifs (daltonisme, impression)
          </label>
          {motifs && (coloring.kind === 'score' || coloring.kind === 'participation') && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ce dégradé se lit par sa clarté ; les motifs distinguent les candidats en tête et les
              deux camps d’un écart.
            </p>
          )}
          {coloring.kind === 'ecart' && data && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['a', 'b'] as const).map((side) => (
                <div key={side} className="space-y-1">
                  <label htmlFor={`carte-ecart-${side}`} className={label}>
                    {side === 'a' ? 'Candidat (bleu)' : 'Comparé à (rouge)'}
                  </label>
                  <select
                    id={`carte-ecart-${side}`}
                    className={input}
                    value={coloring[side]}
                    onChange={(e) => setColoring({ ...coloring, [side]: Number(e.target.value) })}
                  >
                    {data.candidats.map((c, i) => (
                      <option key={c.key} value={i}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
        <fieldset className="space-y-1">
          <legend className={label}>Niveau</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {(['region', 'departement', 'commune'] as const).map((lvl) => (
              <label key={lvl} className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="niveau"
                  checked={level === lvl}
                  onChange={() => setLevel(lvl)}
                />
                {LEVEL_LABELS[lvl]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="md:col-span-4">
          <SearchBox onFound={onFound} />
        </div>
      </div>

      {sourceData.error !== null && <ErrorMessage error={sourceData.error} />}
      {communeError && (
        <ErrorMessage
          error={communeError.error}
          onRetry={() => communeResults.forEach((q) => q.isError && void q.refetch())}
        />
      )}
      {data ? (
        <Legend
          entries={scheme.legend}
          noData={scheme.noData}
          title={legendTitle(coloring, data)}
          motifs={motifs}
          mode={mode}
        />
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Aucun résultat affiché :{' '}
          {game.state.elections.t1
            ? 'ce tour n’a pas de détail territorial (partie migrée d’une version antérieure).'
            : 'le premier tour de la partie n’a pas encore eu lieu.'}
        </p>
      )}
      {level === 'commune' && (!view || view.zoom < 6.5) && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Zoomez sur la carte de la métropole (ou recherchez une commune) pour afficher les
          communes.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <ElectionMap
          {...mapProps}
          label="Carte de la métropole"
          bounds={zoneBounds('metropole')}
          layers={metropoleLayers}
          focus={focusFor('metropole')}
          onViewChange={(bounds, zoom) => setView({ bounds, zoom })}
          className="h-[60vh] min-h-80"
        />
        <div className="space-y-4">
          {sheet ? (
            <TerritorySheet info={sheet} data={data} onClose={() => setSelected(null)} />
          ) : (
            <p className={`${card} text-sm text-slate-600 dark:text-slate-400`}>
              Touchez ou cliquez un territoire, ou utilisez la recherche, pour afficher sa fiche.
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="titre-drom" className="space-y-2">
        <h2 id="titre-drom" className="text-lg font-semibold">
          Départements et régions d’outre-mer
        </h2>
        {mobile ? (
          <ul className="grid grid-cols-2 gap-2">
            {DROM_ZONES.map((zone) => (
              <li key={zone}>
                <button
                  type="button"
                  className={`${buttonSecondary} w-full`}
                  onClick={() => setOpenDrom(zone)}
                >
                  Ouvrir l’encart {DROM_LABELS[zone]}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {DROM_ZONES.map((zone) => (
              <li key={zone} className="space-y-1">
                <h3 className="text-sm font-medium">{DROM_LABELS[zone]}</h3>
                <ElectionMap
                  {...mapProps}
                  label={`Encart ${DROM_LABELS[zone]}`}
                  bounds={zoneBounds(zone)}
                  maxBounds={expand(zoneBounds(zone), 0.6)}
                  layers={dromLayers[zone]!}
                  focus={focusFor(zone)}
                  compact
                  className="h-40"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {mobile && openDrom && openDrom !== 'metropole' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Encart ${DROM_LABELS[openDrom]}`}
          className="fixed inset-0 z-40 flex flex-col bg-white p-3 dark:bg-slate-950"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{DROM_LABELS[openDrom]}</h2>
            <button type="button" className={buttonSecondary} onClick={() => setOpenDrom(null)}>
              Fermer l’encart
            </button>
          </div>
          <ElectionMap
            {...mapProps}
            label={`Encart ${DROM_LABELS[openDrom]}`}
            bounds={zoneBounds(openDrom)}
            maxBounds={expand(zoneBounds(openDrom), 0.6)}
            layers={dromLayers[openDrom]!}
            focus={focusFor(openDrom)}
            className="min-h-0 flex-1"
          />
          {sheet && (
            <div className="mt-2 max-h-[45vh] overflow-y-auto">
              <TerritorySheet info={sheet} data={data} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      )}

      <section aria-labelledby="titre-tableau-carte" className={`${card} space-y-3`}>
        <h2 id="titre-tableau-carte" className="text-lg font-semibold">
          Tableau des territoires ({LEVEL_LABELS[level].toLowerCase()}s)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Équivalent textuel de la carte, utilisable au clavier.
          {level === 'commune' &&
            !selectedDepartement &&
            ' Sélectionnez un département pour lister ses communes.'}
        </p>
        <div className="space-y-1">
          <label htmlFor="carte-filtre" className={label}>
            Filtrer par nom ou code
          </label>
          <input
            id="carte-filtre"
            className={input}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Territoires et candidat en tête</caption>
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-1 font-medium">
                  Territoire
                </th>
                <th scope="col" className="py-1 font-medium">
                  En tête
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Participation
                </th>
                <th scope="col" className="py-1 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const result = resultOf(level, row.code);
                const leader = leaderOf(result);
                return (
                  <tr key={row.code} className="border-t border-slate-100 dark:border-slate-800">
                    <th scope="row" className="py-1 pr-2 text-left font-normal">
                      {row.nom} <span className="text-xs text-slate-500">({row.code})</span>
                    </th>
                    <td className="py-1 pr-2">
                      {leader !== null && data
                        ? `${data.candidats[leader]!.label} (${formatRatio(result!.voix[leader]!, result!.exprimes)})`
                        : '—'}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {result ? formatRatio(result.votants, result.inscrits) : '—'}
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        className="text-republique-600 underline dark:text-republique-100"
                        onClick={() => {
                          select({ level, code: row.code });
                          const bbox =
                            level === 'region'
                              ? m.regions.find((r) => r.code === row.code)?.bbox
                              : level === 'departement'
                                ? departementsByCode.get(row.code)?.bbox
                                : undefined;
                          const zone =
                            level === 'region'
                              ? zoneOfRegion(row.code)
                              : level === 'departement'
                                ? departementsByCode.get(row.code)?.zone
                                : 'metropole';
                          if (bbox && zone)
                            setFocus({ zone, bbox, key: `${row.code}-${Date.now()}` });
                        }}
                      >
                        Voir {row.nom}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <OffMapList manifest={m} data={data} />
    </section>
  );
}
