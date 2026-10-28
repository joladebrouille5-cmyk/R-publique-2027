import {
  DROM_LABELS,
  type DepartementInfo,
  type GeoManifest,
  type MapZone,
  type TerritoryLevel,
  type TerritorySearchResult,
} from '@r2027/shared';
import { useQueries } from '@tanstack/react-query';
import { Info, MapPin, MousePointerClick, Play, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRuleset } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonSecondary, card, input, label, screenTitle } from '../components/ui';
import { formatCount, formatRatio } from '../labels';
import { colorScheme, leaderOf, MAP_SURFACE, type Coloring } from '../map/colors';
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
import { ElectionMap, type BBox, type Insets, type MapSelection } from '../map/ElectionMap';
import { useMediaQuery, useMode } from '../map/useMode';
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
/** Zoom maximal d'un vol vers un territoire touché : ses voisins restent visibles. */
const CLICK_MAX_ZOOM: Partial<Record<TerritoryLevel, number>> = { region: 6.5, departement: 7 };
const WIDE_QUERY = '(min-width: 1024px)';

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
  const blocs = data.source.kind === 'legislatives';
  if (coloring.kind === 'vainqueur') return blocs ? 'Bloc en tête' : 'Candidat en tête';
  if (coloring.kind === 'participation') return 'Participation (votants / inscrits)';
  if (coloring.kind === 'score')
    return `Score ${blocs ? 'du bloc' : 'de'} ${data.candidats[coloring.candidate]!.label} (% des exprimés)`;
  return `Écart entre ${data.candidats[coloring.a]!.label} et ${data.candidats[coloring.b]!.label} (points de % des exprimés)`;
}

/** Départements révélés à chaque pas du dépouillement rejouable (phase 13). */
const REVEAL_STEP = 3;
const REVEAL_DELAY_MS = 110;

