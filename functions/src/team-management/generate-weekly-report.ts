import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns the most recent Sunday at 23:59:59 relative to `now`. */
function getLastSunday(now: Date): Date {
  const d = new Date(now);
  // getDay(): 0=Sunday ... 6=Saturday
  const dayOfWeek = d.getDay(); // 0 if today is Sunday
  // Days back to last Sunday (if today IS Sunday, step back 0 days but we want the previous Sunday)
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek;
  d.setDate(d.getDate() - daysBack);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns ISO week number (1-53) for a given date. */
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── Scheduled function ───────────────────────────────────────────────────────

/**
 * generateWeeklyReport
 *
 * Runs every Monday at 07:00 America/Guayaquil.
 * Reads timesheets for the previous week (Mon–Sun) per company,
 * groups by userId, calculates regular/overtime hours and unique task count,
 * then writes a summary document to:
 *   /companies/{companyId}/tm-reports/{weekKey}
 *
 * weekKey format: "YYYY-WNN" (e.g. "2026-W15")
 *
 * Schedule: 0 7 * * 1  (every Monday at 07:00)
 */
export const generateWeeklyReport = onSchedule(
  { schedule: '0 7 * * 1', timeZone: 'America/Guayaquil' },
  async () => {
    const db  = admin.firestore();
    const now = new Date();

    const weekEnd   = getLastSunday(now);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const weekKey = `${weekStart.getFullYear()}-W${String(getWeekNumber(weekStart)).padStart(2, '0')}`;

    const weekStartTs = admin.firestore.Timestamp.fromDate(weekStart);
    const weekEndTs   = admin.firestore.Timestamp.fromDate(weekEnd);
    const generatedAt = admin.firestore.Timestamp.now();

    let companiesProcessed = 0;

    try {
      const companiesSnap = await db
        .collection('companies')
        .where('isActive', '==', true)
        .get();

      for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;

        const timesheetsSnap = await db
          .collection(`companies/${companyId}/tm-timesheets`)
          .where('date', '>=', weekStartTs)
          .where('date', '<=', weekEndTs)
          .get();

        // Group by userId
        const byUser: Record<string, {
          hours: number;
          overtimeHours: number;
          tasks: Set<string>;
          userName: string;
        }> = {};

        for (const d of timesheetsSnap.docs) {
          const e = d.data() as Record<string, any>;
          const uid = e['userId'] as string;
          if (!uid) continue;

          if (!byUser[uid]) {
            byUser[uid] = { hours: 0, overtimeHours: 0, tasks: new Set(), userName: e['userName'] ?? '' };
          }

          const h = Number(e['hours'] ?? 0);
          byUser[uid].hours += h;
          if (e['type'] === 'overtime') byUser[uid].overtimeHours += h;
          if (e['taskId']) byUser[uid].tasks.add(e['taskId'] as string);
        }

        const rows = Object.entries(byUser).map(([userId, stats]) => ({
          userId,
          userName:      stats.userName,
          totalHours:    stats.hours,
          overtimeHours: stats.overtimeHours,
          regularHours:  stats.hours - stats.overtimeHours,
          taskCount:     stats.tasks.size,
          isOvertime:    stats.hours > 40,
        }));

        await db.doc(`companies/${companyId}/tm-reports/${weekKey}`).set({
          weekKey,
          weekStart:   weekStartTs,
          weekEnd:     weekEndTs,
          rows,
          generatedAt,
        });

        companiesProcessed++;
      }

      logger.info('[generateWeeklyReport] Reporte generado.', { weekKey, companiesProcessed });
    } catch (err) {
      logger.error('[generateWeeklyReport] Error.', { weekKey, err });
    }
  }
);
