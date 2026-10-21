import {
  CommuneResultsResponseSchema,
  GeoManifestSchema,
  HistoricalCommunesSchema,
  HistoricalOverviewSchema,
  HistoricalStatusSchema,
  TerritorySearchResultSchema,
  type Counts,
  type GameState,
  type HistoricalStatus,
} from '@r2027/shared';
import { candidateName } from '@r2027/shared';
import { useQuery } from '@tanstack/react-query';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import { z } from 'zod';
import { api } from '../api/client';

// Données de la carte : référentiel géographique (fichiers TopoJSON servis par l'API) et
// résultats, simulés (partie) ou réels (présidentielle 2022 importée), ramenés à une forme commune.

export type TerritoryProperties = {
  code: string;
  nom?: string;
  dep?: string;
  reg?: string;
  region?: string;
  population?: number | null;
};
export type TerritoryCollection = FeatureCollection<Geometry, TerritoryProperties>;

type Topology = Parameters<typeof feature>[0];

const TopologySchema = z.custom<Topology>(
  (value) =>
    typeof value === 'object' && value !== null && (value as { type?: string }).type === 'Topology',
  'TopoJSON attendu',
);

export function useGeoManifest() {
  return useQuery({
    queryKey: ['geo', 'manifeste'],
    queryFn: () => api.get('/api/geo/manifeste', GeoManifestSchema),
    staleTime: Infinity,
  });
}

/** Objets d'une topologie du référentiel, convertis en GeoJSON. */
export async function fetchTopology(file: string): Promise<Record<string, TerritoryCollection>> {
  const topology = await api.get(`/api/geo/fichiers/${file}`, TopologySchema);
  return Object.fromEntries(
    Object.entries(topology.objects).map(([name, object]) => [
      name,
      feature(topology, object) as unknown as TerritoryCollection,
    ]),
  );
}

export const topologyQuery = (file: string) => ({
  queryKey: ['geo', 'fichier', file],
  queryFn: () => fetchTopology(file),
  staleTime: Infinity,
});

/** Objets d'une topologie convertis en GeoJSON (un seul décodage, mis en cache). */
export function useTopology(file: string | null) {
  return useQuery({ ...topologyQuery(file ?? ''), enabled: file !== null });
}

export async function searchTerritories(query: string) {
  return api.get(
    `/api/geo/recherche?q=${encodeURIComponent(query)}`,
    TerritorySearchResultSchema.array(),
  );
}

export function useHistoricalStatus() {
  return useQuery({
    queryKey: ['geo', 'historique'],
    queryFn: () => api.get('/api/geo/historique', HistoricalStatusSchema),
    staleTime: Infinity,
  });
}

// --- Résultats normalisés ---

export type ResultCandidate = { key: string; label: string; player: boolean };
export type TerritoryResult = {
  inscrits: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  /** Voix, dans l'ordre de `candidats` de la source. */
  voix: number[];
};

/** Source des couleurs de la carte : un tour simulé de la partie ou un tour réel de 2022. */
export type ResultSource =
  | { kind: 'partie'; tour: 1 | 2; label: string }
  | { kind: 'historique'; tour: 1 | 2; label: string }
  | { kind: 'aucune'; label: string };

export type SourceData = {
  source: ResultSource;
  /** Nature affichée : simulé, réel, démonstration fictive. */
  nature: 'simule' | 'reel' | 'fictif' | null;
  candidats: ResultCandidate[];
  regions: Map<string, TerritoryResult>;
  departements: Map<string, TerritoryResult>;
  horsCarte: Map<string, TerritoryResult>;
};

const fromCounts = (c: Counts, keys: readonly string[]): TerritoryResult => ({
  inscrits: c.inscrits,
  votants: c.votants,
  blancs: c.blancs,
  nuls: c.nuls,
  exprimes: c.exprimes,
  voix: keys.map((k) => c.voix[k] ?? 0),
});

/** [inscrits, abstentions, votants, blancs, nuls, exprimés, voix…] → résultat. */
export const fromValues = (v: readonly number[]): TerritoryResult => ({
  inscrits: v[0]!,
  votants: v[2]!,
  blancs: v[3]!,
  nuls: v[4]!,
  exprimes: v[5]!,
  voix: v.slice(6),
});

