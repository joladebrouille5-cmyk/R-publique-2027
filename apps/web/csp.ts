import type { Plugin } from 'vite';

// Politique de sécurité du contenu de l'interface construite (web et application Android) :
// seuls les fichiers de l'application sont chargés, aucune connexion vers une autre origine,
// aucun script en ligne ni distant ; MapLibre crée ses workers et ses images en « blob: ».
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Ajoute la politique au paquet construit seulement : le serveur de développement de Vite
 * injecte lui-même des scripts en ligne (rechargement à chaud).
 */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'r2027-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}
