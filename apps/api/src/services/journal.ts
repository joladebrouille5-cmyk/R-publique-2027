import {
  journalCursor,
  WeeklyReportSchema,
  type JournalCursor,
  type JournalPage,
} from '@r2027/shared';
import type { Database } from '../db';
import { findOwnedGame } from './state';

/** Événements résumés dans le bilan de leur semaine : non répétés dans le journal. */
const SUMMARIZED_IN_REPORT = ['evenement', 'risque', 'sondage_publie', 'resultat_scrutin'];

export async function journalPage(
  db: Database,
  userId: string,
  gameId: string,
  { before, limit }: { before?: JournalCursor | undefined; limit: number },
): Promise<JournalPage> {
  await findOwnedGame(db, userId, gameId);
  const rows = await db.gameEvent.findMany({
    where: {
      gameId,
      type: { notIn: SUMMARIZED_IN_REPORT },
      // Curseur (date, id) : les entrées d'une même progression partagent leur horodatage.
      ...(before
        ? {
            OR: [
              { createdAt: { lt: new Date(before.createdAt) } },
              ...(before.id
                ? [{ createdAt: new Date(before.createdAt), id: { lt: before.id } }]
                : []),
            ],
          }
        : {}),
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
    nextBefore: rows.length > limit ? journalCursor(entries[entries.length - 1]!) : null,
  };
}
