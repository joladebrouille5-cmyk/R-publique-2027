import {
  ECONOMIC_INDICATORS,
  INDICATOR_BOUNDS,
  type EconomicIndicator,
  type EconomyChange,
  type EconomyState,
  type GameState,
  type Proposal,
  type Ruleset,
} from '@r2027/shared';
import type { Ledger } from '../core/ledger';
import { stream } from '../core/random';

// Économie du quinquennat (phase 6, P6-05). Valeurs de départ : séries de l'Insee (jeu de
// règles). Évolution : modèle de jeu simple et étiqueté (hypothèses) — retour vers des cibles
// de long terme, loi d'Okun, part conjoncturelle du déficit, dette nourrie par le déficit et
// allégée par la croissance nominale, pouvoir d'achat, confiance et tensions sociales. Toute
// variation passe par le registre de l'économie : chaque variation est la somme exacte de ses
// facteurs, écrêtement aux bornes compris (facteur « limite »).

type Factor = EconomyChange['factors'][number];
type Source = Factor['source'];

const HISTORY_WEEKS = 260;
const round = (value: number) => Math.round(value) + 0;

/** Registre des variations des indicateurs d'une semaine. */
export class EconomyBook {
  private readonly changes = new Map<EconomicIndicator, EconomyChange>();

  constructor(private readonly economy: EconomyState) {}

  current(indicator: EconomicIndicator): number {
    return this.economy.indicateurs[indicator] ?? 0;
  }

  apply(indicator: EconomicIndicator, factors: Factor[]): number {
    const significant = factors.filter((f) => f.value !== 0);
    if (significant.length === 0) return 0;
    const before = this.current(indicator);
    const raw = before + significant.reduce((sum, f) => sum + f.value, 0);
    const { min, max } = INDICATOR_BOUNDS[indicator];
    const bounded = Math.min(max, Math.max(min, raw));
    const recorded = [...significant];
    if (bounded !== raw)
      recorded.push({
        label: bounded === max ? 'Plafond du jeu atteint' : 'Plancher du jeu atteint',
        value: bounded - raw,
        source: 'limite',
      });
    this.economy.indicateurs[indicator] = bounded;
    const change = this.changes.get(indicator) ?? {
      indicateur: indicator,
      before,
      after: before,
      factors: [],
    };
    change.after = bounded;
    change.factors.push(...recorded);
    this.changes.set(indicator, change);
    return bounded - before;
  }

  /** Raccourci : un seul facteur. */
  add(indicator: EconomicIndicator, label: string, value: number, source: Source): number {
    return this.apply(indicator, [{ label, value: round(value), source }]);
  }

  list(): EconomyChange[] {
    return ECONOMIC_INDICATORS.map((i) => this.changes.get(i)).filter(
      (c): c is EconomyChange => c !== undefined && c.factors.length > 0,
    );
  }
}

/** Économie au début du premier quinquennat : séries de l'Insee et conventions du jeu de règles. */
export function openEconomy(ruleset: Ruleset, week: number): EconomyState {
  const real = ruleset.economieReelle.indicateurs;
  const rules = ruleset.economie;
  const indicateurs: Record<EconomicIndicator, number> = {
    croissance: real.croissance.valeur,
    inflation: real.inflation.valeur,
    chomage: real.chomage.valeur,
    deficit: real.deficit.valeur,
    dette: real.dette.valeur,
    pouvoirAchat: rules.depart.pouvoirAchat,
    confiance: real.confiance.valeur,
    tensions: rules.depart.tensions,
  };
  // Solde structurel : déficit de départ diminué de sa part conjoncturelle.
  const cyclical =
    rules.sensibilites.deficitCroissance *
    (indicateurs.croissance - rules.cibles.croissancePotentielle);
  return {
    indicateurs,
    soldeStructurel: round(indicateurs.deficit - cyclical),
    differes: [],
    historique: [{ semaine: week, valeurs: { ...indicateurs } }],
  };
}

/** Part du PIB annuel (centièmes de point) que représente un montant en millions d'euros. */
export function shareOfGdp(ruleset: Ruleset, millions: number): number {
  return (millions / ruleset.economieReelle.pibAnnuelMillions.valeur) * 10_000;
}

/**
 * Entrée en vigueur d'une réforme : son coût annuel estimé (proposition du programme) modifie le
 * solde structurel et donne une impulsion temporaire à la croissance (multiplicateur, hypothèse).
 */
export function applyReformToEconomy(
  state: GameState,
  ruleset: Ruleset,
  book: EconomyBook,
  proposal: Proposal,
  kept: number,
): void {
  const economy = state.economie!;
  const cost = shareOfGdp(ruleset, proposal.coutMillionsEuros) * kept;
  if (round(cost) === 0) return;
  economy.soldeStructurel = round(economy.soldeStructurel - cost);
  book.add(
    'croissance',
    `Impulsion budgétaire : ${proposal.libelle}`,
    ruleset.economie.sensibilites.multiplicateur * cost,
    'reforme',
  );
}

/** Programme un effet différé sur un indicateur (crise, choix). */
export function scheduleEconomy(
  state: GameState,
  indicator: EconomicIndicator,
  value: number,
  delay: number,
  label: string,
): void {
  state.economie!.differes.push({
    semaine: state.meta.week + delay,
    indicateur: indicator,
    valeur: value,
    libelle: label,
  });
}

const fmt = (centiemes: number) => `${(centiemes / 100).toFixed(2).replace('.', ',')}`;

