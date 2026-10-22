import {
  addDays,
  candidateName,
  type Actor,
  type DebateAngle,
  type DebateCard,
  type DebateMove,
  type DebateOffer,
  type DebateOutcome,
  type DebateRequest,
  type DebateSession,
  type DebateSessionRule,
  type DebateTheme,
  type DigitalTone,
  type GameState,
  type ReportEvent,
  type Ruleset,
  type UtilityFactor,
} from '@r2027/shared';
import { credibility } from '../campaign/programme';
import { EngineInputError } from '../core/errors';
import { compareStrings, type Ledger } from '../core/ledger';
import { stream } from '../core/random';
import type { Rng } from '../core/rng';
import { largestRemainder } from './apportion';

// Débats télévisés (phase 10, hypothèses du jeu) : débats à plusieurs avant le premier tour et
// débat d'entre-deux-tours, joués séquence par séquence. Le joueur choisit une carte par
// séquence (API) ; les adversaires suivent une règle déterministe (graine, semaine, débat,
// séquence, coup). Chaque coup modifie l'approbation du public (0 à 100) ; le débat terminé
// donne un sondage flash simulé et une prestation (−1 à +1) dont les effets passent par le
// registre à la résolution de la semaine, et un facteur de vote qui s'estompe. Une attaque dont
// le fait est faux se retourne toujours contre l'attaquant. Aucune réplique n'est prêtée à une
// personnalité réelle : seul son coup est enregistré.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const round1 = (value: number) => Math.round(value * 10) / 10 + 0;
const round2 = (value: number) => Math.round(value * 100) / 100 + 0;

/** Ordre de préférence des angles d'attaque de l'IA (le plus dommageable d'abord). */
const ANGLE_PREFERENCE: DebateAngle[] = [
  'bilan',
  'revirements',
  'programme',
  'finances',
  'ralliement',
];

type Choice = {
  carte: DebateCard;
  cible?: string | null;
  angle?: DebateAngle | null;
  propositionId?: string | null;
  attaquant?: string | null;
};

// --- Calendrier et invitations ---

function echeanceDate(ruleset: Ruleset, rule: DebateSessionRule): string | null {
  return ruleset.calendrier.echeances.find((e) => e.id === rule.echeanceId)?.date ?? null;
}

const inWeek = (date: string, monday: string) => date >= monday && date < addDays(monday, 7);

/** Intentions de vote les plus récentes (sondage publié, sinon opinion), par candidat. */
function latestIntentions(state: GameState, round: 1 | 2): Record<string, number> {
  const kind = round === 1 ? 'intentions_t1' : 'intentions_t2';
  const poll = [...state.polls]
    .reverse()
    .find((p) => p.kind === kind && !p.id.endsWith('-hypothese-t2'));
  if (poll) return Object.fromEntries(poll.results.map((r) => [r.actorId, r.value]));
  return state.opinion?.intentions ?? {};
}

/** Candidats invités à un débat, triés par identifiant. */
export function invitedTo(state: GameState, rule: DebateSessionRule): string[] {
  const status = rule.tour === 1 ? 'candidat' : 'qualifie';
  const eligible = Object.values(state.actors)
    .filter((a) => a.status === status)
    .map((a) => a.id)
    .sort(compareStrings);
  if (rule.invites.mode !== 'sondage') return eligible;
  const intentions = latestIntentions(state, 1);
  return [...eligible]
    .sort(
      (a, b) =>
        (intentions[b] ?? 0) - (intentions[a] ?? 0) ||
        state.actors[b]!.resources.notoriete - state.actors[a]!.resources.notoriete ||
        compareStrings(a, b),
    )
    .slice(0, rule.invites.nombre)
    .sort(compareStrings);
}

const present = (session: DebateSession) =>
  session.invites.filter((id) => !session.refus.includes(id));

/** Le joueur est-il sur le plateau (invité, présent et toujours en lice) ? */
function playerOnStage(state: GameState, session: DebateSession): string | null {
  const id = state.player.actorId;
  if (!id || !present(session).includes(id)) return null;
  const status = state.actors[id]?.status;
  return status === 'candidat' || status === 'qualifie' ? id : null;
}

/**
 * Débats de la semaine en cours : séances créées une fois (invitations d'après le dernier
 * sondage ou le statut des candidats, refus éventuel d'un favori IA), première séquence
 * préparée si le joueur est sur le plateau. Idempotent.
 */
