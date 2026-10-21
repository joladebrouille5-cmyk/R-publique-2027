import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { contentSecurityPolicy } from './csp.ts';

// Le fichier .env est à la racine du dépôt (partagé avec l'API).
const ENV_DIR = '../..';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const apiTarget = `http://127.0.0.1:${env.API_PORT ?? '3001'}`;
  const proxy = { '/api': { target: apiTarget, changeOrigin: false } };
  return {
    envDir: ENV_DIR,
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  };
});
