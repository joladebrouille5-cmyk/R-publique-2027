import type { PendingDecision } from '@r2027/shared';
import { Badge } from '../../components/Badge';
import { card } from '../../components/ui';

type Props = {
  decisions: readonly PendingDecision[];
  answers: Record<string, string>;
  onAnswer: (decisionId: string, optionId: string) => void;
};

/** Décisions obligatoires : la semaine ne peut pas être résolue sans réponse (§2). */
export function DecisionsPanel({ decisions, answers, onAnswer }: Props) {
  return (
    <section aria-labelledby="titre-decisions" className="space-y-3">
      <h2 id="titre-decisions" className="text-lg font-semibold">
        Décisions à prendre
      </h2>
      {decisions.map((decision) => (
        <fieldset
          key={decision.id}
          className={`${card} space-y-2 border-amber-300 dark:border-amber-800`}
        >
          <legend className="sr-only">{decision.label}</legend>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <Badge tone="fictif">Événement fictif</Badge>
            {decision.label}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{decision.description}</p>
          {decision.options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <input
                type="radio"
                name={decision.id}
                value={option.id}
                checked={answers[decision.id] === option.id}
                onChange={() => onAnswer(decision.id, option.id)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{option.libelle}</span>
                <span className="block text-sm text-slate-600 dark:text-slate-400">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
