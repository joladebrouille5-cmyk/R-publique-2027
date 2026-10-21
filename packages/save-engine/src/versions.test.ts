import {
  advanceWeek,
  createGame,
  ENGINE_VERSION,
  PLAYER_ACTOR_ID,
  SAVE_SCHEMA_VERSION,
} from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { GameStateSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashState, sha256 } from './canonical';
import { buildExport, readExport } from './exchange';
import V2 from './fixtures/v2-phase-2.json' with { type: 'json' };
import V3 from './fixtures/v3-phase-3.json' with { type: 'json' };
import V4 from './fixtures/v4-phase-4.json' with { type: 'json' };
import V5 from './fixtures/v5-phase-5.json' with { type: 'json' };
import V6 from './fixtures/v6-phase-5-bis.json' with { type: 'json' };
import V7 from './fixtures/v7-phase-5-ter.json' with { type: 'json' };
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
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
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
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
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
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Le premier tour déjà dépouillé n'a pas de détail territorial ; ses chiffres sont conservés.
    expect(state.elections.t1).toEqual({ ...V3.state.elections.t1, territoire: null });
    expect(state.pendingDecisions.map((d) => d.kind)).toEqual(['consigne']);

    let current = state;
    while (!current.quinquennat) {
      const decisions = current.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      current = advanceWeek(current, { actions: [], decisions }, { ruleset }).state;
    }
    expect(current.elections.t2!.territoire).not.toBeNull();
    expect(current.elections.t2!.winner).toMatch(/^adv-/);
  });

  it('migre une partie réelle de la phase 4 entre les deux tours, puis la mène au second tour', () => {
    const { state, migratedFrom } = loadStoredState(V4.state, V4.stateHash, 4);
    expect(migratedFrom).toBe(4);
    expect(state.meta).toMatchObject({
      week: 29,
      phase: 'entre_deux_tours',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Le premier tour et ses statuts sont conservés ; les parrainages ne sont pas modélisés
    // pour une partie commencée avant la phase 5 (personne n'est écarté).
    expect(state.elections.t1).toEqual(V4.state.elections.t1);
    expect(state.campagne).toEqual({ parrainages: 'non_modelise', finances: 'partiel' });
    expect(state.elections.debateDetail).toBeNull();
    for (const [id, actor] of Object.entries(state.actors)) {
      const before = V4.state.actors[id as keyof typeof V4.state.actors];
      expect(actor.status).toBe(before.status);
      expect(actor.resources).toEqual(before.resources);
      expect(actor.resources.budgetCentimes).toBe(
        actor.finances.recettes.parti + actor.finances.recettes.apportPersonnel,
      );
      const fictional = ruleset.candidatsFictifs.find((c) => c.id === id);
      expect(actor.programme.propositions).toEqual(fictional?.programme ?? []);
    }
    expect(Object.keys(state.relations)).toHaveLength(28);

    let current = state;
    while (!current.quinquennat) {
      const decisions = current.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      current = advanceWeek(current, { actions: [], decisions }, { ruleset }).state;
    }
    expect(current.elections.t2!.winner).not.toBeNull();
    expect(current.elections.debateDetail).not.toBeNull();
  });

  it('migre une partie réelle de la phase 5 entre les deux tours, puis la mène au second tour', () => {
    const { state, migratedFrom } = loadStoredState(V5.state, V5.stateHash, 5);
    expect(migratedFrom).toBe(5);
    expect(state.meta).toMatchObject({
      week: 29,
      phase: 'entre_deux_tours',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Adversaires fictifs, aucun candidat réel ; tout le reste est conservé tel quel.
    expect(state.player).toEqual({ ...V5.state.player, adversaires: 'fictifs' });
    for (const [id, actor] of Object.entries(state.actors)) {
      const before = V5.state.actors[id as keyof typeof V5.state.actors];
      expect(actor).toEqual({
        ...before,
        candidate: { ...before.candidate, personnaliteId: null },
      });
    }
    // La couverture par les organes fictifs est effacée (format 7, médias réels).
    expect(V5.state.medias).not.toBeNull();
    expect(state.medias).toBeNull();
    const {
      meta: _meta,
      player: _player,
      actors: _actors,
      medias: _medias,
      cycle: _cycle,
      quinquennat: _quinquennat,
      historique: _historique,
      ...rest
    } = state;
    const { meta: _m, player: _p, actors: _a, medias: _md, ...restBefore } = V5.state;
    expect(rest).toEqual(restBefore);
    expect(state.alliances).toHaveLength(1);

    let current = state;
    while (!current.quinquennat) {
      const decisions = current.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      }));
      current = advanceWeek(current, { actions: [], decisions }, { ruleset }).state;
    }
    expect(current.elections.t2!.winner).not.toBeNull();
    expect(current.elections.debateDetail).not.toBeNull();
  });

  it('migre une partie réelle de la phase 5 bis vers les médias réels, puis la poursuit', () => {
    const { state, migratedFrom } = loadStoredState(V6.state, V6.stateHash, 6);
    expect(migratedFrom).toBe(6);
    expect(state.meta).toMatchObject({
      week: 10,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Seule la couverture par les organes fictifs disparaît ; tout le reste est conservé.
    expect(Object.keys(V6.state.medias.couverture)).toContain('onde-publique');
    expect(state.medias).toBeNull();
    const {
      meta: _meta,
      medias: _medias,
      cycle: _cycle,
      quinquennat: _quinquennat,
      historique: _historique,
      ...rest
    } = state;
    const { meta: _m, medias: _md, ...restBefore } = V6.state;
    expect(rest).toEqual(restBefore);
    expect(state.player).toMatchObject({ mode: 'candidat_reel', adversaires: 'reels' });

    // La partie continue : couverture par les organes réels, interview dans une émission réelle.
    const show = ruleset.mediasReels.emissions[0]!;
    const next = advanceWeek(
      state,
      {
        actions: [{ actionId: 'emission-politique', cible: show.id }],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    ).state;
    expect(Object.keys(next.medias!.couverture).sort()).toEqual(
      ruleset.mediasReels.organes.map((o) => o.id).sort(),
    );
    expect(next.medias!.interviews).toContainEqual({
      emissionId: show.id,
      acteurId: PLAYER_ACTOR_ID,
    });
  });

  it('reprend une partie réelle de la phase 5 ter, gagnée au second tour, au début du quinquennat', () => {
    // Avant la phase 6, la partie s'arrêtait à l'élection (le joueur, Gabriel Attal, est élu).
    expect(V7.state.calendar.blockedBy).toBe('fin-de-la-presidentielle');
    expect(V7.state.elections.t2.winner).toBe(PLAYER_ACTOR_ID);
    const { state, migratedFrom } = loadStoredState(V7.state, V7.stateHash, 7);
    expect(migratedFrom).toBe(7);
    expect(state.meta).toMatchObject({
      week: 31,
      date: '2027-05-03',
      phase: 'presidence',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(state.calendar).toEqual({ blockedBy: null, blockedMessage: null });
    expect(state.cycle).toEqual({ annee: 2027, decalageSemaines: 0 });
    expect(state.historique).toEqual({ presidentielles: [], quinquennats: [] });
    expect(state.quinquennat).toEqual({
      mandat: { presidentId: PLAYER_ACTOR_ID, debut: '2027-05-14', fin: '2032-05-13', numero: 1 },
      gouvernement: null,
      anciensGouvernements: [],
      feuilleDeRoute: V7.state.actors[PLAYER_ACTOR_ID].programme.propositions,
      refus: [],
    });
    // Rien d'autre ne change : candidats, résultats, médias, relations.
    const {
      meta: _meta,
      calendar: _calendar,
      cycle: _cycle,
      quinquennat: _quinquennat,
      historique: _historique,
      ...rest
    } = state;
    const { meta: _m, calendar: _c, ...restBefore } = V7.state;
    expect(rest).toEqual(restBefore);

    // Critère 10 : la victoire ouvre la phase gouvernementale ; reprise et rejeu déterministes.
    const play = () => {
      let current = state;
      while (!current.quinquennat!.gouvernement) {
        const decisions = current.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        }));
        current = advanceWeek(current, { actions: [], decisions }, { ruleset }).state;
      }
      return current;
    };
    const governed = play();
    expect(governed.meta.date).toBe('2027-05-17');
    expect(governed.quinquennat!.gouvernement).toMatchObject({ numero: 1, nommeLe: '2027-05-10' });
    expect(governed.quinquennat!.gouvernement!.ministres).toHaveLength(
      ruleset.quinquennat.postes.length,
    );
    expect(play()).toEqual(governed);
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
    expect(errorCode(() => upgradeState(V4.state, 5))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V5.state, 6))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V6.state, 7))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V7.state, 8))).toBe('etat_invalide');
  });

  it('refuse un jeu de règles inconnu', () => {
    const state = createGame({ seed: 'x', mode: 'observateur', difficulty: 'standard' }, ruleset);
    const unknown = { ...state, meta: { ...state.meta, rulesetVersion: 'inexistant@9.9.9' } };
    expect(errorCode(() => upgradeState(unknown, SAVE_SCHEMA_VERSION))).toBe('regles_inconnues');
  });

  it('laisse un état au format courant inchangé', () => {
    const state = createGame(
      { seed: 'courant', mode: 'candidat_personnalise', difficulty: 'standard', candidate },
      ruleset,
    );
    const loaded = loadStoredState(state, hashState(state), SAVE_SCHEMA_VERSION);
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
    expect(read.state.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});
