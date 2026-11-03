import type { RealPersonality } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { ErrorMessage } from '../../components/ErrorMessage';
import {
  CandidacyLine,
  PersonalityPhoto,
  SIMULATION_NOTICE,
} from '../../components/RealPersonality';
import { optionTile, radio } from '../../components/ui';
import { describePosition, formatGameDate, POSITION_METHOD_LABELS } from '../../labels';

/**
 * Choix de la personnalité réelle incarnée (mode « candidat réel ») : candidatures déclarées
 * retenues, photo, position et son statut (sources et crédits : Paramètres → Crédits).
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
      {/* Le titre du chapitre est visible au-dessus ; la légende nomme le groupe. */}
      <legend className="sr-only">Personnalité incarnée</legend>
      <p className="text-sm text-encre-2">
        Candidatures déclarées à la présidentielle de 2027, relevées le {formatGameDate(verifieLe)}{' '}
        et retenues pour le jeu. {SIMULATION_NOTICE} Sources et crédits des photos : Paramètres.
      </p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {personnalites.map((p: RealPersonality) => (
          <li key={p.id}>
            <label className={`${optionTile} h-full`}>
              <input
                type="radio"
                name="personnalite"
                value={p.id}
                checked={value === p.id}
                onChange={() => onChange(p.id)}
                className={`${radio} self-start`}
                aria-describedby={`fiche-${p.id}`}
              />
              <PersonalityPhoto personality={p} ruleset={ruleset.data} size="sm" />
              <span className="min-w-0 space-y-1">
                <span className="block font-semibold">
                  {p.prenom} {p.nom}
                </span>
                <span id={`fiche-${p.id}`} className="block space-y-1 text-xs">
                  <span className="block">{p.parti}</span>
                  <span className="block text-encre-2">
                    {describePosition(p.position)} — {POSITION_METHOD_LABELS[p.position.methode]}
                  </span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {value && (
        <div
          className="space-y-1 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-white/[0.04]"
          aria-live="polite"
        >
          {(() => {
            const chosen = personnalites.find((p) => p.id === value);
            return chosen ? <CandidacyLine personality={chosen} /> : null;
          })()}
        </div>
      )}
      {nonIntegrees.length > 0 && (
        <details className="text-xs text-encre-2">
          <summary className="cursor-pointer">
            {nonIntegrees.length} autres candidatures déclarées, non intégrées
          </summary>
          <p className="mt-1">
            {nonIntegrees.map((n) => `${n.prenom} ${n.nom} (${n.parti})`).join(', ')} : aucun de
            leurs partis n’a de position estimée pour placer les candidats.
          </p>
        </details>
      )}
    </fieldset>
  );
}
