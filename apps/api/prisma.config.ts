import { defineConfig } from 'prisma/config';
import { loadRootEnv } from './src/env-file';

loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` n'a pas besoin de base : l'URL n'est exigée que pour les migrations.
  datasource: { url: process.env.DATABASE_URL },
});
