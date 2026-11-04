import type { GameState } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { electoralPeriod } from '../campaign/medias';
import { PLAYER_ACTOR_ID } from './createGame';
import { advance, newGame, QUIET, RULESET } from './testing';

// Calendrier réel (phase 20) : jours fériés du code du travail, ouverture de la campagne
// officielle et égalité stricte des temps de parole à la télévision et à la radio.

/** Avance sans action jusqu'au lundi `date` ; rend l'état et le bilan de la semaine d'avant. */
function reach(state: GameState, date: string) {
  let current = state;
  let last = null;
  while (current.meta.date < date) {
    const next = advance(current);
    current = next.state;
    last = next.report;
  }
  return { state: current, report: last! };
}

/** État placé au lundi `date` (même partie, sans rien d'autre de changé). */
const at = (state: GameState, date: string): GameState => ({
  ...state,
  meta: { ...state.meta, date },
});

describe('jours fériés (phase 20)', () => {
  it('retire des heures de campagne la semaine du 11-Novembre, par le registre', () => {
    const { state, report } = reach(newGame({ seed: 'ferie-1' }), '2026-11-09');
    expect(state.meta.date).toBe('2026-11-09');
    const lost = RULESET.jeu.heuresSemaineFeriee;
    expect(lost).toBeGreaterThan(0);
    expect(state.actors[PLAYER_ACTOR_ID]!.resources.tempsHeures).toBe(
      RULESET.jeu.tempsHebdomadaireHeures - lost,
    );
    const time = report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'tempsHeures',
    )!;
    expect(time.factors.at(-1)).toMatchObject({
      label: `Jour férié (Armistice de 1918) : ${lost} h de campagne en moins (hypothèse de jeu)`,
      value: -lost,
      source: 'calendrier',
    });
    // Les adversaires en lice perdent les mêmes heures.
    for (const actor of Object.values(state.actors))
      expect(actor.resources.tempsHeures, actor.id).toBe(
        RULESET.jeu.tempsHebdomadaireHeures - lost,
      );
    // La semaine suivante, sans jour férié, rend tout le temps.
    const after = advance(state).state;
    expect(after.actors[PLAYER_ACTOR_ID]!.resources.tempsHeures).toBe(
      RULESET.jeu.tempsHebdomadaireHeures,
    );
  });

  it('ne retire rien pour un jour férié tombé un dimanche (Toussaint 2026)', () => {
    const { state } = reach(newGame({ seed: 'ferie-2' }), '2026-10-26');
    expect(state.actors[PLAYER_ACTOR_ID]!.resources.tempsHeures).toBe(
      RULESET.jeu.tempsHebdomadaireHeures,
    );
  });

  it('annonce les jours fériés des quatre semaines à venir, dates déduites de la loi', () => {
    const { report } = reach(newGame({ seed: 'ferie-3' }), '2026-12-07');
    const holidays = report.notices.filter((n) => n.kind === 'ferie');
    expect(holidays.map((n) => [n.label, n.date, n.statut])).toEqual([
      ['Jour férié : Noël', '2026-12-25', 'deduit'],
      ['Jour férié : Jour de l’an', '2027-01-01', 'deduit'],
    ]);
  });
});

describe('campagne officielle : égalité des temps de parole (phase 20)', () => {
  const start = newGame({ seed: 'egalite-1' });
  const tv = RULESET.mediasReels.organes.filter((o) => o.type !== 'presse');
  const press = RULESET.mediasReels.organes.filter((o) => o.type === 'presse');

  it('s’ouvre le lundi 5 avril 2027 et dure jusqu’au second tour', () => {
    expect(electoralPeriod(at(start, '2027-03-29'), RULESET)).toBe(false);
    expect(electoralPeriod(at(start, '2027-04-05'), RULESET)).toBe(true);
    const second: GameState = {
      ...at(start, '2027-04-26'),
      meta: { ...at(start, '2027-04-26').meta, phase: 'entre_deux_tours' },
    };
    expect(electoralPeriod(second, RULESET)).toBe(true);
  });

  it('expose également chaque candidat à l’antenne, la presse restant à la notoriété', () => {
    const before = advance(at(start, '2027-03-29'), [], [], QUIET);
    const during = advance(at(start, '2027-04-05'), [], [], QUIET);
    const exposures = (report: typeof before, outletId: string) =>
      Object.values(report.state.medias!.couverture[outletId]!).map((c) => c.exposition);
    for (const outlet of tv) {
      expect(new Set(exposures(during, outlet.id)).size, outlet.id).toBe(1);
    }
    expect(tv.some((o) => new Set(exposures(before, o.id)).size > 1)).toBe(true);
    for (const outlet of press)
      expect(new Set(exposures(during, outlet.id)).size).toBeGreaterThan(1);
    const label = during.report.changes
      .find((c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'notoriete')!
      .factors.find((f) => f.label.startsWith('Couverture médiatique'))!.label;
    expect(label).toBe(
      'Couverture médiatique de la semaine (période électorale : égalité des temps de parole)',
    );
  });
});
