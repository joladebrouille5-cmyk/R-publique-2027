// Point d'entrée Cloudflare Workers (voir wrangler.jsonc). Les fichiers de l'interface sont
// servis par Cloudflare ; ce script ne reçoit que les requêtes /api/*. L'API du jeu (Fastify +
// PostgreSQL) n'est pas déployée sur Workers : la réponse est une erreur explicite au format de
// l'API, jamais une page ou une donnée simulée.

export const API_NON_DEPLOYEE = {
  error: {
    code: 'api_non_deployee',
    message:
      'Le serveur du jeu n’est pas déployé sur cet hébergement : Cloudflare Workers ne sert que l’interface. Lancez le serveur (API Fastify et base PostgreSQL) pour jouer.',
  },
};

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (request: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return Response.json(API_NON_DEPLOYEE, {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
