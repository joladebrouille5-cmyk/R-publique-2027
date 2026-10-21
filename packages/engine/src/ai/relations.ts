import {
  candidateName,
  daysFromCivil,
  parseIsoDate,
  relationKey,
  type Actor,
  type Alliance,
  type GameState,
  type Relation,
  type RelationNote,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { compareStrings } from '../core/ledger';
import { stream } from '../core/random';
import { distance } from '../election/model';

// Relations entre candidats (§7) : graphe de confiance, proximité, rivalité et historique ;
// ralliements avant le premier tour (un candidat se retire et soutient un autre candidat).
// Un ralliement est toujours décidé par le candidat qui se retire : jamais imposé au joueur.

const ACTIVE = new Set(['candidat', 'qualifie']);
const HISTORY = 10;
const RIVALRY_ALERT = 60;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Proximité idéologique (0 à 100) entre deux candidats. */
export function proximity(a: Actor, b: Actor): number {
  const d = distance(a.candidate.positionnement, b.candidate.positionnement);
  return Math.round(100 * clamp(1 - d / 2, 0, 1));
}

/** Relations initiales : la confiance de départ suit la proximité (hypothèse de jeu). */
export function initialRelations(actors: Record<string, Actor>): Record<string, Relation> {
  const ids = Object.keys(actors).sort(compareStrings);
  const relations: Record<string, Relation> = {};
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = actors[ids[i]!]!;
      const b = actors[ids[j]!]!;
      const proximite = proximity(a, b);
      relations[relationKey(a.id, b.id)] = {
        a: a.id,
        b: b.id,
        confiance: Math.round((proximite - 50) * 0.8) + 0,
        proximite,
        rivalite: 0,
        historique: [],
      };
    }
  }
  return relations;
}

function remember(relation: Relation, week: number, libelle: string) {
  relation.historique = [...relation.historique, { semaine: week, libelle }].slice(-HISTORY);
}

/**
 * Étape 4 : rivalité selon l'écart dans les intentions de vote et l'électorat commun ; une
 * rivalité forte entame la confiance. Renvoie les faits marquants de la semaine. Tant
 * qu'aucune intention n'a été calculée (semaine 0), la rivalité ne peut pas être appréciée.
 */
export function updateRelations(state: GameState): RelationNote[] {
  const notes: RelationNote[] = [];
  if (!state.opinion) return notes;
  const week = state.meta.week;
  const intentions = state.opinion.intentions;
  for (const key of Object.keys(state.relations).sort(compareStrings)) {
    const relation = state.relations[key]!;
    const a = state.actors[relation.a];
    const b = state.actors[relation.b];
    if (!a || !b) continue;
    const before = relation.rivalite;
    if (!ACTIVE.has(a.status) || !ACTIVE.has(b.status)) {
      relation.rivalite = 0;
      continue;
    }
    const gap = Math.abs((intentions[a.id] ?? 0) - (intentions[b.id] ?? 0));
    const closeness = 1 - Math.min(1, gap / 1_000);
    relation.rivalite = Math.round(100 * closeness * (0.3 + (0.7 * relation.proximite) / 100));
    if (relation.rivalite >= RIVALRY_ALERT) {
      relation.confiance = clamp(relation.confiance - 2, -100, 100);
      if (before < RIVALRY_ALERT) {
        const libelle = 'Rivalité accrue : intentions de vote proches et électorat commun';
        remember(relation, week, libelle);
        notes.push({ a: a.id, b: b.id, libelle });
      }
    }
  }
  return notes;
}

/** Semaines restant avant le premier tour (le scrutin du premier tour du jeu de règles). */
export function weeksBeforeFirstRound(state: GameState, ruleset: Ruleset): number {
  const t1 = ruleset.calendrier.scrutins[0]!.date;
  const days = daysFromCivil(parseIsoDate(t1)!) - daysFromCivil(parseIsoDate(state.meta.date)!);
  return Math.floor(days / 7);
}

function inWindow(state: GameState, ruleset: Ruleset): boolean {
  const weeks = weeksBeforeFirstRound(state, ruleset);
  return (
    state.meta.phase === 'campagne' && weeks >= 1 && weeks <= ruleset.alliances.fenetreSemaines
  );
}

/** Appréciation d'un soutien possible : proximité, confiance et poids du candidat soutenu. */
function attractiveness(relation: Relation, intentions: number): number {
  return relation.proximite + relation.confiance / 2 + intentions / 100;
}

export type AllianceOutcome = {
  alliances: Alliance[];
  notes: RelationNote[];
  events: ReportEvent[];
};

