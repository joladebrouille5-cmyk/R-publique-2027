import { candidateName, type GameDetail, type Ruleset } from '@r2027/shared';
import { CalendarDays, Heart, Megaphone, Users, Wallet, type LucideIcon } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { PHASE_LABELS } from '../../labels';
import { portraitOf } from '../../portraits';

// En-tête collant de la partie (phase 9) : qui l'on joue, l'argent, l'opinion et le temps,
// lisibles d'un coup d'œil sur tous les écrans. Les détails restent au tableau de bord.

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

const compactEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 2,
});
const compactCount = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Prochain scrutin du calendrier (cycle de la partie), avec le nombre de semaines restantes. */
export function nextBallot(ruleset: Ruleset | undefined, today: string) {
  const next = ruleset?.calendrier.scrutins
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const days = dayNumber(next.date) - dayNumber(today);
  return {
    libelle: next.libelle,
    court: shortBallot(next.libelle),
    date: next.date,
    semaines: Math.ceil(days / 7),
    jours: days,
  };
}

/** « Premier tour de l'élection présidentielle » → « 1er tour ». */
function shortBallot(libelle: string): string {
  if (/^Premier tour/i.test(libelle)) return '1er tour';
  if (/^Second tour/i.test(libelle)) return '2d tour';
  return libelle.split(' ').slice(0, 2).join(' ');
}

function Stat({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-100/80 px-2.5 py-1.5 dark:bg-white/[0.04] dark:ring-1 dark:ring-white/10">
      <dt className="flex items-center gap-1 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-400">
        <Icon aria-hidden="true" className="hidden size-3.5 shrink-0 sm:block" strokeWidth={2.25} />
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className="truncate font-display text-xl leading-tight font-extrabold dark:text-white dark:[text-shadow:0_0_18px_rgb(98_134_255/0.45)]"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

export function GameHud({ game, ruleset }: { game: GameDetail; ruleset: Ruleset | undefined }) {
  const { state } = game;
  const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const ballot = nextBallot(ruleset, game.date);
  const resources = player?.resources;

  return (
    <section
      aria-label="Situation de la partie"
      className="sticky top-(--sat) z-30 -mx-4 mb-5 overflow-hidden border-b border-slate-200/80 bg-white/85 px-4 pt-3 pb-2.5 shadow-hud backdrop-blur-md supports-[backdrop-filter]:bg-white/75 lg:mx-0 lg:rounded-b-card lg:border-x dark:border-republique-400/20 dark:bg-slate-950/85 dark:shadow-[0_10px_40px_-18px_rgb(61_87_230/0.6)] dark:supports-[backdrop-filter]:bg-slate-950/70"
    >
      {/* Liseré tricolore du plateau. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 flex h-[3px] dark:shadow-[0_0_12px_rgb(98_134_255/0.8)]"
      >
        <span className="flex-1 bg-republique-500" />
        <span className="flex-1 bg-slate-100" />
        <span className="flex-1 bg-red-500" />
      </span>
      <div className="flex items-center gap-3">
        {player ? (
          <Avatar portrait={portraitOf(player, ruleset)} size="sm" ring />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-republique-600 text-white"
          >
            <Users className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold leading-tight">
            {player ? candidateName(player.candidate) : 'Mode observateur'}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-600 dark:text-slate-400">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            <span data-testid="hud-semaine">Semaine {game.week}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              /
            </span>
            <span>{shortDate.format(new Date(`${game.date}T00:00:00Z`))}</span>
          </p>
        </div>
        <p className="shrink-0 rounded-full bg-republique-50 px-3 py-1 text-right text-xs font-semibold text-republique-800 dark:bg-republique-500/15 dark:text-republique-200 dark:ring-1 dark:ring-republique-400/40">
          {ballot ? (
            <>
              <span className="block font-display text-base leading-tight font-extrabold">
                {ballot.jours === 0 ? 'Aujourd’hui' : `J−${ballot.jours}`}
              </span>
              <span className="block font-normal" title={ballot.libelle}>
                <span aria-hidden="true">{ballot.court}</span>
                <span className="sr-only">{ballot.libelle}</span>
              </span>
            </>
          ) : (
            PHASE_LABELS[game.phase]
          )}
        </p>
      </div>
      {resources && (
        <dl className="mt-2 grid grid-cols-4 gap-1.5 sm:gap-2">
          <Stat
            icon={Wallet}
            label="Budget"
            value={compactEuros.format(resources.budgetCentimes / 100)}
            testId="hud-budget"
          />
          <Stat
            icon={Heart}
            label="Popularité"
            value={`${percent.format(resources.popularite / 100)} %`}
            testId="hud-popularite"
          />
          <Stat
            icon={Megaphone}
            label="Notoriété"
            value={`${percent.format(resources.notoriete / 100)} %`}
            testId="hud-notoriete"
          />
          <Stat
            icon={Users}
            label="Militants"
            value={compactCount.format(resources.militants)}
            testId="hud-militants"
          />
        </dl>
      )}
    </section>
  );
}
