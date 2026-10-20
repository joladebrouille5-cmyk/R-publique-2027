import { ApiErrorSchema } from '@r2027/shared';
import type { z } from 'zod';

/** Erreur renvoyée par l'API (code métier + message en français), ou serveur injoignable. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'serveur_injoignable', 'Impossible de joindre le serveur.');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiRequestError(
      response.status,
      'erreur_http',
      `Erreur du serveur (${response.status}).`,
    );
  }
  // Le contrat est vérifié à la réception : une réponse inattendue n'est jamais affichée telle quelle.
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiRequestError(
      response.status,
      'reponse_invalide',
      'Réponse du serveur inattendue.',
    );
  }
  return parsed.data;
}

export const api = {
  get: <T>(path: string, schema: z.ZodType<T>) => request('GET', path, schema),
  post: <T>(path: string, schema: z.ZodType<T>, body: unknown = {}) =>
    request('POST', path, schema, body),
};
