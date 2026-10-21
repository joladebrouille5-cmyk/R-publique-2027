import { z } from 'zod';

/** Valeur d'exemple de `.env.example` : publique, donc refusée en production. */
const EXAMPLE_SECRET_PREFIX = 'remplacer-';

/**
 * Confiance accordée au reverse proxy (en-tête X-Forwarded-For) : `false` (aucun proxy),
 * `true` (tous les intermédiaires, à éviter si le proxy n'écrase pas l'en-tête), un nombre
 * d'intermédiaires, ou une liste d'adresses ou de plages (« 10.0.0.0/8,127.0.0.1 »).
 */
const TrustProxySchema = z
  .string()
  .trim()
  .min(1)
  .default('false')
  .transform((value): boolean | number | string[] => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return Number(value);
    return value.split(',').map((entry) => entry.trim());
  })
  .refine((value) => typeof value !== 'number' || (value >= 1 && value <= 10), {
    message: 'nombre d’intermédiaires entre 1 et 10',
  })
  .refine(
    (value) => !Array.isArray(value) || value.every((entry) => /^[0-9a-fA-F.:/]+$/.test(entry)),
    {
      message:
        'true, false, un nombre d’intermédiaires ou une liste d’adresses IP ou de plages CIDR',
    },
  );

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL est obligatoire'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit contenir au moins 32 caractères'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Référentiel cartographique (sinon : import complet de data/processed, puis démonstration). */
    GEO_DATA_DIR: z.string().min(1).optional(),
    /** Résultats historiques importés (sinon data/processed/resultats/presidentielle-2022). */
    RESULTS_DATA_DIR: z.string().min(1).optional(),
    /** Écritures coûteuses (création, import, progression) : requêtes par minute et par IP. */
    RATE_LIMIT_WRITE_MAX: z.coerce.number().int().positive().default(60),
    /** Derrière un reverse proxy (hébergement), pour obtenir la vraie IP du client. */
    TRUST_PROXY: TrustProxySchema,
  })
  .refine(
    (config) =>
      config.NODE_ENV !== 'production' || !config.SESSION_SECRET.startsWith(EXAMPLE_SECRET_PREFIX),
    {
      path: ['SESSION_SECRET'],
      message:
        'valeur d’exemple de .env.example refusée en production (générer : openssl rand -base64 48)',
    },
  );

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
