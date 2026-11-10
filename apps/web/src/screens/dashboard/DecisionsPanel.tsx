import {
  isOptionalDecision,
  MINISTER_DECISION_EVENT,
  type GameState,
  type MemberRef,
  type PendingDecision,
  type Ruleset,
} from '@r2027/shared';
import { Check, CircleMinus, CirclePlus, Landmark } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge, type BadgeTone } from '../../components/Badge';
import { BlocFaces, blocPeople } from '../../components/BlocFigures';
import { FigureFilterBar, matchesFigure, NO_FILTER } from '../../components/FigureFilter';
import { cardRaisedBase } from '../../components/ui';
import { memberInfo } from '../Government';
import { CandidacyOptionBody } from './CandidacyOptions';
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
  /** Ouvre le pop-up d'une décision (urgence, questions au gouvernement, rendez-vous d'élus). */
  onSpotlight?: (decisionId: string) => void;
};

/** Décisions présentées aussi en pop-up d'intervention (phase 15). */
export const SPOTLIGHT_KINDS: ReadonlySet<PendingDecision['kind']> = new Set([
  'urgence',
  'qag',
  'parrainage',
  'candidature',
]);

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

export const DECISION_KINDS: Record<
  PendingDecision['kind'],
  { badge: string; tone: BadgeTone; accent: string; bandeau: string }
> = {
  consigne: {
    badge: 'Consigne de vote',
    tone: 'simule',
    accent: 'bg-republique-500',
    bandeau: 'border-t-republique-500',
  },
  gouvernement: {
    badge: 'Nomination',
    tone: 'alerte',
    accent: 'bg-or-500',
    bandeau: 'border-t-or-500',
  },
  texte: { badge: 'Parlement', tone: 'alerte', accent: 'bg-or-500', bandeau: 'border-t-or-500' },
  crise: {
    badge: 'Crise fictive',
    tone: 'fictif',
    accent: 'bg-red-500',
    bandeau: 'border-t-red-500',
  },
  evenement: {
    badge: 'Événement fictif',
    tone: 'fictif',
    accent: 'bg-violet-500',
    bandeau: 'border-t-violet-500',
  },
  alliance: {
    badge: 'Législatives',
    tone: 'simule',
    accent: 'bg-emerald-500',
    bandeau: 'border-t-emerald-500',
  },
  // Phase 15 : rendez-vous d'élus, urgences ministérielles, questions au gouvernement.
  parrainage: {
    badge: 'Rendez-vous d’élus (fictif)',
    tone: 'fictif',
    accent: 'bg-emerald-500',
    bandeau: 'border-t-emerald-500',
  },
  urgence: {
    badge: 'Urgence ministérielle (fictive)',
    tone: 'fictif',
    accent: 'bg-orange-500',
    bandeau: 'border-t-orange-500',
  },
  qag: {
    badge: 'Questions au gouvernement',
    tone: 'simule',
    accent: 'bg-sky-500',
    bandeau: 'border-t-sky-500',
  },
  // Phase 23 : se représenter ou passer la main à la présidentielle suivante (simulée).
  candidature: {
    badge: 'Présidentielle suivante',
    tone: 'simule',
    accent: 'bg-republique-500',
    bandeau: 'border-t-republique-500',
  },
};

/**
 * Membre du gouvernement en charge d'un poste (le Premier ministre sans poste ou si le poste est
 * vacant) : lecture de l'état servi par l'API, comme le fait le moteur.
 */
export function memberInChargeOf(
  state: GameState | undefined,
  posteId: string | undefined,
): MemberRef | null {
  const government = state?.quinquennat?.gouvernement;
  if (!government) return null;
  return (
    (posteId ? government.ministres.find((m) => m.posteId === posteId) : undefined) ??
    government.premierMinistre
  );
}

