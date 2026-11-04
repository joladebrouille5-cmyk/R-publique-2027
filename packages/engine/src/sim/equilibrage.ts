import {
  cycleRuleset,
  debateAwaitingPlayer,
  type Difficulty,
  type GameState,
  type PlannedAction,
  type Position,
  type Ruleset,
} from '@r2027/shared';
import { planOpponentActions } from '../ai/opponents';
import { departements, presentationWindow } from '../campaign/parrainages';
import { advanceWeek } from '../core/advanceWeek';
import { createGame, PLAYER_ACTOR_ID } from '../core/createGame';
import { playDebate } from '../election/debats';

// Banc d'essai d'équilibrage (phase 24) : parties en format court, graine par graine, avec le
// vrai moteur ; débats conclus par la fin simulée, décisions par défaut. Pur et déterministe :
// même graine, même scénario, même résultat. Le lanceur (`pnpm sim:equilibrage`) écrit le
// résumé et le détail des parties ; une version courte tourne dans `pnpm check`.

export type Strategy = 'passif' | 'naif' | 'ia';

export type Scenario = {
  id: string;
  libelle: string;
  create: (seed: string, ruleset: Ruleset) => GameState;
  strategy: Strategy;
  /** Annonce progressive d'un programme par le joueur. */
  programme: boolean;
};

export type GameOutcome = {
  seed: string;
  winner: string | null;
  qualified: string[];
  /** Part des exprimés au premier tour (0 à 1) de chaque candidat présent. */
  t1Shares: Record<string, number>;
  sansParrainages: string[];
  /** Rang du joueur au premier tour (1 = en tête), écarté : dernier + 1 ; null en observateur. */
  playerRank: number | null;
};

const MAX_WEEKS = 60;

function concludeDebates(state: GameState, ruleset: Ruleset): GameState {
  let current = state;
  for (let i = 0; i < 4; i++) {
    const debate = debateAwaitingPlayer(current);
    if (!debate) return current;
    current = playDebate(current, ruleset, debate.id, {
      action: 'finir',
      sequence: debate.enCours?.index ?? 0,
    }).state;
  }
  return current;
}

/** Programme du joueur à annoncer : celui du candidat fictif le plus proche (copie, hypothèse). */
export function referenceProgramme(position: Position, ruleset: Ruleset): string[] {
  const closest = [...ruleset.candidatsFictifs].sort(
    (a, b) =>
      Math.hypot(
        a.positionnement.economie - position.economie,
        a.positionnement.societe - position.societe,
      ) -
        Math.hypot(
          b.positionnement.economie - position.economie,
          b.positionnement.societe - position.societe,
        ) || a.id.localeCompare(b.id),
  )[0]!;
  return [...closest.programme];
}

/** Actions du joueur pour la semaine selon sa stratégie. */
export function playerPlan(
  state: GameState,
  ruleset: Ruleset,
  strategy: Strategy,
): PlannedAction[] {
  const player = state.actors[PLAYER_ACTOR_ID];
  if (!player || (player.status !== 'candidat' && player.status !== 'qualifie')) return [];
  if (strategy === 'passif') return [];
  if (strategy === 'naif') {
    const calendar = cycleRuleset(ruleset, state.cycle);
    const open =
      state.meta.phase === 'campagne' && !presentationWindow(state.meta.date, calendar).closed;
    const deps = departements(ruleset);
    const week = state.meta.week;
    const sponsorship = open
      ? [0, 1].map((k) => ({
          actionId: 'elus-locaux',
          cible: deps[(week * 2 + k) % deps.length]!,
        }))
      : [];
    return [
      ...sponsorship,
      { actionId: 'meeting' },
      { actionId: 'interview', cible: 'france-inter' },
    ];
  }
  // Joueur IA : le joueur cloné en adversaire équilibré, son plan gardé.
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  const clone = copy.actors[PLAYER_ACTOR_ID]!;
  clone.kind = 'adversaire';
  clone.style = 'equilibre';
  clone.toleranceRisque = 0.4;
  clone.objectif = 'victoire';
  return (
    planOpponentActions(copy, ruleset).find((p) => p.actorId === PLAYER_ACTOR_ID)?.planned ?? []
  );
}

