import { debateAwaitingPlayer, type GameState } from '@r2027/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { advanceWeek } from '../core/advanceWeek';
import { PLAYER_ACTOR_ID } from '../core/createGame';
import { EngineInputError } from '../core/errors';
import {
  concludeDebates,
  deepFreeze,
  newGame,
  playUntil,
  RULESET,
  sponsorship,
} from '../core/testing';
import { angleHolds, playDebate } from './debats';
import { distribute, summarize } from './distribution';

// Débats télévisés (phase 10) : programmation, cartes du joueur, IA, attaques factuelles et
// retour de bâton, effets par le registre, facteur de vote borné, entre-deux-tours.

const decisionsOf = (state: GameState) =>
  state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId }));

/** Joue avec des parrainages jusqu'à ce qu'un débat de la semaine existe. */
function untilDebate(start: GameState, id: string) {
  return playUntil(
    start,
    (s) => s.debats.seances.some((d) => d.id === id && d.semaine === s.meta.week),
    RULESET,
    (s) => sponsorship(s),
  ).state;
}

const sessionOf = (state: GameState, id: string) => state.debats.seances.find((d) => d.id === id)!;

/** Joue la première carte proposée à chaque séquence jusqu'à la fin du débat. */
function playFirstCards(state: GameState, id: string): GameState {
  let current = state;
  for (let i = 0; i < 12; i++) {
    const session = sessionOf(current, id);
    if (session.statut === 'termine' || !session.enCours) break;
    const card = session.enCours.cartes[0]!;
    current = playDebate(current, RULESET, id, {
      action: 'jouer',
      sequence: session.enCours.index,
      carte: card.carte,
    }).state;
  }
  return current;
}

let allCandidates: GameState;
beforeAll(() => {
  allCandidates = untilDebate(newGame({ seed: 'debats-1' }), 'debat-t1-tous');
});

