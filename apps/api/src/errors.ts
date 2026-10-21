/** Erreur métier renvoyée telle quelle au client, au format `ApiError`. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message: string) => new HttpError(404, 'introuvable', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
