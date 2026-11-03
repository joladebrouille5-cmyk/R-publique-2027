import {
  plateauFormat,
  type ActionDefinition,
  type PlannedAction,
  type Posture,
  type Ruleset,
} from '@r2027/shared';
import { useId } from 'react';

export { isPlateau } from '@r2027/shared';

/** Adéquation d'une posture au format, d'après le jeu de règles (centièmes, hypothèses). */
function fit(affinity: number): { label: string; tone: string } {
  if (affinity >= 15)
    return { label: 'adaptée au format', tone: 'text-emerald-700 dark:text-emerald-400' };
  if (affinity <= -10)
    return { label: 'peu adaptée au format', tone: 'text-red-700 dark:text-red-400' };
  return { label: 'neutre pour ce format', tone: 'text-encre-2' };
}

/**
 * Posture d'un passage dans les médias (phase 11) : offensive, pédagogique ou rassembleuse. Le
 * format de l'exercice (interview selon l'organe, émission, format numérique) vient du jeu de
 * règles ; le score du passage, lui, est calculé par le serveur à la résolution de la semaine.
 */
export function PostureSelect({
  ruleset,
  action,
  planned,
  index,
  onChange,
}: {
  ruleset: Ruleset;
  action: ActionDefinition;
  planned: PlannedAction;
  index: number;
  onChange: (posture: Posture) => void;
}) {
  const name = useId();
  const rules = ruleset.prestations;
  const value = planned.posture ?? rules.postureParDefaut;
  const format = plateauFormat(ruleset, action, planned.cible ?? null);
  const selected = rules.postures.find((p) => p.id === value)!;
  return (
    <fieldset className="w-full basis-full space-y-1.5">
      <legend className="text-xs text-encre-2">
        Posture du passage n° {index + 1}
        {format ? ` — ${format.libelle}` : ' — choisissez d’abord le média'}
      </legend>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 dark:bg-slate-900">
        {rules.postures.map((posture) => (
          <label
            key={posture.id}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-xs font-semibold has-checked:bg-republique-600 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-republique-500"
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={posture.id}
              checked={value === posture.id}
              onChange={() => onChange(posture.id)}
            />
            {posture.libelle}
          </label>
        ))}
      </div>
      <p className="text-xs text-encre-2">
        {selected.description}
        {format && (
          <>
            {' '}
            <span className={`font-semibold ${fit(format.affinites[value]).tone}`}>
              Posture {fit(format.affinites[value]).label}.
            </span>
          </>
        )}
        {planned.posture === undefined && ' (posture par défaut)'}
      </p>
    </fieldset>
  );
}
