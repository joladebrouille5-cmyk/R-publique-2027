import { describe, expect, it } from 'vitest';
import {
  computeProgression,
  creationParameters,
  CreationRefusal,
  deviceDate,
  gameOutcome,
  parisDate,
  type ProgressionGame,
  type ProgressionRules,
} from './progression';

// Progression (phase 20) : calcul pur partagé par l'API et le moteur local.

const RULES: ProgressionRules = {
  statut: 'hypothese',
  sourceId: 'conception-du-jeu',
  points: { partie: 10, premierTour: 20, secondTour: 30, victoire: 100, defi: 5 },
  niveaux: [
    { numero: 1, titre: 'Militant', points: 0 },
    { numero: 2, titre: 'Maire', points: 50 },
    { numero: 3, titre: 'Chef de l’État', points: 200 },
  ],
  deblocages: [
    { id: 'niveau-legende', libelle: 'Niveau Légende', difficulte: 'legende', victoires: 1 },
  ],
  defi: { difficulte: 'standard', format: 'court', scenarioId: 'standard' },
};

const round = (
  voix: Record<string, number>,
  qualified: string[],
  winner: string | null = null,
) => ({
  exprimes: Object.values(voix).reduce((a, b) => a + b, 0),
  voix,
  qualified,
  winner,
});

/** Partie minimale : semaine, premier tour et second tour éventuels, archives. */
function game(
  options: {
    seed?: string;
    week?: number;
    t1?: ReturnType<typeof round>;
    t2?: ReturnType<typeof round>;
    archives?: { t1: ReturnType<typeof round>; eluId: string }[];
    player?: string | null;
    difficulty?: string;
    format?: string;
  } = {},
): ProgressionGame {
  return {
    seed: options.seed ?? 'graine',
    state: {
      meta: { week: options.week ?? 5, difficulty: options.difficulty ?? 'standard' },
      player: {
        actorId: options.player === undefined ? 'joueur' : options.player,
        format: options.format ?? 'complet',
      },
      elections: { t1: options.t1 ?? null, t2: options.t2 ?? null },
      historique: { presidentielles: options.archives ?? [], quinquennats: [] },
      scenario: 'standard',
    },
  } as unknown as ProgressionGame;
}

describe('progression entre les parties (phase 20)', () => {
  it('tire de chaque partie son premier tour, sa qualification et ses victoires', () => {
    const t1 = round({ joueur: 2_500, adv: 7_500 }, ['adv', 'joueur']);
    expect(gameOutcome(game({ t1, t2: round({ joueur: 6, adv: 4 }, [], 'joueur') }).state)).toEqual(
      {
        semaines: 5,
        premierTour: 0.25,
        qualifie: true,
        victoires: 1,
      },
    );
    // Un cycle archivé gagné, puis une campagne en cours : deux présidentielles comptées.
    const archived = gameOutcome(
      game({ archives: [{ t1, eluId: 'joueur' }], t1: round({ joueur: 1, adv: 3 }, ['adv']) })
        .state,
    );
    expect(archived).toMatchObject({ premierTour: 0.25, victoires: 1, qualifie: true });
    // Un observateur ne concourt pas.
    expect(gameOutcome(game({ player: null, t1 }).state)).toMatchObject({
      premierTour: null,
      victoires: 0,
    });
  });

  it('cumule les points, le niveau, les déblocages et le meilleur score du défi du jour', () => {
    const won = game({
      t1: round({ joueur: 3_000, adv: 7_000 }, ['adv', 'joueur']),
      t2: round({ joueur: 6, adv: 4 }, [], 'joueur'),
    });
    const defi = game({
      seed: 'defi-2026-11-03',
      format: 'court',
      t1: round({ joueur: 1_800, adv: 8_200 }, ['adv']),
    });
    const fresh = game({ week: 0 });
    const p = computeProgression([won, defi, fresh], { progression: RULES }, '2026-11-03');
    expect(p).toMatchObject({
      parties: 2,
      victoires: 1,
      qualifications: 1,
      meilleurPremierTour: 0.3,
    });
    expect(p.points).toBe(2 * 10 + 2 * 20 + 30 + 100 + 5);
    expect(p.niveau).toMatchObject({ numero: 2, titre: 'Maire', suivant: { numero: 3 } });
    expect(p.deblocages[0]).toMatchObject({
      debloque: true,
      condition: 'Gagner une présidentielle',
    });
    expect(p.defi).toMatchObject({ graine: 'defi-2026-11-03', tentatives: 1, meilleurScore: 0.18 });
    // Le lendemain, le défi repart de zéro ; un défi joué à un autre niveau ne compte pas.
    expect(computeProgression([defi], { progression: RULES }, '2026-11-04').defi.tentatives).toBe(
      0,
    );
    const tricked = game({ seed: 'defi-2026-11-03', format: 'court', difficulty: 'decouverte' });
    expect(
      computeProgression([tricked], { progression: RULES }, '2026-11-03').defi.tentatives,
    ).toBe(0);
  });

  it('impose les paramètres du défi, réserve sa graine et refuse un contenu verrouillé', () => {
    const base = {
      difficulty: 'expert' as const,
      scenarioId: 'colere-sociale',
      format: 'complet' as const,
      defi: false,
    };
    const none = () => ({
      deblocages: computeProgression([], { progression: RULES }, '2026-11-03').deblocages,
    });
    expect(creationParameters(base, RULES, '2026-11-03', none)).toEqual(base);
    expect(
      creationParameters({ ...base, defi: true, startDate: undefined }, RULES, '2026-11-03', none),
    ).toMatchObject({
      seed: 'defi-2026-11-03',
      difficulty: 'standard',
      format: 'court',
      scenarioId: 'standard',
    });
    const refusal = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof CreationRefusal ? [error.status, error.code] : error;
      }
      return null;
    };
    expect(
      refusal(() =>
        creationParameters({ ...base, seed: 'defi-2026-11-01' }, RULES, '2026-11-03', none),
      ),
    ).toEqual([422, 'graine_reservee']);
    expect(
      refusal(() =>
        creationParameters({ ...base, difficulty: 'legende' }, RULES, '2026-11-03', none),
      ),
    ).toEqual([403, 'verrouille']);
  });

  it('date le défi à Paris pour l’API, et sur l’horloge de l’appareil pour le moteur local', () => {
    expect(parisDate(new Date('2026-11-03T22:30:00Z'))).toBe('2026-11-03');
    expect(parisDate(new Date('2026-11-03T23:30:00Z'))).toBe('2026-11-04');
    expect(deviceDate(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
  });
});
