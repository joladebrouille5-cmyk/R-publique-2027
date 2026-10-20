import { BaselineMismatchError, communeResults, type TerritorialBaseline } from '@r2027/engine';
import { getRuleset } from '@r2027/rulesets';
import {
  type CommuneResultsResponse,
  type HistoricalCommunes,
  type HistoricalOverview,
  type HistoricalStatus,
  type Ruleset,
} from '@r2027/shared';
import type { Database } from '../db';
import { HttpError } from '../errors';
import type { ElectoralRepository } from './electoral';
import type { GeoRepository } from './geo';
import { loadOwnedGame } from './state';

/** Résultats simulés des communes d'un département, recalculés à partir du tour enregistré. */
export async function communeResultsOf(
  db: Database,
  userId: string,
  gameId: string,
  tour: 1 | 2,
  departement: string,
  territoryFor: (ruleset: Ruleset) => TerritorialBaseline,
): Promise<CommuneResultsResponse> {
  const { state } = await loadOwnedGame(db, userId, gameId);
  const result = tour === 1 ? state.elections.t1 : state.elections.t2;
  if (!result)
    throw new HttpError(
      404,
      'tour_non_depouille',
      `Le ${tour === 1 ? 'premier' : 'second'} tour n’a pas encore eu lieu.`,
    );
  const ruleset = getRuleset(state.meta.rulesetVersion);
  const baseline = territoryFor(ruleset);
  try {
    const communes = communeResults(result, baseline, ruleset, departement);
    return { tour, departement, nature: baseline.nature, communes: Object.fromEntries(communes) };
  } catch (error) {
    if (error instanceof BaselineMismatchError)
      throw new HttpError(409, 'base_differente', error.message);
    throw error;
  }
}

export function historicalStatus(electoral: ElectoralRepository): HistoricalStatus {
  const history = electoral.history;
  if (!history) {
    return {
      disponible: false,
      raison:
        'Résultats 2022 non chargés : ils sont importés localement avec le référentiel complet (« pnpm data:geo » puis « pnpm data:resultats ») et ne sont pas redistribués (licence non précisée, question Q8).',
    };
  }
  return {
    disponible: true,
    election: history.t1.election,
    tours: [history.t1, history.t2].map((r) => ({
      tour: r.tour,
      date: r.date,
      candidats: r.candidats,
      proclamation: { reference: r.proclamation.reference, url: r.proclamation.url },
    })),
    sources: history.t1.sources.concat(
      history.t2.sources.filter((s) => !history.t1.sources.some((t) => t.id === s.id)),
    ),
  };
}

const sum = (target: number[] | undefined, values: readonly number[]) =>
  target ? target.map((v, i) => v + values[i]!) : [...values];

function roundOf(electoral: ElectoralRepository, tour: 1 | 2) {
  const history = electoral.history;
  if (!history) {
    const status = historicalStatus(electoral);
    throw new HttpError(
      404,
      'historique_indisponible',
      status.disponible ? 'Indisponible' : status.raison,
    );
  }
  return tour === 1 ? history.t1 : history.t2;
}

/** Agrégats exacts des résultats réels par département, région et territoire hors carte. */
export function historicalValues(
  electoral: ElectoralRepository,
  geo: GeoRepository,
  tour: 1 | 2,
  departement: null,
): HistoricalOverview;
export function historicalValues(
  electoral: ElectoralRepository,
  geo: GeoRepository,
  tour: 1 | 2,
  departement: string,
): HistoricalCommunes;
export function historicalValues(
  electoral: ElectoralRepository,
  geo: GeoRepository,
  tour: 1 | 2,
  departement: string | null,
): HistoricalOverview | HistoricalCommunes {
  const round = roundOf(electoral, tour);
  const index = geo.index;
  if (departement !== null) {
    const codes = index.filter((e) => e[2] === departement).map((e) => e[0]);
    if (codes.length === 0)
      throw new HttpError(404, 'introuvable', `Département inconnu : ${departement}`);
    return {
      tour,
      nature: 'reel',
      departement,
      communes: Object.fromEntries(codes.map((code) => [code, round.communes[code]!])),
      estimations: round.estimations.filter((code) => codes.includes(code)),
    };
  }
  const departements: Record<string, number[]> = {};
  const regions: Record<string, number[]> = {};
  for (const [code, , dep, reg] of index) {
    departements[dep] = sum(departements[dep], round.communes[code]!);
    regions[reg] = sum(regions[reg], round.communes[code]!);
  }
  const horsCarte = Object.fromEntries(
    Object.entries(round.horsCarte).map(([code, area]) => [code, area.valeurs]),
  );
  return { tour, nature: 'reel', departements, regions, horsCarte };
}
