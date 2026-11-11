import type { RoundResult, VoteInstruction } from '@r2027/shared';

// Reports de voix de l'entre-deux-tours (phase 26) : un arc part des départements où le candidat
// éliminé a fait ses meilleurs scores du premier tour et rejoint ceux du candidat qu'il soutient.
// Le poids d'un ralliement est le nombre de voix du premier tour du candidat rallié : c'est le
// réservoir que sa consigne oriente, pas un transfert mesuré (le second tour reste simulé par le
// moteur, groupe d'électeurs par groupe d'électeurs).

export type Ralliement = {
  de: string;
  vers: string;
  /** Voix du premier tour du candidat rallié. */
  poids: number;
  /** Part des exprimés du premier tour (centièmes de point). */
  part: number;
};

export type Arc = {
  de: string;
  vers: string;
  /** Départements de départ et d'arrivée. */
  depuis: string;
  jusqua: string;
  /** Voix portées par cet arc (le poids du ralliement, partagé entre ses arcs). */
  poids: number;
  /** Épaisseur et débit de particules : poids rapporté au plus gros arc (0 à 1). */
  intensite: number;
};

/** Consignes de vote suivies d'effet : un candidat du premier tour en soutient un autre. */
export function ralliements(
  consignes: readonly VoteInstruction[],
  t1: RoundResult | null,
): Ralliement[] {
  if (!t1) return [];
  const exprimes = Object.values(t1.voix).reduce((a, b) => a + b, 0);
  return consignes
    .flatMap((c) => {
      const poids = t1.voix[c.fromActorId] ?? 0;
      return c.toActorId && poids > 0
        ? [
            {
              de: c.fromActorId,
              vers: c.toActorId,
              poids,
              part: exprimes > 0 ? Math.round((poids * 10_000) / exprimes) : 0,
            },
          ]
        : [];
    })
    .sort((a, b) => b.poids - a.poids || (a.de < b.de ? -1 : 1));
}

/** Meilleurs départements d'un candidat au premier tour (part des exprimés), les plus forts d'abord. */
export function fiefs(t1: RoundResult, candidat: string, nombre: number): string[] {
  const territoire = t1.territoire;
  if (!territoire) return [];
  if (!territoire.candidats.includes(candidat)) return [];
  return Object.entries(territoire.departements)
    .map(([code, c]) => ({ code, part: c.exprimes > 0 ? (c.voix[candidat] ?? 0) / c.exprimes : 0 }))
    .sort((a, b) => b.part - a.part || (a.code < b.code ? -1 : 1))
    .slice(0, nombre)
    .map((d) => d.code);
}

/**
 * Arcs des reports : `parRalliement` arcs par ralliement, du n-ième fief du candidat rallié au
 * n-ième fief du candidat soutenu. L'intensité d'un arc est proportionnelle aux voix qu'il porte.
 */
export function arcsDeReport(
  consignes: readonly VoteInstruction[],
  t1: RoundResult | null,
  parRalliement = 2,
): Arc[] {
  if (!t1?.territoire) return [];
  const arcs: Omit<Arc, 'intensite'>[] = [];
  for (const r of ralliements(consignes, t1)) {
    const depart = fiefs(t1, r.de, parRalliement);
    const arrivee = fiefs(t1, r.vers, parRalliement + depart.length).filter(
      (code) => !depart.includes(code),
    );
    const paires = Math.min(depart.length, arrivee.length);
    for (let i = 0; i < paires; i++)
      arcs.push({
        de: r.de,
        vers: r.vers,
        depuis: depart[i]!,
        jusqua: arrivee[i]!,
        poids: r.poids / paires,
      });
  }
  const max = Math.max(0, ...arcs.map((a) => a.poids));
  return arcs.map((a) => ({ ...a, intensite: max > 0 ? a.poids / max : 0 }));
}
