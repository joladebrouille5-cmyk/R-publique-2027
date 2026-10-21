import { ApiRequestError } from '../api/client';
import { buttonSecondary } from './ui';

type Props = { error: unknown; onRetry?: () => void };

export function ErrorMessage({ error, onRetry }: Props) {
  const message =
    error instanceof ApiRequestError ? error.message : 'Une erreur inattendue est survenue.';
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    >
      <p>{message}</p>
      {onRetry && (
        <button type="button" className={`${buttonSecondary} mt-3`} onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
