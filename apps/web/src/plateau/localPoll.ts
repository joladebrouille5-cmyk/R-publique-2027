import { candidateName, type GameState } from '@r2027/shared';

// Mini-sondage local (phase 25 bis) : le classement des intentions de vote d'un département, lu
// tel quel dans la projection simulée du moteur (`opinion.departements`, centièmes de point).
// L'interface ne calcule rien : elle trie et met en forme ce que le moteur a projeté.

export type LocalEntry = {
  actorId: string;
  /** Nom de famille (classements écrits, étiquettes). */
  nom: string;
  /** Prénom et nom (fiche, infobulle). */
  nomComplet: string;
  /** Part projetée, en centièmes de point (0 à 10 000). */
  share: number;
  /** Rang : les ex aequo partagent le même. */
  rank: number;
  isPlayer: boolean;
};

export type LocalPoll = {
  entries: LocalEntry[];
  leader: LocalEntry;
  player: LocalEntry | null;
  /** Égalité en tête. */
  tie: boolean;
};

/** Part en centièmes de point → « 27,4 % ». */
export const formatLocal = (centiemes: number) =>
  `${(centiemes / 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Tri du classement : part décroissante, puis identifiant (départage stable). */
const byShare = (a: [string, number], b: [string, number]) =>
  b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** Classement d'un département ; null sans projection (semaine 0, département hors base). */
export function localPoll(state: GameState, code: string): LocalPoll | null {
  const local = state.opinion?.departements[code];
  if (!local) return null;
  const sorted = Object.entries(local).sort(byShare);
  if (sorted.length === 0) return null;
  const playerId = state.player.actorId;
  const entries = sorted.map(([actorId, share]): LocalEntry => {
    const actor = state.actors[actorId];
    return {
      actorId,
      nom: actor?.candidate.nom ?? actorId,
      nomComplet: actor ? candidateName(actor.candidate) : actorId,
      share,
      rank: 1 + sorted.filter(([, other]) => other > share).length,
      isPlayer: actorId === playerId,
    };
  });
  return {
    entries,
    leader: entries[0]!,
    player: entries.find((e) => e.isPlayer) ?? null,
    tie: entries.length > 1 && entries[1]!.share === entries[0]!.share,
  };
}

/** Les n premiers, et le joueur à part s'il est plus loin (toujours visible). */
export function topOfPoll(poll: LocalPoll, n: number) {
  const top = poll.entries.slice(0, n);
  const extra = poll.player && !top.includes(poll.player) ? poll.player : null;
  return { top, extra };
}

/** Classement écrit : « Rivière 27,4 %, Laborde 19,1 %, vous 8,8 % » (trois premiers et vous). */
export function rankingText(poll: LocalPoll, n = 3): string {
  const { top, extra } = topOfPoll(poll, n);
  return [...top, ...(extra ? [extra] : [])]
    .map((e) => `${e.isPlayer ? 'vous' : e.nom} ${formatLocal(e.share)}`)
    .join(', ');
}

/**
 * Couleurs des adversaires en tête (lecture « Qui mène ») : palette dédiée à la carte, contrôlée
 * au validateur de palettes sur le carton de jour et de nuit, toutes paires comparées (écart
 * perceptif ≥ 20,9 en vision normale, ≥ 9,2 en daltonisme), l'or du joueur compris. Les couleurs
 * de famille des sondages n'y suffisent pas (trois bleus voisins, un jaune proche de l'or).
 */
export const LEADER_COLORS = ['#6250d6', '#e87ba4', '#0d366b', '#2e7d7d'] as const;
/** Adversaires en tête au-delà de la palette : une couleur commune, leurs noms en légende. */
export const OTHER_LEADERS_COLOR = '#7a7f8c';

/**
 * Couleur de chaque adversaire qui mène au moins un département, dans l'ordre des acteurs de la
 * partie (la couleur suit le candidat, pas son nombre de départements) ; le joueur garde l'or.
 */
export function leaderColors(state: GameState) {
  const playerId = state.player.actorId;
  const leading = new Set<string>();
  for (const local of Object.values(state.opinion?.departements ?? {})) {
    const first = Object.entries(local).sort(byShare)[0];
    if (first && first[0] !== playerId) leading.add(first[0]);
  }
  const order = [...Object.keys(state.actors), ...[...leading].filter((id) => !state.actors[id])];
  const ranked = order.filter((id) => leading.has(id));
  const colors = new Map<string, string>(
    ranked.slice(0, LEADER_COLORS.length).map((id, i) => [id, LEADER_COLORS[i]!]),
  );
  return { colors, others: ranked.slice(LEADER_COLORS.length) };
}
