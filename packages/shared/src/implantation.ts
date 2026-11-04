import type { PlannedAction } from './game';
import type { Ruleset } from './ruleset';

// Implantation par département (phase 25) : règles partagées par le moteur (départ, combos,
// effet sur le vote) et par l'interface (paliers, militants estimés, combos annoncés avant
// validation). Les codes de département sont ceux du réservoir des parrainages, en chaînes.

export type Famille = 'terrain' | 'medias' | 'numerique' | 'organisation';

export const FAMILLE_LABELS: Record<Famille, string> = {
  terrain: 'Terrain',
  medias: 'Médias',
  numerique: 'Numérique',
  organisation: 'Organisation',
};

export type ImplantationTierId = 'inconnue' | 'presence' | 'ancrage' | 'bastion' | 'fief';

/** Paliers affichés, du plus bas au plus haut (seuil inclus). */
export const IMPLANTATION_TIERS: readonly {
  id: ImplantationTierId;
  libelle: string;
  min: number;
}[] = [
  { id: 'inconnue', libelle: 'Terre inconnue', min: 0 },
  { id: 'presence', libelle: 'Présence', min: 5 },
  { id: 'ancrage', libelle: 'Ancrage', min: 25 },
  { id: 'bastion', libelle: 'Bastion', min: 50 },
  { id: 'fief', libelle: 'Fief', min: 75 },
];

export function implantationTier(value: number) {
  let tier = IMPLANTATION_TIERS[0]!;
  for (const t of IMPLANTATION_TIERS) if (value >= t.min) tier = t;
  return tier;
}

const INSCRITS = new WeakMap<Ruleset, Record<string, number>>();

/**
 * Inscrits de chaque département du jeu, somme des circonscriptions des législatives de 2024
 * (donnée officielle du jeu de règles) ; sert de poids aux moyennes et aux répartitions.
 */
export function departmentInscrits(ruleset: Ruleset): Record<string, number> {
  let cached = INSCRITS.get(ruleset);
  if (!cached) {
    const departements = ruleset.parrainages.reservoir.departements;
    cached = Object.fromEntries(Object.keys(departements).map((code) => [code, 0]));
    for (const c of ruleset.legislatives2024.circonscriptions)
      if (c.departement in cached) cached[c.departement]! += c.inscrits;
    INSCRITS.set(ruleset, cached);
  }
  return cached;
}

/**
 * Implantation de départ d'un candidat : `implantation.depart` dans les départements des régions
 * de son implantation, 0 ailleurs ; carte blanche (0 partout) pour le candidat personnalisé.
 */
export function startingImplantation(
  actor: { candidate: { nature: string }; implantation: readonly string[] },
  ruleset: Ruleset,
): Record<string, number> {
  const departements = ruleset.parrainages.reservoir.departements;
  const start = actor.candidate.nature === 'personnalise' ? 0 : ruleset.implantation.depart;
  return Object.fromEntries(
    Object.entries(departements).map(([code, d]) => [
      code,
      actor.implantation.includes(d.region) ? start : 0,
    ]),
  );
}

/** Implantation moyenne (0 à 100), pondérée par les inscrits de chaque département. */
export function weightedImplantation(
  map: Record<string, number>,
  inscrits: Record<string, number>,
): number {
  let total = 0;
  let weighted = 0;
  for (const [code, weight] of Object.entries(inscrits)) {
    total += weight;
    weighted += weight * (map[code] ?? 0);
  }
  return total > 0 ? weighted / total : 0;
}

/**
 * Militants estimés par département (affichage) : le total national réparti au plus fort reste,
 * au prorata de l'implantation × inscrits ; sans aucune implantation, au prorata des inscrits.
 */
export function militantsByDepartment(
  militants: number,
  map: Record<string, number>,
  inscrits: Record<string, number>,
): Record<string, number> {
  const codes = Object.keys(inscrits).sort();
  let weights = codes.map((c) => (map[c] ?? 0) * inscrits[c]!);
  if (weights.every((w) => w === 0)) weights = codes.map((c) => inscrits[c]!);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((w) => (Math.max(0, militants) * w) / sum);
  const parts = exact.map(Math.floor);
  let rest = Math.max(0, militants) - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    parts[i]! += 1;
    rest -= 1;
  }
  return Object.fromEntries(codes.map((c, i) => [c, parts[i]!]));
}

export type WeekCombos = {
  /** Cartes en série : index dans le plan, famille, rang dans la famille, bonus d'effet. */
  series: { index: number; famille: Famille; rang: number; taux: number }[];
  /** Départements visés par assez de cartes pour former un bastion. */
  bastions: string[];
  /** Régions dont assez de départements distincts sont visés (tour de région). */
  toursDeRegion: string[];
};

/**
 * Combos d'un plan de semaine, dans l'ordre des cartes : série d'une même famille (2ᵉ carte,
 * puis 3ᵉ et suivantes), bastion et tour de région pour les cartes posées sur un département.
 * Une carte inconnue du catalogue de campagne n'entre dans aucun combo.
 */
export function weekCombos(plan: readonly PlannedAction[], ruleset: Ruleset): WeekCombos {
  const { serie, bastion, tourDeRegion } = ruleset.combos;
  const departements = ruleset.parrainages.reservoir.departements;
  const byId = new Map(ruleset.actions.map((a) => [a.id, a]));
  const counts: Partial<Record<Famille, number>> = {};
  const series: WeekCombos['series'] = [];
  const perDepartment = new Map<string, number>();
  plan.forEach((planned, index) => {
    const definition = byId.get(planned.actionId);
    if (!definition?.famille) return;
    const rang = (counts[definition.famille] ?? 0) + 1;
    counts[definition.famille] = rang;
    if (rang >= 2)
      series.push({
        index,
        famille: definition.famille,
        rang,
        taux: rang === 2 ? serie.deuxieme : serie.suivantes,
      });
    if (definition.cible === 'departement' && planned.cible && planned.cible in departements)
      perDepartment.set(planned.cible, (perDepartment.get(planned.cible) ?? 0) + 1);
  });
  const bastions = [...perDepartment.entries()]
    .filter(([, n]) => n >= bastion.cartesMin)
    .map(([code]) => code)
    .sort();
  const perRegion = new Map<string, Set<string>>();
  for (const code of perDepartment.keys()) {
    const region = departements[code]!.region;
    if (!perRegion.has(region)) perRegion.set(region, new Set());
    perRegion.get(region)!.add(code);
  }
  const toursDeRegion = [...perRegion.entries()]
    .filter(([, set]) => set.size >= tourDeRegion.departementsMin)
    .map(([region]) => region)
    .sort();
  return { series, bastions, toursDeRegion };
}
