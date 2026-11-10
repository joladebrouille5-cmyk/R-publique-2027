import {
  advanceWeek,
  createGame,
  ENGINE_VERSION,
  playDebate,
  PLAYER_ACTOR_ID,
  SAVE_SCHEMA_VERSION,
} from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import {
  debateAwaitingPlayer,
  GameStateSchema,
  startingImplantation,
  type GameState,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashState, sha256 } from './canonical';
import { buildExport, readExport } from './exchange';
import V2 from './fixtures/v2-phase-2.json' with { type: 'json' };
import V3 from './fixtures/v3-phase-3.json' with { type: 'json' };
import V4 from './fixtures/v4-phase-4.json' with { type: 'json' };
import V5 from './fixtures/v5-phase-5.json' with { type: 'json' };
import V6 from './fixtures/v6-phase-5-bis.json' with { type: 'json' };
import V7 from './fixtures/v7-phase-5-ter.json' with { type: 'json' };
import V8 from './fixtures/v8-phase-6.json' with { type: 'json' };
import V9 from './fixtures/v9-phase-6.json' with { type: 'json' };
import V10 from './fixtures/v10-phase-6.json' with { type: 'json' };
import V11 from './fixtures/v11-phase-6.json' with { type: 'json' };
import V12 from './fixtures/v12-phase-6.json' with { type: 'json' };
import V13 from './fixtures/v13-phase-9.json' with { type: 'json' };
import V14 from './fixtures/v14-phase-9.json' with { type: 'json' };
import V15 from './fixtures/v15-phase-10.json' with { type: 'json' };
import V16 from './fixtures/v16-phase-12.json' with { type: 'json' };
import V17 from './fixtures/v17-phase-13.json' with { type: 'json' };
import V18 from './fixtures/v18-phase-14.json' with { type: 'json' };
import V19 from './fixtures/v19-phase-17.json' with { type: 'json' };
import V20 from './fixtures/v20-phase-19.json' with { type: 'json' };
import V21 from './fixtures/v21-phase-20.json' with { type: 'json' };
import V22 from './fixtures/v22-phase-22.json' with { type: 'json' };
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

/** Ressources sans les jauges du format 14 (Jeunesse, Dynamique). */
const v1Resources = ({
  jeunesse: _j,
  dynamique: _d,
  ...rest
}: GameState['actors'][string]['resources']) => rest;

/**
 * État migré sans les ajouts des formats 12 (relevé de départ du quinquennat), 13 (scénario,
 * conséquences durables), 14 (jauges Jeunesse et Dynamique, fil des réseaux) et 15 (débats
 * télévisés) : le reste doit être identique à l'état d'origine.
 */
/**
 * Retire les ajouts du format 16 aux sondages (variation, explication, point de comparaison des
 * instituts) après avoir vérifié qu'ils valent leurs valeurs de migration.
 */
const withoutPollNews = <T extends object>(state: T) => {
  const { sondagesBase, polls, ...rest } = state as {
    sondagesBase?: GameState['sondagesBase'];
    polls?: GameState['polls'];
  };
  expect(sondagesBase).toEqual({});
  for (const poll of polls ?? [])
    for (const r of poll.results) {
      expect(r.variation).toBeNull();
      expect(r.explication).toEqual([]);
    }
  return {
    ...rest,
    ...(polls
      ? {
          polls: polls.map((poll) => ({
            ...poll,
            results: poll.results.map(({ variation: _v, explication: _e, ...r }) => r),
          })),
        }
      : {}),
  };
};

const withoutDepart = <T extends object>(state: T) => {
  const { quinquennat, actors } = state as {
    quinquennat?: GameState['quinquennat'];
    actors?: GameState['actors'];
  };
  return {
    ...state,
    ...(quinquennat !== undefined
      ? { quinquennat: quinquennat ? { ...quinquennat, depart: undefined } : null }
      : {}),
    ...(actors
      ? {
          actors: Object.fromEntries(
            Object.entries(actors).map(([id, a]) => [
              id,
              { ...a, resources: v1Resources(a.resources) },
            ]),
          ),
        }
      : {}),
    scenario: undefined,
    consequences: undefined,
    numerique: undefined,
    debats: undefined,
  };
};

/**
 * Retire les ajouts du format 17 (phase 13) après avoir vérifié qu'ils valent leurs valeurs de
 * migration : photo des candidats, tension, fronde, motions et coalition du Parlement, frondeurs
 * et interventions des votes, accords et campagne des législatives, emplois des actions du
 * président.
 */
/**
 * Retire de l'état migré les ajouts du format 19 (phase 15), après avoir vérifié leurs valeurs
 * de migration : aucune orientation, négociation ni succès ; Parlement sans échauffement ni QAG ;
 * quinquennat sans suivi des ministres, objectifs ni déplacements ; bilans sans note.
 */
/**
 * Format 25 (phase 25) : une partie migrée reçoit l'implantation de départ de chaque candidat et
 * une projection par département vide ; le reste de l'état est inchangé.
 */