describe('débats télévisés (phase 10)', () => {
  it('programme le débat de la semaine : invités, première séquence et trois cartes', () => {
    const session = sessionOf(allCandidates, 'debat-t1-tous');
    const candidates = Object.values(allCandidates.actors)
      .filter((a) => a.status === 'candidat')
      .map((a) => a.id)
      .sort();
    expect(session.invites).toEqual(candidates);
    expect(session.invites).toContain(PLAYER_ACTOR_ID);
    expect(session.statut).toBe('prevu');
    expect(session.themes.at(-1)).toBe('conclusion');
    expect(session.enCours?.index).toBe(0);
    expect(session.enCours?.cartes.map((c) => c.carte)).toContain('attaquer');
    expect(session.enCours?.cartes).toHaveLength(3);
    // Le grand débat à cinq a eu lieu deux semaines plus tôt, effets appliqués.
    const five = sessionOf(allCandidates, 'debat-t1-principaux');
    expect(five.invites.length).toBeLessThanOrEqual(5);
    expect(five.resultat?.applique).toBe(true);
  });

  it('joue un débat carte par carte, de façon déterministe et sans modifier l’état reçu', () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(allCandidates)) as GameState);
    const a = playFirstCards(frozen, 'debat-t1-tous');
    const b = playFirstCards(frozen, 'debat-t1-tous');
    expect(a).toEqual(b);
    const session = sessionOf(a, 'debat-t1-tous');
    expect(session.statut).toBe('termine');
    expect(session.sequences).toHaveLength(session.themes.length);
    expect(
      session.sequences.every((s) => s.coups.some((m) => m.acteurId === PLAYER_ACTOR_ID)),
    ).toBe(true);
    const shares = Object.values(session.resultat!.convaincant);
    expect(shares.reduce((x, y) => x + y, 0)).toBe(10_000);
    for (const p of Object.values(session.resultat!.prestation)) {
      expect(p).toBeGreaterThanOrEqual(-1);
      expect(p).toBeLessThanOrEqual(1);
    }
    // Sur le plateau, chaque approbation reste entre 0 et 100.
    for (const v of Object.values(session.approbation)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('retourne toujours une attaque fondée sur un fait faux contre son auteur', () => {
    let backfires = 0;
    for (const seed of ['retour-1', 'retour-2', 'retour-3', 'retour-4', 'retour-5']) {
      const state = JSON.parse(JSON.stringify(allCandidates)) as GameState;
      state.meta.seed = seed;
      const session = sessionOf(state, 'debat-t1-tous');
      const target = session.invites.find(
        (id) => id !== PLAYER_ACTOR_ID && !angleHolds(state, RULESET, id, 'revirements'),
      )!;
      const after = playDebate(state, RULESET, 'debat-t1-tous', {
        action: 'jouer',
        sequence: 0,
        carte: 'attaquer',
        cible: target,
        angle: 'revirements',
      }).state;
      const move = sessionOf(after, 'debat-t1-tous').sequences[0]!.coups.find(
        (m) => m.acteurId === PLAYER_ACTOR_ID,
      )!;
      expect(move.issue).toBe('retourne');
      expect(move.effets[PLAYER_ACTOR_ID]!).toBeLessThan(0);
      expect(move.effets[target]!).toBeGreaterThan(0);
      backfires++;
    }
    expect(backfires).toBe(5);
  });

  it('fait porter une attaque fondée sur la cible', () => {
    const state = JSON.parse(JSON.stringify(allCandidates)) as GameState;
    const session = sessionOf(state, 'debat-t1-tous');
    const target = session.invites.find((id) => id !== PLAYER_ACTOR_ID)!;
    state.actors[target]!.programme.revirements = 2;
    expect(angleHolds(state, RULESET, target, 'revirements')).toBe(true);
    const after = playDebate(state, RULESET, 'debat-t1-tous', {
      action: 'jouer',
      sequence: 0,
      carte: 'attaquer',
      cible: target,
      angle: 'revirements',
    }).state;
    const move = sessionOf(after, 'debat-t1-tous').sequences[0]!.coups.find(
      (m) => m.acteurId === PLAYER_ACTOR_ID,
    )!;
    expect(['reussi', 'rate']).toContain(move.issue);
    expect(move.effets[target]!).toBeLessThan(0);
  });

  it('refuse une carte non proposée, une séquence périmée, un débat absent', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return (error as { code?: string }).code;
      }
      return null;
    };
    expect(
      code(() =>
        playDebate(allCandidates, RULESET, 'debat-t1-tous', {
          action: 'jouer',
          sequence: 3,
          carte: 'defendre',
        }),
      ),
    ).toBe('sequence_perimee');
    expect(
      code(() =>
        playDebate(allCandidates, RULESET, 'debat-t1-tous', {
          action: 'jouer',
          sequence: 0,
          carte: 'attaquer',
          cible: PLAYER_ACTOR_ID,
          angle: 'finances',
        }),
      ),
    ).toBe('carte_invalide');
    expect(code(() => playDebate(allCandidates, RULESET, 'debat-t2', { action: 'ouvrir' }))).toBe(
      'debat_introuvable',
    );
  });

  it('applique les effets par le registre à la résolution de la semaine', () => {
    const played = playFirstCards(allCandidates, 'debat-t1-tous');
    const { state, report } = advanceWeek(
      played,
      { actions: [], decisions: decisionsOf(played) },
      { ruleset: RULESET },
    );
    expect(sessionOf(state, 'debat-t1-tous').resultat?.applique).toBe(true);
    const debateFactors = report.changes.flatMap((c) =>
      c.factors.filter((f) => f.source === 'debat').map((f) => ({ ...f, actorId: c.actorId })),
    );
    expect(debateFactors.some((f) => f.actorId === PLAYER_ACTOR_ID)).toBe(true);
    for (const change of report.changes)
      expect(change.factors.reduce((s, f) => s + f.value, 0)).toBe(change.after - change.before);
    expect(report.events.some((e) => e.refId === 'debat-t1-tous')).toBe(true);
    // Effets appliqués une seule fois.
    const next = advanceWeek(
      state,
      { actions: [], decisions: decisionsOf(state) },
      { ruleset: RULESET },
    );
    expect(next.report.changes.flatMap((c) => c.factors).some((f) => f.source === 'debat')).toBe(
      false,
    );
  });

  it('pénalise la chaise vide et simule le débat sans le joueur', () => {
    const refused = playDebate(allCandidates, RULESET, 'debat-t1-tous', {
      action: 'refuser',
    }).state;
    const session = sessionOf(refused, 'debat-t1-tous');
    expect(session.refus).toContain(PLAYER_ACTOR_ID);
    expect(session.enCours).toBeNull();
    const { state, report } = advanceWeek(
      refused,
      { actions: [], decisions: decisionsOf(refused) },
      { ruleset: RULESET },
    );
    const done = sessionOf(state, 'debat-t1-tous');
    expect(done.statut).toBe('termine');
    expect(done.resultat!.prestation[PLAYER_ACTOR_ID]).toBe(
      RULESET.debats.effets.prestationChaiseVide,
    );
    expect(done.sequences.flatMap((s) => s.coups).some((m) => m.acteurId === PLAYER_ACTOR_ID)).toBe(
      false,
    );
    const popularity = report.changes.find(
      (c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite',
    )!;
    expect(
      popularity.factors.find((f) => f.source === 'debat' && f.label.includes('chaise vide'))
        ?.value,
    ).toBe(-RULESET.debats.effets.chaiseVide);
  });

  it('borne l’effet d’un débat à ±2 points d’intentions au premier tour', () => {
    const played = playFirstCards(allCandidates, 'debat-t1-tous');
    const { state } = advanceWeek(
      played,
      { actions: [], decisions: decisionsOf(played) },
      { ruleset: RULESET },
    );
    // Pire cas réaliste d'un débat (prestations centrées sur la moyenne du plateau, donc de somme
    // nulle) : un candidat à +1 ou à −1, les autres se partageant l'inverse ; sans estompage.
    const opinion = (s: GameState) => summarize(distribute(s, RULESET, 1, 'opinion'), 0, 1)!;
    const withDebate = (star: string, value: number) => {
      const s = JSON.parse(JSON.stringify(state)) as GameState;
      for (const d of s.debats.seances)
        for (const id of Object.keys(d.resultat!.prestation)) d.resultat!.prestation[id] = 0;
      const target = s.debats.seances.find((d) => d.id === 'debat-t1-tous')!;
      const ids = Object.keys(target.resultat!.prestation);
      for (const id of ids)
        target.resultat!.prestation[id] = id === star ? value : -value / (ids.length - 1);
      target.semaine = s.meta.week;
      return opinion(s).intentions;
    };
    const neutral = withDebate(PLAYER_ACTOR_ID, 0);
    let a = neutral;
    let worst = 0;
    for (const star of Object.keys(neutral))
      for (const value of [1, -1]) {
        const shifted = withDebate(star, value);
        if (star === PLAYER_ACTOR_ID && value === 1) a = shifted;
        for (const id of Object.keys(shifted)) {
          worst = Math.max(worst, Math.abs(shifted[id]! - neutral[id]!));
        }
      }
    expect(worst).toBeLessThanOrEqual(200);
    // L'effet existe bel et bien (surtout pour les candidats les mieux placés).
    expect(worst).toBeGreaterThan(50);
    expect(a[PLAYER_ACTOR_ID]!).toBeGreaterThan(neutral[PLAYER_ACTOR_ID]!);
  });

  it('use la préparation de 10 % par semaine', () => {
    const state = JSON.parse(JSON.stringify(allCandidates)) as GameState;
    state.actors[PLAYER_ACTOR_ID]!.preparationDebat = 40;
    const { state: next } = advanceWeek(
      concludeDebates(state),
      { actions: [], decisions: decisionsOf(state) },
      { ruleset: RULESET },
    );
    expect(next.actors[PLAYER_ACTOR_ID]!.preparationDebat).toBe(36);
  });
});

