import type { Counts, RoundResult } from './game';

// Soirée électorale en direct (phase 9) : restitution, minute par minute (phase 11), d'un tour
// DÉJÀ dépouillé par le moteur. Rien n'est recalculé : chaque département (puis chaque commune)
// passe de « en attente » à « dépouillé » selon un rythme simulé, déterministe (graine de la
// partie, tour, code INSEE), et les chiffres affichés sont des fractions exactes du résultat
// final. L'état de la soirée ne dépend que de l'heure (aucune horloge réelle) : la vitesse de
// lecture choisie à l'écran ne change aucun chiffre. Une nouvelle estimation simulée est publiée
// toutes les 30 minutes et converge vers le résultat final à minuit. Horaires, rythme et
// estimations : hypothèses de présentation du jeu.

/** Durée de la soirée, en minutes : de 20 h 00 à 0 h 00. */
export const SOIREE_MINUTES = 240;
/** Intervalle entre deux estimations publiées (une « tranche » horaire), en minutes. */
export const SOIREE_PAS = 30;

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

/** Heure affichée d'une minute de la soirée (0 → « 20 h 00 », 240 → « 0 h 00 »). */
export function heureSoiree(minute: number): string {
  const m = Math.max(0, Math.min(SOIREE_MINUTES, Math.floor(minute)));
  const total = 20 * 60 + m;
  return `${Math.floor(total / 60) % 24} h ${String(total % 60).padStart(2, '0')}`;
}

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

/** Minutes de début et de fin du dépouillement d'un département (0 = 20 h 00). */
export type DepartementRythme = { debut: number; fin: number };

/**
 * Rythme de dépouillement de chaque département, à la minute : les départements les moins
 * peuplés finissent plus tôt ; un tirage stable départage les autres et étale les fins (entre
 * 20 h 30 et minuit) ; chaque dépouillement dure de 30 minutes à 2 heures.
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
    const fin = SOIREE_PAS + Math.round((0.6 * taille + 0.4 * h) * (SOIREE_MINUTES - SOIREE_PAS));
    const duree = SOIREE_PAS + Math.floor(soireeHash(graine, code, 'debut') * 3 * SOIREE_PAS);
    rythme[code] = { debut: Math.max(0, fin - duree), fin };
  });
  return rythme;
}

/** Part dépouillée (0 à 1) d'un département à une minute donnée de la soirée. */
export function avancement(rythme: DepartementRythme | undefined, minute: number): number {
  // Territoire sans rythme connu : dépouillé à minuit.
  if (!rythme) return minute >= SOIREE_MINUTES ? 1 : 0;
  if (minute >= rythme.fin) return 1;
  if (minute <= rythme.debut) return 0;
  return (minute - rythme.debut) / (rythme.fin - rythme.debut);
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

/** État de la soirée à une minute donnée. */
export type SoireeInstant = {
  /** Minute de la soirée (0 = 20 h 00, 240 = 0 h 00). */
  minute: number;
  heure: string;
  /** Dernière estimation publiée (0 à SOIREE_DERNIERE). */
  tranche: number;
  /** Résultats des bureaux dépouillés (somme exacte des parts dépouillées). */
  depouille: Counts;
  /** Part des inscrits dont les bulletins sont dépouillés (0 à 1). */
  partInscrits: number;
  departementsTermines: number;
  departements: number;
  /** Estimation simulée, en parts des exprimés (somme 1), par candidat. */
  estimation: Record<string, number>;
};

/** Point d'une tranche horaire : l'état à son heure et les départements terminés depuis. */
export type SoireeTranche = SoireeInstant & {
  /** Départements terminés dans la demi-heure qui s'achève (à 20 h : l'outre-mer). */
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
 * État de la soirée à une minute donnée (arrondie à la minute inférieure). À minuit, tout est
 * dépouillé (y compris les territoires hors carte) et l'estimation est le résultat définitif.
 * Ne dépend que de la minute : fonction pure, sans horloge.
 */
export function soireeInstant(
  result: RoundResult,
  graine: string,
  minuteDemandee: number,
  rythme: Record<string, DepartementRythme> = rythmeDepartements(result, graine),
): SoireeInstant {
  const minute = Math.max(0, Math.min(SOIREE_MINUTES, Math.floor(minuteDemandee)));
  const fini = minute >= SOIREE_MINUTES;
  const territoire = result.territoire;
  const candidats = Object.keys(result.voix);
  const final = Object.fromEntries(
    candidats.map((k) => [k, result.exprimes > 0 ? result.voix[k]! / result.exprimes : 0]),
  );
  let depouille: Counts = { inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0, voix: {} };
  let termines = 0;
  for (const [code, counts] of Object.entries(territoire?.departements ?? {})) {
    const part = avancement(rythme[code], minute);
    if (part >= 1) termines += 1;
    depouille = somme(depouille, fraction(counts, part));
  }
  // À minuit : le résultat définitif, hors carte compris (Français de l'étranger, collectivités),
  // et, sans détail territorial, le national seul.
  if (fini) depouille = result;
  // Estimation publiée à la dernière demi-heure : écart simulé qui se resserre jusqu'à minuit.
  const tranche = Math.min(SOIREE_DERNIERE, Math.floor(minute / SOIREE_PAS));
  const ecart = (0.015 * (SOIREE_DERNIERE - tranche)) / SOIREE_DERNIERE;
  const brut = Object.fromEntries(
    candidats.map((k) => [
      k,
      Math.max(0, final[k]! + (soireeHash(graine, result.round, tranche, k) * 2 - 1) * ecart),
    ]),
  );
  const total = Object.values(brut).reduce((s, v) => s + v, 0);
  const estimation =
    fini || total === 0 ? final : Object.fromEntries(candidats.map((k) => [k, brut[k]! / total]));
  return {
    minute,
    heure: heureSoiree(minute),
    tranche,
    depouille,
    partInscrits: result.inscrits > 0 ? Math.min(1, depouille.inscrits / result.inscrits) : 0,
    departementsTermines: termines,
    departements: Object.keys(territoire?.departements ?? {}).length,
    estimation,
  };
}

/** Départements terminés dans l'intervalle de minutes ]de, a] (à 20 h : ceux finis à 20 h). */
export function departementsTermines(
  rythme: Record<string, DepartementRythme>,
  de: number,
  a: number,
): string[] {
  return Object.entries(rythme)
    .filter(([, r]) => (de < 0 ? r.fin <= a : r.fin > de && r.fin <= a))
    .map(([code]) => code)
    .sort();
}

/** Déroulé de la soirée par demi-heure (une estimation publiée à chaque point). */
export function soireeElectorale(result: RoundResult, graine: string): SoireeTranche[] {
  const rythme = rythmeDepartements(result, graine);
  return SOIREE_TRANCHES.map((_, tranche) => {
    const minute = tranche * SOIREE_PAS;
    return {
      ...soireeInstant(result, graine, minute, rythme),
      nouveaux: departementsTermines(rythme, tranche === 0 ? -1 : minute - SOIREE_PAS, minute),
    };
  });
}
