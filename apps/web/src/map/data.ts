import {
  CommuneResultsResponseSchema,
  closestBloc,
  GeoManifestSchema,
  HistoricalCommunesSchema,
  HistoricalOverviewSchema,
  HistoricalStatusSchema,
  legislativeDepartments,
  realLegislativeDepartments,
  TerritorySearchResultSchema,
  type Counts,
  type GameState,
  type HistoricalStatus,
  type LegislativeDepartment,
  type Ruleset,
} from '@r2027/shared';
import { candidateName } from '@r2027/shared';
import { useQuery } from '@tanstack/react-query';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import { z } from 'zod';
import { api } from '../api/client';

// Données de la carte : référentiel géographique (fichiers TopoJSON servis par l'API) et
// résultats, simulés (partie) ou réels (présidentielle 2022 importée), ramenés à une forme commune.
// Phase 13 : législatives par département et par bloc — 2024 (résultats officiels du jeu de
// règles) et scrutins simulés de la partie, regroupés par les fonctions partagées avec le moteur.

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
  /** Législatives par bloc (phase 13) : 2024 réelles, dernier scrutin simulé ou tour en cours. */
  | {
      kind: 'legislatives';
      scrutin: 'reelles-2024' | 'simulees' | 'en-cours';
      tour: 1 | 2;
      label: string;
    }
  | { kind: 'aucune'; label: string };

export type SourceData = {
  source: ResultSource;
  /** Nature affichée : simulé, réel, démonstration fictive. */
  nature: 'simule' | 'reel' | 'fictif' | null;
  candidats: ResultCandidate[];
  regions: Map<string, TerritoryResult>;
  departements: Map<string, TerritoryResult>;
  horsCarte: Map<string, TerritoryResult>;
  /** Législatives (phase 13) : sièges par bloc et circonscriptions de chaque département. */
  legislatives?: {
    sieges: Map<string, Record<string, number>>;
    circonscriptions: Map<string, LegislativeDistrict[]>;
  };
};

/** Circonscription dans la fiche d'un département (aucun nom de candidat). */
export type LegislativeDistrict = {
  code: string;
  libelle: string;
  /** Bloc en tête au tour affiché, et sa part des exprimés. */
  tete: { bloc: string; part: number } | null;
  /** Bloc élu (au tour affiché ou avant), avec son tour. */
  elu: { bloc: string; tour: 1 | 2 } | null;
};

