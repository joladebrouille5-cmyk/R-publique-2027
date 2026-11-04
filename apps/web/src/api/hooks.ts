import {
  cycleRuleset,
  AdvanceResponseSchema,
  GameDetailSchema,
  GameSummarySchema,
  HealthResponseSchema,
  IDEMPOTENCY_HEADER,
  JournalPageSchema,
  ProgressionSchema,
  RulesetSchema,
  SaveSummarySchema,
  SupportProspectsSchema,
  type AdvanceRequest,
  type CreateGameRequest,
  type CreateSaveRequest,
  type Cycle,
  type DebateRequest,
  type Ruleset,
} from '@r2027/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from './client';

export const queryKeys = {
  health: ['health'] as const,
  games: ['games'] as const,
  game: (id: string) => ['games', id] as const,
  saves: (id: string) => ['games', id, 'saves'] as const,
  journal: (id: string) => ['games', id, 'journal'] as const,
  supports: (id: string, week: number) => ['games', id, 'soutiens', week] as const,
  ruleset: (key: string) => ['rulesets', key] as const,
  progression: ['progression'] as const,
};

/** Palmarès, niveau, déblocages et défi du jour (phase 20), calculés par le serveur. */
export function useProgression() {
  return useQuery({
    queryKey: queryKeys.progression,
    queryFn: () => api.get('/api/progression', ProgressionSchema),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.get('/api/health', HealthResponseSchema),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useGames() {
  return useQuery({
    queryKey: queryKeys.games,
    queryFn: () => api.get('/api/games', GameSummarySchema.array()),
  });
}

export function useGame(gameId: string) {
  return useQuery({
    queryKey: queryKeys.game(gameId),
    queryFn: () => api.get(`/api/games/${gameId}`, GameDetailSchema),
  });
}

export function useSaves(gameId: string) {
  return useQuery({
    queryKey: queryKeys.saves(gameId),
    queryFn: () => api.get(`/api/games/${gameId}/saves`, SaveSummarySchema.array()),
  });
}

/** Jeu de règles de la partie (catalogue d'actions, calendrier sourcé), servi par l'API. */
/**
 * Jeu de règles d'une partie. Avec le cycle électoral de la partie, le calendrier de campagne
 * est celui de ce cycle (2027, puis transposé pour 2032…), exactement comme pour le moteur.
 */
export function useRuleset(key: string, cycle?: Cycle) {
  return useQuery({
    queryKey: queryKeys.ruleset(key),
    queryFn: () => api.get(`/api/rulesets/${encodeURIComponent(key)}`, RulesetSchema),
    // Clé vide : la partie n'est pas encore chargée, rien à demander.
    enabled: key !== '',
    staleTime: Infinity,
    select: (ruleset: Ruleset) => (cycle ? cycleRuleset(ruleset, cycle) : ruleset),
  });
}

/** Jeu de règles des nouvelles parties (profils de départ, électorat, adversaires). */
export function useCurrentRuleset() {
  return useQuery({
    queryKey: queryKeys.ruleset('courant'),
    queryFn: () => api.get('/api/rulesets/courant', RulesetSchema),
    staleTime: Infinity,
  });
}

/**
 * Vivier des négociations de soutien du candidat du joueur (phase 15), calculé par le serveur
 * (ou le moteur local) pour la semaine en cours : l'interface l'affiche sans rien recalculer.
 */
export function useSupports(gameId: string, week: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.supports(gameId, week),
    queryFn: () => api.get(`/api/games/${gameId}/soutiens`, SupportProspectsSchema),
    enabled,
    staleTime: Infinity,
  });
}

export function useJournal(gameId: string, pageSize = 10) {
  return useInfiniteQuery({
    queryKey: queryKeys.journal(gameId),
    queryFn: ({ pageParam }) =>
      api.get(
        `/api/games/${gameId}/journal?limit=${pageSize}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
        JournalPageSchema,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextBefore,
  });
}

export function useCreateGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGameRequest) => api.post('/api/games', GameDetailSchema, body),
    onSuccess: (game) => {
      queryClient.setQueryData(queryKeys.game(game.id), game);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games, exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.progression });
    },
  });
}

export function useImportGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (document: unknown) => api.post('/api/games/import', GameDetailSchema, document),
    onSuccess: (game) => {
      queryClient.setQueryData(queryKeys.game(game.id), game);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games, exact: true });
    },
  });
}

export function useCreateSave(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSaveRequest) =>
      api.post(`/api/games/${gameId}/saves`, SaveSummarySchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saves(gameId) }),
  });
}

export function useRestoreSave(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saveId, expectedVersion }: { saveId: string; expectedVersion: number }) =>
      api.post(`/api/games/${gameId}/saves/${saveId}/restore`, GameDetailSchema, {
        expectedVersion,
      }),
    onSuccess: (game) => {
      queryClient.setQueryData(queryKeys.game(gameId), game);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games, exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.journal(gameId) });
    },
  });
}

export type AdvanceVariables = { body: AdvanceRequest; idempotencyKey: string };

/**
 * Semaine suivante. En cas de coupure réseau, la requête est renvoyée avec la MÊME clé :
 * le serveur ne fait avancer la partie qu'une fois.
 */
export function useAdvance(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: AdvanceVariables) =>
      api.post(`/api/games/${gameId}/advance`, AdvanceResponseSchema, body, {
        [IDEMPOTENCY_HEADER]: idempotencyKey,
      }),
    retry: (failures, error) =>
      failures < 2 && error instanceof ApiRequestError && error.code === 'serveur_injoignable',
    onSuccess: ({ game }) => {
      queryClient.setQueryData(queryKeys.game(gameId), game);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games, exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.saves(gameId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.journal(gameId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.progression });
    },
  });
}

/**
 * Débat télévisé de la semaine (phase 10) : ouvrir, refuser, jouer une carte, simuler la fin.
 * Le serveur (ou le moteur local) joue la demande ; l'interface ne calcule rien.
 */
export function useDebate(gameId: string, debatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DebateRequest) =>
      api.post(`/api/games/${gameId}/debats/${debatId}`, GameDetailSchema, body),
    onSuccess: (game) => {
      queryClient.setQueryData(queryKeys.game(gameId), game);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games, exact: true });
    },
  });
}