const toMap = <T>(record: Record<string, T>, map: (value: T) => TerritoryResult) =>
  new Map(Object.entries(record).map(([code, value]) => [code, map(value)]));

/** Sources disponibles : tours dépouillés de la partie (avec détail territorial), puis 2022. */
export function availableSources(
  state: GameState,
  history: HistoricalStatus | undefined,
): ResultSource[] {
  const sources: ResultSource[] = [];
  if (state.elections.t1?.territoire)
    sources.push({ kind: 'partie', tour: 1, label: 'Partie — premier tour (simulé)' });
  if (state.elections.t2?.territoire)
    sources.push({ kind: 'partie', tour: 2, label: 'Partie — second tour (simulé)' });
  if (history?.disponible) {
    for (const t of history.tours) {
      sources.push({
        kind: 'historique',
        tour: t.tour,
        label: `Présidentielle 2022 — ${t.tour === 1 ? 'premier' : 'second'} tour (officiel)`,
      });
    }
  }
  sources.push({ kind: 'aucune', label: 'Géographie seule (sans résultats)' });
  return sources;
}

/** Résultats agrégés (régions, départements, hors carte) de la source choisie. */
export function useSourceData(
  state: GameState,
  source: ResultSource,
  history: HistoricalStatus | undefined,
) {
  const overview = useQuery({
    queryKey: ['geo', 'historique', source.kind === 'historique' ? source.tour : 0, 'apercu'],
    enabled: source.kind === 'historique',
    staleTime: Infinity,
    queryFn: () =>
      api.get(
        `/api/geo/historique/${source.kind === 'historique' ? source.tour : 1}/apercu`,
        HistoricalOverviewSchema,
      ),
  });

  if (source.kind === 'partie') {
    const result = source.tour === 1 ? state.elections.t1 : state.elections.t2;
    const territoire = result?.territoire;
    if (!territoire) return { data: null, isPending: false, error: null };
    const keys = territoire.candidats;
    const data: SourceData = {
      source,
      nature: territoire.nature === 'fictif' ? 'fictif' : 'simule',
      candidats: keys.map((key) => ({
        key,
        label: state.actors[key] ? candidateName(state.actors[key]!.candidate) : key,
        player: key === state.player.actorId,
      })),
      regions: toMap(territoire.regions, (c) => fromCounts(c, keys)),
      departements: toMap(territoire.departements, (c) => fromCounts(c, keys)),
      horsCarte: toMap(territoire.horsCarte, (c) => fromCounts(c, keys)),
    };
    return { data, isPending: false, error: null };
  }
  if (source.kind === 'historique') {
    const tour = history?.disponible
      ? history.tours.find((t) => t.tour === source.tour)
      : undefined;
    if (!overview.data || !tour)
      return { data: null, isPending: overview.isPending, error: overview.error };
    const data: SourceData = {
      source,
      nature: 'reel',
      candidats: tour.candidats.map((c) => ({
        key: `2022-${c.panneau}`,
        label: `${c.prenom} ${c.nom}`,
        player: false,
      })),
      regions: toMap(overview.data.regions, fromValues),
      departements: toMap(overview.data.departements, fromValues),
      horsCarte: toMap(overview.data.horsCarte, fromValues),
    };
    return { data, isPending: false, error: null };
  }
  return { data: null, isPending: false, error: null };
}

/** Résultats des communes d'un département pour la source choisie (simulés ou réels). */
export async function fetchCommuneResults(
  gameId: string,
  source: ResultSource,
  candidateKeys: readonly string[],
  departement: string,
): Promise<{ results: Map<string, TerritoryResult>; estimations: Set<string> }> {
  if (source.kind === 'partie') {
    const body = await api.get(
      `/api/games/${gameId}/resultats/${source.tour}/communes?departement=${departement}`,
      CommuneResultsResponseSchema,
    );
    return {
      results: toMap(body.communes, (c) => fromCounts(c, candidateKeys)),
      estimations: new Set(),
    };
  }
  if (source.kind === 'historique') {
    const body = await api.get(
      `/api/geo/historique/${source.tour}/communes?departement=${departement}`,
      HistoricalCommunesSchema,
    );
    return { results: toMap(body.communes, fromValues), estimations: new Set(body.estimations) };
  }
  return { results: new Map(), estimations: new Set() };
}

export type FeatureOf = Feature<Geometry, TerritoryProperties>;
