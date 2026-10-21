import type { RealPersonality } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { ErrorMessage } from '../../components/ErrorMessage';
import {
  CandidacyLine,
  PersonalityPhoto,
  PhotoCreditLine,
  SIMULATION_NOTICE,
} from '../../components/RealPersonality';
import { label } from '../../components/ui';
import { describePosition, formatGameDate, POSITION_METHOD_LABELS } from '../../labels';

/**
 * Choix de la personnalité réelle incarnée (mode « candidat réel ») : candidatures déclarées
 * retenues, fiche sourcée, photo créditée, position estimée et sa méthode.
 */
export function PersonalityPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const ruleset = useCurrentRuleset();
  if (ruleset.isError)
    return <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />;
  if (!ruleset.data) return <p>Chargement des personnalités…</p>;
  const { personnalites, verifieLe, nonIntegrees } = ruleset.data.personnalites;
  return (
    <fieldset className="space-y-3">
      <legend className={label}>Personnalité incarnée</legend>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Candidatures déclarées à la présidentielle de 2027, relevées le {formatGameDate(verifieLe)}{' '}
        et retenues pour le jeu (position d’après l’enquête d’experts Chapel Hill).{' '}
        {SIMULATION_NOTICE}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {personnalites.map((p: RealPersonality) => (
          <li key={p.id}>
            <label
              className={`flex h-full cursor-pointer gap-3 rounded-lg border p-3 ${
                value === p.id
                  ? 'border-blue-600 ring-2 ring-blue-600/30'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <input
                type="radio"
                name="personnalite"
                value={p.id}
                checked={value === p.id}
                onChange={() => onChange(p.id)}
                className="mt-1 self-start"
                aria-describedby={`fiche-${p.id}`}
              />
              <PersonalityPhoto personality={p} size="sm" />
              <span className="min-w-0 space-y-1">
                <span className="block font-medium">
                  {p.prenom} {p.nom}
                </span>
                <span id={`fiche-${p.id}`} className="block space-y-1 text-xs">
                  <span className="block">{p.parti}</span>
                  <span className="block text-slate-600 dark:text-slate-400">
                    {describePosition(p.position)} — {POSITION_METHOD_LABELS[p.position.methode]}
                  </span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {value && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-900" aria-live="polite">
          {(() => {
            const chosen = personnalites.find((p) => p.id === value);
            return chosen ? (
              <>
                <CandidacyLine personality={chosen} />
                <PhotoCreditLine personality={chosen} />
              </>
            ) : null;
          })()}
        </div>
      )}
      <details className="text-xs text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer">Crédits des photos</summary>
        <ul className="mt-1 space-y-1">
          {personnalites.map((p) => (
            <li key={p.id}>
              <span className="font-medium">
                {p.prenom} {p.nom} —{' '}
              </span>
              <PhotoCreditLine personality={p} />
            </li>
          ))}
        </ul>
      </details>
      {nonIntegrees.length > 0 && (
        <details className="text-xs text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer">
            {nonIntegrees.length} autres candidatures déclarées, non intégrées
          </summary>
          <p className="mt-1">
            {nonIntegrees.map((n) => `${n.prenom} ${n.nom} (${n.parti})`).join(', ')} : aucun de
            leurs partis n’est noté par l’enquête d’experts utilisée pour placer les candidats.
          </p>
        </details>
      )}
    </fieldset>
  );
}
