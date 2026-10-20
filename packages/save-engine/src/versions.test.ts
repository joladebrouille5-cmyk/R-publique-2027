import { advanceWeek, createGame, ENGINE_VERSION, PLAYER_ACTOR_ID } from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { GameStateSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashState, sha256 } from './canonical';
import { buildExport, readExport } from './exchange';
import V2 from './fixtures/v2-phase-2.json' with { type: 'json' };
import V3 from './fixtures/v3-phase-3.json' with { type: 'json' };
import { loadStoredState, MIGRATED_CANDIDATE, SaveFormatError, upgradeState } from './versions';

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const candidate = { nom: 'Export', parti: 'Parti', positionnement: { economie: 0, societe: 0 } };
const opponentIds = ruleset.candidatsFictifs.map((c) => c.id).sort();

/** État exact produit par le moteur de la phase 1 (commit 268d591) pour la graine « phase-1 ». */
const V1_STATE = {
  meta: {
    seed: 'phase-1',
    week: 0,
    date: '2026-09-28',
    startDate: '2026-09-28',
    phase: 'campagne',
    difficulty: 'expert',
    engineVersion: '0.1.0',
    rulesetVersion: 'socle@0.1.0',
    saveSchemaVersion: 1,
  },
  rng: { algorithm: 'sfc32', state: [2192868698, 897309963, 1850546000, 13] },
  player: { mode: 'candidat_personnalise', actorId: null },
};
const V1_HASH = sha256(canonicalStringify(V1_STATE));

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof SaveFormatError) return error.code;
    throw error;
  }
  return null;
};

describe('migrations de sauvegarde', () => {
  it('migre une partie de la phase 1 jusqu’au format courant', () => {
    const { state, stateHash, migratedFrom } = loadStoredState(V1_STATE, V1_HASH, 1);
    expect(migratedFrom).toBe(1);
    expect(GameStateSchema.parse(state)).toEqual(state);
    expect(stateHash).toBe(hashState(state));
    expect(state.meta).toMatchObject({
      seed: 'phase-1',
      week: 0,
      difficulty: 'expert',
      saveSchemaVersion: 4,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(state.player.actorId).toBe(PLAYER_ACTOR_ID);
    expect(state.actors[PLAYER_ACTOR_ID]!.resources.budgetCentimes).toBe(
      ruleset.jeu.ressourcesInitiales.expert.budgetCentimes,
    );
    // La partie migrée est jouable.
    expect(advanceWeek(state, { actions: [], decisions: [] }, { ruleset }).state.meta.week).toBe(1);
  });

  it('migre un observateur sans lui créer de campagne', () => {
    const observer = { ...V1_STATE, player: { mode: 'observateur', actorId: null } };
    const { state } = loadStoredState(observer, sha256(canonicalStringify(observer)), 1);
    expect(Object.keys(state.actors).sort()).toEqual(opponentIds);
    expect(state.player.actorId).toBeNull();
  });

  it('migre une partie réelle de la phase 2 en conservant sa progression', () => {
    const v2 = V2.state;
    const { state, migratedFrom } = loadStoredState(v2, V2.stateHash, 2);
    expect(migratedFrom).toBe(2);
    expect(state.meta).toMatchObject({
      seed: 'phase-2',
      week: 20,
      date: '2027-02-15',
      saveSchemaVersion: 4,
    });
    const player = state.actors[PLAYER_ACTOR_ID]!;
    expect(player.resources).toEqual(v2.actors.joueur.resources);
    expect(player).toMatchObject({
      label: 'Votre campagne',
      status: 'candidat',
      candidate: MIGRATED_CANDIDATE,
    });
    expect(
      Object.keys(state.actors)
        .filter((id) => id !== PLAYER_ACTOR_ID)
        .sort(),
    ).toEqual(opponentIds);
    expect(state.eventHistory).toEqual(v2.eventHistory);
    expect(state.pendingDecisions).toEqual(
      v2.pendingDecisions.map((d) => ({ ...d, kind: 'evenement' })),
    );
    expect(state).toMatchObject({
      opinion: null,
      polls: [],
      calendar: { blockedBy: null, blockedMessage: null },
    });

    // Jouable : la décision en attente se répond comme avant.
    const [decision] = state.pendingDecisions;
    const next = advanceWeek(
      state,
      {
        actions: [{ actionId: 'meeting' }],
        decisions: [{ decisionId: decision!.id, optionId: 'excuses' }],
      },
      { ruleset },
    );
    expect(next.state.meta.week).toBe(21);
    expect(next.report.intentions).not.toBeNull();
  });

  it('lève le blocage de la phase 2 au premier tour : le scrutin est désormais simulé', () => {
    const blocked = {
      ...V2.state,
      meta: { ...V2.state.meta, week: 28, date: '2027-04-12' },
      pendingDecisions: [],
      calendar: { blockedBy: 'presidentielle-2027-t1' },
    };
    const { state } = loadStoredState(blocked, sha256(canonicalStringify(blocked)), 2);
    expect(state.calendar.blockedBy).toBeNull();
    const result = advanceWeek(state, { actions: [], decisions: [] }, { ruleset });
    expect(result.report.election).toMatchObject({ round: 1, scrutinId: 'presidentielle-2027-t1' });
  });

  it('migre une partie réelle de la phase 3 entre les deux tours, puis la mène au second tour', () => {
    const { state, migratedFrom } = loadStoredState(V3.state, V3.stateHash, 3);
    expect(migratedFrom).toBe(3);
    expect(state.meta).toMatchObject({
      week: 29,
      phase: 'entre_deux_tours',
      saveSchemaVersion: 4,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Le premier tour déjà dépouillé n'a pas de détail territorial ; ses chiffres sont conservés.
    expect(state.elections.t1).toEqual({ ...V3.state.elections.t1, territoire: null });
    expect(state.pendingDecisions.map((d) => d.kind)).toEqual(['consigne']);

    let current = state;
    while (!current.calendar.blockedBy) {
      const decisions = current.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      current = advanceWeek(current, { actions: [], decisions }, { ruleset }).state;
    }
    expect(current.elections.t2!.territoire).not.toBeNull();
    expect(current.elections.t2!.winner).toMatch(/^adv-/);
  });

  it('vérifie l’empreinte avant toute migration', () => {
    const altered = { ...V1_STATE, meta: { ...V1_STATE.meta, week: 3 } };
    expect(errorCode(() => loadStoredState(altered, V1_HASH, 1))).toBe('empreinte_incoherente');
    expect(
      errorCode(() => loadStoredState({ ...V2.state, eventHistory: {} }, V2.stateHash, 2)),
    ).toBe('empreinte_incoherente');
  });

  it('refuse les versions futures, inconnues et les états non conformes', () => {
    expect(errorCode(() => upgradeState(V1_STATE, 99))).toBe('version_future');
    expect(errorCode(() => upgradeState(V1_STATE, 0))).toBe('version_inconnue');
    expect(errorCode(() => upgradeState({ ...V1_STATE, intrus: 1 }, 1))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V1_STATE, 2))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V2.state, 4))).toBe('etat_invalide');
  });

  it('refuse un jeu de règles inconnu', () => {
    const state = createGame({ seed: 'x', mode: 'observateur', difficulty: 'standard' }, ruleset);
    const unknown = { ...state, meta: { ...state.meta, rulesetVersion: 'inexistant@9.9.9' } };
    expect(errorCode(() => upgradeState(unknown, 4))).toBe('regles_inconnues');
  });

  it('laisse un état au format courant inchangé', () => {
    const state = createGame(
      { seed: 'courant', mode: 'candidat_personnalise', difficulty: 'standard', candidate },
      ruleset,
    );
    const loaded = loadStoredState(state, hashState(state), 4);
    expect(loaded).toEqual({ state, stateHash: hashState(state), migratedFrom: null });
  });
});

