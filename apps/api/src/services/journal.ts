import { WeeklyReportSchema, type JournalPage } from '@r2027/shared';
import type { Database } from '../db';
import { findOwnedGame } from './state';

/** Événements résumés dans le bilan de leur semaine : non répétés dans le journal. */
const SUMMARIZED_IN_REPORT = ['evenement', 'risque'];

export async function journalPage(
  db: Database,
  userId: string,
  gameId: string,
  { before, limit }: { before?: string | undefined; limit: number },
): Promise<JournalPage> {
  await findOwnedGame(db, userId, gameId);
  const rows = await db.gameEvent.findMany({
    where: {
      gameId,
      type: { notIn: SUMMARIZED_IN_REPORT },
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const entries = rows.slice(0, limit).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const isWeek = row.type === 'semaine_resolue';
    return {
      id: row.id,
      week: row.week,
      type: row.type,
      nature: row.nature,
      createdAt: row.createdAt.toISOString(),
      report: isWeek ? WeeklyReportSchema.parse(payload.report) : null,
      details: isWeek ? {} : payload,
    };
  });
  return {
    entries,
    nextBefore: rows.length > limit ? entries[entries.length - 1]!.createdAt : null,
  };
}
