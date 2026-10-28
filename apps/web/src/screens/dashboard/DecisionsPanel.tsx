import {
  MINISTER_DECISION_EVENT,
  type GameState,
  type PendingDecision,
  type Ruleset,
} from '@r2027/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge, type BadgeTone } from '../../components/Badge';
import { BlocFaces, blocPeople } from '../../components/BlocFigures';
import { FigureFilterBar, matchesFigure, NO_FILTER } from '../../components/FigureFilter';
import { cardRaised } from '../../components/ui';
import {
  portraitOf,
  portraitOfPersonality,
  portraitOfProfile,
  type Portrait,
} from '../../portraits';

type Props = {
  decisions: readonly PendingDecision[];
  answers: Record<string, string>;
  onAnswer: (decisionId: string, optionId: string) => void;
  /** État et jeu de règles : photos et filtres des nominations (phase 14), s'ils sont chargés. */
  state?: GameState | undefined;
  ruleset?: Ruleset | undefined;
};

/** Portrait de la personne d'une option de nomination (figure, profil ou acteur), ou null. */
function optionPortrait(
  id: string,
  state: GameState | undefined,
  ruleset: Ruleset | undefined,
): Portrait | null {
  if (!ruleset) return null;
  const figure = ruleset.figures.figures.find((f) => f.id === id);
  if (figure) return portraitOfPersonality(figure, ruleset);
  const profile = ruleset.quinquennat.profils.find((p) => p.id === id);
  if (profile) return portraitOfProfile(profile, ruleset);
  const actor = state?.actors[id];
  return actor ? portraitOf(actor, ruleset) : null;
}

const KINDS: Record<PendingDecision['kind'], { badge: string; tone: BadgeTone; accent: string }> = {
  consigne: { badge: 'Consigne de vote', tone: 'simule', accent: 'bg-republique-500' },
  gouvernement: { badge: 'Nomination', tone: 'alerte', accent: 'bg-or-500' },
  texte: { badge: 'Parlement', tone: 'alerte', accent: 'bg-or-500' },
  crise: { badge: 'Crise fictive', tone: 'fictif', accent: 'bg-red-500' },
  evenement: { badge: 'Événement fictif', tone: 'fictif', accent: 'bg-violet-500' },
  alliance: { badge: 'Législatives', tone: 'simule', accent: 'bg-emerald-500' },
};

type Option = PendingDecision['options'][number];

/**
 * Groupes d'options d'une nomination (phase 11) : proposition du Premier ministre (ministères),
 * candidats de la partie, personnalités réelles, profils fictifs. Présentation seulement : le
 * moteur fournit les options et leur description.
 */
function nominationGroups(
  decision: PendingDecision,
): { title: string; options: Option[]; figures: boolean }[] {
  const proposal = decision.eventId === MINISTER_DECISION_EVENT ? decision.options.slice(0, 1) : [];
  const rest = decision.options.slice(proposal.length);
  return [
    { title: 'Proposition du Premier ministre', options: proposal, figures: false },
    {
      title: 'Candidats de la partie',
      options: rest.filter((o) => !/^(figure|profil)-/.test(o.id)),
      figures: false,
    },
    {
      title: 'Personnalités réelles',
      options: rest.filter((o) => o.id.startsWith('figure-')),
      figures: true,
    },
    {
      title: 'Profils fictifs',
      options: rest.filter((o) => o.id.startsWith('profil-')),
      figures: false,
    },
  ].filter((g) => g.options.length > 0);
}

/**
 * Nomination : options groupées en lignes compactes, avec la photo de chacun, groupes
 * repliables sauf le premier ; recherche et filtres (parti, expertise) parmi les personnalités
 * réelles (phase 14). Le choix déjà fait reste affiché quel que soit le filtre.
 */
function GroupedOptions({
  decision,
  answer,
  onAnswer,
  state,
  ruleset,
}: {
  decision: PendingDecision;
  answer: string | undefined;
  onAnswer: (decisionId: string, optionId: string) => void;
  state: GameState | undefined;
  ruleset: Ruleset | undefined;
}) {
  const [filter, setFilter] = useState(NO_FILTER);
  // Groupes dépliés par le joueur ; un groupe replié ne rend pas ses options (vivier de plus de
  // cent personnalités, avec leurs photos).
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const figures = new Map(ruleset?.figures.figures.map((f) => [f.id, f]));
  const visible = (option: Option) => {
    const figure = figures.get(option.id);
    return !ruleset || !figure || option.id === answer || matchesFigure(ruleset, figure, filter);
  };
  return (
    <div className="space-y-3">
      {nominationGroups(decision).map((group, index) => {
        const shown = group.figures ? group.options.filter(visible) : group.options;
        const open =
          opened[group.title] ?? (index === 0 || group.options.some((o) => o.id === answer));
        return (
          <details
            key={group.title}
            open={open}
            onToggle={(e) => {
              const next = e.currentTarget.open;
              setOpened((current) => ({ ...current, [group.title]: next }));
            }}
            className="rounded-card border border-slate-200 dark:border-slate-700"
          >
            <summary className="cursor-pointer px-4 py-3 font-semibold">
              {group.title} ({group.options.length})
            </summary>
            {open && group.figures && ruleset && (
              <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                <FigureFilterBar
                  ruleset={ruleset}
                  value={filter}
                  onChange={setFilter}
                  shown={shown.length}
                  total={group.options.length}
                  idPrefix={`filtre-${decision.id}`}
                />
              </div>
            )}
            {open && (
              <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {shown.map((option) => {
                  const checked = answer === option.id;
                  const portrait = optionPortrait(option.id, state, ruleset);
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
                        {portrait && <Avatar portrait={portrait} size="sm" />}
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
            )}
          </details>
        );
      })}
    </div>
  );
}

/**
 * Décisions obligatoires (§2), présentées comme des dossiers posés sur le bureau : la semaine
 * ne peut pas être résolue sans réponse.
 */
export function DecisionsPanel({ decisions, answers, onAnswer, state, ruleset }: Props) {
  return (
    <section aria-labelledby="titre-decisions" className="space-y-4">
      <h2 id="titre-decisions" tabIndex={-1} className="text-xl font-bold outline-none">
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
                state={state}
                ruleset={ruleset}
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
                      {decision.kind === 'alliance' && ruleset && (
                        // Accord ou coalition avec un bloc : visages des personnalités de ses partis.
                        <BlocFaces people={blocPeople(ruleset, option.id.split(':')[1] ?? '')} />
                      )}
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
