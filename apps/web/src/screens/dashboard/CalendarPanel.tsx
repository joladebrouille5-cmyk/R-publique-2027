import { addDays, holidaysBetween, type Ruleset } from '@r2027/shared';
import { Badge } from '../../components/Badge';
import { ScreenHeading } from '../../components/Disclosure';
import { card } from '../../components/ui';
import { DATA_STATUS_LABELS, formatGameDate } from '../../labels';

const DAY_MS = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Calendrier du jeu de règles, avec le statut de chaque date (sources : Paramètres). Phase 20 :
 * les jours fériés jusqu'au dernier scrutin, dates déduites du code du travail (`@r2027/shared`).
 */
export function CalendarPanel({ ruleset, today }: { ruleset: Ruleset; today: string }) {
  const dated = [
    ...ruleset.calendrier.scrutins.map((s) => ({ ...s, heure: null })),
    ...ruleset.calendrier.echeances,
  ];
  // Jours fériés de la campagne : de la date en jeu (ou de la première échéance) au dernier tour.
  const first = dated.reduce((min, d) => (d.date < min ? d.date : min), today);
  const last = ruleset.calendrier.scrutins.reduce((max, d) => (d.date > max ? d.date : max), today);
  const holidays = holidaysBetween(first, addDays(last, 1)).map((h) => ({
    id: h.id,
    libelle: `Jour férié : ${h.libelle}`,
    date: h.date,
    heure: null,
    statut: 'deduit' as const,
  }));
  const items = [...dated, ...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section aria-labelledby="titre-calendrier" className={`${card} space-y-3`}>
      <ScreenHeading id="titre-calendrier" level={2} className="text-lg font-semibold">
        Calendrier électoral
      </ScreenHeading>
      <ul className="space-y-3 text-sm">
        {items.map((item) => {
          const inDays = days(today, item.date);
          return (
            <li key={item.id} className={inDays < 0 ? 'opacity-60' : ''}>
              <p className="font-medium">{item.libelle}</p>
              <p className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
                <span>
                  {formatGameDate(item.date)}
                  {item.heure ? ` à ${item.heure.replace(':', ' h ')}` : ''}
                  {inDays >= 0 ? ` · dans ${Math.ceil(inDays / 7)} sem.` : ' · passée'}
                </span>
                <Badge tone={item.statut === 'officiel' ? 'succes' : 'alerte'}>
                  Date {DATA_STATUS_LABELS[item.statut]}
                </Badge>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
