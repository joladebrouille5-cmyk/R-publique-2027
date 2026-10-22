import { POSTURES, type GameState, type PlannedAction, type Ruleset } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { newGame, playerChange, QUIET, RULESET } from '../core/testing';
import { POSTURE_WITHOUT_PLATEAU } from './actions';
import { bestPosture, isPlateau, scorePrestation } from './prestations';

// Passages dans les médias sans aléa (phase 11) : posture, préparation, format, situation.

const decisionsOf = (state: GameState) =>
  state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId }));

function week(state: GameState, actions: PlannedAction[], ruleset: Ruleset = QUIET) {
  return advanceWeek(state, { actions, decisions: decisionsOf(state) }, { ruleset });
}

const withPreparation = (state: GameState, hours: number) => {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  copy.actors[PLAYER_ACTOR_ID]!.preparationDebat = hours;
  return copy;
};

/** Partie de quelques semaines : intentions connues, rangs établis. */
const started = (() => {
  let state = newGame({ seed: 'plateaux' });
  for (let i = 0; i < 3; i++) state = week(state, []).state;
  return state;
})();

const plateaux = RULESET.prestations.actions.map((id) => RULESET.actions.find((a) => a.id === id)!);
const cibleOf = (actionId: string) =>
  actionId === 'interview'
    ? 'france-inter'
    : actionId === 'emission-politique'
      ? RULESET.mediasReels.emissions[0]!.id
      : undefined;
const plan = (actionId: string, posture?: (typeof POSTURES)[number]): PlannedAction => ({
  actionId,
  ...(cibleOf(actionId) ? { cible: cibleOf(actionId)! } : {}),
  ...(posture ? { posture } : {}),
});