/** Joue une partie en format court jusqu'au soir du second tour. */
export function playShortGame(
  start: GameState,
  ruleset: Ruleset,
  strategy: Strategy,
  programme: boolean,
): GameOutcome {
  let state = start;
  const player = state.actors[PLAYER_ACTOR_ID];
  const toAnnounce =
    programme && player ? referenceProgramme(player.candidate.positionnement, ruleset) : [];
  for (let i = 0; i < MAX_WEEKS && !state.calendar.blockedBy; i++) {
    state = concludeDebates(state, ruleset);
    const actions = state.player.actorId ? playerPlan(state, ruleset, strategy) : [];
    const ajouter = toAnnounce.splice(0, 2);
    const playing = state.player.actorId
      ? ['candidat', 'qualifie'].includes(state.actors[state.player.actorId]!.status)
      : false;
    const result = advanceWeek(
      state,
      {
        actions,
        decisions: state.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
        ...(ajouter.length > 0 && playing && state.meta.phase === 'campagne'
          ? { programme: { ajouter, retirer: [] } }
          : {}),
      },
      { ruleset },
    );
    state = result.state;
  }
  return outcomeOf(start.meta.seed, state);
}

function outcomeOf(seed: string, state: GameState): GameOutcome {
  const t1 = state.elections.t1;
  const exprimes = t1?.exprimes ?? 0;
  const t1Shares = Object.fromEntries(
    Object.entries(t1?.voix ?? {}).map(([id, v]) => [id, exprimes > 0 ? v / exprimes : 0]),
  );
  const actors = Object.values(state.actors);
  const winner = actors.find((a) => a.status === 'elu')?.id ?? null;
  const qualified = Object.keys(state.elections.t2?.voix ?? {}).sort();
  const sansParrainages = actors
    .filter((a) => a.status === 'ecarte')
    .map((a) => a.id)
    .sort();
  let playerRank: number | null = null;
  if (state.player.actorId) {
    const ranking = Object.entries(t1Shares).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const index = ranking.findIndex(([id]) => id === state.player.actorId);
    playerRank = index >= 0 ? index + 1 : ranking.length + 1;
  }
  return { seed, winner, qualified, t1Shares, sansParrainages, playerRank };
}

export type CandidateStats = {
  victoires: number;
  secondTour: number;
  sansParrainages: number;
  scoreMoyenT1: number;
};
export type ScenarioSummary = {
  parties: number;
  candidats: Record<string, CandidateStats>;
  rangMedianJoueur: number | null;
};

/** Agrégats d'un scénario : proportions (0 à 1) et score moyen au premier tour par candidat. */
export function summarize(outcomes: readonly GameOutcome[]): ScenarioSummary {
  const ids = new Set<string>();
  for (const o of outcomes) {
    Object.keys(o.t1Shares).forEach((id) => ids.add(id));
    o.sansParrainages.forEach((id) => ids.add(id));
    if (o.winner) ids.add(o.winner);
  }
  const n = outcomes.length || 1;
  const candidats: Record<string, CandidateStats> = {};
  for (const id of [...ids].sort()) {
    candidats[id] = {
      victoires: outcomes.filter((o) => o.winner === id).length / n,
      secondTour: outcomes.filter((o) => o.qualified.includes(id)).length / n,
      sansParrainages: outcomes.filter((o) => o.sansParrainages.includes(id)).length / n,
      scoreMoyenT1: outcomes.reduce((s, o) => s + (o.t1Shares[id] ?? 0), 0) / n,
    };
  }
  const ranks = outcomes
    .map((o) => o.playerRank)
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  const rangMedianJoueur = ranks.length ? ranks[Math.floor((ranks.length - 1) / 2)]! : null;
  return { parties: outcomes.length, candidats, rangMedianJoueur };
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

/** Résumé texte en français d'un scénario. */
export function formatSummary(
  scenario: Pick<Scenario, 'id' | 'libelle'>,
  summary: ScenarioSummary,
  label: (id: string) => string = (id) => id,
): string {
  const rows = Object.entries(summary.candidats)
    .sort((a, b) => b[1].victoires - a[1].victoires || b[1].scoreMoyenT1 - a[1].scoreMoyenT1)
    .map(
      ([id, s]) =>
        `| ${label(id)} | ${pct(s.victoires)} | ${pct(s.secondTour)} | ${pct(s.sansParrainages)} | ${pct(s.scoreMoyenT1)} |`,
    );
  return [
    `### ${scenario.libelle} (\`${scenario.id}\`, ${summary.parties} parties)`,
    '',
    '| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    summary.rangMedianJoueur === null
      ? ''
      : `Rang médian du joueur au 1er tour : ${summary.rangMedianJoueur}.`,
    '',
  ].join('\n');
}

// ————————————————————————————————————————————————————————————————————————————————
// Scénarios

const CENTRE: Position = { economie: 0, societe: 0 };
const custom = (position: Position, nom = 'Banc') => ({
  prenom: 'Camille',
  nom,
  parti: "Parti du banc d'essai",
  positionnement: position,
});

function short(
  ruleset: Ruleset,
  seed: string,
  input: Omit<Parameters<typeof createGame>[0], 'seed' | 'format'>,
) {
  return createGame({ ...input, seed, format: 'court' }, ruleset);
}

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'decouverte',
  'accessible',
  'standard',
  'expert',
  'legende',
];