/** Écran Carte électorale (§3) : métropole, cinq encarts DROM, recherche, fiche, tableau. */
export function MapScreen() {
  const game = useCurrentGame();
  const mode = useMode();
  const mobile = useMediaQuery('(max-width: 767px)');
  const manifest = useGeoManifest();
  const overview = useTopology(manifest.data?.apercu ?? null);
  const history = useHistoricalStatus();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const sources = availableSources(game.state, history.data, true);
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[Math.min(sourceIndex, sources.length - 1)]!;
  const sourceData = useSourceData(game.state, source, history.data, ruleset.data);
  const data: SourceData | null = sourceData.data;
  // Dépouillement rejouable des législatives (phase 13) : les départements se colorent un à un,
  // les plus petits d'abord ; d'un coup si le mouvement réduit est demandé.
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [reveal, setReveal] = useState<number | null>(null);
  const revealOrder = useMemo(
    () =>
      data?.legislatives
        ? [...data.departements.entries()]
            .sort((a, b) => a[1].exprimes - b[1].exprimes || a[0].localeCompare(b[0]))
            .map(([code]) => code)
        : [],
    [data],
  );
  const revealed = useMemo(
    () => (reveal === null ? null : new Set(revealOrder.slice(0, reveal))),
    [reveal, revealOrder],
  );
  useEffect(() => {
    if (reveal === null) return;
    const timer = setTimeout(
      () =>
        setReveal((r) =>
          r === null || r + REVEAL_STEP >= revealOrder.length ? null : r + REVEAL_STEP,
        ),
      REVEAL_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [reveal, revealOrder.length]);
  const [coloring, setColoring] = useState<Coloring>({ kind: 'vainqueur' });
  const [motifs, setMotifs] = useState(false);
  const [level, setLevel] = useState<TerritoryLevel>('departement');
  const [selected, setSelected] = useState<MapSelection | null>(null);
  /** Vue demandée ; `serial` change à chaque demande, même vers le même territoire. */
  const [focus, setFocus] = useState<{
    zone: MapZone;
    bbox: BBox;
    serial: number;
    maxZoom?: number;
  } | null>(null);
  const focusOn = (zone: MapZone, bbox: BBox, maxZoom?: number) =>
    setFocus((f) => ({
      zone,
      bbox,
      serial: (f?.serial ?? 0) + 1,
      ...(maxZoom ? { maxZoom } : {}),
    }));
  const [view, setView] = useState<{ bounds: BBox; zoom: number } | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [openDrom, setOpenDrom] = useState<MapZone | null>(null);
  const [filter, setFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersToggle = useRef<HTMLButtonElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const sheetPanel = useRef<HTMLDivElement>(null);
  const filtersPanel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  /** Parties de la carte recouvertes par la barre d'outils et la fiche (cadrage des vols). */
  const insets = useCallback((): Insets => {
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    const bar = toolbar.current;
    const panel = sheetPanel.current;
    const box = stage.current;
    if (bar) out.top = bar.offsetTop + bar.offsetHeight;
    const wideScreen = window.matchMedia?.(WIDE_QUERY).matches ?? false;
    if (panel && box) {
      if (wideScreen) out.right = box.clientWidth - panel.offsetLeft;
      else out.bottom = box.clientHeight - panel.offsetTop;
    }
    // Filtres ouverts sur grand écran : la vue se cadre à leur droite.
    const filters = filtersPanel.current;
    if (wideScreen && filters && !filters.hidden)
      out.left = filters.offsetLeft + filters.offsetWidth;
    return out;
  }, []);

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
        ? revealed
          ? undefined
          : data.regions.get(code)
        : lvl === 'departement'
          ? revealed && !revealed.has(code)
            ? undefined
            : data.departements.get(code)
          : communeResultMap.map.get(code);
  const colorOf = (lvl: TerritoryLevel, code: string) => scheme.colorOf(resultOf(lvl, code));
  const motifOf = motifs
    ? (lvl: TerritoryLevel, code: string) => scheme.motifOf(resultOf(lvl, code))
    : undefined;
  const colorKey = `${source.label}|${JSON.stringify(coloring)}|${mode}|${motifs}|${communeResultMap.map.size}|${data ? 'd' : 'n'}|${reveal ?? 'tout'}`;

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

  /** Vole vers une région ou un département (clic, tableau). */
  const flyTo = (lvl: TerritoryLevel, code: string, maxZoom?: number) => {
    const bbox =
      lvl === 'region'
        ? m?.regions.find((r) => r.code === code)?.bbox
        : lvl === 'departement'
          ? departementsByCode.get(code)?.bbox
          : undefined;
    const zone =
      lvl === 'region'
        ? zoneOfRegion(code)
        : lvl === 'departement'
          ? departementsByCode.get(code)?.zone
          : undefined;
    if (bbox && zone) focusOn(zone, bbox, maxZoom);
  };
  const select = (selection: MapSelection) => {
    setSelected(selection);
    if (selection.level === 'departement')
      setPinned((p) => [...new Set([selection.code, ...p])].slice(0, MAX_LOADED));
  };
  /** Territoire touché sur une carte : fiche, puis vol vers lui (la commune, elle, glisse). */
  const selectOnMap = (selection: MapSelection) => {
    if (mobile) setFiltersOpen(false);
    select(selection);
    flyTo(selection.level, selection.code, CLICK_MAX_ZOOM[selection.level]);
  };
  const onFound = (found: TerritorySearchResult) => {
    setLevel(found.level);
    setSelected({ level: found.level, code: found.code });
    if (found.departement)
      setPinned((p) => [...new Set([found.departement!, ...p])].slice(0, MAX_LOADED));
    focusOn(found.zone, found.bbox);
    if (mobile) setFiltersOpen(false);
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

  // La scène descend jusqu'au bas de l'écran (au-dessus de la navigation basse sur téléphone) :
  // sa position dans la page est mesurée, la hauteur restante calculée en CSS.
  const loaded = !!m && !overview.isPending;
  useLayoutEffect(() => {
    const measure = () => {
      const element = stage.current;
      if (element)
        element.style.setProperty(
          '--haut-scene',
          `${element.getBoundingClientRect().top + window.scrollY}px`,
        );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loaded]);

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
    onSelect: selectOnMap,
    describe,
    mode,
  };
  const focusFor = (zone: MapZone) =>
    focus && focus.zone === zone
      ? {
          bbox: focus.bbox,
          key: String(focus.serial),
          ...(focus.maxZoom ? { maxZoom: focus.maxZoom } : {}),
        }
      : null;
  const closeFilters = () => {
    setFiltersOpen(false);
    filtersToggle.current?.focus();
  };

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

  const filters = (
    <div
      ref={filtersPanel}
      id="carte-filtres"
      role="group"
      aria-label="Filtres de la carte"
      hidden={!filtersOpen}
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeFilters();
      }}
      className="pointer-events-auto max-h-full w-full min-h-0 animate-monte space-y-4 overflow-y-auto rounded-card border border-slate-200/80 bg-white p-4 shadow-raised sm:w-80 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg font-bold tracking-tight">Filtres</p>
        <button
          type="button"
          onClick={closeFilters}
          className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Fermer les filtres</span>
        </button>
      </div>
      <div className="space-y-1">
        <label htmlFor="carte-source" className={label}>
          Résultats affichés
        </label>
        <select
          id="carte-source"
          className={input}
          value={sourceIndex}
          onChange={(e) => {
            setSourceIndex(Number(e.target.value));
            setReveal(null);
          }}
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
          <option value="vainqueur">
            {source.kind === 'legislatives' ? 'Bloc en tête' : 'Candidat en tête'}
          </option>
          <option value="participation">Participation</option>
          <option value="ecart">
            {source.kind === 'legislatives'
              ? 'Écart entre deux blocs'
              : 'Écart entre deux candidats'}
          </option>
          {data?.candidats.map((c, i) => (
            <option key={c.key} value={`score-${i}`}>
              Score {source.kind === 'legislatives' ? 'du bloc' : 'de'} {c.label}
            </option>
          ))}
        </select>
      </div>
      {coloring.kind === 'ecart' && data && (
        <div className="grid grid-cols-2 gap-2">
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
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-medium dark:bg-slate-800/60">
        <input
          type="checkbox"
          className="size-4 accent-republique-600"
          checked={motifs}
          disabled={!data}
          onChange={(e) => setMotifs(e.target.checked)}
        />
        Motifs (daltonisme, impression)
      </label>
      {motifs && (coloring.kind === 'score' || coloring.kind === 'participation') && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Ce dégradé se lit par sa clarté ; les motifs distinguent les candidats en tête et les deux
          camps d’un écart.
        </p>
      )}
    </div>
  );

  const levels = (
    <fieldset className="pointer-events-auto flex rounded-full border border-slate-200/80 bg-white/95 p-1 shadow-raised dark:border-slate-700 dark:bg-slate-900/95">
      <legend className="sr-only">Niveau</legend>
      {(['region', 'departement', 'commune'] as const).map((lvl) => (
        <label
          key={lvl}
          className={`relative flex min-h-9 cursor-pointer items-center rounded-full px-3 text-sm font-semibold transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-republique-500 ${
            level === lvl
              ? 'bg-republique-600 text-white shadow-card'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <input
            type="radio"
            name="niveau"
            className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
            checked={level === lvl}
            onChange={() => setLevel(lvl)}
          />
          {LEVEL_LABELS[lvl]}
        </label>
      ))}
    </fieldset>
  );

  return (
    <section aria-labelledby="titre-carte" className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 id="titre-carte" className={screenTitle}>
          Carte électorale
        </h1>
        <NatureBadge nature={data?.nature ?? null} />
      </div>

      {sourceData.error !== null && <ErrorMessage error={sourceData.error} />}
      {communeError && (
        <ErrorMessage
          error={communeError.error}
          onRetry={() => communeResults.forEach((q) => q.isError && void q.refetch())}
        />
      )}

      {/* Scène : la carte occupe toute la place ; outils, légende et fiche flottent au-dessus. */}
      <div
        ref={stage}
        className="relative -mx-4 overflow-hidden border-y border-slate-200/80 shadow-raised [--reserve:calc(4rem+var(--sab)+0.5rem)] sm:mx-0 sm:rounded-dossier sm:border lg:[--reserve:1.5rem] dark:border-slate-800"
        style={{
          backgroundColor: MAP_SURFACE[mode],
          height: 'max(24rem, calc(100dvh - var(--haut-scene, 18rem) - var(--reserve)))',
        }}
      >
        <ElectionMap
          {...mapProps}
          label="Carte de la métropole"
          bounds={zoneBounds('metropole')}
          layers={metropoleLayers}
          focus={focusFor('metropole')}
          insets={insets}
          onViewChange={(bounds, zoom) => setView({ bounds, zoom })}
          controlsClassName={`absolute right-3 z-10 transition-[right] duration-300 ease-sortie max-lg:top-[7.25rem] sm:max-lg:top-[4.25rem] lg:bottom-10 ${
            sheet ? 'max-lg:hidden lg:right-[calc(23rem+1.5rem)]' : ''
          }`}
          className="h-full w-full rounded-[inherit]"
        />

        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-start gap-2 p-3">
          <div ref={toolbar} className="flex w-full flex-wrap items-center gap-2">
            <div className="pointer-events-auto flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <SearchBox onFound={onFound} className="min-w-0 flex-1 sm:w-72 sm:flex-none" />
              <button
                ref={filtersToggle}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setFiltersOpen(false);
                }}
                type="button"
                aria-expanded={filtersOpen}
                aria-controls="carte-filtres"
                onClick={() => setFiltersOpen((o) => !o)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold shadow-raised transition-colors ${
                  filtersOpen
                    ? 'border-republique-600 bg-republique-600 text-white'
                    : 'border-slate-200/80 bg-white/95 text-slate-800 hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100'
                }`}
              >
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                Filtres
              </button>
            </div>
            {levels}
          </div>
          {source.kind === 'legislatives' && data && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 text-sm font-bold text-slate-800 shadow-raised hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
                onClick={() => {
                  setLevel('departement');
                  setReveal(reduceMotion ? null : 0);
                }}
              >
                <Play aria-hidden="true" className="size-4" />
                Rejouer le dépouillement
              </button>
              <p
                aria-live="polite"
                className="rounded-full bg-slate-950/90 px-3 py-1.5 text-xs font-medium text-white empty:hidden dark:bg-white/90 dark:text-slate-900"
              >
                {reveal !== null
                  ? `Dépouillement : ${Math.min(reveal, revealOrder.length)} départements sur ${revealOrder.length}`
                  : ''}
              </p>
            </div>
          )}
          {source.kind === 'legislatives' && level === 'commune' && (
            <p className="pointer-events-auto max-w-sm animate-apparait rounded-2xl bg-slate-950/90 px-3 py-2 text-xs font-medium text-white shadow-raised dark:bg-white/90 dark:text-slate-900">
              Les législatives se lisent par département : touchez un département pour voir ses
              circonscriptions et ses sièges.
            </p>
          )}
          {level === 'commune' && (!view || view.zoom < 6.5) && (
            <p className="pointer-events-auto max-w-sm animate-apparait rounded-2xl bg-slate-950/90 px-3 py-2 text-xs font-medium text-white shadow-raised dark:bg-white/90 dark:text-slate-900">
              Zoomez sur la carte de la métropole (ou recherchez une commune) pour afficher les
              communes.
            </p>
          )}
          {filters}
        </div>

        <div
          className={`absolute bottom-3 left-3 z-10 max-w-[calc(100%-3.5rem)] rounded-card border border-slate-200/80 bg-white/95 px-3.5 py-2.5 shadow-raised sm:max-w-sm dark:border-slate-700 dark:bg-slate-900/95 ${
            sheet ? 'lg:max-w-[calc(100%-26rem)]' : ''
          }`}
        >
          {data ? (
            <Legend
              entries={scheme.legend}
              noData={scheme.noData}
              title={legendTitle(coloring, data)}
              motifs={motifs}
              mode={mode}
            />
          ) : (
            <p className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
              <Info aria-hidden="true" className="mt-px size-4 shrink-0" />
              <span>
                {source.kind === 'legislatives'
                  ? 'Chargement des résultats des législatives…'
                  : `Aucun résultat affiché : ${
                      game.state.elections.t1
                        ? 'ce tour n’a pas de détail territorial (partie migrée d’une version antérieure).'
                        : 'le premier tour de la partie n’a pas encore eu lieu.'
                    }`}
              </span>
            </p>
          )}
        </div>

        {!sheet && (
          <p className="pointer-events-none absolute right-3 bottom-10 z-10 hidden animate-apparait items-center gap-2 rounded-full bg-slate-950/90 px-3 py-1.5 text-xs font-medium text-white lg:right-16 lg:flex dark:bg-white/90 dark:text-slate-900">
            <MousePointerClick aria-hidden="true" className="size-4" />
            Touchez un territoire pour ouvrir sa fiche
          </p>
        )}

        {sheet && (
          <div
            ref={sheetPanel}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSelected(null);
            }}
            className="absolute inset-x-0 bottom-0 z-20 max-h-[58%] animate-feuille overflow-y-auto rounded-t-dossier border-t border-slate-200/80 bg-white shadow-raised lg:inset-x-auto lg:top-[4.25rem] lg:right-3 lg:bottom-auto lg:max-h-[calc(100%-5.5rem)] lg:w-[23rem] lg:animate-volet lg:rounded-card lg:border dark:border-slate-700 dark:bg-slate-900"
          >
            <span
              aria-hidden="true"
              className="mx-auto mt-2 block h-1.5 w-10 rounded-full bg-slate-300 lg:hidden dark:bg-slate-600"
            />
            <TerritorySheet
              key={`${sheet.level}-${sheet.code}`}
              info={sheet}
              data={data}
              onClose={() => setSelected(null)}
              className="p-4 pt-3 sm:p-5"
            />
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
        <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          {m.effectifs.communes === m.effectifs.communesDuReferentiel
            ? `Les ${formatCount(m.effectifs.communes)} communes de métropole et des DROM (${m.millesime}).`
            : `Jeu de démonstration : ${formatCount(m.effectifs.communes)} communes détaillées (Ain, Corse, Somme, DROM) sur ${formatCount(m.effectifs.communesDuReferentiel)} ; les autres départements apparaissent en entier. Le référentiel complet s’obtient avec « pnpm data:geo ».`}{' '}
          {history.data && !history.data.disponible && ` ${history.data.raison}`}
        </span>
      </p>

      <section aria-labelledby="titre-drom" className="space-y-3">
        <h2 id="titre-drom" className="text-xl font-bold">
          Départements et régions d’outre-mer
        </h2>
        {mobile ? (
          <ul className="grid grid-cols-2 gap-2">
            {DROM_ZONES.map((zone) => (
              <li key={zone}>
                <button
                  type="button"
                  className={`${buttonSecondary} w-full justify-start`}
                  onClick={() => setOpenDrom(zone)}
                >
                  <MapPin
                    aria-hidden="true"
                    className="size-4 shrink-0 text-republique-600 dark:text-republique-300"
                  />
                  <span>
                    <span className="sr-only">Ouvrir l’encart </span>
                    {DROM_LABELS[zone]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {DROM_ZONES.map((zone) => (
              <li
                key={zone}
                className="overflow-hidden rounded-card border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="px-3 pt-2.5 pb-1.5 font-sans text-sm font-bold tracking-normal">
                  {DROM_LABELS[zone]}
                </h3>
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
          className="fixed inset-0 z-40 flex animate-apparait flex-col bg-white p-3 pt-[calc(0.75rem+var(--sat))] pb-[calc(0.75rem+var(--sab))] dark:bg-slate-950"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold">{DROM_LABELS[openDrom]}</h2>
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
            className="min-h-0 flex-1 overflow-hidden rounded-card"
          />
          {sheet && (
            <div className="mt-2 max-h-[45vh] animate-feuille overflow-y-auto">
              <TerritorySheet info={sheet} data={data} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      )}

      <section aria-labelledby="titre-tableau-carte" className={`${card} space-y-3`}>
        <h2 id="titre-tableau-carte" className="text-xl font-bold">
          Tableau des territoires ({LEVEL_LABELS[level].toLowerCase()}s)
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
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
              <tr className="text-xs text-slate-600 dark:text-slate-400">
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
                      {row.nom}{' '}
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        ({row.code})
                      </span>
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
                        className="rounded-full px-2 py-1 font-semibold text-republique-700 underline-offset-2 hover:bg-republique-50 hover:underline dark:text-republique-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          select({ level, code: row.code });
                          flyTo(level, row.code);
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
