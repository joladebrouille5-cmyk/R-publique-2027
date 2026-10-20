import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export type Database = PrismaClient;

export function createDatabase(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Les colonnes `DATE` sont lues à minuit UTC : on reste en dates ISO AAAA-MM-JJ. */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
