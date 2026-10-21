import { defineConfig, devices } from '@playwright/test';

// Application mobile hors ligne (phase 8) : le paquet construit pour Android (apps/mobile/dist)
// est servi tel quel, sans API ni base ; tout le réseau est coupé dans les scénarios.
const PORT = 4174;

export default defineConfig({
  testDir: './apps/mobile/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [{ name: 'android-hors-ligne', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `pnpm --filter @r2027/mobile build && pnpm --filter @r2027/mobile exec vite preview --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
