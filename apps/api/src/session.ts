import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from './db';

// Session anonyme : un cookie signé (HttpOnly, SameSite=Lax) porte l'identifiant d'un
// utilisateur créé à la première écriture (une simple lecture n'en crée pas). Les comptes avec
// authentification sont une décision ouverte (Q5 du plan de développement).

export const SESSION_COOKIE = 'r2027_session';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UuidSchema = z.uuid();

export type SessionOptions = { secureCookie: boolean };

/** Utilisateur du cookie de session s'il existe, sans en créer (lectures). */
export async function existingUserId(
  db: Database,
  request: FastifyRequest,
): Promise<string | null> {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !UuidSchema.safeParse(unsigned.value).success) return null;
  const user = await db.user.findUnique({ where: { id: unsigned.value! } });
  return user?.id ?? null;
}

/** Utilisateur de la session, créé à la première écriture (cookie posé à ce moment). */
export async function resolveUserId(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  options: SessionOptions,
): Promise<string> {
  const existing = await existingUserId(db, request);
  if (existing) return existing;
  const user = await db.user.create({ data: {} });
  reply.setCookie(SESSION_COOKIE, user.id, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secureCookie,
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return user.id;
}
