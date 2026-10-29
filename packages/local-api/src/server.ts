import {
  advanceWeek,
  BaselineMismatchError,
  communeResults,
  createGame,
  ENGINE_VERSION,
  EngineInputError,
  GameCreationError,
  inputErrorStatus,
  playDebate,
  playerSupportProspects,
  SAVE_SCHEMA_VERSION,
  type AdvanceResult,
} from '@r2027/engine';
import { CURRENT_RULESET_KEY, getRuleset, UnknownRulesetError } from '@r2027/rulesets';
import {
  buildExport,
  canonicalStringify,
  CURRENT_SAVE_SCHEMA_VERSION,
  loadStoredState,
  readExport,
  SaveFormatError,
  sha256,
  snapshotState,
} from '@r2027/save-engine';
import {
  AdvanceRequestSchema,
  AdvanceResponseSchema,
  candidateForJournal,
  CreateGameRequestSchema,
  CreateSaveRequestSchema,
  DebateIdSchema,
  DebateRequestSchema,
  FAST_FORWARD_STOPS,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  isBeforeCursor,
  debateAwaitingPlayer,
  isOptionalDecision,
  journalCursor,
  JournalCursorSchema,
  RestoreSaveRequestSchema,
  WeeklyReportSchema,
  type AdvanceResponse,
  type ApiError,
  type GameDetail,
  type GameState,
  type GameSummary,
  type HealthResponse,
  type HistoricalStatus,
  type JournalCursor,
  type JournalPage,
  type SaveSummary,
  type SupportProspects,
} from '@r2027/shared';
import { z, ZodError } from 'zod';
import type { LocalGeo } from './geo';
import type { AdvanceRow, EventRow, GameRow, Operation, SaveRow, Store } from './store';

// Serveur local de l'application mobile (phase 8) : les mêmes routes, les mêmes réponses et les
// mêmes règles que l'API (idempotence de la progression, avance rapide, sauvegardes
// automatiques, journal, export et import vérifiés), mais avec le moteur exécuté sur l'appareil
// et un stockage local. Un seul joueur par appareil : pas de session. Les tables d'audit du
// serveur (actions détaillées, journal de simulation par étape) ne sont pas tenues localement.

export const LOCAL_API_VERSION = 'local-0.1.0';

export type LocalRequest = {
  method: string;
  /** Chemin et requête, comme pour `fetch` : « /api/games/…/journal?limit=10 ». */
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};
export type LocalResponse = { status: number; headers: Record<string, string>; body: unknown };

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const notFound = (message: string) => new HttpError(404, 'introuvable', message);

/** Segment d'URL décodé ; un encodage invalide (« %zz ») désigne une ressource introuvable. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw notFound('Ressource introuvable.');
  }
}
const conflict = (code: string, message: string) => new HttpError(409, code, message);

const GameId = z.uuid();
const Tour = z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)]));
const DepartementQuery = z.object({ departement: z.string().regex(/^[0-9AB]{2,3}$/) });
const JournalQuery = z.object({
  before: JournalCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const MAX_BODY_BYTES = 1024 * 1024;
/** Nombre de sauvegardes automatiques hebdomadaires conservées par partie (§12). */
export const AUTO_SAVE_RETENTION = 8;
/**
 * Progressions dont la réponse est conservée pour être rejouée (idempotence) : chaque réponse
 * contient l'état complet (plusieurs centaines de Ko), soit des centaines de Mo sur une partie
 * entière. Sur l'appareil, seules les plus récentes sont gardées (le journal, lui, est complet) ;
 * une requête plus ancienne rejouée reçoit « semaine périmée » et l'interface recharge.
 */
export const ADVANCE_REPLAY_RETENTION = 10;
/** Événements résumés dans le bilan de leur semaine : non répétés dans le journal. */
const SUMMARIZED_IN_REPORT = new Set(['evenement', 'risque', 'sondage_publie', 'resultat_scrutin']);
const IMPORT_SUFFIX = ' (importée)';

