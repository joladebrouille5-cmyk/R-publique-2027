import {
  FAMILLE_LABELS,
  startingImplantation,
  weekCombos,
  type ComboApplied,
  type Famille,
  type GameState,
  type ImplantationChange,
  type PlannedAction,
  type Ruleset,
} from '@r2027/shared';
import { compareStrings } from '../core/ledger';

// Implantation de la semaine (phase 25, hypothèses du jeu de règles) : les cartes Terrain posées
// sur un département y font gagner des points, le grand meeting et la tournée débordent sur la
// région, les combos de lieu (bastion, tour de région) s'ajoutent, l'implantation s'érode
// au-dessus du départ hors des départements visés et plafonne à 100. Chaque variation est
// expliquée par ses facteurs, comme dans le registre des ressources.

type Factor = { label: string; value: number };

const percent = (taux: number) => Math.round(taux * 100);
const decimal = (value: number) => String(value).replace('.', ',');

/** Libellé du bonus de série d'une carte, dans le registre : « Meeting public : série Terrain ×2 (+25 %) ». */
export function seriesLabel(libelle: string, famille: Famille, rang: number, taux: number) {
  return `${libelle} : série ${FAMILLE_LABELS[famille]} ×${rang} (+${percent(taux)} %)`;
}

const REGIONS = new WeakMap<Ruleset, Map<string, string[]>>();

/** Départements de chaque région du jeu de règles, codes triés. */
function departementsByRegion(ruleset: Ruleset): Map<string, string[]> {
  let cached = REGIONS.get(ruleset);
  if (!cached) {
    cached = new Map();
    const departements = ruleset.parrainages.reservoir.departements;
    for (const code of Object.keys(departements).sort(compareStrings)) {
      const region = departements[code]!.region;
      if (!cached.has(region)) cached.set(region, []);
      cached.get(region)!.push(code);
    }
    REGIONS.set(ruleset, cached);
  }
  return cached;
}

/**
 * Applique l'implantation de la semaine à tous les candidats : seules les cartes acceptées
 * (`accepted`, positions dans `plans`) comptent. Met à jour `state.implantation` et renvoie les
 * variations (joueur d'abord, puis par identifiant ; départements par code) et les combos.
 */
export function applyWeekImplantation(
  state: GameState,
  ruleset: Ruleset,
  plans: Readonly<Record<string, readonly PlannedAction[]>>,
  accepted: Readonly<Record<string, readonly number[]>>,
): { changes: ImplantationChange[]; combos: ComboApplied[] } {
  const params = ruleset.implantation;
  const { bastion, tourDeRegion } = ruleset.combos;
  const departements = ruleset.parrainages.reservoir.departements;
  const regions = departementsByRegion(ruleset);
  const codes = Object.keys(departements).sort(compareStrings);
  const campaign = new Map(ruleset.actions.map((a) => [a.id, a]));
  const presidency = new Map(ruleset.quinquennat.actions.map((a) => [a.id, a]));
  const playerId = state.player.actorId;
  const actorIds = Object.keys(state.actors).sort((a, b) =>
    a === playerId ? -1 : b === playerId ? 1 : compareStrings(a, b),
  );
  const changes: ImplantationChange[] = [];
  const combos: ComboApplied[] = [];

  for (const actorId of actorIds) {
    const floor = startingImplantation(state.actors[actorId]!, ruleset);
    const map = (state.implantation[actorId] ??= { ...floor });
    const kept = new Set(accepted[actorId] ?? []);
    const cards = (plans[actorId] ?? []).filter((_, index) => kept.has(index));
    const factors = new Map<string, Factor[]>();
    const add = (code: string, label: string, value: number) => {
      if (value === 0) return;
      if (!factors.has(code)) factors.set(code, []);
      factors.get(code)!.push({ label, value });
    };
    const targeted = new Set<string>();

    // Gains des cartes posées sur un département, dans l'ordre du plan.
    for (const card of cards) {
      if (card.cible === undefined || !(card.cible in departements)) continue;
      const definition = campaign.get(card.actionId);
      const trip = presidency.get(card.actionId);
      let gain: number;
      let label: string;
      if (definition?.cible === 'departement') {
        gain = params.gains[definition.id] ?? 0;
        label = definition.libelle;
      } else if (trip?.cible === 'departement') {
        gain = params.deplacementPresident;
        label = trip.libelle;
      } else continue;
      targeted.add(card.cible);
      const region = regions.get(departements[card.cible]!.region) ?? [card.cible];
      if (definition?.id === 'tournee' && params.regionTournee) {
        for (const code of region)
          add(code, code === card.cible ? label : `${label} (région)`, gain);
        continue;
      }
      add(card.cible, label, gain);
      if (definition?.id === 'grand-meeting')
        for (const code of region)
          if (code !== card.cible) add(code, `${label} (région)`, params.regionGrandMeeting);
    }

    // Combos de la semaine (règle partagée avec l'interface).
    const week = weekCombos(cards, ruleset);
    for (const s of week.series) {
      const libelle = campaign.get(cards[s.index]!.actionId)!.libelle;
      combos.push({
        actorId,
        kind: 'serie',
        libelle: `Série ${FAMILLE_LABELS[s.famille]} ×${s.rang} (+${percent(s.taux)} %) : ${libelle}`,
        cible: null,
      });
    }
    for (const code of week.bastions) {
      const gains = (factors.get(code) ?? []).reduce((sum, f) => sum + f.value, 0);
      add(
        code,
        `Bastion ×${decimal(bastion.multiplicateur)}`,
        Math.round((bastion.multiplicateur - 1) * gains),
      );
      combos.push({
        actorId,
        kind: 'bastion',
        libelle: `Bastion ×${decimal(bastion.multiplicateur)} : ${departements[code]!.nom} (${code})`,
        cible: code,
      });
    }
    for (const region of week.toursDeRegion) {
      const members = regions.get(region) ?? [];
      for (const code of members) add(code, 'Tour de région', tourDeRegion.gain);
      combos.push({
        actorId,
        kind: 'tour-de-region',
        libelle: `Tour de région : +${tourDeRegion.gain} dans ses ${members.length} départements`,
        cible: region,
      });
    }

    // Érosion au-dessus du départ (jamais en dessous), hors départements visés ; plafond.
    for (const code of codes) {
      const start = floor[code] ?? 0;
      const before = map[code] ?? start;
      const list = factors.get(code) ?? [];
      if (!targeted.has(code) && before > start) {
        const erosion = Math.min(params.erosion, before - start);
        if (erosion > 0) list.push({ label: 'Érosion', value: -erosion });
      }
      if (list.length === 0) continue;
      let after = before + list.reduce((sum, f) => sum + f.value, 0);
      if (after > params.plafond) {
        list.push({ label: 'Plafond', value: params.plafond - after });
        after = params.plafond;
      }
      map[code] = after;
      changes.push({ actorId, departement: code, before, after, factors: list });
    }
  }
  return { changes, combos };
}
