import type { PendingDecision } from '@r2027/shared';
import { Check } from 'lucide-react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { cardRaised } from '../../components/ui';

type Props = {
  decisions: readonly PendingDecision[];
  answers: Record<string, string>;
  onAnswer: (decisionId: string, optionId: string) => void;
};

const KINDS: Record<PendingDecision['kind'], { badge: string; tone: BadgeTone; accent: string }> = {
  consigne: { badge: 'Consigne de vote', tone: 'simule', accent: 'bg-republique-500' },
  gouvernement: { badge: 'Nomination', tone: 'alerte', accent: 'bg-or-500' },
  texte: { badge: 'Parlement', tone: 'alerte', accent: 'bg-or-500' },
  crise: { badge: 'Crise fictive', tone: 'fictif', accent: 'bg-red-500' },
  evenement: { badge: 'Événement fictif', tone: 'fictif', accent: 'bg-violet-500' },
};

/**
 * Décisions obligatoires (§2), présentées comme des dossiers posés sur le bureau : la semaine
 * ne peut pas être résolue sans réponse.
 */
export function DecisionsPanel({ decisions, answers, onAnswer }: Props) {
  return (
    <section aria-labelledby="titre-decisions" className="space-y-4">
      <h2 id="titre-decisions" className="text-xl font-bold">
        Décisions à prendre
      </h2>
      {decisions.map((decision) => {
        const kind = KINDS[decision.kind] ?? KINDS.evenement;
        return (
          <fieldset
            key={decision.id}
            className={`${cardRaised} relative animate-revele space-y-4 overflow-hidden`}
          >
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${kind.accent}`} />
            <legend className="sr-only">{decision.label}</legend>
            <div className="space-y-2">
              <Badge tone={kind.tone}>{kind.badge}</Badge>
              <p className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                {decision.label}
              </p>
              <p className="max-w-prose text-slate-600 dark:text-slate-400">
                {decision.description}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {decision.options.map((option) => {
                const checked = answers[decision.id] === option.id;
                return (
                  <label
                    key={option.id}
                    className={`relative flex min-h-24 cursor-pointer flex-col gap-1 rounded-card border-2 p-4 pr-12 transition duration-150 active:scale-[0.99] ${
                      checked
                        ? 'border-republique-600 bg-republique-50 dark:border-republique-400 dark:bg-republique-950'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                    } has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-republique-500`}
                  >
                    <input
                      type="radio"
                      name={decision.id}
                      value={option.id}
                      checked={checked}
                      onChange={() => onAnswer(decision.id, option.id)}
                      className="sr-only"
                    />
                    <span className="font-bold">{option.libelle}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {option.description}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`absolute top-4 right-4 inline-flex size-6 items-center justify-center rounded-full border-2 transition-colors ${
                        checked
                          ? 'border-republique-600 bg-republique-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {checked && <Check className="size-4" strokeWidth={3} />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
