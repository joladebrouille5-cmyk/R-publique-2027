import { z } from 'zod';
import { DifficultySchema, GameFormatSchema, IsoDateSchema, type GameState } from './game';
import type { Ruleset } from './ruleset';

// Progression entre les parties (phase 20) : palmarès, niveau de joueur, déblocages et défi du
// jour, calculés à partir des parties du joueur par l'API et par le moteur local, à l'identique
// (même fonction pure). Les barèmes sont des paramètres de jeu (`ruleset.progression`,
// hypothèses) ; la date du défi vient de l'horloge du serveur ou de l'appareil, jamais du moteur.

const Id = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'identifiant en minuscules');
const Points = z.number().int().min(0).max(10_000);

export const ProgressionRulesSchema = z
  .object({
    statut: z.literal('hypothese'),
    sourceId: Id,
    /** Points gagnés par partie : jouée (une semaine au moins), premier tour, qualification… */
    points: z
      .object({
        partie: Points,
        premierTour: Points,
        secondTour: Points,
        victoire: Points,
        defi: Points,
      })
      .strict(),
    /** Niveaux de joueur, par seuil de points croissant (le premier à 0). */
    niveaux: z
      .array(
        z.object({ numero: z.number().int().min(1), titre: z.string().min(1), points: Points }),
      )
      .min(2)
      .refine((l) => l[0]!.points === 0, 'Le premier niveau commence à 0 point')
      .refine(
        (l) => l.every((n, i) => n.numero === i + 1 && (i === 0 || n.points > l[i - 1]!.points)),
        'Niveaux numérotés à partir de 1, seuils strictement croissants',
      ),
    /** Contenus existants verrouillés jusqu'à `victoires` présidentielles gagnées. */
    deblocages: z.array(
      z
        .object({
          id: Id,
          libelle: z.string().min(1),
          difficulte: DifficultySchema.optional(),
          scenarioId: Id.optional(),
          victoires: z.number().int().min(1),
        })
        .strict()
        .refine((d) => (d.difficulte === undefined) !== (d.scenarioId === undefined), {
          message: 'Un déblocage vise une difficulté ou un scénario',
        }),
    ),
    /** Défi du jour : même graine pour tous ce jour-là, paramètres imposés. */
    defi: z
      .object({ difficulte: DifficultySchema, format: GameFormatSchema, scenarioId: Id })
      .strict(),
  })
  .strict();
export type ProgressionRules = z.infer<typeof ProgressionRulesSchema>;

/** Graine du défi d'un jour (`defi-2026-11-03`), réservée au défi. */
export const defiSeed = (date: string) => `defi-${date}`;
export const DEFI_SEED_PATTERN = /^defi-\d{4}-\d{2}-\d{2}$/;

/** Ce qu'une partie apporte au palmarès : semaines jouées, premier tour, qualification, victoires. */
export type GameOutcome = {
  semaines: number;
  /** Part des exprimés du joueur à son premier premier tour (0 à 1), sinon null. */
  premierTour: number | null;
  qualifie: boolean;
  victoires: number;
};

type Round = { exprimes: number; voix: Record<string, number>; qualified: string[] } | null;

/** Bilan d'une partie pour le palmarès (rien pour un observateur, qui ne concourt pas). */
export function gameOutcome(
  state: Pick<GameState, 'player' | 'elections' | 'historique' | 'meta'>,
): GameOutcome {
  const player = state.player.actorId;
  const rounds: { t1: Round; won: boolean }[] = [
    ...state.historique.presidentielles.map((p) => ({ t1: p.t1, won: p.eluId === player })),
    ...(state.elections.t1
      ? [{ t1: state.elections.t1, won: state.elections.t2?.winner === player }]
      : []),
  ];
  if (!player)
    return { semaines: state.meta.week, premierTour: null, qualifie: false, victoires: 0 };
  const first = rounds.find((r) => r.t1 && player in r.t1.voix)?.t1 ?? null;
  return {
    semaines: state.meta.week,
    premierTour:
      first && first.exprimes > 0
        ? Math.round((first.voix[player]! / first.exprimes) * 1e4) / 1e4
        : null,
    qualifie: rounds.some((r) => r.t1?.qualified.includes(player)),
    victoires: rounds.filter((r) => r.won).length,
  };
}

