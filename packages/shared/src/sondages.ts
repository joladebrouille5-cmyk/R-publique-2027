import { z } from 'zod';

// Sondages réels d'intentions de vote (phase 24) : enquêtes publiées, relues dans la liste
// Wikipédia des sondages (révision figée) et renvoyant chacune à sa notice déposée à la Commission
// des sondages. Ils fixent le point de départ « Sondages actuels » des personnalités réelles ; la
// suite de la partie est simulée. Aucun chiffre n'est inventé : une personnalité jamais testée est
// « non testée » et reçoit le socle minimal du jeu de règles.

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PersonalityId = z.string().regex(/^reel-[a-z0-9-]+$/);
const Centiemes = z.number().int().min(0).max(10_000);

export const PollSurveySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    institut: z.string().min(1),
    commanditaire: z.string().min(1),
    terrain: z.object({ debut: IsoDate, fin: IsoDate }).strict(),
    echantillon: z.number().int().positive(),
    hypothese: z.string().min(1),
    /** Intentions au premier tour, en centièmes de point des exprimés. */
    intentions: z.record(PersonalityId, Centiemes),
    /** Personnalités notées « moins de 1 % » (comptées 0,5 %). */
    inferieursA1: z.array(PersonalityId),
    source: z.url(),
  })
  .strict();
export type PollSurvey = z.infer<typeof PollSurveySchema>;

export const PollDuelSchema = z
  .object({
    a: PersonalityId,
    b: PersonalityId,
    partA: Centiemes,
    partB: Centiemes,
    institut: z.string().min(1),
    terrain: z.object({ debut: IsoDate, fin: IsoDate }).strict(),
    echantillon: z.number().int().positive(),
    source: z.url(),
  })
  .strict();
export type PollDuel = z.infer<typeof PollDuelSchema>;

export const RealPollsSchema = z
  .object({
    verifieLe: IsoDate,
    source: z
      .object({
        titre: z.string().min(1),
        revision: z.number().int().positive(),
        url: z.url(),
        note: z.string().min(1),
      })
      .strict(),
    methode: z.string().min(1),
    enquetes: z.array(PollSurveySchema).min(1),
    duels: z.array(PollDuelSchema),
  })
  .strict();
export type RealPolls = z.infer<typeof RealPollsSchema>;

export type PollTarget = { valeur: number; statut: 'testee' | 'non-testee' };

/**
 * Moyenne des sondages (méthode de `RealPolls.methode`) pour une liste de personnalités : moyenne
 * de chacune sur les enquêtes qui la testent, socle minimal si elle n'est jamais testée, puis
 * renormalisation à 10 000 centièmes sur la liste (plus fort reste). `date` : fin de terrain de
 * l'enquête la plus récente.
 */
export function pollAverage(
  polls: RealPolls,
  personnaliteIds: readonly string[],
  socleMinimal: number,
): { date: string; cibles: Record<string, PollTarget> } {
  const raw = personnaliteIds.map((id) => {
    const values = polls.enquetes.flatMap((e) =>
      e.intentions[id] === undefined ? [] : [e.intentions[id]!],
    );
    return values.length
      ? { id, value: values.reduce((a, b) => a + b, 0) / values.length, statut: 'testee' as const }
      : { id, value: socleMinimal, statut: 'non-testee' as const };
  });
  const total = raw.reduce((s, r) => s + r.value, 0);
  const exact = raw.map((r) => (r.value * 10_000) / total);
  const floors = exact.map(Math.floor);
  let rest = 10_000 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest -= 1;
  }
  const date = polls.enquetes
    .map((e) => e.terrain.fin)
    .sort()
    .at(-1)!;
  return {
    date,
    cibles: Object.fromEntries(raw.map((r, i) => [r.id, { valeur: floors[i]!, statut: r.statut }])),
  };
}

/** Moyenne des duels sourcés d'une paire (part de `a`, en centièmes), ou null s'il n'y en a pas. */
export function duelAverage(polls: RealPolls, a: string, b: string): number | null {
  const shares = polls.duels.flatMap((d) =>
    d.a === a && d.b === b
      ? [(d.partA * 10_000) / (d.partA + d.partB)]
      : d.a === b && d.b === a
        ? [(d.partB * 10_000) / (d.partA + d.partB)]
        : [],
  );
  return shares.length ? Math.round(shares.reduce((x, y) => x + y, 0) / shares.length) : null;
}