export function scheduleDebates(state: GameState, ruleset: Ruleset): DebateSession[] {
  const rules = ruleset.debats;
  const week = state.meta.week;
  const created: DebateSession[] = [];
  for (const rule of rules.seances) {
    if (state.debats.seances.some((s) => s.id === rule.id)) continue;
    const date = echeanceDate(ruleset, rule);
    if (!date || !inWeek(date, state.meta.date)) continue;
    const phase = rule.tour === 1 ? 'campagne' : 'entre_deux_tours';
    if (state.meta.phase !== phase) continue;
    // Partie migrée dont le débat d'entre-deux-tours (automatique) a déjà eu lieu.
    if (rule.tour === 2 && state.elections.debate) continue;
    const invites = invitedTo(state, rule);
    if (invites.length < 2) continue;
    const refus = aiRefusals(state, ruleset, rule, invites);
    const session: DebateSession = {
      id: rule.id,
      libelle: rule.libelle,
      tour: rule.tour,
      date,
      semaine: week,
      mediaId: rule.mediaId,
      invites,
      refus,
      statut: 'prevu',
      themes: [...rule.themes, rules.conclusion.id],
      sequences: [],
      enCours: null,
      approbation: Object.fromEntries(
        invites.filter((id) => !refus.includes(id)).map((id) => [id, rules.approbation.depart]),
      ),
      resultat: null,
    };
    state.debats.seances.push(session);
    created.push(session);
    if (present(session).length < 2) finalize(state, ruleset, session);
    else if (playerOnStage(state, session)) openSequence(state, ruleset, session, 0);
  }
  return created;
}

/** Un favori IA largement en tête refuse parfois de débattre (chaise vide). */
function aiRefusals(
  state: GameState,
  ruleset: Ruleset,
  rule: DebateSessionRule,
  invites: readonly string[],
): string[] {
  const { refus } = ruleset.debats.ia;
  const intentions = latestIntentions(state, rule.tour);
  const ranked = [...invites].sort(
    (a, b) => (intentions[b] ?? 0) - (intentions[a] ?? 0) || compareStrings(a, b),
  );
  const [first, second] = ranked as [string, string | undefined];
  if (first === state.player.actorId || second === undefined) return [];
  const lead = (intentions[first] ?? 0) - (intentions[second] ?? 0);
  if (lead < refus.ecartMin) return [];
  const rng = stream(state.meta.seed, state.meta.week, 'debat', rule.id, 'refus');
  return rng.nextFloat() < refus.probabilite ? [first] : [];
}

// --- Compétences et faits ---

/** Composantes de compétence (0 à 1) : préparation, maîtrise, cohérence du programme. */
export function debateSkills(state: GameState, ruleset: Ruleset, actorId: string) {
  const actor = state.actors[actorId]!;
  const preparation = clamp01(actor.preparationDebat / ruleset.debats.preparationMaxHeures);
  const bonus =
    actor.kind === 'adversaire' ? ruleset.debats.ia.difficulte[state.meta.difficulty] : 0;
  const maitrise = clamp01(0.5 * (actor.resources.notoriete / 10_000) + 0.5 * actor.equipe + bonus);
  const coherence =
    actor.programme.propositions.length === 0
      ? 0.4
      : clamp01((credibility(actor.programme, ruleset).value + 1) / 2);
  return {
    preparation: round2(preparation),
    maitrise: round2(maitrise),
    coherence: round2(coherence),
  };
}

/** Compétence (0 à 1) : moyenne pondérée, hors part du hasard. */
function skillOf(state: GameState, ruleset: Ruleset, actorId: string): number {
  const w = ruleset.debats.poids;
  const s = debateSkills(state, ruleset, actorId);
  const total = w.preparation + w.maitrise + w.coherence;
  return total === 0
    ? 0.5
    : (w.preparation * s.preparation + w.maitrise * s.maitrise + w.coherence * s.coherence) / total;
}

/** Programme attribué par le jeu : jamais celui d'une personnalité réelle adverse. */
const simulatedProgramme = (actor: Actor) =>
  !(actor.candidate.nature === 'reel' && actor.kind === 'adversaire');

