import type { Counts, RoundResult } from './game';

// Soirée électorale en direct (phase 9) : restitution, tranche horaire par tranche horaire, d'un
// tour DÉJÀ dépouillé par le moteur. Rien n'est recalculé : chaque département (puis chaque
// commune) passe de « en attente » à « dépouillé » selon un rythme simulé, déterministe (graine
// de la partie, tour, code INSEE), et les chiffres affichés sont des fractions exactes du
// résultat final. L'estimation de 20 h est simulée elle aussi et converge vers le résultat final
// à la dernière tranche. Horaires, rythme et estimations : hypothèses de présentation du jeu.

/** Tranches horaires de la soirée (la dernière donne le résultat définitif). */
export const SOIREE_TRANCHES = [
  '20 h 00',
  '20 h 30',
  '21 h 00',
  '21 h 30',
  '22 h 00',
  '22 h 30',
  '23 h 00',
  '23 h 30',
  '0 h 00',
] as const;
export const SOIREE_DERNIERE = SOIREE_TRANCHES.length - 1;

/** Départements et régions d'outre-mer : résultats connus dès 20 h (hypothèse du jeu). */
const OUTRE_MER = new Set(['971', '972', '973', '974', '976']);

/**
 * FNV-1a 32 bits puis brassage final de murmur3 → [0, 1) : tirage stable, sans aléa ni horloge,
 * uniforme même pour des codes voisins (80001, 80002…).
 */
export function soireeHash(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join('|')) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

export type DepartementRythme = { debut: number; fin: number };

/**
 * Rythme de dépouillement de chaque département : tranche de début et de fin. Les départements
 * les moins peuplés finissent plus tôt ; un tirage stable départage les autres.
 */
export function rythmeDepartements(
  result: RoundResult,
  graine: string,
): Record<string, DepartementRythme> {
  const departements = result.territoire?.departements ?? {};
  const codes = Object.keys(departements).sort((a, b) =>
    departements[a]!.inscrits !== departements[b]!.inscrits
      ? departements[a]!.inscrits - departements[b]!.inscrits
      : a < b
        ? -1
        : 1,
  );
  const rythme: Record<string, DepartementRythme> = {};
  codes.forEach((code, rank) => {
    if (OUTRE_MER.has(code)) {
      rythme[code] = { debut: 0, fin: 0 };
      return;
    }
    const taille = codes.length > 1 ? rank / (codes.length - 1) : 0;
    const h = soireeHash(graine, result.round, code);
    const fin = Math.min(
      SOIREE_DERNIERE,
      1 + Math.floor((0.6 * taille + 0.4 * h) * (SOIREE_DERNIERE - 1)),
    );
    const debut = Math.max(0, fin - 1 - Math.floor(soireeHash(graine, code, 'debut') * 3));
    rythme[code] = { debut, fin };
  });
  return rythme;
}

/** Part dépouillée (0 à 1) d'un département à une tranche donnée. */
export function avancement(rythme: DepartementRythme | undefined, tranche: number): number {
  // Territoire sans rythme connu : dépouillé à la dernière tranche.
  if (!rythme) return tranche >= SOIREE_DERNIERE ? 1 : 0;
  if (tranche >= rythme.fin) return 1;
  if (tranche < rythme.debut) return 0;
  return (tranche - rythme.debut + 1) / (rythme.fin - rythme.debut + 1);
}

/** Une commune est dépouillée quand son tirage passe sous l'avancement de son département. */
export function communeDepouillee(
  graine: string,
  round: number,
  commune: string,
  part: number,
): boolean {
  return part >= 1 || soireeHash(graine, round, 'commune', commune) < part;
}

/** Fraction exacte (entiers) d'un résultat : mêmes proportions, arrondies au plus bas. */
export function fraction(counts: Counts, part: number): Counts {
  if (part >= 1) return counts;
  const f = (n: number) => Math.floor(n * part);
  return {
    inscrits: f(counts.inscrits),
    votants: f(counts.votants),
    blancs: f(counts.blancs),
    nuls: f(counts.nuls),
    exprimes: f(counts.exprimes),
    voix: Object.fromEntries(Object.entries(counts.voix).map(([k, v]) => [k, f(v)])),
  };
}

