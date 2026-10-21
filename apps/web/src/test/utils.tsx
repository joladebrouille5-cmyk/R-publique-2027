import {
  advanceWeek,
  createGame,
  ENGINE_VERSION,
  presentationWindow,
  SAVE_SCHEMA_VERSION,
} from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import type { GameDetail, GameState, SaveSummary, WeeklyReport } from '@r2027/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../routes';

export const GAME_ID = '11111111-1111-4111-8111-111111111111';
export const RULESET_KEY = CURRENT_RULESET_KEY;
export const RULESET = getRuleset(RULESET_KEY);
export const RULESET_URL = `/api/rulesets/${encodeURIComponent(RULESET_KEY)}`;
export const rulesetHandler: Handler = () => ({ body: RULESET });

export const TEST_CANDIDATE = {
  prenom: 'Camille',
  nom: 'Test',
  parti: 'Parti du test',
  positionnement: { economie: 0, societe: 0 },
};

/** État initial produit par le vrai moteur (candidat du joueur et adversaires fictifs). */
export function initialState(
  mode: 'candidat_personnalise' | 'observateur' = 'candidat_personnalise',
): GameState {
  return createGame(
    {
      seed: 'graine-test',
      mode,
      difficulty: 'standard',
      ...(mode === 'observateur' ? {} : { candidate: TEST_CANDIDATE }),
    },
    RULESET,
  );
}

const DEPARTEMENTS = Object.keys(RULESET.parrainages.reservoir.departements).sort();

/**
 * Plan par défaut des états de test : deux rencontres d'élus par semaine tant que les
 * présentations sont ouvertes, pour que le candidat du joueur figure au premier tour.
 */
function sponsorship(state: GameState) {
  const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  if (!player || player.status !== 'candidat') return [];
  if (presentationWindow(state.meta.date, RULESET).closed) return [];
  return [0, 1].map((k) => ({
    actionId: 'elus-locaux',
    cible: DEPARTEMENTS[(state.meta.week * 2 + k) % DEPARTEMENTS.length]!,
  }));
}

/** Fait avancer le vrai moteur jusqu'à `done(state)` (décisions par défaut, parrainages). */
export function playedState(
  done: (state: GameState) => boolean,
  start = initialState(),
): GameState {
  let state = start;
  for (let i = 0; i < 80 && !done(state) && !state.calendar.blockedBy; i++) {
    const decisions = state.pendingDecisions.map((d) => ({
      decisionId: d.id,
      optionId: d.defaultOptionId,
    }));
    state = advanceWeek(
      state,
      { actions: sponsorship(state), decisions },
      { ruleset: RULESET },
    ).state;
  }
  return state;
}

export function gameFixture(
  overrides: Partial<GameDetail> = {},
  state: GameState = initialState(),
): GameDetail {
  return {
    id: GAME_ID,
    name: 'Partie de test',
    mode: state.player.mode,
    difficulty: 'standard',
    phase: state.meta.phase,
    week: state.meta.week,
    date: state.meta.date,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    seed: 'graine-test',
    engineVersion: ENGINE_VERSION,
    rulesetVersion: RULESET_KEY,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    version: 3,
    stateHash: 'a'.repeat(64),
    state,
    ...overrides,
  };
}

export function saveFixture(overrides: Partial<SaveSummary> = {}): SaveSummary {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'manuelle',
    slot: 2,
    label: 'Avant le débat',
    week: 0,
    date: '2026-09-28',
    stateHash: 'a'.repeat(64),
    engineVersion: ENGINE_VERSION,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: '2026-10-20T10:05:00.000Z',
    ...overrides,
  };
}

type Handler = (body: unknown) => { status?: number; body: unknown };
export type FetchCall = {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
};

/** Remplace `fetch` par un faux serveur : clé « MÉTHODE /chemin ». */
export function mockApi(handlers: Record<string, Handler>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ method, url, body, headers });
      const handler = handlers[`${method} ${url}`];
      if (!handler) {
        return new Response(JSON.stringify({ error: { code: 'introuvable', message: url } }), {
          status: 404,
        });
      }
      const result = handler(body);
      return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
    }),
  );
  return calls;
}

export const healthHandler: Handler = () => ({
  body: {
    status: 'ok',
    database: 'ok',
    versions: { api: '0.1.0', engine: '0.1.0', saveSchema: 1 },
  },
});

export function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

export function reportFixture(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    week: 0,
    date: '2026-09-28',
    nextWeek: 1,
    nextDate: '2026-10-05',
    steps: Array.from({ length: 12 }, (_, i) => ({
      step: i + 1,
      module: 'test',
      label: `Étape ${i + 1}`,
      active: ![3, 4, 7, 8].includes(i + 1),
      summary: [3, 4, 7, 8].includes(i + 1) ? 'phase 3' : 'ok',
    })),
    actions: [
      {
        actorId: 'joueur',
        index: 0,
        actionId: 'meeting',
        label: 'Meeting public',
        status: 'validee',
        reason: null,
        cible: null,
        cost: { budgetCentimes: 12_000_000, tempsHeures: 8 },
      },
    ],
    changes: [
      {
        actorId: 'joueur',
        ressource: 'budgetCentimes',
        before: 300_000_000,
        after: 288_000_000,
        factors: [
          { label: 'Meeting public : coût', value: -12_000_000, source: 'action', step: 2 },
        ],
      },
    ],
    events: [],
    decisions: [],
    notices: [],
    blocked: null,
    intentions: null,
    polls: [],
    election: null,
    phaseChange: null,
    programme: [],
    parrainages: [],
    finances: [],
    relations: [],
    alliances: [],
    strategies: [],
    economie: [],
    ...overrides,
  };
}