/** Président sortant (campagnes de 2032 et suivantes). */
function outgoingPresident(state: GameState): string | null {
  if (state.cycle.annee <= 2027) return null;
  return (
    state.quinquennat?.mandat.presidentId ??
    state.historique.quinquennats.at(-1)?.mandat.presidentId ??
    null
  );
}

/** Le fait reproché par un angle d'attaque est-il vrai pour cette cible ? */
export function angleHolds(
  state: GameState,
  ruleset: Ruleset,
  targetId: string,
  angle: DebateAngle,
): boolean {
  const target = state.actors[targetId];
  if (!target) return false;
  switch (angle) {
    case 'programme':
      return (
        simulatedProgramme(target) &&
        target.programme.propositions.length > 0 &&
        credibility(target.programme, ruleset).value < ruleset.debats.seuilCredibilite
      );
    case 'revirements':
      return target.programme.revirements > 0;
    case 'finances':
      return target.finances.refus.nombre > 0;
    case 'ralliement':
      return state.alliances.some((a) => a.vers === targetId);
    case 'bilan':
      return outgoingPresident(state) === targetId;
  }
}

// --- Déroulé d'une séquence ---

type Context = {
  state: GameState;
  ruleset: Ruleset;
  session: DebateSession;
  index: number;
  theme: DebateTheme;
  /** Coups déjà joués dans la séquence (ouverture comprise). */
  moves: DebateMove[];
};

function themeOf(ruleset: Ruleset, id: string): DebateTheme {
  const { themes, conclusion } = ruleset.debats;
  return themes.find((t) => t.id === id) ?? conclusion;
}

/** Candidat favori sur le plateau : le mieux placé dans les intentions de vote. */
function favouriteOf(state: GameState, session: DebateSession): string {
  const intentions = latestIntentions(state, session.tour);
  return [...present(session)].sort(
    (a, b) =>
      (intentions[b] ?? 0) - (intentions[a] ?? 0) ||
      (session.approbation[b] ?? 0) - (session.approbation[a] ?? 0) ||
      compareStrings(a, b),
  )[0]!;
}

/** Ordre de parole d'une séquence : rotation des présents ; IA limitées aux grands débats. */
function speakingOrder(
  ruleset: Ruleset,
  session: DebateSession,
  index: number,
  playerId: string | null,
) {
  const rule = ruleset.debats.seances.find((r) => r.id === session.id);
  const all = present(session);
  const rotate = <T>(list: readonly T[], k: number) =>
    list.length === 0 ? [] : list.map((_, i) => list[(i + k) % list.length]!);
  const ais = all.filter((id) => id !== playerId);
  const limit = rule?.coupsIaParSequence ?? ais.length;
  const speaking = new Set(rotate(ais, index * limit).slice(0, limit));
  return rotate(all, index).filter((id) => id === playerId || speaking.has(id));
}

/** Première proposition du programme du candidat qui relève du thème, sinon null (vision). */
function propositionFor(state: GameState, ruleset: Ruleset, actorId: string, theme: DebateTheme) {
  const actor = state.actors[actorId]!;
  if (!simulatedProgramme(actor) || theme.domaines.length === 0) return null;
  const proposals = new Map(ruleset.programme.propositions.map((p) => [p.id, p]));
  return (
    actor.programme.propositions.find((id) => {
      const domain = proposals.get(id)?.domaine;
      return domain !== undefined && theme.domaines.includes(domain);
    }) ?? null
  );
}

/** Dernière attaque reçue dans la séquence, le cas échéant. */
const attackOn = (moves: readonly DebateMove[], actorId: string) =>
  [...moves].reverse().find((m) => m.carte === 'attaquer' && m.cible === actorId);

