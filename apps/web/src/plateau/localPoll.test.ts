import type { GameState } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { initialState } from '../test/utils';
import {
  LEADER_COLORS,
  leaderColors,
  localPoll,
  OTHER_LEADERS_COLOR,
  rankingText,
  topOfPoll,
} from './localPoll';

// Mini-sondage local (phase 25 bis) : le classement d'un département, lu tel quel dans la
// projection simulée du moteur (`opinion.departements`), trié et mis en forme pour l'affichage.

const PLAYER = 'joueur';

/** État de test avec une projection posée à la main (centièmes de point). */
function withProjection(departements: Record<string, Record<string, number>>): GameState {
  const state = initialState();
  state.opinion = {
    week: 1,
    round: 1,
    participation: 7_000,
    intentions: {},
    breakdown: {},
    departements,
  };
  return state;
}

describe('mini-sondage local', () => {
  it('classe les candidats du plus haut au plus bas et marque le joueur', () => {
    const state = withProjection({
      '02': { 'adv-pilier': 2_740, [PLAYER]: 880, 'adv-rempart': 1_910, 'adv-aurore': 1_200 },
    });
    const poll = localPoll(state, '02')!;
    expect(poll.entries.map((e) => [e.nom, e.share, e.rank])).toEqual([
      ['Rivière', 2_740, 1],
      ['Laborde', 1_910, 2],
      ['Marchetti', 1_200, 3],
      ['Test', 880, 4],
    ]);
    expect(poll.leader.actorId).toBe('adv-pilier');
    expect(poll.player).toMatchObject({ actorId: PLAYER, rank: 4, isPlayer: true });
    expect(poll.entries.filter((e) => e.isPlayer)).toHaveLength(1);
    expect(poll.tie).toBe(false);
  });

  it('égalité de score : même rang, ordre stable, égalité en tête signalée', () => {
    const state = withProjection({
      '29': { 'adv-rempart': 2_000, [PLAYER]: 2_000, 'adv-aurore': 1_500 },
    });
    const poll = localPoll(state, '29')!;
    // Départage stable par identifiant : « adv-rempart » avant « joueur ».
    expect(poll.entries.map((e) => [e.actorId, e.rank])).toEqual([
      ['adv-rempart', 1],
      [PLAYER, 1],
      ['adv-aurore', 3],
    ]);
    expect(poll.tie).toBe(true);
    expect(rankingText(poll)).toBe('Laborde 20,0 %, vous 20,0 %, Marchetti 15,0 %');
  });

  it('candidat inconnu de la partie : nommé par son identifiant ; joueur absent : aucune ligne « vous »', () => {
    const state = withProjection({ '13': { 'adv-aurore': 2_600, fantome: 900 } });
    const poll = localPoll(state, '13')!;
    expect(poll.entries.map((e) => e.nom)).toEqual(['Marchetti', 'fantome']);
    expect(poll.player).toBeNull();
    expect(rankingText(poll)).toBe('Marchetti 26,0 %, fantome 9,0 %');
  });

  it('projection vide ou absente : rien à classer', () => {
    expect(localPoll(initialState(), '29')).toBeNull();
    expect(localPoll(withProjection({}), '29')).toBeNull();
    expect(localPoll(withProjection({ '29': {} }), '29')).toBeNull();
  });

  it('cinq premiers, plus le joueur s’il est plus loin ; le classement écrit garde le joueur', () => {
    const state = withProjection({
      '59': {
        'adv-pilier': 2_400,
        'adv-rempart': 2_100,
        'adv-aurore': 1_800,
        'adv-boussole': 1_500,
        'adv-agora': 1_200,
        'adv-canopee': 900,
        [PLAYER]: 500,
      },
    });
    const poll = localPoll(state, '59')!;
    const { top, extra } = topOfPoll(poll, 5);
    expect(top.map((e) => e.nom)).toEqual([
      'Rivière',
      'Laborde',
      'Marchetti',
      'Delorme',
      'Castaing',
    ]);
    expect(extra).toMatchObject({ actorId: PLAYER, rank: 7 });
    expect(rankingText(poll)).toBe('Rivière 24,0 %, Laborde 21,0 %, Marchetti 18,0 %, vous 5,0 %');
    // Joueur déjà parmi les premiers : pas de ligne en plus.
    expect(topOfPoll(poll, 7).extra).toBeNull();
  });
});

describe('couleurs des leaders (lecture « Qui mène »)', () => {
  it('deux adversaires en tête ont deux couleurs différentes ; le joueur n’en prend aucune', () => {
    const state = withProjection({
      '01': { 'adv-rempart': 2_400, 'adv-pilier': 2_000, [PLAYER]: 900 },
      '02': { 'adv-pilier': 2_500, 'adv-rempart': 2_000, [PLAYER]: 900 },
      '29': { [PLAYER]: 3_000, 'adv-pilier': 2_000 },
    });
    const { colors, others } = leaderColors(state);
    expect(colors.get('adv-pilier')).toBeDefined();
    expect(colors.get('adv-rempart')).toBeDefined();
    expect(colors.get('adv-pilier')).not.toBe(colors.get('adv-rempart'));
    expect(colors.has(PLAYER)).toBe(false);
    expect(others).toEqual([]);
    // Ordre des acteurs de la partie, pas le nombre de départements menés : Rivière (adv-pilier)
    // vient avant Laborde (adv-rempart).
    expect(colors.get('adv-pilier')).toBe(LEADER_COLORS[0]);
    expect(colors.get('adv-rempart')).toBe(LEADER_COLORS[1]);
  });

  it('au-delà de quatre adversaires en tête, les suivants partagent la couleur « autres »', () => {
    const ids = [
      'adv-etincelle',
      'adv-aurore',
      'adv-canopee',
      'adv-agora',
      'adv-boussole',
      'adv-pilier',
    ];
    const state = withProjection(
      Object.fromEntries(ids.map((id, i) => [`0${i + 1}`, { [id]: 3_000, [PLAYER]: 1_000 }])),
    );
    const { colors, others } = leaderColors(state);
    expect([...colors.keys()]).toEqual(ids.slice(0, LEADER_COLORS.length));
    expect(new Set(colors.values()).size).toBe(LEADER_COLORS.length);
    expect(others).toEqual(ids.slice(LEADER_COLORS.length));
    expect(OTHER_LEADERS_COLOR).not.toBe(LEADER_COLORS[0]);
  });
});
