import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';

// Phase 8 : configuration de production durcie (secret d'exemple refusé, proxy de confiance).

const base = {
  DATABASE_URL: 'postgresql://localhost/r2027',
  SESSION_SECRET: 'une-valeur-aleatoire-de-test-0123456789-abcdef',
};
const EXAMPLE_SECRET = 'remplacer-par-une-valeur-aleatoire-d-au-moins-32-caracteres';

describe('configuration', () => {
  it('refuse en production le secret d’exemple de .env.example', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', SESSION_SECRET: EXAMPLE_SECRET }),
    ).toThrow(ConfigError);
    expect(loadConfig({ ...base, SESSION_SECRET: EXAMPLE_SECRET }).NODE_ENV).toBe('development');
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('lit la confiance accordée au reverse proxy', () => {
    expect(loadConfig(base).TRUST_PROXY).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadConfig({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(loadConfig({ ...base, TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).TRUST_PROXY).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
    ]);
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'n’importe quoi' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, TRUST_PROXY: '0' })).toThrow(ConfigError);
  });

  it('applique une limite propre aux écritures', () => {
    expect(loadConfig(base).RATE_LIMIT_WRITE_MAX).toBe(60);
    expect(loadConfig({ ...base, RATE_LIMIT_WRITE_MAX: '5' }).RATE_LIMIT_WRITE_MAX).toBe(5);
  });
});
