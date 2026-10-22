import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { screenTitle } from '../components/ui';

export function NotFound() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <h1 className={screenTitle}>Page introuvable</h1>
      <Link to="/" className="text-republique-600 underline dark:text-republique-100">
        Retour à l’accueil
      </Link>
    </div>
  );
}

/** Erreur de rendu ou de routage : affichée explicitement, jamais masquée. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Erreur inconnue';
  return (
    <div role="alert" className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <h1 className={screenTitle}>Une erreur est survenue</h1>
      <p className="font-mono text-sm">{message}</p>
      <a href="/" className="text-republique-600 underline">
        Recharger l’accueil
      </a>
    </div>
  );
}