describe('débat obligatoire (phase 17)', () => {
  const advanceRefusal = (state: GameState) => {
    try {
      advanceWeek(state, { actions: [], decisions: decisionsOf(state) }, { ruleset: RULESET });
      return null;
    } catch (error) {
      return error instanceof EngineInputError ? error.code : String(error);
    }
  };

  it('bloque la semaine tant que le débat attend le joueur sur le plateau', () => {
    expect(debateAwaitingPlayer(allCandidates)?.id).toBe('debat-t1-tous');
    expect(advanceRefusal(allCandidates)).toBe('debat_requis');
    // Une carte jouée ne suffit pas : le débat doit aller jusqu'au bout.
    const session = sessionOf(allCandidates, 'debat-t1-tous');
    const started = playDebate(allCandidates, RULESET, 'debat-t1-tous', {
      action: 'jouer',
      sequence: session.enCours!.index,
      carte: session.enCours!.cartes[0]!.carte,
    }).state;
    expect(sessionOf(started, 'debat-t1-tous').statut).toBe('en_cours');
    expect(advanceRefusal(started)).toBe('debat_requis');
  });

  it('se lève par un choix du joueur : débat joué, fin simulée ou chaise vide', () => {
    const played = playFirstCards(allCandidates, 'debat-t1-tous');
    expect(debateAwaitingPlayer(played)).toBeUndefined();
    expect(advanceRefusal(played)).toBeNull();

    const simulated = concludeDebates(allCandidates);
    expect(sessionOf(simulated, 'debat-t1-tous').statut).toBe('termine');
    expect(advanceRefusal(simulated)).toBeNull();

    const refused = playDebate(allCandidates, RULESET, 'debat-t1-tous', {
      action: 'refuser',
    }).state;
    expect(sessionOf(refused, 'debat-t1-tous').refus).toContain(PLAYER_ACTOR_ID);
    expect(debateAwaitingPlayer(refused)).toBeUndefined();
    const after = advanceWeek(
      refused,
      { actions: [], decisions: decisionsOf(refused) },
      { ruleset: RULESET },
    );
    // Chaise vide : le débat se tient sans le joueur, qui en paie le malus.
    expect(sessionOf(after.state, 'debat-t1-tous').statut).toBe('termine');
    expect(
      after.report.changes
        .find((c) => c.actorId === PLAYER_ACTOR_ID && c.ressource === 'popularite')!
        .factors.some((f) => f.label.endsWith(': chaise vide')),
    ).toBe(true);
  });

  it('ne bloque ni l’observateur, ni le joueur absent du plateau ou éliminé', () => {
    const observer = untilDebate(
      newGame({ seed: 'debats-1', mode: 'observateur' }),
      'debat-t1-tous',
    );
    expect(sessionOf(observer, 'debat-t1-tous')).toBeDefined();
    expect(debateAwaitingPlayer(observer)).toBeUndefined();
    expect(advanceRefusal(observer)).toBeNull();

    const notInvited = JSON.parse(JSON.stringify(allCandidates)) as GameState;
    const session = sessionOf(notInvited, 'debat-t1-tous');
    session.invites = session.invites.filter((id) => id !== PLAYER_ACTOR_ID);
    expect(advanceRefusal(notInvited)).toBeNull();

    const eliminated = JSON.parse(JSON.stringify(allCandidates)) as GameState;
    eliminated.actors[PLAYER_ACTOR_ID]!.status = 'elimine';
    expect(debateAwaitingPlayer(eliminated)).toBeUndefined();
  });
});

