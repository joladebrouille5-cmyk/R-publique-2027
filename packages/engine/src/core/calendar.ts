import {
  addDays,
  daysFromCivil,
  parseIsoDate,
  type GameState,
  type Notice,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { effectFactors } from './effects';
import { compareStrings, type Ledger } from './ledger';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const NOTICE_HORIZON_DAYS = 28;

function dayNumber(iso: string): number {
  const civil = parseIsoDate(iso);
  if (!civil) throw new Error(`Date ISO invalide : ${iso}`);
  return daysFromCivil(civil);
}

/** « dimanche 18 avril 2027 », sans dépendre de la langue du système. */
export function formatFrenchDate(iso: string): string {
  const civil = parseIsoDate(iso)!;
  const weekday = WEEKDAYS[(((dayNumber(iso) + 3) % 7) + 7) % 7]!;
  return `${weekday} ${civil.day === 1 ? '1er' : civil.day} ${MONTHS[civil.month - 1]} ${civil.year}`;
}

/** Échéances et scrutins des quatre prochaines semaines, à partir du lundi `weekStart`. */
export function upcomingNotices(weekStart: string, ruleset: Ruleset): Notice[] {
  const start = dayNumber(weekStart);
  const items = [
    ...ruleset.calendrier.scrutins.map((s) => ({ ...s, kind: 'scrutin' as const })),
    ...ruleset.calendrier.echeances.map((e) => ({ ...e, kind: 'echeance' as const })),
  ];
  return items
    .map((item) => ({ item, days: dayNumber(item.date) - start }))
    .filter(({ days }) => days >= 0 && days < NOTICE_HORIZON_DAYS)
    .sort((a, b) => a.days - b.days || compareStrings(a.item.id, b.item.id))
    .map(({ item, days }) => ({
      id: item.id,
      kind: item.kind,
      label: item.libelle,
      date: item.date,
      statut: item.statut,
      inWeeks: Math.floor(days / 7),
    }));
}

/** Scrutin tombant dans la semaine commençant le lundi `weekStart`, s'il y en a un. */
export function scrutinInWeek(weekStart: string, ruleset: Ruleset) {
  const start = dayNumber(weekStart);
  return ruleset.calendrier.scrutins.find((s) => {
    const days = dayNumber(s.date) - start;
    return days >= 0 && days < 7;
  });
}

/**
 * Étape 9 : passage à la semaine suivante. Remet à zéro le temps disponible, applique les
 * effets différés arrivés à échéance, signale les échéances proches et bloque la partie
 * avant un scrutin que le moteur ne sait pas encore résoudre (moteur électoral : phase 3).
 */
export function enterNextWeek(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  step: number,
): { notices: Notice[]; blocked: WeeklyReport['blocked']; appliedScheduled: number } {
  const nextWeek = state.meta.week + 1;
  state.meta.week = nextWeek;
  state.meta.date = addDays(state.meta.date, 7);

  const capacity = ruleset.jeu.tempsHebdomadaireHeures;
  for (const actorId of Object.keys(state.actors).sort(compareStrings)) {
    const remaining = ledger.current(actorId, 'tempsHeures');
    ledger.apply(actorId, 'tempsHeures', [
      {
        label: `Nouvelle semaine : temps disponible remis à ${capacity} h`,
        value: capacity - remaining,
        source: 'calendrier',
        step,
      },
    ]);
  }

  const due = state.scheduled
    .filter((effect) => effect.dueWeek <= nextWeek)
    .sort((a, b) => compareStrings(a.id, b.id));
  state.scheduled = state.scheduled.filter((effect) => effect.dueWeek > nextWeek);
  for (const effect of due) {
    if (!state.actors[effect.actorId]) continue;
    const current = ledger.current(effect.actorId, effect.ressource);
    const label = `${effect.origin.label} (effet différé de la semaine ${effect.origin.week})`;
    ledger.apply(
      effect.actorId,
      effect.ressource,
      effectFactors(effect, current, label, 'differe', step),
    );
  }

  const scrutin = scrutinInWeek(state.meta.date, ruleset);
  let blocked: WeeklyReport['blocked'] = null;
  if (scrutin) {
    state.calendar.blockedBy = scrutin.id;
    blocked = {
      scrutinId: scrutin.id,
      message: `${scrutin.libelle} le ${formatFrenchDate(scrutin.date)} : le moteur électoral arrive en phase 3. La partie ne peut pas encore avancer au-delà de cette semaine.`,
    };
  }
  return {
    notices: upcomingNotices(state.meta.date, ruleset),
    blocked,
    appliedScheduled: due.length,
  };
}
