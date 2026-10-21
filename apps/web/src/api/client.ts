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

/** Requête transmise au transport : le serveur HTTP, ou le moteur local de l'application mobile. */
export type ApiTransportRequest = {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};
export type ApiTransportResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};
export type ApiTransport = (request: ApiTransportRequest) => Promise<ApiTransportResponse>;

/** Transport par défaut : l'API HTTP du serveur (même origine). */
const fetchTransport: ApiTransport = async ({ method, url, headers, body }) => {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  return {
    status: response.status,
    body: payload,
    headers: Object.fromEntries(response.headers.entries()),
  };
};

let transport: ApiTransport = fetchTransport;

/**
 * Remplace le transport (application mobile hors ligne : moteur et stockage sur l'appareil,
 * même contrat que l'API). L'interface ne calcule jamais l'état elle-même.
 */
export function setApiTransport(next: ApiTransport): void {
  transport = next;
}

async function send(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiTransportResponse> {
  let response: ApiTransportResponse;
  try {
    response = await transport({
      method,
      url: path,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body }),
    });
  } catch {
    throw new ApiRequestError(0, 'serveur_injoignable', 'Impossible de joindre le serveur.');
  }
  if (response.status < 200 || response.status >= 300) {
    const parsed = ApiErrorSchema.safeParse(response.body);
    if (parsed.success) {
      throw new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiRequestError(
      response.status,
      'erreur_http',
      `Erreur du serveur (${response.status}).`,
    );
  }
  return response;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await send(method, path, body, extraHeaders);
  // Le contrat est vérifié à la réception : une réponse inattendue n'est jamais affichée telle quelle.
  const parsed = schema.safeParse(response.body);
  if (!parsed.success) {
    throw new ApiRequestError(
      response.status,
      'reponse_invalide',
      'Réponse du serveur inattendue.',
    );
  }
  return parsed.data;
}

/** Nom de fichier d'un en-tête « content-disposition: attachment; filename="…" ». */
function attachmentName(headers: Record<string, string>): string | null {
  const disposition = headers['content-disposition'] ?? headers['Content-Disposition'] ?? '';
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
}

export const api = {
  get: <T>(path: string, schema: z.ZodType<T>) => request('GET', path, schema),
  /** Fichier à enregistrer (export de partie) : contenu JSON et nom proposé. */
  file: async (path: string) => {
    const response = await send('GET', path);
    return { body: response.body, fileName: attachmentName(response.headers) };
  },
  post: <T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown = {},
    headers: Record<string, string> = {},
  ) => request('POST', path, schema, body, headers),
};

/**
 * Clé d'idempotence d'une tentative de progression. `crypto.getRandomValues` reste disponible
 * hors contexte sécurisé (test depuis un téléphone en http sur le réseau local), contrairement
 * à `crypto.randomUUID`.
 */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
