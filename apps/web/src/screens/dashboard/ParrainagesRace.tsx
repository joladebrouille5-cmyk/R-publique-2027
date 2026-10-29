import { candidateName, type Actor, type GameState, type Ruleset } from '@r2027/shared';
import { Gavel, Hourglass } from 'lucide-react';
import { echeanceDate, presentationSummary } from '../../campaign';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { cardRaised } from '../../components/ui';
import { formatCount, formatGameDate } from '../../labels';
import { portraitOf } from '../../portraits';

// Course aux parrainages (phase 15) : panneau du QG pendant la pré-campagne — présentations
// comptées et départements face au seuil légal, compte à rebours jusqu'à la clôture, rivaux
// classés, et la marche à suivre (rencontres d'élus, rendez-vous de délégations). Lecture de
// l'état servi par l'API, sans rien simuler.

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function Progress({ label, value, goal }: { label: string; value: number; goal: number }) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, goal)));
  return (
    <div>
      <p className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-display text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
          {formatCount(value)}
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {' '}
            / {formatCount(goal)}
          </span>
        </span>
      </p>
      <span
        aria-hidden="true"
        className="mt-1 block h-2 rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ${ratio >= 1 ? 'bg-emerald-500' : 'bg-republique-500'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
    </div>
  );
}

export function ParrainagesRace({
  state,
  actor,
  ruleset,
}: {
  state: GameState;
  actor: Actor;
  ruleset: Ruleset;
}) {
  const mine = presentationSummary(actor.parrainages, ruleset);
  const opening = echeanceDate(ruleset, ruleset.parrainages.ouvertureEcheanceId);
  const closing = echeanceDate(ruleset, ruleset.parrainages.clotureEcheanceId);
  const today = state.meta.date;
  const left = closing ? daysBetween(today, closing) : null;
  const rivals = Object.values(state.actors)
    .filter((a) => a.status === 'candidat')
    .map((a) => ({ actor: a, summary: presentationSummary(a.parrainages, ruleset) }))
    .sort(
      (a, b) =>
        b.summary.comptees - a.summary.comptees ||
        b.summary.promesses + b.summary.intentions - (a.summary.promesses + a.summary.intentions),
    );
  const rank = rivals.findIndex((r) => r.actor.id === actor.id) + 1;
  const meeting = state.pendingDecisions.find((d) => d.kind === 'parrainage');
  return (
    <section aria-labelledby="titre-course" className={`${cardRaised} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="titre-course" className="flex items-center gap-2 text-xl font-bold">
            <Gavel
              aria-hidden="true"
              className="size-5 text-republique-600 dark:text-republique-300"
            />
            Course aux parrainages
          </h2>
          <p className="max-w-prose text-sm text-slate-600 dark:text-slate-400">
            Il faut {mine.seuil} présentations d’élus de {mine.departementsMin} départements au
            moins (au plus {mine.cap} comptées par département). Rencontrez les élus locaux et
            recevez les délégations qui se présentent : chaque promesse devient une intention, puis
            une présentation envoyée pendant la période d’envoi.
          </p>
        </div>
        {left !== null && left >= 0 && (
          <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <Hourglass aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-300" />
            <span>
              <span className="font-display text-xl font-bold tabular-nums">J−{left}</span>
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                clôture le {formatGameDate(closing!)}
              </span>
            </span>
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Progress label="Présentations comptées" value={mine.comptees} goal={mine.seuil} />
        <Progress label="Départements" value={mine.departements} goal={mine.departementsMin} />
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {mine.atteint ? (
          <Badge tone="succes">Seuil atteint</Badge>
        ) : (
          <Badge tone="alerte">Seuil non atteint</Badge>
        )}
        <span className="text-slate-600 dark:text-slate-400">
          En réserve : {formatCount(mine.promesses)} promesse(s), {formatCount(mine.intentions)}{' '}
          intention(s)
          {opening && today < opening ? ` ; envois à partir du ${formatGameDate(opening)}` : ''}.
        </span>
      </p>
      {meeting && (
        <p className="rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
          {meeting.label} : une délégation attend votre réponse (décision de la semaine).
        </p>
      )}
      <div>
        <h3 className="text-sm font-semibold">
          Classement des candidats
          {rank > 0 ? ` — vous êtes ${rank === 1 ? '1er' : `${rank}e`}` : ''}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Présentations comptées, puis promesses et intentions en réserve.
        </p>
        <ol className="mt-2 space-y-1.5">
          {rivals.slice(0, 6).map(({ actor: a, summary }, i) => (
            <li
              key={a.id}
              className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm ${
                a.id === actor.id ? 'bg-republique-50 font-semibold dark:bg-republique-950' : ''
              }`}
            >
              <span className="w-5 text-right text-xs text-slate-500 tabular-nums">{i + 1}</span>
              <Avatar portrait={portraitOf(a, ruleset)} size="xs" />
              <span className="min-w-0 flex-1 truncate">{candidateName(a.candidate)}</span>
              <span className="shrink-0 text-right tabular-nums">
                {formatCount(summary.comptees)}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {' '}
                  · {summary.departements} dép.
                </span>
                <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                  {formatCount(summary.promesses + summary.intentions)} en réserve
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
