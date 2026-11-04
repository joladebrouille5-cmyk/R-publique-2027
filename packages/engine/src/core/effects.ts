import type {
  Effect,
  Factor,
  FactorSource,
  GameState,
  ResourceKey,
  ScheduledEffect,
} from '@r2027/shared';
import type { FinanceBook } from '../campaign/finances';
import type { Ledger } from './ledger';

const SATURABLE = new Set(['notoriete', 'popularite', 'jeunesse', 'dynamique']);

/** « 12,34 % » à partir d'une valeur en centièmes de point (format indépendant du système). */
export function formatPercent(centiemes: number): string {
  return `${(centiemes / 100).toFixed(2).replace('.', ',')} %`;
}

type Drawn = Pick<ScheduledEffect, 'ressource' | 'base' | 'alea' | 'saturation'>;

/**
 * Facteurs d'un effet : attendu, part variable (aléa, ou score d'un passage noté), puis
 * saturation calculée sur le niveau actuel.
 */
export function effectFactors(
  effect: Drawn,
  current: number,
  label: string,
  source: FactorSource,
  step: number,
  variable = 'aléa',
  rattrapage?: CatchUp,
): Factor[] {
  const factors: Factor[] = [
    { label: `${label} : effet attendu`, value: effect.base, source, step },
  ];
  if (effect.alea !== 0)
    factors.push({ label: `${label} : ${variable}`, value: effect.alea, source, step });
  const total = effect.base + effect.alea;
  if (effect.saturation && SATURABLE.has(effect.ressource) && total > 0) {
    const reduction = Math.round((total * current) / 10_000);
    if (reduction > 0) {
      factors.push({
        label: `${label} : saturation (niveau actuel ${formatPercent(current)})`,
        value: -reduction,
        source,
        step,
      });
    }
  }
  // Phase 24 : rattrapage de notoriété d'un candidat peu connu (gain d'une action).
  if (rattrapage && effect.ressource === 'notoriete' && total > 0 && current < rattrapage.seuil) {
    const bonus = Math.round(
      (total * rattrapage.coefficient * (rattrapage.seuil - current)) / rattrapage.seuil,
    );
    if (bonus > 0) {
      factors.push({
        label: `${label} : rattrapage de notoriété (sous ${formatPercent(rattrapage.seuil)})`,
        value: bonus,
        source,
        step,
      });
    }
  }
  return factors;
}

/** Paramètres du rattrapage de notoriété (jeu de règles, phase 24). */
export type CatchUp = { seuil: number; coefficient: number };

/**
 * Applique des facteurs à une ressource. La trésorerie passe par le compte de campagne, qui
 * classe la variation en recette ou en dépense (trésorerie = recettes − dépenses).
 */
export function applyFactors(
  ledger: Ledger,
  book: FinanceBook,
  actorId: string,
  ressource: ResourceKey,
  factors: Factor[],
): void {
  if (ressource === 'budgetCentimes') book.applyEffect(actorId, factors);
  else ledger.apply(actorId, ressource, factors);
}

export type EffectContext = {
  state: GameState;
  ledger: Ledger;
  book: FinanceBook;
  actorId: string;
  week: number;
  step: number;
  label: string;
  source: Extract<FactorSource, 'action' | 'risque' | 'evenement' | 'decision'>;
  /** Identifiant stable de l'origine (sert aussi à nommer l'effet programmé). */
  ref: string;
  /** Libellé de la part variable (phase 11, passage noté) ; par défaut « aléa ». */
  variable?: string;
  /** Rattrapage de notoriété (phase 24), pour les seuls effets immédiats des actions. */
  rattrapage?: CatchUp;
};

/** Applique un effet tout de suite (délai 0) ou le programme pour une semaine ultérieure. */
export function applyOrSchedule(
  context: EffectContext,
  effect: Effect,
  alea: number,
  index: number,
) {
  const drawn: Drawn = {
    ressource: effect.ressource,
    base: effect.base,
    alea,
    saturation: effect.saturation,
  };
  if (effect.delaiSemaines === 0) {
    const current = context.ledger.current(context.actorId, effect.ressource);
    applyFactors(
      context.ledger,
      context.book,
      context.actorId,
      effect.ressource,
      effectFactors(
        drawn,
        current,
        context.label,
        context.source,
        context.step,
        context.variable,
        context.rattrapage,
      ),
    );
    return;
  }
  context.state.scheduled.push({
    id: `${context.ref}-${index}`,
    dueWeek: context.week + effect.delaiSemaines,
    actorId: context.actorId,
    ...drawn,
    origin: {
      kind: context.source,
      ref: context.ref,
      label: context.label,
      week: context.week,
      ...(context.variable ? { variable: context.variable } : {}),
    },
  });
}