/** Choix d'un adversaire (ou du joueur quand la fin du débat est simulée). */
function aiChoice(ctx: Context, actorId: string, rng: Rng): Choice {
  const { state, ruleset, session, theme } = ctx;
  const ia = ruleset.debats.ia;
  const actor = state.actors[actorId]!;
  const received = attackOn(ctx.moves, actorId);
  if (received && rng.nextFloat() < ia.riposte)
    return { carte: 'repondre', attaquant: received.acteurId };
  const defend = (): Choice => ({
    carte: 'defendre',
    propositionId: propositionFor(state, ruleset, actorId, theme),
  });
  if (favouriteOf(state, session) === actorId)
    return rng.nextFloat() < ia.hauteurFavori ? { carte: 'hauteur' } : defend();
  const style = actor.style ?? 'equilibre';
  if (rng.nextFloat() < ia.attaque[style]) {
    const others = present(session).filter((id) => id !== actorId);
    const intentions = latestIntentions(state, session.tour);
    const ranked = [actorId, ...others].sort(
      (a, b) => (intentions[b] ?? 0) - (intentions[a] ?? 0) || compareStrings(a, b),
    );
    const rank = ranked.indexOf(actorId);
    let target = rank > 0 ? ranked[rank - 1]! : ranked[1]!;
    // Un joueur qui monte attire les coups.
    const player = state.player.actorId;
    if (player && player !== actorId && others.includes(player)) {
      const history = state.actors[player]!.history.popularite;
      const rising =
        history.length >= 4 &&
        state.actors[player]!.resources.popularite - history[history.length - 4]! >= 150;
      if (rising && rng.nextFloat() < 0.5) target = player;
    }
    const valid = ANGLE_PREFERENCE.filter((a) => angleHolds(state, ruleset, target, a));
    const invalid = ANGLE_PREFERENCE.filter((a) => !valid.includes(a));
    const mistake =
      invalid.length > 0 &&
      rng.nextFloat() < ia.erreurAngle * (1 - debateSkills(state, ruleset, actorId).maitrise);
    if (mistake) return { carte: 'attaquer', cible: target, angle: invalid[0]! };
    if (valid.length > 0) return { carte: 'attaquer', cible: target, angle: valid[0]! };
  }
  if (rng.nextFloat() < ia.petitePhrase) return { carte: 'petite-phrase' };
  return defend();
}

