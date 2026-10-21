import {
  advanceWeek,
  EngineInputError,
  type AdvanceResult,
  type TerritorialBaseline,
} from '@r2027/engine';
import { getRuleset } from '@r2027/rulesets';
import { canonicalStringify, sha256, snapshotState } from '@r2027/save-engine';
import {
  AdvanceResponseSchema,
  type AdvanceRequestSchema,
  type AdvanceResponse,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import type { z } from 'zod';
import type { Database } from '../db';
import { conflict, HttpError } from '../errors';
import { Prisma } from '../generated/prisma/client';
import { saveColumns, writeAutoSave } from './saves';
import { findOwnedGame, gameColumns, loadOwnedGame, toGameDetail } from './state';

type AdvanceBody = z.output<typeof AdvanceRequestSchema>;
export type AdvanceOutcome = { response: AdvanceResponse; replayed: boolean };

async function findReplay(
  db: Database,
  gameId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<AdvanceResponse | null> {
  const previous = await db.gameAdvance.findUnique({
    where: { gameId_idempotencyKey: { gameId, idempotencyKey } },
  });
  if (!previous) return null;
  if (previous.requestHash !== requestHash) {
    throw new HttpError(
      422,
      'cle_idempotence_reutilisee',
      'Cette clé d’idempotence a déjà servi pour une autre requête.',
    );
  }
  return AdvanceResponseSchema.parse(previous.response);
}

function runEngine(...args: Parameters<typeof advanceWeek>): AdvanceResult {
  try {
    return advanceWeek(...args);
  } catch (error) {
    if (error instanceof EngineInputError) {
      throw new HttpError(
        error.code === 'progression_bloquee' ? 409 : 422,
        error.code,
        error.message,
      );
    }
    throw error;
  }
}

/** Factorise les facteurs du bilan par étape, pour le journal de simulation (`SimulationLog`). */
function stepFactors(report: WeeklyReport, step: number) {
  return report.changes.flatMap((change) =>
    change.factors
      .filter((factor) => factor.step === step)
      .map((factor) => ({ ...factor, actorId: change.actorId, ressource: change.ressource })),
  );
}

/**
 * Fait avancer la partie d'une semaine. Idempotent : la même clé et la même requête
 * renvoient la réponse enregistrée sans avancer à nouveau ; verrou optimiste sur la version.
 */
export async function advanceGame(
  db: Database,
  userId: string,
  gameId: string,
  idempotencyKey: string,
  body: AdvanceBody,
  territoryFor: (ruleset: Ruleset) => TerritorialBaseline,
): Promise<AdvanceOutcome> {
  await findOwnedGame(db, userId, gameId);
  const requestHash = sha256(canonicalStringify(body));
  const replay = await findReplay(db, gameId, idempotencyKey, requestHash);
  if (replay) return { response: replay, replayed: true };

  const { game, state, stateHash } = await loadOwnedGame(db, userId, gameId);
  if (body.expectedWeek !== game.week) {
    throw conflict(
      'semaine_perimee',
      `La partie est en semaine ${game.week} (semaine ${body.expectedWeek} attendue) : rechargez-la.`,
    );
  }
  const ruleset = getRuleset(state.meta.rulesetVersion);
  const result = runEngine(
    state,
    {
      actions: body.actions,
      decisions: body.decisions,
      programme: body.programme,
      alliances: body.alliances,
    },
    { ruleset, territory: territoryFor(ruleset) },
  );
  const next = snapshotState(result.state);
  const { report } = result;

  try {
    const response = await db.$transaction(async (tx) => {
      const { count } = await tx.game.updateMany({
        where: { id: gameId, version: game.version, week: game.week },
        data: { ...gameColumns(next.state, next.stateHash), version: { increment: 1 } },
      });
      if (count !== 1) {
        throw conflict(
          'conflit_de_version',
          'La partie a été modifiée entre-temps : rechargez-la.',
        );
      }
      // Sauvegarde automatique AVANT un événement majeur ou un scrutin : on peut revenir à
      // l'état d'avant (§12).
      if (result.majorEvent) {
        await tx.gameSave.create({
          data: {
            gameId,
            kind: 'avant_evenement',
            label: report.election
              ? `Avant le ${report.election.round === 1 ? 'premier' : 'second'} tour`
              : report.events.some((e) => e.refId === 'liste-des-candidats')
                ? 'Avant la clôture des parrainages'
                : 'Avant événement majeur',
            ...saveColumns(state, stateHash),
          },
        });
      }
      const updated = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
      const response: AdvanceResponse = {
        game: toGameDetail({ game: updated, state: next.state, stateHash: next.stateHash }),
        report,
      };
      const advance = await tx.gameAdvance.create({
        data: {
          gameId,
          idempotencyKey,
          requestHash,
          fromWeek: report.week,
          toWeek: report.nextWeek,
          response,
        },
      });
      if (report.actions.length) {
        await tx.gameAction.createMany({
          data: report.actions.map((action) => ({
            gameId,
            advanceId: advance.id,
            week: report.week,
            position: action.index,
            actorId: action.actorId,
            type: action.actionId,
            payload: { label: action.label, cost: action.cost, cible: action.cible },
            status: action.status,
            rejectionReason: action.reason,
          })),
        });
      }
      await tx.gameEvent.createMany({
        data: [
          {
            gameId,
            week: report.week,
            type: 'semaine_resolue',
            nature: 'simule' as const,
            payload: { report },
          },
          ...report.events.map((event) => ({
            gameId,
            week: report.week,
            type: event.kind,
            nature: event.nature,
            payload: event,
          })),
          ...report.polls.map((poll) => ({
            gameId,
            week: report.week,
            type: 'sondage_publie',
            nature: 'sondage' as const,
            payload: poll,
          })),
          ...(report.election
            ? [
                {
                  gameId,
                  week: report.week,
                  type: 'resultat_scrutin',
                  nature: 'simule' as const,
                  payload: report.election,
                },
              ]
            : []),
        ],
      });
      await tx.simulationLog.createMany({
        data: report.steps.map((step) => ({
          gameId,
          week: report.week,
          step: step.step,
          module: step.module,
          message: `${step.label} — ${step.summary}`,
          factors: stepFactors(report, step.step),
        })),
      });
      await writeAutoSave(tx, gameId, next.state, next.stateHash);
      return response;
    });
    return { response, replayed: false };
  } catch (error) {
    // Deux envois simultanés de la même requête : le second rejoue la réponse du premier.
    const concurrent =
      (error instanceof HttpError && error.code === 'conflit_de_version') ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
    if (concurrent) {
      const winner = await findReplay(db, gameId, idempotencyKey, requestHash);
      if (winner) return { response: winner, replayed: true };
      throw conflict('conflit_de_version', 'La partie a été modifiée entre-temps : rechargez-la.');
    }
    throw error;
  }
}