function rally(
  state: GameState,
  from: Actor,
  to: Actor,
  origine: Alliance['origine'],
  outcome: AllianceOutcome,
) {
  const week = state.meta.week;
  const alliance: Alliance = {
    id: `ralliement-${week}-${from.id}`,
    de: from.id,
    vers: to.id,
    semaine: week,
    origine,
    nature: 'ralliement',
  };
  from.status = 'retire';
  state.alliances.push(alliance);
  outcome.alliances.push(alliance);
  const relation = state.relations[relationKey(from.id, to.id)];
  const libelle = `${candidateName(from.candidate)} se retire et soutient ${candidateName(to.candidate)}`;
  if (relation) {
    relation.confiance = clamp(relation.confiance + 30, -100, 100);
    remember(relation, week, libelle);
  }
  outcome.notes.push({ a: from.id, b: to.id, libelle });
  outcome.events.push({
    id: alliance.id,
    kind: 'evenement',
    refId: 'ralliement',
    label: libelle,
    description:
      origine === 'joueur'
        ? 'Ralliement accepté à votre proposition : une partie de ses électeurs pourra vous rejoindre.'
        : 'Ralliement décidé par ce candidat (IA) : une partie de ses électeurs suivra son choix.',
    nature: 'simule',
    majeur: from.id === state.player.actorId || to.id === state.player.actorId,
    decisionId: null,
  });
}

/**
 * Étape 4 : propositions de ralliement du joueur (acceptées ou refusées par le candidat
 * sollicité selon la relation et le rapport de forces), puis ralliements décidés par les
 * adversaires en difficulté, dans les semaines qui précèdent le premier tour.
 */
export function resolveAlliances(
  state: GameState,
  ruleset: Ruleset,
  proposals: readonly string[],
  hopeless: ReadonlySet<string>,
): AllianceOutcome {
  const outcome: AllianceOutcome = { alliances: [], notes: [], events: [] };
  const week = state.meta.week;
  const intentions = state.opinion?.intentions ?? {};
  const playerId = state.player.actorId;
  const player = playerId ? state.actors[playerId] : undefined;
  const open = inWindow(state, ruleset);
  const { seuilIntentions, proximiteMin, probabiliteHebdo } = ruleset.alliances;

  for (const targetId of [...new Set(proposals)].sort(compareStrings)) {
    const target = state.actors[targetId];
    if (!player || !target || target.kind !== 'adversaire') continue;
    const relation = state.relations[relationKey(player.id, target.id)];
    const name = candidateName(target.candidate);
    if (!open || !ACTIVE.has(target.status) || !ACTIVE.has(player.status) || !relation) {
      outcome.notes.push({
        a: player.id,
        b: target.id,
        libelle: `Proposition de ralliement à ${name} sans suite : possible seulement entre candidats en lice, dans les ${ruleset.alliances.fenetreSemaines} semaines avant le premier tour.`,
      });
      continue;
    }
    const mine = intentions[player.id] ?? 0;
    const theirs = intentions[target.id] ?? 0;
    const probability = clamp(
      0.3 +
        (relation.proximite - 50) / 100 +
        relation.confiance / 200 +
        (mine - theirs) / 2_000 +
        (hopeless.has(target.id) ? 0.2 : 0) -
        (target.objectif === 'victoire' ? 0.3 : 0),
      0.05,
      0.9,
    );
    const accepted =
      theirs < mine &&
      relation.proximite >= proximiteMin - 10 &&
      stream(state.meta.seed, week, 'alliance', 'joueur', target.id).nextFloat() < probability;
    if (accepted) {
      rally(state, target, player, 'joueur', outcome);
    } else {
      relation.confiance = clamp(relation.confiance - 15, -100, 100);
      const libelle = `${name} décline votre proposition de ralliement`;
      remember(relation, week, libelle);
      outcome.notes.push({ a: player.id, b: target.id, libelle });
    }
  }

  if (!open) return outcome;
  const opponents = Object.values(state.actors)
    .filter((a) => a.kind === 'adversaire' && a.status === 'candidat' && a.objectif !== 'victoire')
    .sort((a, b) => compareStrings(a.id, b.id));
  for (const actor of opponents) {
    if (actor.status !== 'candidat') continue;
    const own = intentions[actor.id] ?? 0;
    const struggling = own < seuilIntentions || hopeless.has(actor.id);
    if (!struggling) continue;
    const candidates = Object.values(state.actors)
      .filter((other) => other.id !== actor.id && other.status === 'candidat')
      .map((other) => ({ other, relation: state.relations[relationKey(actor.id, other.id)]! }))
      .filter(
        ({ other, relation }) =>
          (intentions[other.id] ?? 0) > own &&
          relation.proximite >= proximiteMin &&
          relation.confiance >= 0,
      )
      .sort(
        (x, y) =>
          attractiveness(y.relation, intentions[y.other.id] ?? 0) -
            attractiveness(x.relation, intentions[x.other.id] ?? 0) ||
          compareStrings(x.other.id, y.other.id),
      );
    const best = candidates[0];
    if (!best) continue;
    const pressure =
      seuilIntentions > 0 ? Math.max(0, (seuilIntentions - own) / seuilIntentions) : 0;
    const probability = Math.min(
      1,
      probabiliteHebdo * (1 + pressure) * (hopeless.has(actor.id) ? 2 : 1),
    );
    if (stream(state.meta.seed, week, 'alliance', 'ia', actor.id).nextFloat() < probability) {
      rally(state, actor, best.other, 'ia', outcome);
    }
  }
  return outcome;
}