describe('débats et personnalités réelles', () => {
  it('n’écrit aucune réplique pour une personnalité réelle', () => {
    const state = untilDebate(
      newGame({ seed: 'debats-reels', adversaires: 'reels' }),
      'debat-t1-tous',
    );
    // Débat mené à son terme par la fin simulée demandée depuis le plateau, puis la semaine.
    const done = advanceWeek(
      concludeDebates(state),
      { actions: [], decisions: decisionsOf(state) },
      { ruleset: RULESET },
    ).state;
    const moves = sessionOf(done, 'debat-t1-tous').sequences.flatMap((s) => s.coups);
    const real = moves.filter((m) => done.actors[m.acteurId]!.candidate.nature === 'reel');
    expect(real.length).toBeGreaterThan(0);
    for (const m of real) expect(m.replique).toBeNull();
    // Les candidats fictifs (le joueur compris) ont leurs répliques, sans nom de personnalité réelle.
    const names = RULESET.personnalites.personnalites.map((p) => p.nom);
    for (const m of moves.filter((x) => done.actors[x.acteurId]!.candidate.nature !== 'reel')) {
      expect(m.replique).not.toBeNull();
      for (const name of names) expect(m.replique).not.toContain(name);
    }
    // Les personnalités réelles adverses n'ont pas de programme dans le jeu : l'angle est faux.
    for (const id of Object.keys(done.actors).filter(
      (x) => done.actors[x]!.candidate.nature === 'reel',
    ))
      expect(angleHolds(done, RULESET, id, 'programme')).toBe(false);
  });
});

describe('débat d’entre-deux-tours', () => {
  it('réunit les finalistes, se joue et renseigne la prestation du second tour', () => {
    const t2 = untilDebate(newGame({ seed: 'debats-t2' }), 'debat-t2');
    const session = sessionOf(t2, 'debat-t2');
    const finalists = Object.values(t2.actors)
      .filter((a) => a.status === 'qualifie')
      .map((a) => a.id)
      .sort();
    expect(session.invites).toEqual(finalists);
    expect(session.themes).toHaveLength(6);
    const { state } = advanceWeek(
      t2,
      { actions: [], decisions: decisionsOf(t2) },
      { ruleset: RULESET },
    );
    const done = sessionOf(state, 'debat-t2');
    expect(done.statut).toBe('termine');
    expect(state.elections.debate).toEqual(done.resultat!.prestation);
    expect(Object.keys(state.elections.debateDetail ?? {})).toEqual(finalists);
  });

  it('borne l’effet du débat à ±3 points au second tour', () => {
    const t2 = untilDebate(newGame({ seed: 'debats-t2' }), 'debat-t2');
    const [a, b] = sessionOf(t2, 'debat-t2').invites as [string, string];
    const withDebate = (pa: number, pb: number) => {
      const s = JSON.parse(JSON.stringify(t2)) as GameState;
      s.elections.debate = { [a]: pa, [b]: pb };
      return summarize(distribute(s, RULESET, 2, 'opinion'), 0, 2)!.intentions;
    };
    const extreme = withDebate(1, -1);
    const neutral = withDebate(0, 0);
    expect(Math.abs(extreme[a]! - neutral[a]!)).toBeLessThanOrEqual(300);
    expect(extreme[a]! - neutral[a]!).toBeGreaterThan(50);
  });
});