export type SoireeTranche = {
  tranche: number;
  heure: string;
  /** Résultats des bureaux dépouillés (somme exacte des parts dépouillées). */
  depouille: Counts;
  /** Part des inscrits dont les bulletins sont dépouillés (0 à 1). */
  partInscrits: number;
  departementsTermines: number;
  departements: number;
  /** Estimation simulée, en parts des exprimés (somme 1), par candidat. */
  estimation: Record<string, number>;
  /** Départements terminés à cette tranche (et pas avant). */
  nouveaux: string[];
};

const somme = (a: Counts, b: Counts): Counts => ({
  inscrits: a.inscrits + b.inscrits,
  votants: a.votants + b.votants,
  blancs: a.blancs + b.blancs,
  nuls: a.nuls + b.nuls,
  exprimes: a.exprimes + b.exprimes,
  voix: Object.fromEntries(
    [...new Set([...Object.keys(a.voix), ...Object.keys(b.voix)])].map((k) => [
      k,
      (a.voix[k] ?? 0) + (b.voix[k] ?? 0),
    ]),
  ),
});

/**
 * Déroulé de la soirée : une entrée par tranche horaire. À la dernière tranche, tout est
 * dépouillé (y compris les territoires hors carte) et l'estimation est le résultat définitif.
 */
export function soireeElectorale(result: RoundResult, graine: string): SoireeTranche[] {
  const territoire = result.territoire;
  const rythme = rythmeDepartements(result, graine);
  const candidats = Object.keys(result.voix);
  const final = Object.fromEntries(
    candidats.map((k) => [k, result.exprimes > 0 ? result.voix[k]! / result.exprimes : 0]),
  );
  const vide: Counts = { inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0, voix: {} };
  return SOIREE_TRANCHES.map((heure, tranche) => {
    let depouille = vide;
    let termines = 0;
    const nouveaux: string[] = [];
    for (const [code, counts] of Object.entries(territoire?.departements ?? {})) {
      const part = avancement(rythme[code], tranche);
      if (part >= 1) {
        termines += 1;
        if (rythme[code]!.fin === tranche) nouveaux.push(code);
      }
      depouille = somme(depouille, fraction(counts, part));
    }
    // Hors carte (Français de l'étranger, collectivités) : comptés à la dernière tranche.
    if (tranche === SOIREE_DERNIERE)
      for (const counts of Object.values(territoire?.horsCarte ?? {}))
        depouille = somme(depouille, counts);
    // Sans détail territorial : le national seul, révélé à la dernière tranche.
    if (!territoire && tranche === SOIREE_DERNIERE) depouille = result;
    // Estimation : écart simulé qui se resserre jusqu'au résultat définitif.
    const ecart = (0.015 * (SOIREE_DERNIERE - tranche)) / SOIREE_DERNIERE;
    const brut = Object.fromEntries(
      candidats.map((k) => [
        k,
        Math.max(0, final[k]! + (soireeHash(graine, result.round, tranche, k) * 2 - 1) * ecart),
      ]),
    );
    const total = Object.values(brut).reduce((s, v) => s + v, 0);
    const estimation =
      tranche === SOIREE_DERNIERE || total === 0
        ? final
        : Object.fromEntries(candidats.map((k) => [k, brut[k]! / total]));
    return {
      tranche,
      heure,
      depouille: tranche === SOIREE_DERNIERE && territoire ? result : depouille,
      partInscrits: result.inscrits > 0 ? Math.min(1, depouille.inscrits / result.inscrits) : 0,
      departementsTermines: termines,
      departements: Object.keys(territoire?.departements ?? {}).length,
      estimation,
      nouveaux: nouveaux.sort(),
    };
  });
}