const withoutPhase25 = <T extends object>(state: T): T => {
  const s = state as Partial<GameState>;
  const out: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  if ('implantation' in s) {
    if (s.actors)
      expect(s.implantation).toEqual(
        Object.fromEntries(
          Object.entries(s.actors).map(([id, actor]) => [id, startingImplantation(actor, ruleset)]),
        ),
      );
    else
      for (const map of Object.values(s.implantation ?? {}))
        for (const value of Object.values(map))
          expect([0, ruleset.implantation.depart]).toContain(value);
    delete out.implantation;
  }
  if (s.opinion) {
    const { departements, ...opinion } = s.opinion;
    expect(departements).toEqual({});
    out.opinion = opinion;
  }
  return out as T;
};

const withoutPhase15 = <T extends object>(state: T): T => {
  const s = state as Partial<GameState>;
  const out: Record<string, unknown> = { ...withoutPhase25(state as Record<string, unknown>) };
  if (s.player) {
    // Format 21 (phase 20) : une partie migrée continue au format complet.
    // Format 24 (phase 24) : une partie migrée garde un départ équitable.
    const { orientation, format, depart, ...player } = s.player;
    expect(orientation).toBeNull();
    expect(format).toBe('complet');
    expect(depart).toBe('equitable');
    out.player = player;
  }
  if (s.negociations) {
    expect(s.negociations).toEqual([]);
    delete out.negociations;
  }
  // Format 22 (phase 20) : aucune suite d'événement programmée dans une partie migrée.
  if (s.suites) {
    expect(s.suites).toEqual([]);
    delete out.suites;
  }
  // Format 23 (phase 23) : aucune succession en cours dans une partie migrée.
  if ('succession' in s) {
    expect(s.succession).toBeNull();
    delete out.succession;
  }
  if ('socle' in s) {
    expect(s.socle).toBeNull();
    delete out.socle;
  }
  if (s.succes) {
    expect(s.succes).toEqual([]);
    delete out.succes;
  }
  if (s.parlement) {
    const { echauffement, qag, ...parlement } = s.parlement;
    expect({ echauffement, qag }).toEqual({ echauffement: 0, qag: [] });
    out.parlement = parlement;
  }
  if (s.quinquennat) {
    // Format 26 (phase 25 ter) : journal de mandat vide.
    const { suivi, objectifs, deplacements, suivisDecisions, ...quinquennat } = s.quinquennat;
    expect({ suivi, objectifs, deplacements, suivisDecisions }).toEqual({
      suivi: {},
      objectifs: [],
      deplacements: {},
      suivisDecisions: [],
    });
    out.quinquennat = quinquennat;
  }
  if (s.historique)
    out.historique = {
      ...s.historique,
      quinquennats: s.historique.quinquennats.map(({ bilan, ...q }) => {
        const { note, ...rest } = bilan;
        expect(note).toBeNull();
        return { ...q, bilan: rest };
      }),
    };
  return out as T;
};