/** Ministre qui répond (urgence, questions au gouvernement) : photo, nom et poste. */
export function ResponsibleMinister({
  decision,
  state,
  ruleset,
  size = 'md',
}: {
  decision: PendingDecision;
  state: GameState | undefined;
  ruleset: Ruleset | undefined;
  size?: 'md' | 'lg';
}) {
  const member = memberInChargeOf(state, decision.posteId);
  if (!member || !state || !ruleset) return null;
  const info = memberInfo(state, ruleset, member);
  const poste = decision.posteId
    ? (ruleset.quinquennat.postes.find((p) => p.id === decision.posteId)?.libelle ??
      decision.posteId)
    : 'Premier ministre';
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5 pr-4 dark:bg-slate-800/60">
      {info.portrait && (
        <Avatar portrait={info.portrait} size={size} ring alt={`Portrait de ${info.name}`} />
      )}
      <p className="min-w-0 text-sm leading-snug">
        <span className="block font-bold">{info.name}</span>
        <span className="block text-encre-2">
          {decision.kind === 'qag' ? 'Répond pour le gouvernement' : 'En charge'} · {poste}
        </span>
        <span className="block text-xs text-encre-3">
          {member.nature === 'profil'
            ? 'Profil fictif'
            : 'Nomination simulée : aucun propos ne lui est attribué'}
        </span>
      </p>
    </div>
  );
}

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
export function GroupedOptions({
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
                          <span className="block text-sm text-encre-2">{option.description}</span>
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
 * Nomination à Matignon (phase 25 ter) : le contexte de l'Assemblée, cinq propositions ciblées
 * (portrait, profil, justification, atouts et limites, écrits en toutes lettres et pas seulement
 * par la couleur), puis toutes les personnalités sous « Voir toutes les personnalités ». Tout
 * vient du moteur ; choisir renseigne la réponse de la semaine.
 */
export function NominationChoice({
  decision,
  answer,
  onPick,
  state,
  ruleset,
}: {
  decision: PendingDecision;
  answer: string | undefined;
  onPick: (optionId: string) => void;
  state: GameState | undefined;
  ruleset: Ruleset | undefined;
}) {
  const proposals = decision.propositions ?? [];
  const proposed = new Set(proposals.map((p) => p.optionId));
  const others = { ...decision, options: decision.options.filter((o) => !proposed.has(o.id)) };
  const chosenElsewhere = answer !== undefined && !proposed.has(answer);
  return (
    <div className="space-y-3">
      {decision.contexte && (
        <p className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-encre-2 dark:bg-slate-800/60">
          <Landmark aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{decision.contexte}</span>
        </p>
      )}
      <ul className="grid gap-2.5" aria-label="Cinq propositions pour Matignon">
        {proposals.map((proposal) => {
          const option = decision.options.find((o) => o.id === proposal.optionId);
          if (!option) return null;
          const chosen = answer === option.id;
          const portrait = optionPortrait(option.id, state, ruleset);
          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => onPick(option.id)}
                className={`relative flex w-full gap-3 rounded-card border-2 p-3 pr-11 text-left transition duration-150 active:scale-[0.99] ${
                  chosen
                    ? 'border-slate-900 bg-or-100 dark:border-dorure/70 dark:bg-dorure/[0.08]'
                    : 'border-slate-200 bg-white hover:border-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-dorure/40'
                }`}
              >
                {portrait && <Avatar portrait={portrait} size="md" />}
                <span className="min-w-0 space-y-1">
                  <span className="block font-bold">{option.libelle}</span>
                  <span className="block text-sm text-encre-2">{proposal.justification}</span>
                  {(proposal.forces.length > 0 || proposal.limites.length > 0) && (
                    <span className="block space-y-0.5 text-xs">
                      {proposal.forces.map((force) => (
                        <span key={force} className="flex items-start gap-1">
                          <CirclePlus
                            aria-hidden="true"
                            className="mt-px size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
                          />
                          <span>
                            <span className="font-semibold">Atout : </span>
                            {force}
                          </span>
                        </span>
                      ))}
                      {proposal.limites.map((limite) => (
                        <span key={limite} className="flex items-start gap-1">
                          <CircleMinus
                            aria-hidden="true"
                            className="mt-px size-3.5 shrink-0 text-orange-700 dark:text-orange-400"
                          />
                          <span>
                            <span className="font-semibold">Limite : </span>
                            {limite}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                  {option.id === decision.defaultOptionId && (
                    <span className="block text-xs font-semibold text-encre-3">Choix proposé</span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full border-2 ${
                    chosen
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-dorure dark:bg-dorure dark:text-[#1d1503]'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {chosen && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {others.options.length > 0 && (
        <details open={chosenElsewhere} className="rounded-card">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-republique-700 dark:text-republique-300">
            Voir toutes les personnalités ({others.options.length})
            {chosenElsewhere && ' · votre choix est dans cette liste'}
          </summary>
          <div className="pt-2">
            <GroupedOptions
              decision={others}
              answer={answer}
              onAnswer={(_, optionId) => onPick(optionId)}
              state={state}
              ruleset={ruleset}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Décisions (§2), présentées comme des dossiers posés sur le bureau : la semaine ne peut pas être
 * résolue sans réponse, sauf pour une décision facultative (questions au gouvernement, phase 15 :
 * le gouvernement retient alors la réplique par défaut de la séance).
 */
export function DecisionsPanel({
  decisions,
  answers,
  onAnswer,
  state,
  ruleset,
  onSpotlight,
}: Props) {
  return (
    <section aria-labelledby="titre-decisions" className="space-y-4">
      <h2 id="titre-decisions" tabIndex={-1} className="text-xl font-bold outline-none">
        Décisions à prendre
      </h2>
      {decisions.map((decision) => {
        const kind = DECISION_KINDS[decision.kind] ?? DECISION_KINDS.evenement;
        return (
          <fieldset
            key={decision.id}
            className={`${cardRaisedBase} ${kind.bandeau} relative animate-revele space-y-4 overflow-hidden`}
          >
            <legend className="sr-only">{decision.label}</legend>
            <div className="space-y-2">
              <p className="flex flex-wrap gap-1.5">
                <Badge tone={kind.tone}>{kind.badge}</Badge>
                {isOptionalDecision(decision) && (
                  <Badge tone="neutre">Facultatif : réplique par défaut sinon</Badge>
                )}
              </p>
              <p className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                {decision.label}
              </p>
              {(decision.kind === 'urgence' || decision.kind === 'qag') && (
                <ResponsibleMinister decision={decision} state={state} ruleset={ruleset} />
              )}
              <p className="max-w-prose text-encre-2">{decision.description}</p>
              {decision.contexte && decision.kind !== 'gouvernement' && (
                <p className="max-w-prose text-xs text-encre-3">{decision.contexte}</p>
              )}
              {onSpotlight && SPOTLIGHT_KINDS.has(decision.kind) && (
                <button
                  type="button"
                  className="text-sm font-semibold text-republique-700 underline-offset-2 hover:underline dark:text-republique-300"
                  aria-haspopup="dialog"
                  onClick={() => onSpotlight(decision.id)}
                >
                  {decision.kind === 'qag' ? 'Suivre la séance en direct' : 'Ouvrir le dossier'}
                </button>
              )}
            </div>
            {decision.kind === 'gouvernement' && decision.propositions?.length ? (
              <NominationChoice
                decision={decision}
                answer={answers[decision.id]}
                onPick={(optionId) => onAnswer(decision.id, optionId)}
                state={state}
                ruleset={ruleset}
              />
            ) : decision.kind === 'gouvernement' && decision.options.length > 6 ? (
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
                          ? 'border-slate-900 bg-or-100 dark:border-dorure/70 dark:bg-dorure/[0.08]'
                          : 'border-slate-200 bg-white hover:border-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-dorure/40'
                      } has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-republique-500 dark:has-[:focus-visible]:outline-dorure`}
                    >
                      <input
                        type="radio"
                        name={decision.id}
                        value={option.id}
                        checked={checked}
                        onChange={() => onAnswer(decision.id, option.id)}
                        className="sr-only"
                      />
                      {decision.kind === 'candidature' ? (
                        <CandidacyOptionBody
                          option={option}
                          decision={decision}
                          state={state}
                          ruleset={ruleset}
                        />
                      ) : (
                        <>
                          <span className="font-bold">{option.libelle}</span>
                          <span className="text-sm text-encre-2">{option.description}</span>
                        </>
                      )}
                      {decision.kind === 'alliance' && ruleset && (
                        // Accord ou coalition avec un bloc : visages des personnalités de ses partis.
                        <BlocFaces people={blocPeople(ruleset, option.id.split(':')[1] ?? '')} />
                      )}
                      <span
                        aria-hidden="true"
                        className={`absolute top-4 right-4 inline-flex size-6 items-center justify-center rounded-full border-2 transition-colors ${
                          checked
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-dorure dark:bg-dorure dark:text-[#1d1503]'
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
