import { MINISTER_DECISION_EVENT, type PendingDecision } from '@r2027/shared';
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

type Option = PendingDecision['options'][number];

/**
 * Groupes d'options d'une nomination (phase 11) : proposition du Premier ministre (ministères),
 * candidats de la partie, personnalités réelles, profils fictifs. Présentation seulement : le
 * moteur fournit les options et leur description.
 */
function nominationGroups(decision: PendingDecision): { title: string; options: Option[] }[] {
  const proposal = decision.eventId === MINISTER_DECISION_EVENT ? decision.options.slice(0, 1) : [];
  const rest = decision.options.slice(proposal.length);
  return [
    { title: 'Proposition du Premier ministre', options: proposal },
    {
      title: 'Candidats de la partie',
      options: rest.filter((o) => !/^(figure|profil)-/.test(o.id)),
    },
    { title: 'Personnalités réelles', options: rest.filter((o) => o.id.startsWith('figure-')) },
    { title: 'Profils fictifs', options: rest.filter((o) => o.id.startsWith('profil-')) },
  ].filter((g) => g.options.length > 0);
}

/** Nomination : options groupées en lignes compactes, groupes repliables sauf le premier. */
function GroupedOptions({
  decision,
  answer,
  onAnswer,
}: {
  decision: PendingDecision;
  answer: string | undefined;
  onAnswer: (decisionId: string, optionId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {nominationGroups(decision).map((group, index) => (
        <details
          key={group.title}
          open={index === 0 || group.options.some((o) => o.id === answer)}
          className="rounded-card border border-slate-200 dark:border-slate-700"
        >
          <summary className="cursor-pointer px-4 py-3 font-semibold">
            {group.title} ({group.options.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {group.options.map((option) => {
              const checked = answer === option.id;
              return (
                <li key={option.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-republique-500 ${
                      checked ? 'bg-republique-50 dark:bg-republique-950' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name={decision.id}
                      value={option.id}
                      checked={checked}
                      onChange={() => onAnswer(decision.id, option.id)}
                      className="mt-1 size-4 shrink-0 accent-republique-600"
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-semibold">{option.libelle}</span>
                      <span className="block text-sm text-slate-600 dark:text-slate-400">
                        {option.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}

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
            {decision.kind === 'gouvernement' && decision.options.length > 6 ? (
              <GroupedOptions
                decision={decision}
                answer={answers[decision.id]}
                onAnswer={onAnswer}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {decision.options.map((option) => {
                  const checked = answers[decision.id] === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`relative flex min-h-24 cursor-pointer flex-col gap-1 rounded-card border-2 p-4 pr-12 transition duration-150 active:scale-[0.99] ${
                        checked
                          ? 'border-republique-600 bg-republique-50 dark:border-republique-400 dark:bg-republique-950 dark:shadow-neon'
                          : 'border-slate-200 bg-white hover:border-republique-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-republique-400/60'
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
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