/** Une partie du joueur, telle que l'API ou le moteur local la relit. */
export type ProgressionGame = {
  seed: string;
  state: Pick<GameState, 'player' | 'elections' | 'historique' | 'meta' | 'scenario'>;
};

export const ProgressionSchema = z
  .object({
    parties: z.number().int().min(0),
    victoires: z.number().int().min(0),
    qualifications: z.number().int().min(0),
    meilleurPremierTour: z.number().min(0).max(1).nullable(),
    points: z.number().int().min(0),
    niveau: z
      .object({
        numero: z.number().int().min(1),
        titre: z.string(),
        points: z.number().int().min(0),
        suivant: z
          .object({ numero: z.number().int(), titre: z.string(), points: z.number().int() })
          .nullable(),
      })
      .strict(),
    deblocages: z.array(
      z
        .object({
          id: z.string(),
          libelle: z.string(),
          debloque: z.boolean(),
          condition: z.string(),
          difficulte: DifficultySchema.nullable(),
          scenarioId: z.string().nullable(),
        })
        .strict(),
    ),
    defi: z
      .object({
        date: IsoDateSchema,
        graine: z.string(),
        difficulte: DifficultySchema,
        format: GameFormatSchema,
        scenarioId: z.string(),
        tentatives: z.number().int().min(0),
        meilleurScore: z.number().min(0).max(1).nullable(),
      })
      .strict(),
  })
  .strict();
export type Progression = z.infer<typeof ProgressionSchema>;

/** Une partie est-elle un défi (graine réservée, paramètres imposés) ? */
export function isDefiGame(game: ProgressionGame, rules: ProgressionRules): boolean {
  return (
    DEFI_SEED_PATTERN.test(game.seed) &&
    game.state.meta.difficulty === rules.defi.difficulte &&
    game.state.player.format === rules.defi.format &&
    game.state.scenario === rules.defi.scenarioId
  );
}

const victoriesLabel = (n: number) =>
  n === 1 ? 'Gagner une présidentielle' : `Gagner ${n} présidentielles`;

/** Palmarès, niveau, déblocages et défi du jour, à partir des parties du joueur. */
export function computeProgression(
  games: readonly ProgressionGame[],
  ruleset: Pick<Ruleset, 'progression'>,
  today: string,
): Progression {
  const rules = ruleset.progression;
  const outcomes = games.map((g) => ({ game: g, outcome: gameOutcome(g.state) }));
  const played = outcomes.filter((o) => o.outcome.semaines > 0);
  const victoires = outcomes.reduce((n, o) => n + o.outcome.victoires, 0);
  const qualifications = outcomes.filter((o) => o.outcome.qualifie).length;
  const scores = outcomes.map((o) => o.outcome.premierTour).filter((s): s is number => s !== null);
  const defis = outcomes.filter((o) => isDefiGame(o.game, rules));
  const p = rules.points;
  const points =
    played.length * p.partie +
    scores.length * p.premierTour +
    qualifications * p.secondTour +
    victoires * p.victoire +
    defis.filter((o) => o.outcome.premierTour !== null).length * p.defi;
  const reached = [...rules.niveaux].reverse().find((n) => points >= n.points)!;
  const next = rules.niveaux.find((n) => n.points > points) ?? null;
  const graine = defiSeed(today);
  const todays = defis.filter((o) => o.game.seed === graine);
  const todaysScores = todays
    .map((o) => o.outcome.premierTour)
    .filter((s): s is number => s !== null);
  return {
    parties: played.length,
    victoires,
    qualifications,
    meilleurPremierTour: scores.length > 0 ? Math.max(...scores) : null,
    points,
    niveau: {
      numero: reached.numero,
      titre: reached.titre,
      points: reached.points,
      suivant: next && { numero: next.numero, titre: next.titre, points: next.points },
    },
    deblocages: rules.deblocages.map((d) => ({
      id: d.id,
      libelle: d.libelle,
      debloque: victoires >= d.victoires,
      condition: victoriesLabel(d.victoires),
      difficulte: d.difficulte ?? null,
      scenarioId: d.scenarioId ?? null,
    })),
    defi: {
      date: today,
      graine,
      difficulte: rules.defi.difficulte,
      format: rules.defi.format,
      scenarioId: rules.defi.scenarioId,
      tentatives: todays.length,
      meilleurScore: todaysScores.length > 0 ? Math.max(...todaysScores) : null,
    },
  };
}