export const fromCounts = (c: Counts, keys: readonly string[]): TerritoryResult => ({
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

/**
 * Sources disponibles : tours dépouillés de la partie (avec détail territorial), législatives
 * (en cours, dernier scrutin simulé, 2024 réelles), puis présidentielle 2022.
 */
export function availableSources(
  state: GameState,
  history: HistoricalStatus | undefined,
  withLegislatives = false,
): ResultSource[] {
  const sources: ResultSource[] = [];
  const legislatives = state.legislatives;
  const simulated: ResultSource[] = [];
  if (withLegislatives && legislatives) {
    if (legislatives.premierTour)
      simulated.push({
        kind: 'legislatives',
        scrutin: 'en-cours',
        tour: 1,
        label: 'Législatives en cours — premier tour (simulé)',
      });
    if (legislatives.derniere.motif !== 'reelles-2024') {
      const year = legislatives.derniere.t2.slice(0, 4);
      simulated.push(
        {
          kind: 'legislatives',
          scrutin: 'simulees',
          tour: 1,
          label: `Législatives ${year} — premier tour (simulé)`,
        },
        {
          kind: 'legislatives',
          scrutin: 'simulees',
          tour: 2,
          label: `Législatives ${year} — second tour (simulé)`,
        },
      );
    }
  }
  // Pendant le quinquennat, les législatives de la partie passent en tête de liste.
  const presidency = state.meta.phase === 'presidence';
  if (presidency) sources.push(...simulated);
  if (state.elections.t1?.territoire)
    sources.push({ kind: 'partie', tour: 1, label: 'Partie — premier tour (simulé)' });
  if (state.elections.t2?.territoire)
    sources.push({ kind: 'partie', tour: 2, label: 'Partie — second tour (simulé)' });
  if (!presidency) sources.push(...simulated);
  if (history?.disponible) {
    for (const t of history.tours) {
      sources.push({
        kind: 'historique',
        tour: t.tour,
        label: `Présidentielle 2022 — ${t.tour === 1 ? 'premier' : 'second'} tour (officiel)`,
      });
    }
  }
  const real2024: ResultSource = {
    kind: 'legislatives',
    scrutin: 'reelles-2024',
    tour: 1,
    label: 'Législatives 2024 — premier tour par bloc (officiel)',
  };
  const none: ResultSource = { kind: 'aucune', label: 'Géographie seule (sans résultats)' };
  // Pendant la campagne présidentielle, la carte s'ouvre sur la présidentielle (ou sur la
  // géographie seule) ; les législatives de 2024 restent proposées.
  if (!withLegislatives) sources.push(none);
  else if (presidency) sources.push(real2024, none);
  else sources.push(none, real2024);
  return sources;
}

/** Résultats agrégés (régions, départements, hors carte) de la source choisie. */
export function useSourceData(
  state: GameState,
  source: ResultSource,
  history: HistoricalStatus | undefined,
  ruleset?: Ruleset,
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
  if (source.kind === 'legislatives') {
    if (!ruleset) return { data: null, isPending: true, error: null };
    return { data: legislativeSource(state, ruleset, source), isPending: false, error: null };
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

/** Codes des territoires hors carte pour les circonscriptions qui n'ont pas de département. */
const OFF_MAP: Record<string, string> = {
  // Français établis hors de France : onze circonscriptions.
  ZZ: '99',
  // Saint-Barthélemy et Saint-Martin : une seule circonscription, comptée avec Saint-Martin.
  ZX: '978',
};

/**
 * Législatives par département et par bloc (phase 13) : 2024 (résultats officiels du jeu de
 * règles) ou scrutin simulé de la partie, regroupés par les fonctions partagées avec le moteur ;
 * régions additionnées, territoires sans département rangés hors carte.
 */
export function legislativeSource(
  state: GameState,
  ruleset: Ruleset,
  source: Extract<ResultSource, { kind: 'legislatives' }>,
): SourceData | null {
  const legislatives = state.legislatives;
  const blocs = ruleset.legislatives.blocs;
  const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  // Camp du joueur : le bloc le plus proche de son candidat (règle du moteur, partagée).
  const camp = player ? closestBloc(ruleset, player.candidate.positionnement) : null;
  let byDepartment: Map<string, LegislativeDepartment>;
  const circonscriptions = new Map<string, LegislativeDistrict[]>();
  const names = new Map(ruleset.legislatives2024.circonscriptions.map((d) => [d.code, d.libelle]));
  const add = (departement: string, district: LegislativeDistrict) =>
    circonscriptions.set(departement, [...(circonscriptions.get(departement) ?? []), district]);
  const best = (voix: Record<string, number>) =>
    Object.entries(voix).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (source.scrutin === 'reelles-2024') {
    byDepartment = realLegislativeDepartments(ruleset);
    const blocOf = new Map(blocs.flatMap((b) => b.nuances.map((n) => [n, b.id])));
    for (const d of ruleset.legislatives2024.circonscriptions) {
      const voix: Record<string, number> = {};
      for (const [nuance, n] of Object.entries(d.voix)) {
        const bloc = blocOf.get(nuance);
        if (bloc) voix[bloc] = (voix[bloc] ?? 0) + n;
      }
      const top = best(voix);
      const elected = blocOf.get(d.elu.nuance);
      add(d.departement, {
        code: d.code,
        libelle: d.libelle,
        tete: top ? { bloc: top[0], part: top[1] / Math.max(1, d.exprimes) } : null,
        elu: elected ? { bloc: elected, tour: d.elu.tour } : null,
      });
    }
  } else {
    const districts =
      source.scrutin === 'en-cours'
        ? legislatives?.premierTour
        : legislatives?.derniere.circonscriptions;
    if (!districts || districts.length === 0) return null;
    byDepartment = legislativeDepartments(districts, source.tour);
    for (const d of districts) {
      const round = source.tour === 2 ? d.t2 : d.t1;
      const top = round ? best(round.voix) : undefined;
      add(d.code.slice(0, -2), {
        code: d.code,
        libelle: names.get(d.code) ?? d.code,
        tete: top ? { bloc: top[0], part: top[1] / Math.max(1, round!.exprimes) } : null,
        elu: d.elu && (source.tour === 2 || d.tour === 1) ? { bloc: d.elu, tour: d.tour } : null,
      });
    }
  }
  const keys = blocs.map((b) => b.id);
  const toResult = (d: LegislativeDepartment): TerritoryResult => ({
    inscrits: d.inscrits,
    votants: d.votants,
    // Blancs et nuls ne sont pas distingués dans ces résultats par circonscription.
    blancs: d.votants - d.exprimes,
    nuls: 0,
    exprimes: d.exprimes,
    voix: keys.map((k) => d.voix[k] ?? 0),
  });
  const departements = new Map<string, TerritoryResult>();
  const horsCarte = new Map<string, TerritoryResult>();
  const regions = new Map<string, TerritoryResult>();
  const sieges = new Map<string, Record<string, number>>();
  const reservoir = ruleset.parrainages.reservoir.departements;
  for (const [code, d] of byDepartment) {
    const result = toResult(d);
    const region = reservoir[code]?.region;
    const offMap = OFF_MAP[code] ?? (region ? null : code);
    if (offMap !== null) {
      horsCarte.set(offMap, result);
      sieges.set(offMap, d.sieges);
      circonscriptions.set(offMap, circonscriptions.get(code) ?? []);
      continue;
    }
    departements.set(code, result);
    sieges.set(code, d.sieges);
    const total = regions.get(region!);
    regions.set(
      region!,
      total
        ? {
            inscrits: total.inscrits + result.inscrits,
            votants: total.votants + result.votants,
            blancs: total.blancs + result.blancs,
            nuls: 0,
            exprimes: total.exprimes + result.exprimes,
            voix: total.voix.map((v, i) => v + result.voix[i]!),
          }
        : { ...result, voix: [...result.voix] },
    );
  }
  return {
    source,
    nature: source.scrutin === 'reelles-2024' ? 'reel' : 'simule',
    candidats: blocs.map((b) => ({
      key: b.id,
      label: `${b.libelle}${b.id === camp ? ' (votre camp)' : ''}`,
      player: false,
    })),
    regions,
    departements,
    horsCarte,
    legislatives: { sieges, circonscriptions },
  };
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
