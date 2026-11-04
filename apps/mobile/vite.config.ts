import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentSecurityPolicy } from '../web/csp.ts';

// Application mobile (phase 8) : mêmes écrans que apps/web, même dossier public (images des
// personnalités et des médias), mais le moteur tourne dans l'application (@r2027/local-api).
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  publicDir: '../web/public',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
