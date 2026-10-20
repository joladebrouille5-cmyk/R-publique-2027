import type { GameDetail, SaveSummary } from '@r2027/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../routes';

export const GAME_ID = '11111111-1111-4111-8111-111111111111';

export function gameFixture(overrides: Partial<GameDetail> = {}): GameDetail {
  return {
    id: GAME_ID,
    name: 'Partie de test',
    mode: 'candidat_personnalise',
    difficulty: 'standard',
    phase: 'campagne',
    week: 0,
    date: '2026-09-28',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    seed: 'graine-test',
    engineVersion: '0.1.0',
    rulesetVersion: 'socle@0.1.0',
    saveSchemaVersion: 1,
    version: 3,
    stateHash: 'a'.repeat(64),
    state: {
      meta: {
        seed: 'graine-test',
        week: 0,
        date: '2026-09-28',
        startDate: '2026-09-28',
        phase: 'campagne',
        difficulty: 'standard',
        engineVersion: '0.1.0',
        rulesetVersion: 'socle@0.1.0',
        saveSchemaVersion: 1,
      },
      rng: { algorithm: 'sfc32', state: [1, 2, 3, 13] },
      player: { mode: 'candidat_personnalise', actorId: null },
    },
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
    engineVersion: '0.1.0',
    saveSchemaVersion: 1,
    createdAt: '2026-10-20T10:05:00.000Z',
    ...overrides,
  };
}

type Handler = (body: unknown) => { status?: number; body: unknown };
export type FetchCall = { method: string; url: string; body: unknown };

/** Remplace `fetch` par un faux serveur : clé « MÉTHODE /chemin ». */
export function mockApi(handlers: Record<string, Handler>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
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