/** Remplit un modèle de réplique ; un marqueur en début de phrase garde sa majuscule. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string, offset: number) => {
    const value = values[key];
    if (value === undefined) return match;
    const before = template.slice(0, offset).trimEnd();
    const sentenceStart = before === '' || before.endsWith('«') || /[.!?]$/.test(before);
    return sentenceStart ? value : value.charAt(0).toLowerCase() + value.slice(1);
  });
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[rng.nextInt(list.length)]!;
}

/** Joue un coup : approbation, issue, réplique, temps de parole, réaction d'un compte fictif. */
function playMove(ctx: Context, actorId: string, choice: Choice, rng: Rng): DebateMove {
  const { state, ruleset, session } = ctx;
  const rules = ruleset.debats;
  const A = rules.approbation;
  const w = rules.poids;
  const actor = state.actors[actorId]!;
  const q = (1 - w.reponse) * skillOf(state, ruleset, actorId) + w.reponse * rng.nextFloat();
  const effects: Record<string, number> = {};
  const add = (id: string, delta: number) => {
    if (!(id in session.approbation)) return;
    effects[id] = round1((effects[id] ?? 0) + delta);
  };
  let issue: DebateOutcome = 'neutre';
  let line: string | null = null;
  let cible: string | null = null;
  let angle: DebateAngle | null = null;
  let propositionId: string | null = null;
  const theme = ctx.theme;
  const proposalLabel = (id: string | null) =>
    id ? (ruleset.programme.propositions.find((p) => p.id === id)?.libelle ?? null) : null;

  switch (choice.carte) {
    case 'defendre': {
      propositionId = choice.propositionId ?? null;
      add(actorId, A.defendre * (q - 0.3));
      issue = q >= 0.6 ? 'reussi' : q < 0.35 ? 'rate' : 'neutre';
      const label = proposalLabel(propositionId);
      line = label
        ? fill(pick(rng, rules.repliques.defendre), { proposition: label })
        : fill(pick(rng, rules.repliques.vision), { theme: theme.libelle });
      break;
    }
    case 'attaquer': {
      cible = choice.cible ?? null;
      angle = choice.angle ?? null;
      if (!cible || !angle) throw new Error('Attaque sans cible ni angle');
      const attacks = [...session.sequences.flatMap((s) => s.coups), ...ctx.moves].filter(
        (m) => m.acteurId === actorId && m.carte === 'attaquer',
      ).length;
      if (angleHolds(state, ruleset, cible, angle)) {
        add(cible, -A.attaque * q);
        add(actorId, A.gainAttaquant * (q - 0.4));
        issue = q >= 0.5 ? 'reussi' : 'rate';
      } else {
        // Fait faux : l'attaque se retourne toujours contre son auteur.
        add(actorId, -A.retour * (0.6 + 0.4 * (1 - q)));
        add(cible, A.retour / 2);
        issue = 'retourne';
      }
      if (attacks >= A.agressivite.seuil) add(actorId, -A.agressivite.malus);
      line = pick(rng, rules.repliques.attaque[angle]);
      break;
    }
    case 'repondre': {
      cible = choice.attaquant ?? null;
      const attack = cible ? attackOn(ctx.moves, actorId) : undefined;
      const unfounded = attack?.issue === 'retourne';
      add(actorId, A.riposte * q + (unfounded ? A.riposteFausse : 0));
      if (cible) add(cible, -(A.riposte * 0.5 * q + (unfounded ? A.riposteFausse : 0)));
      issue = q >= 0.5 || unfounded ? 'reussi' : 'neutre';
      line = pick(rng, unfounded ? rules.repliques.repondreFausse : rules.repliques.repondre);
      break;
    }
    case 'hauteur': {
      const base = favouriteOf(state, session) === actorId ? A.hauteurFavori : A.hauteur;
      const received = ctx.moves
        .map((m) => m.effets[actorId] ?? 0)
        .filter((d) => d < 0)
        .reduce((s, d) => s + d, 0);
      add(actorId, base * q - A.hauteurAmortit * received);
      issue = q >= 0.5 ? 'reussi' : 'neutre';
      line = pick(rng, rules.repliques.hauteur);
      break;
    }
    case 'petite-phrase': {
      const { reussite, echec, gain, perte } = A.petitePhrase;
      const roll = rng.nextFloat();
      if (roll < reussite + 0.25 * (q - 0.5)) {
        add(actorId, gain);
        issue = 'reussi';
      } else if (roll > 1 - (echec - 0.2 * (q - 0.5))) {
        add(actorId, -perte);
        issue = 'rate';
      } else {
        add(actorId, gain * 0.3);
      }
      line = pick(
        rng,
        issue === 'rate' ? rules.repliques.petitePhraseRatee : rules.repliques.petitePhraseReussie,
      );
      break;
    }
  }
  for (const [id, delta] of Object.entries(effects))
    session.approbation[id] = round1(clamp((session.approbation[id] ?? 0) + delta, 0, 100));

  const duree = choice.carte === 'petite-phrase' ? 15 + rng.nextInt(16) : 40 + rng.nextInt(51);
  let reaction: DebateMove['reaction'] = null;
  if (rng.nextFloat() < 0.6) {
    const roll = rng.nextFloat();
    const ton: DigitalTone =
      issue === 'reussi'
        ? roll < 0.8
          ? 'positif'
          : 'neutre'
        : issue === 'rate' || issue === 'retourne'
          ? roll < 0.8
            ? 'negatif'
            : 'neutre'
          : roll < 1 / 3
            ? 'positif'
            : roll < 2 / 3
              ? 'neutre'
              : 'negatif';
    reaction = {
      compte: pick(rng, ruleset.numerique.comptes),
      texte: pick(rng, rules.reactions[ton]),
      ton,
    };
  }
  return {
    acteurId: actorId,
    carte: choice.carte,
    cible,
    angle,
    propositionId,
    issue,
    effets: effects,
    // Aucune réplique prêtée à une personnalité réelle : seul son coup est décrit.
    replique: actor.candidate.nature === 'reel' ? null : line,
    duree,
    reaction,
  };
}

const moveRng = (state: GameState, session: DebateSession, index: number, k: number, id: string) =>
  stream(state.meta.seed, session.semaine, 'debat', session.id, index, k, id);

function contextFor(
  state: GameState,
  ruleset: Ruleset,
  session: DebateSession,
  index: number,
): Context {
  return {
    state,
    ruleset,
    session,
    index,
    theme: themeOf(ruleset, session.themes[index]!),
    moves: [],
  };
}

