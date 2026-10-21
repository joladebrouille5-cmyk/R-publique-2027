import { describe, expect, it } from 'vitest';
import { advanceWeek } from './advanceWeek';
import { PLAYER_ACTOR_ID } from './createGame';
import { EngineInputError } from './errors';
import {
  advance,
  deepFreeze,
  newGame,
  playToEnd,
  playUntil,
  QUIET,
  RULESET,
  sponsorship,
  TEST_CANDIDATE,
  withResources,
} from './testing';

describe('présidentielle complète', () => {
  const { state, reports } = playToEnd(newGame(), RULESET, (s) => [
    ...sponsorship(s),
    'meeting',
    'interview@france-inter',
  ]);
  const t1 = reports.find((r) => r.election?.round === 1)!;
  const t2 = reports.find((r) => r.election?.round === 2);

  it('dépouille le premier tour la semaine du 18 avril 2027', () => {
    expect(t1).toMatchObject({ week: 28, date: '2027-04-12' });
    expect(t1.election).toMatchObject({ scrutinId: 'presidentielle-2027-t1', date: '2027-04-18' });
    expect(state.elections.t1).toEqual(t1.election);
  });

  it('enchaîne l’entre-deux-tours puis le second tour la semaine du 2 mai 2027', () => {
    expect(t1.phaseChange).toEqual({ from: 'campagne', to: 'entre_deux_tours' });
    expect(t2).toMatchObject({ week: 30, date: '2027-04-26' });
    expect(t2!.election).toMatchObject({ scrutinId: 'presidentielle-2027-t2', date: '2027-05-02' });
    expect(reports.some((r) => r.events.some((e) => e.refId === 'debat-entre-deux-tours'))).toBe(
      true,
    );
    expect(state.elections.debate).not.toBeNull();
  });

  it('publie des intentions et des sondages chaque semaine de campagne', () => {
    for (const report of reports.filter((r) => r.week < 28)) {
      expect(report.intentions?.round).toBe(1);
      expect(Object.values(report.intentions!.values).reduce((a, b) => a + b, 0)).toBe(10_000);
    }
    expect(reports.filter((r) => r.week < 28).every((r) => r.polls.length > 0)).toBe(true);
    expect(state.polls.length).toBe(reports.reduce((n, r) => n + r.polls.length, 0));
  });

  it('le joueur, parrainé, figure au premier tour', () => {
    expect(Object.keys(state.elections.t1!.voix)).toContain(PLAYER_ACTOR_ID);
  });

  it('termine sur un élu, met à jour les statuts et ouvre le quinquennat', () => {
    const statuses = Object.values(state.actors).map((a) => a.status);
    const ran = Object.keys(state.elections.t1!.voix).length;
    expect(statuses.filter((s) => s === 'elu')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'battu')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'elimine')).toHaveLength(ran - 2);
    expect(statuses.filter((s) => s === 'ecarte' || s === 'retire')).toHaveLength(
      statuses.length - ran,
    );
    const winner = Object.values(state.actors).find((a) => a.status === 'elu')!;
    expect(state.elections.t2!.winner).toBe(winner.id);
    // Critère 10 : la fin de la présidentielle ouvre la présidence (joueur ou IA).
    expect(state.meta.phase).toBe('presidence');
    expect(state.calendar.blockedBy).toBeNull();
    expect(reports.at(-1)!.phaseChange).toEqual({ from: 'entre_deux_tours', to: 'presidence' });
    expect(state.quinquennat).toMatchObject({
      mandat: { presidentId: winner.id, debut: '2027-05-14', fin: '2032-05-13', numero: 1 },
      gouvernement: null,
    });
    expect(() =>
      advanceWeek(
        state,
        { actions: [{ actionId: 'meeting' }], decisions: [] },
        { ruleset: RULESET },
      ),
    ).toThrow(EngineInputError);
  });

  it('ne modifie pas l’état reçu, même la semaine d’un scrutin', () => {
    const before = playUntil(newGame({}, QUIET), (s) => s.meta.week === 28, QUIET).state;
    expect(() => advance(deepFreeze(before))).not.toThrow();
  });
});

describe('candidat éliminé au premier tour', () => {
  const start = withResources(
    newGame(
      { candidate: { ...TEST_CANDIDATE, positionnement: { economie: 100, societe: -100 } } },
      QUIET,
    ),
    { notoriete: 100 },
  );
  const { state } = playUntil(
    start,
    (s) => s.meta.phase === 'entre_deux_tours',
    QUIET,
    (s) => sponsorship(s, QUIET),
  );
  const decision = state.pendingDecisions.find((d) => d.kind === 'consigne')!;

  it('le joueur éliminé doit choisir une consigne de vote entre les finalistes', () => {
    expect(state.actors[PLAYER_ACTOR_ID]!.status).toBe('elimine');
    expect(decision.options.map((o) => o.id)).toEqual([...state.elections.t1!.qualified, 'aucune']);
    expect(() => advance(state)).toThrow(/Décision à prendre/);
  });

  it('ne peut plus programmer d’actions de campagne', () => {
    const answer = [{ decisionId: decision.id, optionId: 'aucune' }];
    expect(() => advance(state, ['meeting'], answer)).toThrow(/plus candidat/);
  });

  it('sa consigne est enregistrée et pèse sur le second tour', () => {
    const finalist = state.elections.t1!.qualified[0]!;
    const { state: next, report } = advance(
      state,
      [],
      [{ decisionId: decision.id, optionId: finalist }],
    );
    expect(next.elections.consignes).toContainEqual({
      fromActorId: PLAYER_ACTOR_ID,
      toActorId: finalist,
      automatic: false,
    });
    expect(report.decisions).toMatchObject([{ optionId: finalist, automatic: false }]);
    expect(
      next.opinion!.breakdown[finalist]!.some((f) =>
        f.label.startsWith('Consigne de vote de Camille'),
      ),
    ).toBe(true);
  });
});

describe('mode observateur', () => {
  it('la présidentielle se déroule sans joueur, jusqu’à l’élection', () => {
    const { state, reports } = playToEnd(newGame({ mode: 'observateur' }), QUIET);
    expect(reports.flatMap((r) => r.actions).every((a) => a.actorId !== PLAYER_ACTOR_ID)).toBe(
      true,
    );
    expect(state.meta.phase).toBe('presidence');
    expect(Object.values(state.actors).filter((a) => a.status === 'elu')).toHaveLength(1);
  });
});
