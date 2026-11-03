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
    <div className="min-w-0 px-2 first:pl-0 sm:px-4">
      <dt className="flex items-center gap-1 text-[0.7rem] font-semibold text-encre-2">
        <Icon aria-hidden="true" className="hidden size-3.5 shrink-0 sm:block" strokeWidth={2.25} />
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className="truncate font-display text-[1.3rem] leading-tight font-black text-slate-950 [font-stretch:68%] sm:text-[1.7rem] sm:[font-stretch:86%] dark:text-white"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Bandeau de campagne (phase 21) : une feuille d'en-tête filetée d'encre ; le portrait du
 * candidat en affiche, son mouvement, le calendrier, et le compte à rebours du prochain scrutin
 * imprimé en blanc sur un pavé rouge ; les ressources en dessous, séparées par des filets.
 */
export function GameHud({ game, ruleset }: { game: GameDetail; ruleset: Ruleset | undefined }) {
  const { state } = game;
  const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const ballot = nextBallot(ruleset, game.date);
  const resources = player?.resources;

  return (
    <section
      aria-label="Situation de la partie"
      className="sticky top-(--sat) z-30 -mx-4 mb-6 overflow-hidden border-b-[1.5px] border-slate-900 bg-papier/95 px-4 pt-3 pb-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-papier/85 lg:mx-0 lg:mt-3 lg:rounded-dossier lg:border-[1.5px] lg:px-5 dark:border-white/25 dark:bg-slate-950/90 dark:supports-[backdrop-filter]:bg-slate-950/80"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {player ? (
          <Avatar
            portrait={portraitOf(player, ruleset)}
            size="sm"
            shape="affiche"
            ring
            className="sm:size-12"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-affiche bg-republique-600 text-white sm:size-12"
          >
            <Users className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl leading-tight font-[850] [font-stretch:76%] sm:text-[1.75rem]">
            {player ? candidateName(player.candidate) : 'Mode observateur'}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-encre-2">
            {player && (
              <span className="hidden truncate font-semibold text-slate-700 sm:inline dark:text-slate-300">
                {player.candidate.parti}
              </span>
            )}
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0 sm:ml-1.5" />
            <span data-testid="hud-semaine">Semaine {game.week}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              /
            </span>
            <span>{shortDate.format(new Date(`${game.date}T00:00:00Z`))}</span>
          </p>
        </div>
        <p
          className={`shrink-0 text-right ${ballot ? 'rounded-md bg-red-700 px-2.5 py-1.5 text-white sm:px-3.5 dark:bg-red-800' : ''}`}
        >
          {ballot ? (
            <>
              <span className="block font-display text-[1.6rem] leading-none font-black [font-stretch:92%] sm:text-[2.2rem]">
                {ballot.jours === 0 ? 'Aujourd’hui' : `J−${ballot.jours}`}
              </span>
              <span
                className="mt-0.5 block text-[0.7rem] font-bold text-white/90"
                title={ballot.libelle}
              >
                <span aria-hidden="true">{ballot.court}</span>
                <span className="sr-only">{ballot.libelle}</span>
              </span>
            </>
          ) : (
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {PHASE_LABELS[game.phase]}
            </span>
          )}
        </p>
      </div>
      {resources && (
        <dl className="mt-2.5 grid grid-cols-4 divide-x divide-slate-300 border-t border-slate-300 pt-2 dark:divide-white/15 dark:border-white/15">
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