const withoutPhase13 = <T extends object>(state: T): T => {
  const s = state as Partial<GameState>;
  const out: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  if (s.actors)
    out.actors = Object.fromEntries(
      Object.entries(s.actors).map(([id, a]) => {
        expect(a.candidate.photo).toBeNull();
        const { photo: _p, ...candidate } = a.candidate;
        return [id, { ...a, candidate }];
      }),
    );
  if (s.parlement) {
    const {
      tension: _t,
      fronde,
      apaisement,
      motions,
      motionsSession: _ms,
      coalition,
      textes,
      ...parlement
    } = s.parlement;
    expect({ fronde, apaisement, motions, coalition }).toEqual({
      fronde: {},
      apaisement: 0,
      motions: [],
      coalition: null,
    });
    out.parlement = {
      ...parlement,
      textes: textes.map(({ frondeursNegocies, votes, censure, ...bill }) => {
        expect(frondeursNegocies).toBe(false);
        return {
          ...bill,
          votes: votes.map(({ intervention, parGroupe, ...vote }) => {
            expect(intervention).toBeNull();
            return {
              ...vote,
              parGroupe: Object.fromEntries(
                Object.entries(parGroupe).map(([id, { frondeurs, ...g }]) => {
                  expect(frondeurs).toBe(0);
                  return [id, g];
                }),
              ),
            };
          }),
          censure: censure ? (({ intervention: _i, ...c }) => c)(censure) : null,
        };
      }),
    };
  }
  if (s.legislatives) {
    const { campagne, derniere, premierTour, ...legislatives } = s.legislatives;
    expect(campagne).toBeNull();
    const district = ({
      communs,
      retraits,
      ...d
    }: NonNullable<GameState['legislatives']>['derniere']['circonscriptions'][number]) => {
      expect([communs, retraits]).toEqual([[], []]);
      return d;
    };
    const { alliances, circonscriptions, ...outcome } = derniere;
    expect(alliances).toEqual([]);
    out.legislatives = {
      ...legislatives,
      derniere: { ...outcome, circonscriptions: circonscriptions.map(district) },
      premierTour: premierTour?.map(district) ?? null,
    };
  }
  if (s.quinquennat) {
    const { usages, ...quinquennat } = s.quinquennat;
    expect(usages).toEqual({});
    out.quinquennat = quinquennat;
  }
  return out as T;
};

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
    expect(v1Resources(player.resources)).toEqual(v2.actors.joueur.resources);
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
      expect(v1Resources(actor.resources)).toEqual(before.resources);
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
    expect(state.player).toEqual({
      ...V5.state.player,
      adversaires: 'fictifs',
      orientation: null,
      format: 'complet',
      depart: 'equitable',
    });
    for (const [id, actor] of Object.entries(state.actors)) {
      const before = V5.state.actors[id as keyof typeof V5.state.actors];
      expect({ ...actor, resources: v1Resources(actor.resources) }).toEqual({
        ...before,
        candidate: { ...before.candidate, personnaliteId: null, photo: null },
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
      parlement: _parlement,
      economie: _economie,
      legislatives: _legislatives,
      ...rest
    } = state;
    const { meta: _m, player: _p, actors: _a, medias: _md, ...restBefore } = V5.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
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
      parlement: _parlement,
      economie: _economie,
      legislatives: _legislatives,
      ...rest
    } = state;
    const { meta: _m, medias: _md, ...restBefore } = V6.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
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
    expect(state.parlement!.textes).toEqual([]);
    expect(state.quinquennat).toEqual({
      mandat: { presidentId: PLAYER_ACTOR_ID, debut: '2027-05-14', fin: '2032-05-13', numero: 1 },
      gouvernement: null,
      anciensGouvernements: [],
      feuilleDeRoute: V7.state.actors[PLAYER_ACTOR_ID].programme.propositions,
      refus: [],
      // Format 12 : semaine du second tour ; popularité de départ non enregistrée auparavant.
      depart: {
        semaine: 30,
        date: '2027-04-26',
        popularite: null,
        indicateurs: state.economie!.historique[0]!.valeurs,
      },
      // Format 17 : aucune action du président encore employée.
      usages: {},
      // Format 19 : ni suivi des ministres, ni objectifs, ni déplacements.
      suivi: {},
      objectifs: [],
      deplacements: {},
      // Format 26 : journal de mandat vide.
      suivisDecisions: [],
    });
    // Rien d'autre ne change : candidats, résultats, médias, relations.
    const {
      meta: _meta,
      calendar: _calendar,
      cycle: _cycle,
      quinquennat: _quinquennat,
      historique: _historique,
      parlement: _parlement,
      economie: _economie,
      legislatives: _legislatives,
      ...rest
    } = state;
    const { meta: _m, calendar: _c, ...restBefore } = V7.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );

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

  it('ouvre l’Assemblée nationale d’une partie réelle en cours de quinquennat (format 8)', () => {
    const { state, migratedFrom } = loadStoredState(V8.state, V8.stateHash, 8);
    expect(migratedFrom).toBe(8);
    expect(state.meta).toMatchObject({
      week: 43,
      phase: 'presidence',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Rien d'autre ne change ; l'Assemblée est la composition importée, sans texte déposé.
    const {
      meta: _meta,
      parlement,
      economie: _economie,
      legislatives: _legislatives,
      ...rest
    } = state;
    const { meta: _m, ...restBefore } = V8.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
    expect(Object.entries(parlement!.groupes).map(([id, g]) => [id, g.sieges])).toEqual(
      ruleset.assemblee.groupes.map((g) => [g.id, g.sieges]),
    );
    expect(parlement!.textes).toEqual([]);

    // La partie continue. Le joueur n'avait annoncé aucune proposition pendant la campagne :
    // sa feuille de route est vide, aucun texte n'est déposé ; le gouvernement reste en place.
    let current = state;
    for (let i = 0; i < 6; i++)
      current = advanceWeek(
        current,
        {
          actions: [{ actionId: 'allocution' }],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    expect(state.quinquennat!.feuilleDeRoute).toEqual([]);
    expect(current.parlement!.textes).toEqual([]);
    expect(current.quinquennat!.gouvernement!.premierMinistre.ref).toBe('profil-ines-carrel');
    expect(current.meta.week).toBe(49);
  });

  it('ouvre l’économie d’une partie réelle en cours de quinquennat (format 9)', () => {
    const { state, migratedFrom } = loadStoredState(V9.state, V9.stateHash, 9);
    expect(migratedFrom).toBe(9);
    expect(state.meta).toMatchObject({
      week: 61,
      phase: 'presidence',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Rien d'autre ne change ; l'économie part des valeurs de l'Insee du jeu de règles.
    const { meta: _meta, economie, legislatives: _legislatives, ...rest } = state;
    const { meta: _m, ...restBefore } = V9.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
    expect(economie!.indicateurs.chomage).toBe(ruleset.economieReelle.indicateurs.chomage.valeur);
    expect(economie!.historique).toEqual([{ semaine: 61, valeurs: economie!.indicateurs }]);

    // La partie continue : textes en cours, économie simulée, réformes déjà adoptées conservées.
    let current = state;
    for (let i = 0; i < 12; i++)
      current = advanceWeek(
        current,
        {
          actions: [],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    expect(current.economie!.historique).toHaveLength(13);
    expect(current.parlement!.reformes.length).toBeGreaterThanOrEqual(
      V9.state.parlement.reformes.length,
    );
  });

  it('ouvre les législatives d’une partie réelle en cours de quinquennat (format 10)', () => {
    const { state, migratedFrom } = loadStoredState(V10.state, V10.stateHash, 10);
    expect(migratedFrom).toBe(10);
    expect(state.meta).toMatchObject({
      week: V10.state.meta.week,
      phase: 'presidence',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Rien d'autre ne change ; dernières élections : 2024 (réelles) ; prochaines : juin 2029.
    const { meta: _meta, legislatives, ...rest } = state;
    const { meta: _m, ...restBefore } = V10.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
    expect(legislatives).toMatchObject({
      derniere: { motif: 'reelles-2024', t2: '2024-07-07', circonscriptions: [] },
      prochaine: { motif: 'fin-de-legislature', t1: '2029-06-10', t2: '2029-06-17' },
      finLegislature: '2029-06-19',
      premierTour: null,
    });
    expect(Object.values(legislatives!.derniere.siegesParBloc).reduce((a, b) => a + b, 0)).toBe(
      Object.values(V10.state.parlement.groupes).reduce((a, g) => a + g.sieges, 0),
    );
    // La partie continue.
    const next = advanceWeek(
      state,
      {
        actions: [],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    ).state;
    expect(next.meta.week).toBe(state.meta.week + 1);
  });

  it('ajoute le relevé de départ d’une partie réelle en cours de quinquennat (format 11)', () => {
    const { state, migratedFrom } = loadStoredState(V11.state, V11.stateHash, 11);
    expect(migratedFrom).toBe(11);
    expect(state.meta).toMatchObject({
      week: V11.state.meta.week,
      phase: 'presidence',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
    });
    // Rien d'autre ne change ; départ : semaine du second tour, économie de cette semaine.
    const { meta: _meta, ...rest } = state;
    const { meta: _m, ...restBefore } = V11.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
    const opening = V11.state.economie.historique.find((h) => h.semaine === 30)!;
    expect(state.quinquennat!.depart).toEqual({
      semaine: 30,
      date: '2027-04-26',
      popularite: null,
      indicateurs: opening.valeurs,
    });
    // La partie continue jusqu'à la campagne de 2032, dont le bilan signale la popularité
    // de départ non enregistrée.
    let current = state;
    while (current.meta.phase === 'presidence')
      current = advanceWeek(
        current,
        {
          actions: [],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    expect(current.meta).toMatchObject({ phase: 'campagne', date: '2031-09-29' });
    const { bilan } = current.historique.quinquennats[0]!;
    expect(bilan.debut.popularite).toBeNull();
    expect(bilan.reformes.adoptees.length).toBeGreaterThanOrEqual(
      V11.state.parlement.reformes.length,
    );
  });

  it('ajoute scénario et conséquences à une partie réelle archivée en 2031 (format 12)', () => {
    const { state, migratedFrom } = loadStoredState(V12.state, V12.stateHash, 12);
    expect(migratedFrom).toBe(12);
    expect(state.meta).toMatchObject({
      week: V12.state.meta.week,
      phase: 'campagne',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(state.scenario).toBe('standard');
    expect(state.consequences).toEqual([]);
    // Bilan archivé : identique, sans conséquence durable (il n'en existait pas).
    const [archived] = state.historique.quinquennats;
    const { consequences, note, ...bilan } = archived!.bilan;
    expect(consequences).toEqual([]);
    expect(note).toBeNull();
    expect(bilan).toEqual(V12.state.historique.quinquennats[0]!.bilan);
    const { meta: _meta, historique: _h, ...rest } = state;
    const { meta: _m, historique: _hb, ...restBefore } = V12.state;
    expect(withoutDepart(withoutPollNews(withoutPhase13(withoutPhase15(rest))))).toEqual(
      restBefore,
    );
    // La campagne de 2032 continue.
    let current = state;
    for (let i = 0; i < 4; i++)
      current = advanceWeek(
        current,
        {
          actions: [],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    expect(current.meta.week).toBe(state.meta.week + 4);
    expect(current.cycle.annee).toBe(2032);
  });

  it('ajoute les jauges Jeunesse et Dynamique et le fil des réseaux (format 13)', () => {
    const { state, migratedFrom } = loadStoredState(V13.state, V13.stateHash, 13);
    expect(migratedFrom).toBe(13);
    expect(state.meta).toMatchObject({
      week: V13.state.meta.week,
      phase: 'campagne',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Jauges de départ du jeu de règles pour chaque candidat ; tout le reste est inchangé.
    const before = V13.state.actors as Record<string, { resources: object }>;
    for (const [id, actor] of Object.entries(state.actors)) {
      expect(actor.resources).toEqual({ ...before[id]!.resources, ...ruleset.numerique.initial });
      const { photo, ...candidate } = actor.candidate;
      expect(photo).toBeNull();
      expect({ ...actor, candidate, resources: before[id]!.resources }).toEqual(before[id]);
    }
    expect(state.numerique).toEqual({ publications: [], passages: {} });
    const { meta: _meta, actors: _a, numerique: _n, debats: _d, ...rest } = state;
    const { meta: _m, actors: _ab, ...restBefore } = V13.state;
    expect(withoutPollNews(withoutPhase13(withoutPhase15(rest)))).toEqual(restBefore);
    // La campagne continue avec une interview longue : publication simulée et jauges en hausse.
    const { state: next, report } = advanceWeek(
      state,
      {
        actions: [{ actionId: 'interview-longue' }],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    );
    const player = state.player.actorId!;
    expect(report.numerique.filter((p) => p.acteurId === player)).toHaveLength(1);
    expect(next.numerique.publications.some((p) => p.acteurId === player)).toBe(true);
    const jeunesse = report.changes.find((c) => c.actorId === player && c.ressource === 'jeunesse');
    expect(jeunesse!.factors.some((f) => f.source === 'action')).toBe(true);
  });

  it('ajoute les débats télévisés et passe au jeu de règles courant (format 14)', () => {
    const { state, migratedFrom } = loadStoredState(V14.state, V14.stateHash, 14);
    expect(migratedFrom).toBe(14);
    expect(state.meta).toMatchObject({
      week: V14.state.meta.week,
      date: V14.state.meta.date,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(state.debats).toEqual({ seances: [] });
    // Passages récents reconstitués d'après le fil des publications.
    expect(state.numerique.publications).toEqual(V14.state.numerique.publications);
    for (const post of V14.state.numerique.publications)
      expect(state.numerique.passages[post.acteurId]?.[post.actionId]).toContain(post.semaine);
    const { meta: _meta, debats: _d, numerique: _n, ...rest } = state;
    const { meta: _m, numerique: _nb, ...restBefore } = V14.state;
    expect(withoutPollNews(withoutPhase13(withoutPhase15(rest)))).toEqual(restBefore);
    // La campagne continue : la semaine du premier débat télévisé se résout.
    let current = state;
    for (let i = 0; i < 2; i++)
      current = advanceWeek(
        current,
        {
          actions: [],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    expect(current.meta.week).toBe(state.meta.week + 2);
  });

  it('passe au jeu de règles 13 sans rien perdre (format 15, débat déjà tenu)', () => {
    const { state, migratedFrom } = loadStoredState(V15.state, V15.stateHash, 15);
    expect(migratedFrom).toBe(15);
    expect(state.meta).toMatchObject({
      week: V15.state.meta.week,
      date: V15.state.meta.date,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    const { meta: _meta, ...rest } = state;
    const { meta: _m, ...restBefore } = V15.state;
    expect(withoutPollNews(withoutPhase13(withoutPhase15(rest)))).toEqual(restBefore);
    expect(state.debats.seances.some((d) => d.statut === 'termine')).toBe(true);
    // La campagne continue avec le jeu de règles 13 : interview longue et réactions.
    const { state: next, report } = advanceWeek(
      state,
      {
        actions: [{ actionId: 'interview-longue' }],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    );
    expect(next.meta.week).toBe(state.meta.week + 1);
    expect(report.numerique.some((p) => p.acteurId === state.player.actorId)).toBe(true);
  });

  it('passe au jeu de règles 14 sans rien perdre (format 16, gouvernement de figures réelles)', () => {
    // Président IA, Premier ministre et ministres régaliens choisis parmi les figures réelles,
    // textes déjà votés à l'Assemblée.
    expect(V16.state.quinquennat.gouvernement.premierMinistre.nature).toBe('figure');
    expect(V16.state.parlement.textes.some((b) => b.votes.length > 0)).toBe(true);
    const { state, migratedFrom } = loadStoredState(V16.state, V16.stateHash, 16);
    expect(migratedFrom).toBe(16);
    expect(state.meta).toMatchObject({
      week: V16.state.meta.week,
      date: V16.state.meta.date,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Tension parlementaire calculée selon le jeu de règles 14 : somme exacte de ses facteurs.
    const { tension } = state.parlement!;
    expect(tension.facteurs.length).toBeGreaterThan(0);
    expect(tension.valeur).toBe(tension.facteurs.reduce((sum, f) => sum + f.valeur, 0));
    // Rien d'autre ne change : gouvernement, textes et votes, sondages, économie.
    const { meta: _meta, ...rest } = state;
    const { meta: _m, ...restBefore } = V16.state;
    expect(withoutPhase13(withoutPhase15(rest))).toEqual(restBefore);
    // Le quinquennat continue avec le jeu de règles 14, de façon déterministe.
    const play = () => {
      let current = state;
      for (let i = 0; i < 6; i++)
        current = advanceWeek(
          current,
          {
            actions: [],
            decisions: current.pendingDecisions.map((d) => ({
              decisionId: d.id,
              optionId: d.defaultOptionId,
            })),
          },
          { ruleset },
        ).state;
      return current;
    };
    const later = play();
    expect(later.meta.week).toBe(state.meta.week + 6);
    expect(GameStateSchema.parse(later)).toEqual(later);
    expect(later.parlement!.tension.valeur).toBe(
      later.parlement!.tension.facteurs.reduce((sum, f) => sum + f.valeur, 0),
    );
    expect(play()).toEqual(later);
  });

  it('passe au jeu de règles 15 sans rien perdre (format 17, gouvernement de figures réelles)', () => {
    // Président IA, gouvernement de figures réelles, d'un candidat de la partie et de profils.
    const government = V17.state.quinquennat.gouvernement;
    expect(government.premierMinistre.nature).toBe('figure');
    expect(government.ministres.filter((m) => m.nature === 'figure').length).toBeGreaterThan(2);
    const { state, migratedFrom } = loadStoredState(V17.state, V17.stateHash, 17);
    expect(migratedFrom).toBe(17);
    expect(state.meta).toMatchObject({
      week: V17.state.meta.week,
      date: V17.state.meta.date,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Rien d'autre ne change (hors ajouts du format 19) ; chaque personnalité citée figure dans
    // le vivier du jeu de règles courant.
    const { meta: _meta, ...rest } = state;
    const { meta: _m, ...restBefore } = V17.state;
    expect(withoutPhase15(rest)).toEqual(restBefore);
    const known = new Set(ruleset.figures.figures.map((f) => f.id));
    const members = [government.premierMinistre, ...government.ministres];
    for (const m of members.filter((x) => x.nature === 'figure'))
      expect(known.has(m.ref)).toBe(true);
    // Le quinquennat continue avec le jeu de règles 15, de façon déterministe.
    const play = () => {
      let current = state;
      for (let i = 0; i < 6; i++)
        current = advanceWeek(
          current,
          {
            actions: [],
            decisions: current.pendingDecisions.map((d) => ({
              decisionId: d.id,
              optionId: d.defaultOptionId,
            })),
          },
          { ruleset },
        ).state;
      return current;
    };
    const later = play();
    expect(later.meta.week).toBe(state.meta.week + 6);
    expect(GameStateSchema.parse(later)).toEqual(later);
    expect(play()).toEqual(later);
    // Suivi des ministres et objectifs du mandat : initialisés au premier Conseil des ministres.
    const seated = later.quinquennat!.gouvernement!;
    expect(Object.keys(later.quinquennat!.suivi).sort()).toEqual(
      [seated.premierMinistre, ...seated.ministres].map((m) => m.ref).sort(),
    );
    expect(later.quinquennat!.objectifs).toHaveLength(ruleset.objectifs.nombre);
  });

  it('passe au jeu de règles 16 sans rien perdre (format 18, session ordinaire)', () => {
    // Président IA, gouvernement de figures réelles placées par expertise, octobre 2027.
    expect(V18.state.quinquennat.gouvernement.ministres.every((m) => m.nature === 'figure')).toBe(
      true,
    );
    const { state, migratedFrom } = loadStoredState(V18.state, V18.stateHash, 18);
    expect(migratedFrom).toBe(18);
    expect(state.meta).toMatchObject({
      week: V18.state.meta.week,
      date: V18.state.meta.date,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // Rien d'autre ne change que les ajouts du format 19, à leurs valeurs de migration.
    const { meta: _meta, ...rest } = state;
    const { meta: _m, ...restBefore } = V18.state;
    expect(withoutPhase15(rest)).toEqual(restBefore);
    // La partie continue avec le jeu de règles 16, de façon déterministe.
    const play = () => {
      let current = state;
      for (let i = 0; i < 6; i++)
        current = advanceWeek(
          current,
          {
            actions: [],
            decisions: current.pendingDecisions.map((d) => ({
              decisionId: d.id,
              optionId: d.defaultOptionId,
            })),
          },
          { ruleset },
        ).state;
      return current;
    };
    const later = play();
    expect(later.meta.week).toBe(state.meta.week + 6);
    expect(GameStateSchema.parse(later)).toEqual(later);
    expect(play()).toEqual(later);
    // Suivi des ministres et objectifs du mandat : initialisés au premier Conseil des ministres.
    const seated = later.quinquennat!.gouvernement!;
    expect(Object.keys(later.quinquennat!.suivi).sort()).toEqual(
      [seated.premierMinistre, ...seated.ministres].map((m) => m.ref).sort(),
    );
    expect(later.quinquennat!.objectifs).toHaveLength(ruleset.objectifs.nombre);
  });

  it('passe au jeu de règles 17 sans rien perdre (format 19, campagne au niveau expert)', () => {
    const { state, migratedFrom } = loadStoredState(V19.state, V19.stateHash, 19);
    expect(migratedFrom).toBe(19);
    expect(state.meta).toMatchObject({
      week: V19.state.meta.week,
      date: V19.state.meta.date,
      difficulty: 'expert',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    // La difficulté est figée à la création : ni le niveau ni les moyens des candidats ne
    // changent à la migration.
    const { meta: _meta, player, suites, succession, socle, ...rest } = withoutPhase25(state);
    const { meta: _m, player: before, ...restBefore } = V19.state;
    expect(suites).toEqual([]);
    expect(succession).toBeNull();
    expect(rest).toEqual(restBefore);
    expect(player).toEqual({ ...before, format: 'complet', depart: 'equitable' });
    expect(socle).toBeNull();
    // La campagne continue avec le jeu de règles courant, débats compris, de façon déterministe.
    const play = () => {
      let current = state;
      for (let i = 0; i < 6; i++) {
        for (
          let debate = debateAwaitingPlayer(current);
          debate;
          debate = debateAwaitingPlayer(current)
        )
          current = playDebate(current, ruleset, debate.id, {
            action: 'finir',
            sequence: debate.enCours?.index ?? 0,
          }).state;
        current = advanceWeek(
          current,
          {
            actions: [],
            decisions: current.pendingDecisions.map((d) => ({
              decisionId: d.id,
              optionId: d.defaultOptionId,
            })),
          },
          { ruleset },
        ).state;
      }
      return current;
    };
    const later = play();
    expect(later.meta.week).toBe(state.meta.week + 6);
    expect(GameStateSchema.parse(later)).toEqual(later);
    expect(play()).toEqual(later);
  });

  it('passe au format 21 sans rien perdre : une partie existante reste au format complet (format 20)', () => {
    const { state, migratedFrom } = loadStoredState(V20.state, V20.stateHash, 20);
    expect(migratedFrom).toBe(20);
    expect(state.meta).toMatchObject({
      week: V20.state.meta.week,
      difficulty: 'legende',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(state.player.format).toBe('complet');
    const { meta: _meta, player, suites, succession, socle, ...rest } = withoutPhase25(state);
    const { meta: _m, player: before, ...restBefore } = V20.state;
    expect(suites).toEqual([]);
    expect(succession).toBeNull();
    expect(rest).toEqual(restBefore);
    expect(player).toEqual({ ...before, format: 'complet', depart: 'equitable' });
    expect(socle).toBeNull();
    const next = advanceWeek(
      state,
      {
        actions: [],
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset },
    ).state;
    expect(next.meta.week).toBe(state.meta.week + 1);
    expect(GameStateSchema.parse(next)).toEqual(next);
  });

  it('passe au jeu de règles 18 sans rien perdre : aucune suite programmée (format 21, format court)', () => {
    const { state, migratedFrom } = loadStoredState(V21.state, V21.stateHash, 21);
    expect(migratedFrom).toBe(21);
    expect(state.meta).toMatchObject({
      week: V21.state.meta.week,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    const { meta: _meta, suites, succession, socle, player, ...rest } = withoutPhase25(state);
    const { meta: _m, player: before, ...restBefore } = V21.state;
    expect(socle).toBeNull();
    expect(player).toEqual({ ...before, depart: 'equitable' });
    expect(suites).toEqual([]);
    expect(succession).toBeNull();
    expect(rest).toEqual(restBefore);
    expect(state.player.format).toBe('court');
    // La campagne continue avec les chaînes et les coups adverses du jeu de règles 18.
    let current = state;
    for (let i = 0; i < 4; i++)
      current = advanceWeek(
        current,
        {
          actions: [],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    expect(current.meta.week).toBe(state.meta.week + 4);
    expect(GameStateSchema.parse(current)).toEqual(current);
  });

  it('passe au format 23 sans rien perdre : aucune succession en cours (format 22, fin de quinquennat)', () => {
    const { state, migratedFrom, stateHash } = loadStoredState(V22.state, V22.stateHash, 22);
    expect(migratedFrom).toBe(22);
    expect(state.meta).toMatchObject({
      week: V22.state.meta.week,
      date: '2031-08-04',
      phase: 'presidence',
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: CURRENT_RULESET_KEY,
    });
    expect(SAVE_SCHEMA_VERSION).toBe(26);
    expect(stateHash).toBe(hashState(state));
    expect(stateHash).not.toBe(V22.stateHash);
    const { meta: _meta, succession, socle, player, ...rest } = withoutPhase25(state);
    const { meta: _m, player: before, ...restBefore } = V22.state;
    expect(socle).toBeNull();
    expect(player).toEqual({ ...before, depart: 'equitable' });
    expect(succession).toBeNull();
    // Format 26 : le journal de mandat naît vide.
    const { suivisDecisions, ...quinquennat } = rest.quinquennat!;
    expect(suivisDecisions).toEqual([]);
    expect({ ...rest, quinquennat }).toEqual(restBefore);
    // Aucun acteur ne reçoit de fiche de figure : seules les entrées de la phase 23 en ont une.
    for (const actor of Object.values(state.actors))
      expect(actor.candidate.figureId).toBeUndefined();
    // Le quinquennat continue avec le jeu de règles courant, de façon déterministe.
    const play = () => {
      let current = state;
      for (let i = 0; i < 2; i++)
        current = advanceWeek(
          current,
          {
            actions: [],
            decisions: current.pendingDecisions.map((d) => ({
              decisionId: d.id,
              optionId: d.defaultOptionId,
            })),
          },
          { ruleset },
        ).state;
      return current;
    };
    const later = play();
    expect(later.meta.week).toBe(state.meta.week + 2);
    expect(GameStateSchema.parse(later)).toEqual(later);
    expect(play()).toEqual(later);
  });

  it('une partie migrée en fin de quinquennat reçoit la décision de candidature (format 22)', () => {
    const { state } = loadStoredState(V22.state, V22.stateHash, 22);
    const step = (current: GameState, choose: (ids: string[]) => string | undefined) =>
      advanceWeek(
        current,
        {
          actions: [],
          decisions: current.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId:
              d.kind === 'candidature'
                ? (choose(d.options.map((o) => o.id)) ?? d.defaultOptionId)
                : d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    let current = state;
    while (!current.pendingDecisions.some((d) => d.kind === 'candidature'))
      current = step(current, () => undefined);
    expect(current.meta.date).toBe('2031-09-01');
    const decision = current.pendingDecisions.find((d) => d.kind === 'candidature')!;
    // Édouard Philippe (Horizons), battu en 2027 : se représenter, ou une figure de son parti.
    expect(decision.defaultOptionId).toBe('se-representer');
    const figure = decision.options.find((o) => o.id.startsWith('successeur-figure-'))!;
    expect(figure.description).toMatch(
      /^Horizons ; .+ ; personnalité réelle, candidature simulée$/,
    );
    while (current.meta.phase === 'presidence') current = step(current, () => figure.id);
    const successorId = `entrant-2032-${figure.id.replace('successeur-figure-', '')}`;
    expect(current.player.actorId).toBe(successorId);
    expect(current.actors[successorId]).toMatchObject({ kind: 'joueur', status: 'candidat' });
    expect(current.actors[PLAYER_ACTOR_ID]).toMatchObject({ kind: 'adversaire', status: 'retire' });
    expect(GameStateSchema.parse(current)).toEqual(current);
  });

  it('passe au format 25 en pleine campagne : implantation de départ, projection vide, intentions inchangées', () => {
    // Partie la plus récente en campagne (format 21, format court) : joueur personnalisé et
    // adversaires fictifs ; migrée de proche en proche jusqu'au format 25.
    const { state } = loadStoredState(V21.state, V21.stateHash, 21);
    expect(state.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    const departements = ruleset.parrainages.reservoir.departements;
    const codes = Object.keys(departements).sort();
    expect(Object.keys(state.implantation).sort()).toEqual(Object.keys(state.actors).sort());
    for (const [id, actor] of Object.entries(state.actors)) {
      const map = state.implantation[id]!;
      expect(Object.keys(map).sort()).toEqual(codes);
      for (const code of codes) {
        const expected =
          actor.candidate.nature === 'personnalise'
            ? 0
            : actor.implantation.includes(departements[code]!.region)
              ? 30
              : 0;
        expect(map[code], `${id} ${code}`).toBe(expected);
      }
    }
    expect(Object.values(state.implantation[PLAYER_ACTOR_ID]!).every((v) => v === 0)).toBe(true);
    expect(state.implantation['adv-aurore']!['75']).toBe(30);
    expect(state.implantation['adv-aurore']!['29']).toBe(0);
    // Aucune projection avant la semaine suivante, intentions et participation inchangées.
    expect(state.opinion?.departements).toEqual({});
    expect(state.opinion?.intentions).toEqual(V21.state.opinion!.intentions);
    expect(state.opinion?.participation).toBe(V21.state.opinion!.participation);
    expect(GameStateSchema.parse(state)).toEqual(state);
    // Une personnalité réelle (joueur de la phase 22) part de 30 dans sa région d'implantation.
    const presidence = loadStoredState(V22.state, V22.stateHash, 22).state;
    const reel = presidence.actors[PLAYER_ACTOR_ID]!;
    expect(reel.candidate.nature).toBe('reel');
    for (const code of codes)
      expect(presidence.implantation[PLAYER_ACTOR_ID]![code]).toBe(
        reel.implantation.includes(departements[code]!.region) ? 30 : 0,
      );
  });

  it('refuse un état qui cite une personnalité absente du vivier courant', () => {
    const altered = JSON.parse(JSON.stringify(V17.state)) as typeof V17.state;
    altered.quinquennat.gouvernement.ministres[0]!.ref = 'figure-inconnue';
    expect(errorCode(() => upgradeState(altered, 17))).toBe('incoherence');
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
    expect(errorCode(() => upgradeState(V8.state, 9))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V9.state, 10))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V10.state, 11))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V11.state, 12))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V12.state, 13))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V13.state, 14))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V14.state, 15))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V15.state, 16))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V16.state, 17))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V17.state, 18))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V18.state, 19))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V19.state, 20))).toBe('etat_invalide');
    expect(errorCode(() => upgradeState(V20.state, 21))).toBe('etat_invalide');
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
