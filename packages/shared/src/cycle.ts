import { addDays } from './dates';
import type { Cycle } from './quinquennat';
import type { Ruleset } from './ruleset';

// Calendrier d'un cycle électoral (phase 6, P6-08). Les dates de campagne du jeu de règles sont
// celles de 2027 ; une présidentielle ultérieure (2032, 2037) les reprend décalées de semaines
// entières (jours de la semaine conservés). Ces dates transposées sont des hypothèses : les
// dates réelles seront fixées par décret le moment venu. Fonction pure, partagée par le moteur
// et l'interface pour qu'ils affichent et appliquent le même calendrier.

const CACHE = new WeakMap<Ruleset, Map<number, Ruleset>>();
/** Les sources de 2027 ne valent pas pour une date transposée : c'est une règle du jeu. */
const GAME_DESIGN_SOURCE = 'conception-du-jeu';

/** Jeu de règles dont le calendrier de campagne est transposé dans le cycle `cycle`. */
export function cycleRuleset(ruleset: Ruleset, cycle: Cycle): Ruleset {
  if (cycle.decalageSemaines === 0) return ruleset;
  let byShift = CACHE.get(ruleset);
  if (!byShift) {
    byShift = new Map();
    CACHE.set(ruleset, byShift);
  }
  const cached = byShift.get(cycle.decalageSemaines);
  if (cached) return cached;
  const shift = (iso: string) => addDays(iso, 7 * cycle.decalageSemaines);
  const rule =
    ruleset.quinquennat.cycles.find((c) => c.annee === cycle.annee)?.regle ??
    `Calendrier de 2027 décalé de ${cycle.decalageSemaines} semaines.`;
  const year = String(cycle.annee);
  const shifted: Ruleset = {
    ...ruleset,
    calendrier: {
      scrutins: ruleset.calendrier.scrutins.map((s) => ({
        ...s,
        id: s.id.replace('2027', year),
        date: shift(s.date),
        statut: 'hypothese',
        sourceId: GAME_DESIGN_SOURCE,
      })),
      echeances: ruleset.calendrier.echeances.map((e) => ({
        ...e,
        date: shift(e.date),
        statut: 'hypothese',
        sourceId: GAME_DESIGN_SOURCE,
        regle: `${e.regle ? `${e.regle} ` : ''}Présidentielle de ${year} : ${rule}`,
      })),
    },
  };
  byShift.set(cycle.decalageSemaines, shifted);
  return shifted;
}
