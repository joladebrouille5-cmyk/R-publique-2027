import {
  isOptionalDecision,
  type GameState,
  type PendingDecision,
  type Ruleset,
} from '@r2027/shared';
import { Check, Radio, X } from 'lucide-react';
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '../../components/Badge';
import { Hemicycle, seatingOrder } from '../../components/Hemicycle';
import { TensionGauge } from '../../components/ParliamentGauges';
import { useModal } from '../../components/useModal';
import { buttonGhost } from '../../components/ui';
import { formatGameDate } from '../../labels';
import { DECISION_KINDS, ResponsibleMinister } from './DecisionsPanel';

// Pop-ups d'intervention (phase 15) : une urgence ministérielle (situation fictive, ministre en
// charge avec sa photo), une séance de questions au gouvernement « en direct » (hémicycle, groupe
// qui interpelle, jauge de tension) ou un rendez-vous d'élus, présentés en plein écran avec leurs
// choix. Choisir renseigne la réponse de la semaine ; rien n'est calculé ici : textes, options et
// effets viennent du moteur. Aucun propos n'est attribué à une personne réelle.

/** Sièges de l'Assemblée en jeu, de la gauche vers la droite (convention de l'hémicycle). */
function hemicycleGroups(state: GameState, ruleset: Ruleset) {
  const parliament = state.parlement;
  if (!parliament) return [];
  return seatingOrder(ruleset.assemblee.groupes.filter((g) => parliament.groupes[g.id])).map(
    (g) => ({
      id: g.id,
      sigle: g.sigle,
      libelle: g.libelle,
      sieges: parliament.groupes[g.id]!.sieges,
      alignement: parliament.groupes[g.id]!.alignement,
      fronde: parliament.fronde[g.id] ?? 0,
    }),
  );
}

export function DecisionSpotlight({
  decision,
  state,
  ruleset,
  answer,
  onAnswer,
  onClose,
}: {
  decision: PendingDecision;
  state: GameState;
  ruleset: Ruleset | undefined;
  /** Réponse déjà choisie cette semaine, le cas échéant. */
  answer: string | undefined;
  onAnswer: (decisionId: string, optionId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onKeyDown = useModal(panel, onClose);
  const kind = DECISION_KINDS[decision.kind];
  const live = decision.kind === 'qag';
  const group = decision.groupeId
    ? ruleset?.assemblee.groupes.find((g) => g.id === decision.groupeId)
    : undefined;
  const seats = decision.groupeId ? state.parlement?.groupes[decision.groupeId]?.sieges : undefined;
  const theme = decision.themeId
    ? ruleset?.parlement.qag.themes.find((t) => t.id === decision.themeId)
    : undefined;
  const choose = (optionId: string) => {
    onAnswer(decision.id, optionId);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex animate-apparait items-end justify-center bg-slate-950/65 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative max-h-[calc(100dvh-var(--sat)-0.5rem)] w-full max-w-2xl animate-feuille overflow-y-auto overscroll-contain rounded-t-dossier bg-white pb-[calc(1rem+var(--sab))] shadow-raised outline-none sm:animate-revele sm:rounded-dossier sm:pb-5 dark:bg-slate-900 dark:shadow-[0_0_0_1px_rgb(98_134_255/0.25),0_24px_48px_-20px_rgb(0_0_0/0.75)]"
      >
        <span aria-hidden="true" className={`block h-1.5 ${kind.accent}`} />
        <div className="space-y-4 px-4 pt-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex flex-wrap items-center gap-1.5">
                {live && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full bg-white motion-safe:animate-pulse"
                    />
                    Direct
                  </span>
                )}
                <Badge tone={kind.tone}>{kind.badge}</Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatGameDate(state.meta.date)}
                </span>
              </p>
              <h2
                id={titleId}
                className="font-display text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl"
              >
                {decision.label}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Fermer</span>
            </button>
          </div>

          {live && ruleset && state.parlement && (
            <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="flex items-start gap-2 text-sm font-semibold">
                <Radio
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
                />
                <span>
                  En séance à l’Assemblée nationale
                  {group && (
                    <span className="font-normal text-slate-600 dark:text-slate-400">
                      {' '}
                      · {group.libelle}
                      {seats !== undefined ? ` (${seats} sièges)` : ''} interpelle le gouvernement
                      {theme ? ` sur ${theme.libelle}` : ''}
                    </span>
                  )}
                </span>
              </p>
              <Hemicycle
                title="Hémicycle pendant les questions au gouvernement"
                total={ruleset.assemblee.siegesTotal}
                groups={hemicycleGroups(state, ruleset)}
                speaker={decision.groupeId ?? null}
              />
              <TensionGauge
                tension={state.parlement.tension}
                seuilMotion={ruleset.parlement.tension.seuilMotion}
                compact
              />
            </div>
          )}

          {(decision.kind === 'urgence' || decision.kind === 'qag') && (
            <ResponsibleMinister decision={decision} state={state} ruleset={ruleset} size="lg" />
          )}

          <p id={descriptionId} className="max-w-prose text-slate-700 dark:text-slate-300">
            {decision.description}
          </p>

          <ul className="grid gap-2.5" aria-label="Choix possibles">
            {decision.options.map((option) => {
              const chosen = answer === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => choose(option.id)}
                    className={`relative flex w-full flex-col gap-1 rounded-card border-2 p-4 pr-12 text-left transition duration-150 active:scale-[0.99] ${
                      chosen
                        ? 'border-republique-600 bg-republique-50 dark:border-republique-400 dark:bg-republique-950'
                        : 'border-slate-200 bg-white hover:border-republique-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-republique-400/60'
                    }`}
                  >
                    <span className="font-bold">{option.libelle}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {option.description}
                    </span>
                    {option.id === decision.defaultOptionId && (
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {isOptionalDecision(decision) ? 'Réponse par défaut' : 'Choix proposé'}
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className={`absolute top-4 right-4 inline-flex size-6 items-center justify-center rounded-full border-2 ${
                        chosen
                          ? 'border-republique-600 bg-republique-600 text-white'
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

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {decision.kind === 'qag'
                ? 'Séance simulée : aucun député n’est nommé, aucun propos n’est rapporté.'
                : 'Situation fictive ; effets : hypothèses du jeu.'}
            </p>
            <button type="button" className={buttonGhost} onClick={onClose}>
              {isOptionalDecision(decision)
                ? 'Laisser le gouvernement répondre sur le fond'
                : 'Décider plus tard'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