/**
 * Contenu verrouillé visé par une demande de création (difficulté ou scénario), ou null.
 * Règle commune à l'API et au moteur local.
 */
export function lockedBy(
  request: { difficulty: string; scenarioId?: string | null | undefined },
  progression: Pick<Progression, 'deblocages'>,
): Progression['deblocages'][number] | null {
  return (
    progression.deblocages.find(
      (d) =>
        !d.debloque &&
        ((d.difficulte !== null && d.difficulte === request.difficulty) ||
          (d.scenarioId !== null && d.scenarioId === request.scenarioId)),
    ) ?? null
  );
}

/** Refus d'une création de partie (contenu verrouillé, graine réservée), mêmes codes partout. */
export class CreationRefusal extends Error {
  constructor(
    readonly status: 403 | 422,
    readonly code: 'verrouille' | 'graine_reservee',
    message: string,
  ) {
    super(message);
    this.name = 'CreationRefusal';
  }
}

/** Demande de création, après validation par `CreateGameRequestSchema`. */
type CreationRequest = {
  difficulty: Progression['defi']['difficulte'];
  scenarioId: string;
  format: Progression['defi']['format'];
  seed?: string | undefined;
  startDate?: string | undefined;
  defi: boolean;
};

/** La demande vise-t-elle un contenu verrouillable (la progression doit alors être lue) ? */
export function mayBeLocked(
  body: Pick<CreationRequest, 'difficulty' | 'scenarioId' | 'defi'>,
  rules: ProgressionRules,
): boolean {
  return (
    !body.defi &&
    rules.deblocages.some(
      (d) => d.difficulte === body.difficulty || d.scenarioId === body.scenarioId,
    )
  );
}

/**
 * Paramètres effectifs d'une création (phase 20), règle commune à l'API et au moteur local :
 * le défi du jour impose sa graine et ses paramètres ; une graine de défi est réservée au défi ;
 * un contenu verrouillé est refusé (403 `verrouille`). `progression` n'est lue que si la demande
 * vise un contenu verrouillable.
 */
export function creationParameters<T extends CreationRequest>(
  body: T,
  rules: ProgressionRules,
  today: string,
  progression: () => Pick<Progression, 'deblocages'>,
): T {
  if (!body.defi && body.seed !== undefined && DEFI_SEED_PATTERN.test(body.seed))
    throw new CreationRefusal(
      422,
      'graine_reservee',
      'Cette graine est réservée au défi du jour : lancez le défi, ou choisissez une autre graine.',
    );
  const effective: T = body.defi
    ? {
        ...body,
        seed: defiSeed(today),
        startDate: undefined,
        difficulty: rules.defi.difficulte,
        format: rules.defi.format,
        scenarioId: rules.defi.scenarioId,
      }
    : body;
  const lockable = rules.deblocages.some(
    (d) => d.difficulte === effective.difficulty || d.scenarioId === effective.scenarioId,
  );
  if (lockable) {
    const lock = lockedBy(effective, progression());
    if (lock)
      throw new CreationRefusal(
        403,
        'verrouille',
        `${lock.libelle} : contenu verrouillé. ${lock.condition} pour le débloquer.`,
      );
  }
  return effective;
}

/** Date du jour à Paris (AAAA-MM-JJ), pour le défi servi par l'API. */
export function parisDate(now: Date): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Date du jour de l'appareil (AAAA-MM-JJ), pour le défi servi par le moteur local. */
export function deviceDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
