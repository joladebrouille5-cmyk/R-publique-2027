import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est obligatoire'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit contenir au moins 32 caractères'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Référentiel cartographique (sinon : import complet de data/processed, puis démonstration). */
  GEO_DATA_DIR: z.string().min(1).optional(),
  /** Derrière un reverse proxy (hébergement), pour obtenir la vraie IP du client. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `- ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Configuration invalide (voir .env.example) :\n${problems}`);
  }
  return result.data;
}