/** Inverse les ressources de départ de deux adversaires fictifs (démonstration du §2.3). */
export function swapResources(state: GameState, a: string, b: string): GameState {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  const ra = copy.actors[a]!.resources;
  copy.actors[a]!.resources = copy.actors[b]!.resources;
  copy.actors[b]!.resources = ra;
  return copy;
}

/** Scénarios du banc (identifiant → scénario). */
export function scenarios(ruleset: Ruleset): Record<string, Scenario> {
  const list: Scenario[] = [
    {
      id: 'observateur-fictifs',
      libelle: 'Observateur, adversaires fictifs',
      create: (seed, r) => short(r, seed, { mode: 'observateur', difficulty: 'standard' }),
      strategy: 'passif',
      programme: false,
    },
    {
      id: 'observateur-reels-equitable',
      libelle: 'Observateur, personnalités réelles (départ équitable)',
      create: (seed, r) =>
        short(r, seed, {
          mode: 'observateur',
          difficulty: 'standard',
          adversaires: 'reels',
          depart: 'equitable',
        }),
      strategy: 'passif',
      programme: false,
    },
    {
      id: 'observateur-reels-sondages',
      libelle: 'Observateur, personnalités réelles (sondages actuels)',
      create: (seed, r) =>
        short(r, seed, {
          mode: 'observateur',
          difficulty: 'standard',
          adversaires: 'reels',
          depart: 'sondages',
        }),
      strategy: 'passif',
      programme: false,
    },
    {
      id: 'inverse-boussole-pilier',
      libelle: 'Observateur, ressources de Boussole et Pilier échangées',
      create: (seed, r) =>
        swapResources(
          short(r, seed, { mode: 'observateur', difficulty: 'standard' }),
          'adv-boussole',
          'adv-pilier',
        ),
      strategy: 'passif',
      programme: false,
    },
  ];
  for (const difficulty of DIFFICULTY_ORDER)
    for (const strategy of ['passif', 'naif', 'ia'] as const)
      for (const programme of strategy === 'ia' ? [false, true] : [false])
        list.push({
          id: `personnalise-${difficulty}-${strategy}${programme ? '-programme' : ''}`,
          libelle: `Candidat personnalisé au centre, ${difficulty}, ${strategy}${programme ? ', avec programme' : ''}`,
          create: (seed, r) =>
            short(r, seed, {
              mode: 'candidat_personnalise',
              difficulty,
              candidate: custom(CENTRE),
            }),
          strategy,
          programme,
        });
  for (const [side, position] of [
    ['gauche', { economie: -45, societe: -20 }],
    ['droite', { economie: 45, societe: 20 }],
  ] as const)
    list.push({
      id: `miroir-${side}`,
      libelle: `Position miroir (${side}), joueur IA, Standard`,
      create: (seed, r) =>
        short(r, seed, {
          mode: 'candidat_personnalise',
          difficulty: 'standard',
          candidate: custom(position),
        }),
      strategy: 'ia',
      programme: true,
    });
  for (const personality of ruleset.personnalites.personnalites)
    list.push({
      id: `incarne-${personality.id}`,
      libelle: `Incarner ${personality.prenom} ${personality.nom}, joueur IA, Standard`,
      create: (seed, r) =>
        short(r, seed, {
          mode: 'candidat_reel',
          difficulty: 'standard',
          personnaliteId: personality.id,
          adversaires: 'reels',
          depart: 'sondages',
        }),
      strategy: 'ia',
      programme: false,
    });
  return Object.fromEntries(list.map((s) => [s.id, s]));
}

/** Joue `parties` parties d'un scénario, graines `equilibrage-<id>-<n>`. */
export function runScenario(scenario: Scenario, ruleset: Ruleset, parties: number): GameOutcome[] {
  const outcomes: GameOutcome[] = [];
  for (let n = 0; n < parties; n++) {
    const seed = `equilibrage-${scenario.id}-${n}`;
    outcomes.push(
      playShortGame(scenario.create(seed, ruleset), ruleset, scenario.strategy, scenario.programme),
    );
  }
  return outcomes;
}