type Snapshot = ReturnType<typeof snapshotState>;
type FastForwardStop = (typeof FAST_FORWARD_STOPS)[number];
type Loaded = { row: GameRow; state: GameState; stateHash: string };

export type LocalApiOptions = {
  store: Store;
  geo: LocalGeo;
  /** Horloge (horodatage du journal et des sauvegardes) ; injectable pour les tests. */
  now?: () => Date;
  /** Identifiants uniques (UUID v4) ; injectable pour les tests. */
  newId?: () => string;
};

function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Graine aléatoire quand le joueur n'en donne pas (comme l'API). */
function randomSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Nom de fichier ASCII sûr : « republique-2027-ma-partie-semaine-3.json ». */
function exportFileName(name: string, week: number): string {
  const slug =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'partie';
  return `republique-2027-${slug}-semaine-${week}.json`;
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Motif d'arrêt de l'avance rapide après une semaine, ou null pour continuer. */
function stopAfter(result: AdvanceResult): FastForwardStop | null {
  if (result.state.calendar.blockedBy) return 'blocage';
  if (result.report.election) return 'scrutin';
  if (result.report.phaseChange) return 'changement_de_phase';
  if (result.majorEvent) return 'evenement_majeur';
  // Débat obligatoire (phase 17) : la semaine suivante ne se résout qu'une fois le débat joué.
  if (debateAwaitingPlayer(result.state)) return 'debat';
  if (result.state.pendingDecisions.some((d) => !isOptionalDecision(d))) return 'decision';
  return null;
}

export class LocalApi {
  private readonly store: Store;
  private readonly geo: LocalGeo;
  private readonly clock: () => Date;
  private readonly newId: () => string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastTime = 0;

  constructor({ store, geo, now = () => new Date(), newId = uuid }: LocalApiOptions) {
    this.store = store;
    this.geo = geo;
    this.clock = now;
    this.newId = newId;
  }

  /**
   * Traite une requête. Les requêtes sont exécutées une à une (file d'attente), ce qui tient
   * lieu des transactions et du verrou optimiste de l'API.
   */
  handle(request: LocalRequest): Promise<LocalResponse> {
    const run = this.queue.then(() => this.dispatch(request));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Horodatage strictement croissant (ordre du journal et pagination sans doublon). */
  private timestamp(): string {
    const now = Math.max(this.clock().getTime(), this.lastTime + 1);
    this.lastTime = now;
    return new Date(now).toISOString();
  }

  private async dispatch(request: LocalRequest): Promise<LocalResponse> {
    try {
      return await this.route(request);
    } catch (error) {
      if (error instanceof ZodError)
        return {
          status: 400,
          headers: {},
          body: errorBody('requete_invalide', 'Requête invalide.', z.treeifyError(error)),
        };
      if (error instanceof HttpError)
        return {
          status: error.status,
          headers: {},
          body: errorBody(error.code, error.message, error.details),
        };
      if (error instanceof UnknownRulesetError)
        return { status: 500, headers: {}, body: errorBody('regles_inconnues', error.message) };
      return {
        status: 500,
        headers: {},
        body: errorBody(
          'erreur_interne',
          `Erreur interne du moteur local : ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }
  }

  private async route(request: LocalRequest): Promise<LocalResponse> {
    const url = new URL(request.url, 'http://local.invalid');
    const path = url.pathname;
    const query = Object.fromEntries(url.searchParams);
    const method = request.method.toUpperCase();
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (method === 'POST') {
      if (new TextEncoder().encode(JSON.stringify(request.body ?? {})).length > MAX_BODY_BYTES)
        throw new HttpError(413, 'requete_trop_volumineuse', 'Requête trop volumineuse (1 Mo).');
    }
    const ok = (body: unknown, status = 200, extra: Record<string, string> = {}) => ({
      status,
      headers: extra,
      body,
    });
    const match = (pattern: RegExp) => pattern.exec(path);
    let m: RegExpExecArray | null;

    if (method === 'GET' && path === '/api/health') return ok(this.health());
    if (method === 'GET' && path === '/api/session') return ok({ userId: 'appareil' });
    if (path === '/api/games' && method === 'GET') return ok(await this.listGames());
    if (path === '/api/games' && method === 'POST')
      return ok(await this.createGame(request.body), 201);
    if (path === '/api/games/import' && method === 'POST')
      return ok(await this.importGame(request.body), 201);
    if (method === 'GET' && (m = match(/^\/api\/games\/([^/]+)$/)))
      return ok(await this.getGame(GameId.parse(m[1])));
    if (method === 'POST' && (m = match(/^\/api\/games\/([^/]+)\/advance$/))) {
      const key = IdempotencyKeySchema.safeParse(headers[IDEMPOTENCY_HEADER]);
      if (!key.success)
        throw new HttpError(400, 'cle_idempotence_requise', key.error.issues[0]!.message);
      const outcome = await this.advance(GameId.parse(m[1]), key.data, request.body);
      return ok(outcome.response, 200, outcome.replayed ? { 'idempotent-replay': 'true' } : {});
    }
    if (method === 'POST' && (m = match(/^\/api\/games\/([^/]+)\/debats\/([^/]+)$/)))
      return ok(
        await this.playDebate(
          GameId.parse(m[1]),
          DebateIdSchema.parse(decodeSegment(m[2]!)),
          request.body,
        ),
      );
    if (method === 'GET' && (m = match(/^\/api\/games\/([^/]+)\/soutiens$/)))
      return ok(await this.supports(GameId.parse(m[1])));
    if (method === 'GET' && (m = match(/^\/api\/games\/([^/]+)\/journal$/)))
      return ok(await this.journal(GameId.parse(m[1]), JournalQuery.parse(query)));
    if (method === 'GET' && (m = match(/^\/api\/games\/([^/]+)\/export$/))) {
      const { fileName, document } = await this.exportGame(GameId.parse(m[1]));
      return ok(document, 200, {
        'content-disposition': `attachment; filename="${fileName}"`,
        'x-file-name': fileName,
      });
    }
    if (method === 'GET' && (m = match(/^\/api\/games\/([^/]+)\/saves$/)))
      return ok(await this.listSaves(GameId.parse(m[1])));
    if (method === 'POST' && (m = match(/^\/api\/games\/([^/]+)\/saves$/)))
      return ok(await this.createSave(GameId.parse(m[1]), request.body), 201);
    if (method === 'POST' && (m = match(/^\/api\/games\/([^/]+)\/saves\/([^/]+)\/restore$/)))
      return ok(
        await this.restoreSave(GameId.parse(m[1]), z.uuid().parse(m[2]), request.body ?? {}),
      );
    if (method === 'GET' && (m = match(/^\/api\/games\/([^/]+)\/resultats\/([^/]+)\/communes$/)))
      return ok(
        await this.communeResults(
          GameId.parse(m[1]),
          Tour.parse(m[2]),
          DepartementQuery.parse(query).departement,
        ),
      );
    if (method === 'GET' && path === '/api/geo/manifeste') return ok(this.geo.manifest);
    if (method === 'GET' && (m = match(/^\/api\/geo\/fichiers\/(.+)$/))) {
      const name = decodeSegment(m[1]!);
      const file = this.geo.file(name);
      if (!file) throw notFound(`Fichier cartographique inconnu : ${name}`);
      return ok(await file);
    }
    if (method === 'GET' && path === '/api/geo/historique') return ok(this.historicalStatus());
    if (method === 'GET' && match(/^\/api\/geo\/historique\/[^/]+\/(apercu|communes)$/)) {
      const status = this.historicalStatus();
      throw new HttpError(404, 'historique_indisponible', status.disponible ? '' : status.raison);
    }
    if (method === 'GET' && path === '/api/geo/recherche') {
      const { q } = z.object({ q: z.string().trim().min(1).max(80) }).parse(query);
      return ok(this.geo.search(q));
    }
    if (method === 'GET' && path === '/api/rulesets/courant')
      return ok(getRuleset(CURRENT_RULESET_KEY));
    if (method === 'GET' && (m = match(/^\/api\/rulesets\/(.+)$/))) {
      const key = z.string().min(1).max(100).parse(decodeSegment(m[1]!));
      try {
        return ok(getRuleset(key));
      } catch (error) {
        if (error instanceof UnknownRulesetError) throw notFound(error.message);
        throw error;
      }
    }
    throw notFound('Ressource introuvable.');
  }

  private health(): HealthResponse {
    return {
      status: 'ok',
      database: 'ok',
      versions: { api: LOCAL_API_VERSION, engine: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION },
    };
  }

  private historicalStatus(): HistoricalStatus {
    return {
      disponible: false,
      raison:
        'Résultats 2022 non embarqués dans l’application hors ligne : ils ne sont pas redistribués (licence non précisée, question Q8) et s’importent localement sur un serveur (« pnpm data:geo » puis « pnpm data:resultats »).',
    };
  }

  // --- Lignes, résumés, colonnes dérivées de l'état ---

  private summary(row: GameRow): GameSummary {
    return {
      id: row.id,
      name: row.name,
      mode: row.mode,
      difficulty: row.difficulty,
      phase: row.phase,
      week: row.week,
      date: row.date,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private detail(row: GameRow, state: GameState, stateHash: string): GameDetail {
    return {
      ...this.summary(row),
      seed: row.seed,
      engineVersion: row.engineVersion,
      rulesetVersion: row.rulesetVersion,
      saveSchemaVersion: row.saveSchemaVersion,
      version: row.version,
      stateHash,
      state,
    };
  }

  private columns(state: GameState, stateHash: string) {
    return {
      state,
      stateHash,
      engineVersion: state.meta.engineVersion,
      rulesetVersion: state.meta.rulesetVersion,
      saveSchemaVersion: state.meta.saveSchemaVersion,
      phase: state.meta.phase,
      week: state.meta.week,
      date: state.meta.date,
    };
  }

  private saveRow(
    gameId: string,
    kind: SaveRow['kind'],
    slot: number | null,
    label: string | null,
    state: GameState,
    stateHash: string,
  ): SaveRow {
    return {
      id: this.newId(),
      gameId,
      kind,
      slot,
      label,
      week: state.meta.week,
      date: state.meta.date,
      state,
      stateHash,
      engineVersion: state.meta.engineVersion,
      saveSchemaVersion: state.meta.saveSchemaVersion,
      createdAt: this.timestamp(),
    };
  }

  private event(gameId: string, week: number, type: string, nature: string, payload: unknown) {
    const row: EventRow = {
      id: this.newId(),
      gameId,
      week,
      type,
      nature,
      payload,
      createdAt: this.timestamp(),
    };
    return { kind: 'put' as const, table: 'events' as const, value: row };
  }

  private readStored(state: unknown, stateHash: string, version: number, context: string) {
    try {
      return loadStoredState(state, stateHash, version);
    } catch (error) {
      if (error instanceof SaveFormatError)
        throw new HttpError(500, 'etat_corrompu', `État illisible (${context}) : ${error.message}`);
      throw error;
    }
  }

  /** Charge une partie ; un ancien format est migré et réenregistré (événement au journal). */
  private async load(gameId: string): Promise<Loaded> {
    const row = await this.store.game(gameId);
    if (!row) throw notFound('Partie introuvable');
    const loaded = this.readStored(
      row.state,
      row.stateHash,
      row.saveSchemaVersion,
      `partie ${row.id}`,
    );
    if (loaded.migratedFrom === null)
      return { row, state: loaded.state, stateHash: loaded.stateHash };
    const migrated: GameRow = {
      ...row,
      ...this.columns(loaded.state, loaded.stateHash),
      version: row.version + 1,
      updatedAt: this.timestamp(),
    };
    const operations: Operation[] = [
      { kind: 'put', table: 'games', value: migrated },
      this.event(row.id, loaded.state.meta.week, 'migration_de_sauvegarde', 'systeme', {
        from: loaded.migratedFrom,
        to: CURRENT_SAVE_SCHEMA_VERSION,
      }),
    ];
    await this.store.commit(operations);
    return { row: migrated, state: loaded.state, stateHash: loaded.stateHash };
  }

  // --- Parties ---

  private async listGames(): Promise<GameSummary[]> {
    const rows = await this.store.games();
    return rows
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      .map((row) => this.summary(row));
  }

  private async getGame(gameId: string): Promise<GameDetail> {
    const { row, state, stateHash } = await this.load(gameId);
    return this.detail(row, state, stateHash);
  }

  private async createGame(raw: unknown): Promise<GameDetail> {
    const body = CreateGameRequestSchema.parse(raw);
    const seed = body.seed ?? randomSeed();
    let initial: GameState;
    try {
      initial = createGame(
        {
          seed,
          mode: body.mode,
          difficulty: body.difficulty,
          startDate: body.startDate,
          candidate: body.candidate,
          personnaliteId: body.personnaliteId,
          adversaires: body.adversaires,
          scenarioId: body.scenarioId,
          orientationId: body.orientationId,
        },
        getRuleset(CURRENT_RULESET_KEY),
      );
    } catch (error) {
      if (error instanceof GameCreationError) throw new HttpError(422, error.code, error.message);
      throw error;
    }
    const { state, stateHash } = snapshotState(initial);
    const now = this.timestamp();
    const row: GameRow = {
      id: this.newId(),
      name: body.name,
      mode: body.mode,
      difficulty: body.difficulty,
      seed,
      ...this.columns(state, stateHash),
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.commit([
      { kind: 'put', table: 'games', value: row },
      this.event(row.id, state.meta.week, 'partie_creee', 'systeme', {
        mode: body.mode,
        difficulty: body.difficulty,
        seed,
        adversaires: state.player.adversaires,
        scenario: state.scenario,
        orientation: state.player.orientation,
        startDate: state.meta.date,
        candidat: state.player.actorId
          ? candidateForJournal(state.actors[state.player.actorId]!.candidate)
          : null,
      }),
    ]);
    return this.detail(row, state, stateHash);
  }

  // --- Progression ---

  private async advance(
    gameId: string,
    idempotencyKey: string,
    raw: unknown,
  ): Promise<{ response: AdvanceResponse; replayed: boolean }> {
    if (!(await this.store.game(gameId))) throw notFound('Partie introuvable');
    const body = AdvanceRequestSchema.parse(raw);
    const requestHash = sha256(canonicalStringify(body));
    const previous = await this.store.advance(gameId, idempotencyKey);
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new HttpError(
          422,
          'cle_idempotence_reutilisee',
          'Cette clé d’idempotence a déjà servi pour une autre requête.',
        );
      return { response: AdvanceResponseSchema.parse(previous.response), replayed: true };
    }

    const { row, state, stateHash } = await this.load(gameId);
    if (body.expectedWeek !== row.week)
      throw conflict(
        'semaine_perimee',
        `La partie est en semaine ${row.week} (semaine ${body.expectedWeek} attendue) : rechargez-la.`,
      );
    const ruleset = getRuleset(state.meta.rulesetVersion);
    const context = { ruleset, territory: await this.geo.baselineFor(ruleset) };
    const requested = body.semaines ?? 1;
    const weeks: { before: Snapshot; result: AdvanceResult }[] = [];
    let current: Snapshot = { state, stateHash };
    let stop: FastForwardStop | null = null;
    for (let i = 0; i < requested && stop === null; i++) {
      // Entre deux semaines d'une avance rapide, l'interface (même fil d'exécution sur
      // l'appareil) peut se redessiner.
      if (i > 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const plan =
        i === 0
          ? {
              actions: body.actions,
              decisions: body.decisions,
              programme: body.programme,
              alliances: body.alliances,
            }
          : { actions: [], decisions: [] };
      let result: AdvanceResult;
      try {
        result = advanceWeek(current.state, plan, context);
      } catch (error) {
        if (error instanceof EngineInputError)
          throw new HttpError(
            error.code === 'progression_bloquee' ? 409 : 422,
            error.code,
            error.message,
          );
        throw error;
      }
      weeks.push({ before: current, result });
      current = snapshotState(result.state);
      stop = stopAfter(result);
    }
    const { report } = weeks.at(-1)!.result;
    const updated: GameRow = {
      ...row,
      ...this.columns(current.state, current.stateHash),
      version: row.version + 1,
      updatedAt: this.timestamp(),
    };
    const response: AdvanceResponse = {
      game: this.detail(updated, current.state, current.stateHash),
      report,
      avanceRapide:
        body.semaines === undefined
          ? null
          : {
              demandees: requested,
              resolues: weeks.length,
              arret: weeks.length < requested ? stop : null,
            },
    };
    const advanceRow: AdvanceRow = {
      id: this.newId(),
      gameId,
      idempotencyKey,
      requestHash,
      fromWeek: weeks[0]!.result.report.week,
      toWeek: report.nextWeek,
      response,
      createdAt: this.timestamp(),
    };
    // Rétention de l'idempotence : seules les réponses des dernières progressions sont gardées.
    const stale = await this.store.staleAdvances(gameId, ADVANCE_REPLAY_RETENTION - 1);
    const operations: Operation[] = [
      { kind: 'put', table: 'games', value: updated },
      { kind: 'put', table: 'advances', value: advanceRow },
      ...stale.map((id) => ({ kind: 'delete', table: 'advances', id }) as Operation),
    ];
    for (const { before, result } of weeks)
      operations.push(...this.recordWeek(gameId, before, result));
    operations.push(...(await this.autoSave(gameId, current.state, current.stateHash)));
    await this.store.commit(operations);
    return { response, replayed: false };
  }

  /** Sauvegarde d'avant un événement majeur ou un scrutin (§12) et journal de la semaine. */
  private recordWeek(gameId: string, before: Snapshot, result: AdvanceResult): Operation[] {
    const { report } = result;
    const operations: Operation[] = [];
    if (result.majorEvent) {
      const label = report.election
        ? `Avant le ${report.election.round === 1 ? 'premier' : 'second'} tour`
        : report.events.some((e) => e.refId === 'liste-des-candidats')
          ? 'Avant la clôture des parrainages'
          : 'Avant événement majeur';
      operations.push({
        kind: 'put',
        table: 'saves',
        value: this.saveRow(gameId, 'avant_evenement', null, label, before.state, before.stateHash),
      });
    }
    operations.push(this.event(gameId, report.week, 'semaine_resolue', 'simule', { report }));
    for (const event of report.events)
      operations.push(this.event(gameId, report.week, event.kind, event.nature, event));
    for (const poll of report.polls)
      operations.push(this.event(gameId, report.week, 'sondage_publie', 'sondage', poll));
    if (report.election)
      operations.push(
        this.event(gameId, report.week, 'resultat_scrutin', 'simule', report.election),
      );
    return operations;
  }

  /** Sauvegarde automatique hebdomadaire, en ne gardant que les plus récentes. */
  // --- Débats télévisés (phase 10) ---

  /** Même contrat que l'API : le moteur joue la demande, l'état est réenregistré s'il change. */
  /** Vivier des négociations de soutien (phase 15) : même contrat que l'API. */
  private async supports(gameId: string): Promise<SupportProspects> {
    const { state } = await this.load(gameId);
    try {
      return playerSupportProspects(state, getRuleset(state.meta.rulesetVersion));
    } catch (error) {
      if (error instanceof EngineInputError)
        throw new HttpError(inputErrorStatus(error.code), error.code, error.message);
      throw error;
    }
  }

  private async playDebate(gameId: string, debatId: string, raw: unknown): Promise<GameDetail> {
    const body = DebateRequestSchema.parse(raw);
    const { row, state, stateHash } = await this.load(gameId);
    let next: GameState;
    try {
      next = playDebate(state, getRuleset(state.meta.rulesetVersion), debatId, body).state;
    } catch (error) {
      if (error instanceof EngineInputError)
        throw new HttpError(inputErrorStatus(error.code), error.code, error.message);
      throw error;
    }
    const snapshot = snapshotState(next);
    if (snapshot.stateHash === stateHash) return this.detail(row, state, stateHash);
    const updated: GameRow = {
      ...row,
      ...this.columns(snapshot.state, snapshot.stateHash),
      version: row.version + 1,
      updatedAt: this.timestamp(),
    };
    await this.store.commit([{ kind: 'put', table: 'games', value: updated }]);
    return this.detail(updated, snapshot.state, snapshot.stateHash);
  }

  private async autoSave(gameId: string, state: GameState, stateHash: string) {
    const save = this.saveRow(gameId, 'auto', null, null, state, stateHash);
    const autos = (await this.store.saves(gameId))
      .filter((s) => s.kind === 'auto')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const stale = autos.slice(AUTO_SAVE_RETENTION - 1);
    return [
      { kind: 'put', table: 'saves', value: save } as Operation,
      ...stale.map((s) => ({ kind: 'delete', table: 'saves', id: s.id }) as Operation),
    ];
  }

  // --- Journal ---

  private async journal(
    gameId: string,
    { before, limit }: { before?: JournalCursor | undefined; limit: number },
  ): Promise<JournalPage> {
    if (!(await this.store.game(gameId))) throw notFound('Partie introuvable');
    const rows = (await this.store.events(gameId))
      .filter((e) => !SUMMARIZED_IN_REPORT.has(e.type))
      .filter((e) => !before || isBeforeCursor(e, before))
      .sort((a, b) =>
        a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
      )
      .slice(0, limit + 1);
    const entries = rows.slice(0, limit).map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const isWeek = row.type === 'semaine_resolue';
      return {
        id: row.id,
        week: row.week,
        type: row.type,
        nature: row.nature,
        createdAt: row.createdAt,
        report: isWeek ? WeeklyReportSchema.parse(payload.report) : null,
        details: isWeek ? {} : payload,
      };
    });
    return {
      entries,
      nextBefore: rows.length > limit ? journalCursor(entries[entries.length - 1]!) : null,
    } as JournalPage;
  }

  // --- Sauvegardes ---

  private toSaveSummary(save: SaveRow): SaveSummary {
    return {
      id: save.id,
      kind: save.kind,
      slot: save.slot,
      label: save.label,
      week: save.week,
      date: save.date,
      stateHash: save.stateHash,
      engineVersion: save.engineVersion,
      saveSchemaVersion: save.saveSchemaVersion,
      createdAt: save.createdAt,
    };
  }

  private async listSaves(gameId: string): Promise<SaveSummary[]> {
    if (!(await this.store.game(gameId))) throw notFound('Partie introuvable');
    const saves = await this.store.saves(gameId);
    // Emplacements manuels d'abord (ordre croissant), puis les plus récentes.
    return saves
      .sort(
        (a, b) =>
          (a.slot ?? Number.MAX_SAFE_INTEGER) - (b.slot ?? Number.MAX_SAFE_INTEGER) ||
          (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
      )
      .map((s) => this.toSaveSummary(s));
  }

  private async createSave(gameId: string, raw: unknown): Promise<SaveSummary> {
    const body = CreateSaveRequestSchema.parse(raw);
    const { state, stateHash } = await this.load(gameId);
    const existing = (await this.store.saves(gameId)).find((s) => s.slot === body.slot);
    if (existing && !body.overwrite)
      throw conflict(
        'emplacement_occupe',
        `L'emplacement ${body.slot} contient déjà une sauvegarde (semaine ${existing.week}).`,
      );
    const save = this.saveRow(gameId, 'manuelle', body.slot, body.label ?? null, state, stateHash);
    await this.store.commit([
      ...(existing ? [{ kind: 'delete', table: 'saves', id: existing.id } as Operation] : []),
      { kind: 'put', table: 'saves', value: save },
      this.event(gameId, state.meta.week, 'sauvegarde_creee', 'systeme', {
        saveId: save.id,
        slot: body.slot,
        overwrite: Boolean(existing),
      }),
    ]);
    return this.toSaveSummary(save);
  }

  private async restoreSave(gameId: string, saveId: string, raw: unknown): Promise<GameDetail> {
    const body = RestoreSaveRequestSchema.parse(raw);
    const { row } = await this.load(gameId);
    const save = (await this.store.saves(gameId)).find((s) => s.id === saveId);
    if (!save) throw notFound('Sauvegarde introuvable');
    if (body.expectedVersion !== undefined && body.expectedVersion !== row.version)
      throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps : rechargez-la.');
    const { state, stateHash, migratedFrom } = this.readStored(
      save.state,
      save.stateHash,
      save.saveSchemaVersion,
      `sauvegarde ${save.id}`,
    );
    const restored: GameRow = {
      ...row,
      ...this.columns(state, stateHash),
      version: row.version + 1,
      updatedAt: this.timestamp(),
    };
    await this.store.commit([
      { kind: 'put', table: 'games', value: restored },
      this.event(gameId, state.meta.week, 'sauvegarde_restauree', 'systeme', {
        saveId: save.id,
        slot: save.slot,
        kind: save.kind,
        fromWeek: row.week,
        migratedFrom,
      }),
    ]);
    return this.detail(restored, state, stateHash);
  }

  // --- Export et import ---

  private async exportGame(gameId: string) {
    const { row, state, stateHash } = await this.load(gameId);
    return {
      fileName: exportFileName(row.name, state.meta.week),
      document: buildExport({
        name: row.name,
        state,
        stateHash,
        exportedAt: this.clock().toISOString(),
      }),
    };
  }

  /** Import dans une NOUVELLE partie, après vérification complète du fichier (§12). */
  private async importGame(document: unknown): Promise<GameDetail> {
    let read;
    try {
      read = readExport(document);
    } catch (error) {
      if (error instanceof SaveFormatError)
        throw new HttpError(422, error.code, error.message, error.details);
      throw error;
    }
    const { state, stateHash, migratedFrom } = read;
    const now = this.timestamp();
    const row: GameRow = {
      id: this.newId(),
      name: `${read.name.slice(0, 80 - IMPORT_SUFFIX.length)}${IMPORT_SUFFIX}`,
      mode: state.player.mode,
      difficulty: state.meta.difficulty,
      seed: state.meta.seed,
      ...this.columns(state, stateHash),
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.commit([
      { kind: 'put', table: 'games', value: row },
      {
        kind: 'put',
        table: 'saves',
        value: this.saveRow(row.id, 'import', null, 'État importé', state, stateHash),
      },
      this.event(row.id, state.meta.week, 'partie_importee', 'systeme', {
        originalName: read.name,
        migratedFrom,
        stateHash,
      }),
    ]);
    return this.detail(row, state, stateHash);
  }

  // --- Résultats par commune ---

  private async communeResults(gameId: string, tour: 1 | 2, departement: string) {
    const { state } = await this.load(gameId);
    const result = tour === 1 ? state.elections.t1 : state.elections.t2;
    if (!result)
      throw new HttpError(
        404,
        'tour_non_depouille',
        `Le ${tour === 1 ? 'premier' : 'second'} tour n’a pas encore eu lieu.`,
      );
    const ruleset = getRuleset(state.meta.rulesetVersion);
    const baseline = await this.geo.baselineFor(ruleset);
    try {
      const communes = communeResults(result, baseline, ruleset, departement);
      return { tour, departement, nature: baseline.nature, communes: Object.fromEntries(communes) };
    } catch (error) {
      if (error instanceof BaselineMismatchError)
        throw new HttpError(409, 'base_differente', error.message);
      throw error;
    }
  }
}
