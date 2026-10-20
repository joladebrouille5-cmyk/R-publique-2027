import {
  GameDetailSchema,
  GameSummarySchema,
  HealthResponseSchema,
  SaveSummarySchema,
  type CreateGameRequest,
  type CreateSaveRequest,
} from '@r2027/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  health: ['health'] as const,
  games: ['games'] as const,
  game: (id: string) => ['games', id] as const,
  saves: (id: string) => ['games', id, 'saves'] as const,
};

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

export function useCreateGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGameRequest) => api.post('/api/games', GameDetailSchema, body),
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
    },
  });
}