describe('passages dans les médias sans aléa (phase 11)', () => {
  it('note chaque passage sans tirage : même état et même plan, même résultat, quelle que soit la graine', () => {
    for (const action of plateaux) {
      const a = week(started, [plan(action.id, 'offensive')]);
      const b = week(started, [plan(action.id, 'offensive')]);
      expect(b.report).toEqual(a.report);
      const prestation = a.report.actions.find((o) => o.actorId === PLAYER_ACTOR_ID)!.prestation!;
      expect(prestation.posture).toBe('offensive');
      // Une autre graine change les tirages de la semaine, pas la note du passage.
      const other = { ...started, meta: { ...started.meta, seed: 'autre-graine' } };
      const c = week(other, [plan(action.id, 'offensive')]);
      expect(c.report.actions.find((o) => o.actorId === PLAYER_ACTOR_ID)!.prestation).toEqual(
        prestation,
      );
    }
  });

  it('explique le score : la somme des raisons vaut le score, et le niveau suit les seuils', () => {
    const { seuils } = RULESET.prestations;
    for (const action of plateaux)
      for (const posture of POSTURES) {
        const p = scorePrestation(started, RULESET, {
          actorId: PLAYER_ACTOR_ID,
          definition: action,
          cible: cibleOf(action.id) ?? null,
          posture,
          choisie: true,
          preparationSemaine: 0,
          passagesSemaine: 0,
        });
        const sum = p.raisons.reduce((s, r) => s + r.valeur, 0);
        expect(p.score).toBe(Math.max(-100, Math.min(100, sum)));
        expect(p.raisons[0]!.label).toMatch(/^Préparation/);
        expect(p.niveau).toBe(
          p.score >= seuils.reussie ? 'reussie' : p.score < seuils.ratee ? 'ratee' : 'correcte',
        );
        expect(p.incident).toBe(p.score <= seuils.incident);
      }
  });

  it('plus de préparation ne fait jamais moins bien : score, effets et incident', () => {
    for (const action of plateaux)
      for (const posture of POSTURES) {
        let previousScore = -Infinity;
        let previousPopularity = -Infinity;
        for (const hours of [0, 5, 10, 15, 20, 30, 40]) {
          const { report } = week(withPreparation(started, hours), [plan(action.id, posture)]);
          const p = report.actions.find((o) => o.actorId === PLAYER_ACTOR_ID)!.prestation!;
          expect(p.score).toBeGreaterThanOrEqual(previousScore);
          previousScore = p.score;
          const popularity = (playerChange(report, 'popularite')?.factors ?? [])
            .filter((f) => f.source === 'action' || f.source === 'risque')
            .reduce((s, f) => s + f.value, 0);
          expect(popularity).toBeGreaterThanOrEqual(previousPopularity);
          previousPopularity = popularity;
        }
      }
  });

  it('la posture compte : pédagogie en décryptage, offensive en challenger, pas en favori', () => {
    const decryptage = RULESET.actions.find((a) => a.id === 'decryptage')!;
    const input = {
      actorId: PLAYER_ACTOR_ID,
      definition: decryptage,
      cible: null,
      choisie: true,
      preparationSemaine: 0,
      passagesSemaine: 0,
    };
    const score = (posture: (typeof POSTURES)[number], state = started) =>
      scorePrestation(state, RULESET, { ...input, posture }).score;
    expect(score('pedagogique')).toBeGreaterThan(score('offensive'));
    // Rang : en tête, l'offensive coûte ; quatrième, elle rapporte.
    const ranked = (rank: number) => {
      const copy = JSON.parse(JSON.stringify(started)) as GameState;
      const ids = Object.keys(copy.opinion!.intentions).filter((id) => id !== PLAYER_ACTOR_ID);
      const order = [...ids.slice(0, rank - 1), PLAYER_ACTOR_ID, ...ids.slice(rank - 1)];
      order.forEach((id, i) => (copy.opinion!.intentions[id] = 3_000 - i * 100));
      return copy;
    };
    const favori = scorePrestation(ranked(1), RULESET, { ...input, posture: 'offensive' });
    const challenger = scorePrestation(ranked(4), RULESET, { ...input, posture: 'offensive' });
    expect(challenger.score - favori.score).toBe(2 * RULESET.prestations.situation);
    expect(favori.raisons.some((r) => r.label.startsWith('Offensive en favori'))).toBe(true);
  });

  it('lassitude : chaque passage récent dans la même action coûte des points', () => {
    const action = RULESET.actions.find((a) => a.id === 'live-twitch')!;
    const first = week(started, [plan('live-twitch', 'rassembleuse')]);
    const again = week(first.state, [plan('live-twitch', 'rassembleuse')]);
    const p = again.report.actions.find((o) => o.actorId === PLAYER_ACTOR_ID)!.prestation!;
    const tired = p.raisons.find((r) => r.label.startsWith('Lassitude'));
    expect(tired?.valeur).toBe(-RULESET.prestations.repetition.parPassage);
    expect(first.state.numerique.passages[PLAYER_ACTOR_ID]?.[action.id]).toEqual([
      started.meta.week,
    ]);
  });

  it('l’incident ne survient que sous le seuil, décrit comme un passage raté', () => {
    const shorts = RULESET.actions.find((a) => a.id === 'vague-video-courte')!;
    // Pédagogie en vidéos courtes, favori, programme absent : le pire des cas.
    const copy = JSON.parse(JSON.stringify(started)) as GameState;
    for (const id of Object.keys(copy.opinion!.intentions))
      copy.opinion!.intentions[id] = id === PLAYER_ACTOR_ID ? 5_000 : 100;
    copy.actors[PLAYER_ACTOR_ID]!.resources.popularite = 500;
    const bad = week(copy, [plan('vague-video-courte', 'pedagogique')]);
    const p = bad.report.actions.find((o) => o.actorId === PLAYER_ACTOR_ID)!.prestation!;
    expect(p.score).toBeLessThanOrEqual(RULESET.prestations.seuils.incident);
    expect(p.incident).toBe(true);
    const risk = bad.report.events.find((e) => e.kind === 'risque' && e.refId === shorts.id);
    expect(risk?.description).toMatch(/^Passage raté de .+ score -?\d+ : seuil d'incident/);
    const good = week(withPreparation(started, 20), [plan('vague-video-courte', 'offensive')]);
    const mine = `a-${started.meta.week}-${PLAYER_ACTOR_ID}-`;
    expect(good.report.events.some((e) => e.kind === 'risque' && e.id.startsWith(mine))).toBe(
      false,
    );
  });

  it('posture par défaut si le plan n’en donne pas ; refusée pour une action hors plateau', () => {
    const { report } = week(started, [
      plan('decryptage'),
      { actionId: 'meeting', posture: 'offensive' },
    ]);
    const [decryptage, meeting] = report.actions.filter((o) => o.actorId === PLAYER_ACTOR_ID);
    expect(decryptage!.prestation).toMatchObject({
      posture: RULESET.prestations.postureParDefaut,
      choisie: false,
    });
    expect(meeting).toMatchObject({ status: 'rejetee', reason: POSTURE_WITHOUT_PLATEAU });
    expect(meeting!.prestation).toBeNull();
  });

  it('la tonalité de l’organe du passage suit le score, sans tirage', () => {
    const other = { ...started, meta: { ...started.meta, seed: 'autre-graine' } };
    const a = week(started, [plan('interview', 'pedagogique')]).state.medias!.couverture;
    const b = week(other, [plan('interview', 'pedagogique')]).state.medias!.couverture;
    expect(b['france-inter']![PLAYER_ACTOR_ID]!.tonalite).toBe(
      a['france-inter']![PLAYER_ACTOR_ID]!.tonalite,
    );
  });

  it('l’IA choisit pour chaque passage la posture au meilleur score', () => {
    let state = started;
    let checked = 0;
    for (let i = 0; i < 8 && checked < 3; i++) {
      const { state: next, report } = week(state, [], RULESET);
      for (const outcome of report.actions) {
        if (outcome.actorId === PLAYER_ACTOR_ID || !outcome.prestation) continue;
        expect(outcome.prestation.choisie).toBe(true);
        checked += 1;
      }
      state = next;
    }
    expect(checked).toBeGreaterThan(0);
    // Sur un cas connu : la meilleure posture a le meilleur score.
    const decryptage = RULESET.actions.find((a) => a.id === 'decryptage')!;
    const input = {
      actorId: PLAYER_ACTOR_ID,
      definition: decryptage,
      cible: null,
      preparationSemaine: 0,
      passagesSemaine: 0,
    };
    const best = bestPosture(started, RULESET, input);
    for (const posture of POSTURES)
      expect(
        scorePrestation(started, RULESET, { ...input, posture: best, choisie: true }).score,
      ).toBeGreaterThanOrEqual(
        scorePrestation(started, RULESET, { ...input, posture, choisie: true }).score,
      );
  });

  it('le jeu de règles désigne les passages : interviews, émissions et formats numériques', () => {
    const ids = RULESET.actions.filter((a) => isPlateau(RULESET, a)).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['interview', 'emission-politique', 'decryptage']));
    expect(RULESET.actions.filter((a) => a.format).every((a) => isPlateau(RULESET, a))).toBe(true);
  });
});