/**
 * Étape 7 : effets différés arrivés à échéance, puis dynamique hebdomadaire de chaque
 * indicateur (facteurs nommés), aléa tiré par indicateur, et effet de la conjoncture sur la
 * popularité du président (par le registre des ressources).
 */
export function weeklyEconomy(
  state: GameState,
  ruleset: Ruleset,
  book: EconomyBook,
  ledger: Ledger,
  presidentId: string,
  /** Le mandat a commencé : la conjoncture pèse sur la popularité du président. */
  inOffice: boolean,
  step: number,
): void {
  const economy = state.economie!;
  const week = state.meta.week;
  const { cibles, rappel, sensibilites: s, alea } = ruleset.economie;

  const due = economy.differes.filter((d) => d.semaine <= week);
  economy.differes = economy.differes.filter((d) => d.semaine > week);
  for (const d of due) book.add(d.indicateur, `${d.libelle} (effet différé)`, d.valeur, 'differe');

  const v = (i: EconomicIndicator) => book.current(i);
  const gap = v('croissance') - cibles.croissancePotentielle;
  const noise = (indicator: EconomicIndicator) => {
    const amplitude = alea[indicator] ?? 0;
    if (amplitude === 0) return 0;
    const rng = stream(state.meta.seed, week, 'economie', indicator);
    return rng.nextInt(2 * amplitude + 1) - amplitude;
  };

  book.apply('croissance', [
    {
      label: `Retour vers la croissance potentielle (${fmt(cibles.croissancePotentielle)} %, hypothèse)`,
      value: round(rappel.croissance * -gap),
      source: 'conjoncture',
    },
    { label: 'Aléa conjoncturel', value: noise('croissance'), source: 'conjoncture' },
  ]);
  const inflationTarget = cibles.inflation + s.inflationCroissance * gap;
  book.apply('inflation', [
    {
      label: `Retour vers ${fmt(cibles.inflation)} % (hypothèse), ajusté de la tension sur les capacités`,
      value: round(rappel.inflation * (inflationTarget - v('inflation'))),
      source: 'conjoncture',
    },
    { label: 'Aléa sur les prix', value: noise('inflation'), source: 'conjoncture' },
  ]);
  book.apply('chomage', [
    {
      label: 'Loi d’Okun : écart de la croissance à son potentiel',
      value: round((-s.okun * gap) / 52),
      source: 'conjoncture',
    },
    {
      label: `Retour vers le chômage structurel (${fmt(cibles.chomageStructurel)} %, hypothèse)`,
      value: round(rappel.chomage * (cibles.chomageStructurel - v('chomage'))),
      source: 'conjoncture',
    },
    { label: 'Aléa sur l’emploi', value: noise('chomage'), source: 'conjoncture' },
  ]);
  const deficitTarget = economy.soldeStructurel + s.deficitCroissance * gap;
  book.apply('deficit', [
    {
      label: 'Solde structurel et part conjoncturelle du déficit',
      value: round(rappel.deficit * (deficitTarget - v('deficit'))),
      source: 'conjoncture',
    },
    { label: 'Aléa sur les recettes', value: noise('deficit'), source: 'conjoncture' },
  ]);
  book.apply('dette', [
    { label: 'Déficit de la semaine', value: round(-v('deficit') / 52), source: 'conjoncture' },
    {
      label: 'Croissance nominale (allège le ratio)',
      value: round((-v('dette') * (v('croissance') + v('inflation'))) / 10_000 / 52),
      source: 'conjoncture',
    },
  ]);
  book.apply('pouvoirAchat', [
    {
      label: 'Revenus portés par la croissance',
      value: round((v('pouvoirAchat') * s.pouvoirAchatCroissance * v('croissance')) / 10_000 / 52),
      source: 'conjoncture',
    },
    {
      label: 'Inflation au-delà de la cible',
      value: round(
        (-v('pouvoirAchat') * s.pouvoirAchatInflation * (v('inflation') - cibles.inflation)) /
          10_000 /
          52,
      ),
      source: 'conjoncture',
    },
    { label: 'Aléa', value: noise('pouvoirAchat'), source: 'conjoncture' },
  ]);
  const confidenceTarget =
    10_000 +
    s.confianceCroissance * gap -
    s.confianceInflation * (v('inflation') - cibles.inflation) -
    s.confianceChomage * (v('chomage') - cibles.chomageStructurel);
  book.apply('confiance', [
    {
      label: 'Croissance, prix et emploi',
      value: round(rappel.confiance * (confidenceTarget - v('confiance'))),
      source: 'conjoncture',
    },
    { label: 'Aléa', value: noise('confiance'), source: 'conjoncture' },
  ]);
  const tensionTarget =
    ruleset.economie.depart.tensions +
    s.tensionsChomage * (v('chomage') - cibles.chomageStructurel) +
    s.tensionsInflation * Math.max(0, v('inflation') - cibles.inflation) -
    s.tensionsConfiance * (v('confiance') - 10_000);
  book.apply('tensions', [
    {
      label: 'Chômage, inflation et confiance des ménages',
      value: round(rappel.tensions * (tensionTarget - v('tensions'))),
      source: 'conjoncture',
    },
    { label: 'Aléa', value: noise('tensions'), source: 'conjoncture' },
  ]);

  if (inOffice)
    ledger.apply(presidentId, 'popularite', [
      {
        label: 'Conjoncture économique (confiance des ménages)',
        value: round((s.popularite * (v('confiance') - 10_000)) / 100),
        source: 'opinion',
        step,
      },
    ]);
  economy.historique = [
    ...economy.historique,
    { semaine: week, valeurs: { ...economy.indicateurs } },
  ].slice(-HISTORY_WEEKS);
}