/** Cartes proposées au joueur : défendre ou répondre, attaquer, carte de circonstance. */
function offersFor(ctx: Context, playerId: string): DebateOffer[] {
  const received = attackOn(ctx.moves, playerId);
  const first: DebateOffer = received
    ? { carte: 'repondre', propositionId: null, attaquant: received.acteurId }
    : {
        carte: 'defendre',
        propositionId: propositionFor(ctx.state, ctx.ruleset, playerId, ctx.theme),
        attaquant: null,
      };
  const approval = ctx.session.approbation;
  const leading = present(ctx.session).every(
    (id) => (approval[id] ?? 0) <= (approval[playerId] ?? 0),
  );
  return [
    first,
    { carte: 'attaquer', propositionId: null, attaquant: null },
    { carte: leading ? 'hauteur' : 'petite-phrase', propositionId: null, attaquant: null },
  ];
}

/** Prépare la séquence `index` du joueur : coups des adversaires qui parlent avant lui. */
function openSequence(state: GameState, ruleset: Ruleset, session: DebateSession, index: number) {
  const playerId = playerOnStage(state, session)!;
  const ctx = contextFor(state, ruleset, session, index);
  const order = speakingOrder(ruleset, session, index, playerId);
  for (const [k, id] of order.entries()) {
    if (id === playerId) break;
    const rng = moveRng(state, session, index, k, id);
    ctx.moves.push(playMove(ctx, id, aiChoice(ctx, id, rng), rng));
  }
  session.enCours = { index, ouverture: ctx.moves, cartes: offersFor(ctx, playerId) };
}

/**
 * Termine la séquence en cours du joueur : son coup (ou celui que l'IA choisit pour lui),
 * puis ceux des adversaires qui parlent après lui ; un adversaire attaqué par le joueur peut
 * répondre même s'il n'avait pas la parole.
 */
function closeSequence(
  state: GameState,
  ruleset: Ruleset,
  session: DebateSession,
  choice: Choice | null,
) {
  const playerId = playerOnStage(state, session)!;
  const current = session.enCours!;
  const ctx = contextFor(state, ruleset, session, current.index);
  ctx.moves = [...current.ouverture];
  const order = speakingOrder(ruleset, session, current.index, playerId);
  const start = order.indexOf(playerId);
  const playerRng = moveRng(state, session, current.index, start, playerId);
  ctx.moves.push(playMove(ctx, playerId, choice ?? aiChoice(ctx, playerId, playerRng), playerRng));
  const after = order.slice(start + 1);
  const target = ctx.moves.at(-1)!.carte === 'attaquer' ? ctx.moves.at(-1)!.cible : null;
  if (target && !after.includes(target)) after.unshift(target);
  for (const [j, id] of after.entries()) {
    const rng = moveRng(state, session, current.index, start + 1 + j, id);
    ctx.moves.push(playMove(ctx, id, aiChoice(ctx, id, rng), rng));
  }
  session.sequences.push({ theme: ctx.theme.id, coups: ctx.moves });
  session.enCours = null;
}

/** Séquence sans le joueur (débat d'adversaires, chaise vide du joueur, observateur). */
function simulateSequence(
  state: GameState,
  ruleset: Ruleset,
  session: DebateSession,
  index: number,
) {
  const ctx = contextFor(state, ruleset, session, index);
  for (const [k, id] of speakingOrder(ruleset, session, index, null).entries()) {
    const rng = moveRng(state, session, index, k, id);
    ctx.moves.push(playMove(ctx, id, aiChoice(ctx, id, rng), rng));
  }
  session.sequences.push({ theme: ctx.theme.id, coups: ctx.moves });
}

/** Sondage flash et prestations ; le débat est terminé. */
function finalize(state: GameState, ruleset: Ruleset, session: DebateSession) {
  const rules = ruleset.debats;
  const onStage = present(session);
  const approval = session.approbation;
  const weights = onStage.map((id) =>
    Math.exp(((approval[id] ?? rules.approbation.depart) - 50) / rules.sondageFlash.temperature),
  );
  const shares = largestRemainder(10_000, weights);
  const mean = onStage.reduce((s, id) => s + (approval[id] ?? 0), 0) / Math.max(1, onStage.length);
  const prestation: Record<string, number> = {};
  for (const id of session.invites)
    prestation[id] = session.refus.includes(id)
      ? rules.effets.prestationChaiseVide
      : round2(clamp(((approval[id] ?? mean) - mean) / 25, -1, 1));
  session.resultat = {
    convaincant: Object.fromEntries(onStage.map((id, i) => [id, shares[i]!])),
    prestation,
    applique: false,
  };
  session.statut = 'termine';
  session.enCours = null;
}