describe('export et import', () => {
  const state = advanceWeek(
    createGame(
      { seed: 'export', mode: 'candidat_personnalise', difficulty: 'standard', candidate },
      ruleset,
    ),
    { actions: [{ actionId: 'meeting' }], decisions: [] },
    { ruleset },
  ).state;
  const doc = buildExport({
    name: 'Ma partie',
    state,
    stateHash: hashState(state),
    exportedAt: '2026-10-20T12:00:00.000Z',
  });

  it('fait un aller-retour sans perte, y compris en JSON', () => {
    const read = readExport(JSON.parse(JSON.stringify(doc)));
    expect(read).toEqual({
      name: 'Ma partie',
      state,
      stateHash: hashState(state),
      migratedFrom: null,
    });
  });

  it('refuse un fichier modifié, d’un autre format ou incohérent', () => {
    const tampered = { ...doc, state: { ...state, meta: { ...state.meta, week: 9 } } };
    expect(errorCode(() => readExport(tampered))).toBe('empreinte_incoherente');
    expect(errorCode(() => readExport({ ...doc, format: 'autre' }))).toBe('format_inconnu');
    expect(errorCode(() => readExport({ ...doc, champ: 1 }))).toBe('format_inconnu');
    expect(errorCode(() => readExport('pas un objet'))).toBe('format_inconnu');
    expect(errorCode(() => readExport({ ...doc, seed: 'autre-graine' }))).toBe('incoherence');
  });

  it('importe un état au format 1 en le migrant', () => {
    const v1Doc = {
      ...buildExport({
        name: 'Ancienne',
        state,
        stateHash: hashState(state),
        exportedAt: '2026-10-20T12:00:00.000Z',
      }),
      seed: 'phase-1',
      difficulty: 'expert',
      saveSchemaVersion: 1,
      stateHash: V1_HASH,
      state: V1_STATE,
    };
    const read = readExport(v1Doc);
    expect(read.migratedFrom).toBe(1);
    expect(read.state.meta.saveSchemaVersion).toBe(4);
  });
});