/** Joue toutes les séquences restantes (fin simulée, ou débat dont le joueur est absent). */
function completeDebate(state: GameState, ruleset: Ruleset, session: DebateSession) {
  if (session.statut === 'termine') return;
  while (session.sequences.length < session.themes.length) {
    const index = session.sequences.length;
    if (playerOnStage(state, session)) {
      if (!session.enCours) openSequence(state, ruleset, session, index);
      closeSequence(state, ruleset, session, null);
    } else {
      simulateSequence(state, ruleset, session, index);
    }
  }
  finalize(state, ruleset, session);
}

// --- Demandes du joueur (API) ---

/**
 * Demande du joueur sur un débat de la semaine : ouvrir (programmer s'il manque), refuser
 * (chaise vide, avant le premier coup), jouer la carte de la séquence en cours, ou simuler la
 * fin. Renvoie un nouvel état ; l'état reçu n'est jamais modifié.
 */
export function playDebate(
  input: GameState,
  ruleset: Ruleset,
  debatId: string,
  request: DebateRequest,
): { state: GameState; session: DebateSession } {
  const state = JSON.parse(JSON.stringify(input)) as GameState;
  scheduleDebates(state, ruleset);
  const session = state.debats.seances.find(
    (s) => s.id === debatId && s.semaine === state.meta.week,
  );
  if (!session)
    throw new EngineInputError('debat_introuvable', 'Aucun débat de ce nom cette semaine.');
  if (request.action === 'ouvrir') return { state, session };
  if (session.statut === 'termine')
    throw new EngineInputError('debat_termine', 'Ce débat est terminé.');
  const playerId = playerOnStage(state, session);
  if (!playerId)
    throw new EngineInputError(
      'debat_non_invite',
      'Vous n’êtes pas sur le plateau de ce débat (non invité, absent ou plus candidat).',
    );
  if (request.action === 'refuser') {
    if (session.sequences.length > 0)
      throw new EngineInputError(
        'debat_termine',
        'Le débat a déjà commencé : impossible de partir.',
      );
    session.refus = [...session.refus, playerId].sort(compareStrings);
    delete session.approbation[playerId];
    session.enCours = null;
    if (present(session).length < 2) finalize(state, ruleset, session);
    return { state, session };
  }
  const current = session.enCours;
  if (!current || request.sequence !== current.index)
    throw new EngineInputError(
      'sequence_perimee',
      'Cette séquence a déjà été jouée : rechargez le débat.',
    );
  session.statut = 'en_cours';
  if (request.action === 'finir') {
    completeDebate(state, ruleset, session);
    return { state, session };
  }
  const offer = current.cartes.find((c) => c.carte === request.carte);
  if (!offer) throw new EngineInputError('carte_invalide', 'Cette carte n’est pas proposée.');
  let choice: Choice;
  if (request.carte === 'attaquer') {
    const onStage = present(session).filter((id) => id !== playerId);
    if (!request.cible || !onStage.includes(request.cible) || !request.angle)
      throw new EngineInputError(
        'carte_invalide',
        'Une attaque vise un candidat présent sur le plateau, sous un angle donné.',
      );
    choice = { carte: 'attaquer', cible: request.cible, angle: request.angle };
  } else {
    choice = { carte: offer.carte, propositionId: offer.propositionId, attaquant: offer.attaquant };
  }
  closeSequence(state, ruleset, session, choice);
  if (session.sequences.length < session.themes.length)
    openSequence(state, ruleset, session, session.sequences.length);
  else finalize(state, ruleset, session);
  return { state, session };
}

// --- Résolution de la semaine ---

const pct = (centiemes: number) => `${(centiemes / 100).toFixed(0)} %`;

/**
 * Étape 5 : débats de la semaine menés à leur terme (fin simulée pour le joueur qui n'a pas
 * joué), puis effets par le registre : popularité selon la prestation, notoriété (forte pour
 * les moins connus), dynamique des petites phrases réussies, chaise vide. Le débat
 * d'entre-deux-tours renseigne aussi la prestation des finalistes (facteur du second tour).
 */
export function resolveWeekDebates(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  step: number,
): ReportEvent[] {
  scheduleDebates(state, ruleset);
  const rules = ruleset.debats;
  const events: ReportEvent[] = [];
  for (const session of state.debats.seances) {
    if (session.semaine !== state.meta.week) continue;
    completeDebate(state, ruleset, session);
    const result = session.resultat;
    if (!result || result.applique) continue;
    const label = session.libelle;
    for (const id of session.invites) {
      if (session.refus.includes(id)) {
        ledger.apply(id, 'popularite', [
          {
            label: `${label} : chaise vide`,
            value: -rules.effets.chaiseVide,
            source: 'debat',
            step,
          },
        ]);
        continue;
      }
      const prestation = result.prestation[id] ?? 0;
      const actor = state.actors[id]!;
      ledger.apply(id, 'popularite', [
        {
          label: `${label} : prestation jugée ${prestation >= 0.15 ? 'convaincante' : prestation <= -0.15 ? 'décevante' : 'moyenne'}`,
          value: Math.round(rules.effets.popularite * prestation),
          source: 'debat',
          step,
        },
      ]);
      ledger.apply(id, 'notoriete', [
        {
          label: `${label} : exposition`,
          value: Math.round(rules.effets.notoriete * (1 - actor.resources.notoriete / 10_000)),
          source: 'debat',
          step,
        },
      ]);
      const punchlines = session.sequences
        .flatMap((s) => s.coups)
        .filter(
          (m) => m.acteurId === id && m.carte === 'petite-phrase' && m.issue === 'reussi',
        ).length;
      if (punchlines > 0)
        ledger.apply(id, 'dynamique', [
          {
            label: `${label} : petite phrase reprise sur les réseaux`,
            value: punchlines * rules.effets.dynamiquePetitePhrase,
            source: 'debat',
            step,
          },
        ]);
    }
    if (session.tour === 2) {
      state.elections.debate = { ...result.prestation };
      state.elections.debateDetail = Object.fromEntries(
        session.invites.map((id) => [
          id,
          {
            ...debateSkills(state, ruleset, id),
            reponse: round2(clamp01(0.5 + (result.prestation[id] ?? 0) / 2)),
          },
        ]),
      );
    }
    result.applique = true;
    const ranking = Object.entries(result.convaincant).sort(
      (a, b) => b[1] - a[1] || compareStrings(a[0], b[0]),
    );
    const name = (id: string) => candidateName(state.actors[id]!.candidate);
    events.push({
      id: `debat-${session.id}-${session.semaine}`,
      kind: 'evenement',
      refId: session.id,
      label: `${label} : ${name(ranking[0]![0])} jugé(e) le plus convaincant (sondage flash simulé)`,
      description:
        `Sondage flash simulé : ${ranking.map(([id, v]) => `${name(id)} ${pct(v)}`).join(', ')}.` +
        (session.refus.length ? ` Chaise vide : ${session.refus.map(name).join(', ')}.` : '') +
        ' Débat, répliques et réactions simulés (hypothèses du jeu).',
      nature: 'simule',
      majeur: false,
      decisionId: null,
    });
  }
  return events;
}

/**
 * Facteur de vote « Débats télévisés » au premier tour : prestations des débats déjà tenus,
 * qui s'estompent de semaine en semaine.
 */
export function debateVoteFactors(
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
): UtilityFactor[] {
  const { voteT1, persistance } = ruleset.debats.effets;
  let value = 0;
  let held = false;
  for (const session of state.debats.seances) {
    if (session.tour !== 1 || !session.resultat?.applique) continue;
    const prestation = session.resultat.prestation[actorId];
    if (prestation === undefined) continue;
    held = true;
    value += voteT1 * prestation * persistance ** (state.meta.week - session.semaine);
  }
  return held ? [{ label: 'Débats télévisés', value }] : [];
}

/** Débats du premier tour à venir dans les `weeks` prochaines semaines (préparation de l'IA). */
export function upcomingDebate(state: GameState, ruleset: Ruleset, weeks: number): boolean {
  if (state.meta.phase !== 'campagne') return false;
  const end = addDays(state.meta.date, 7 * weeks);
  return ruleset.debats.seances.some((rule) => {
    const date = echeanceDate(ruleset, rule);
    return rule.tour === 1 && date !== null && date >= state.meta.date && date < end;
  });
}
