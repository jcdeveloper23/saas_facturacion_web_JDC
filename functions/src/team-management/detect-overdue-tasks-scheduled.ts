import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * detectOverdueTasksScheduled
 *
 * Runs every day at 08:00 America/Guayaquil.
 * Scans all active companies for tasks whose dueDate has passed and that
 * are not yet done or cancelled, then writes a notification document for
 * each so the frontend can surface alerts.
 *
 * Schedule: 0 8 * * *  (daily at 08:00)
 */
export const detectOverdueTasksScheduled = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Guayaquil' },
  async () => {
    const db    = admin.firestore();
    const nowTs = admin.firestore.Timestamp.now();

    let companiesProcessed = 0;
    let notificationsWritten = 0;

    try {
      const companiesSnap = await db
        .collection('companies')
        .where('isActive', '==', true)
        .get();

      for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;

        const overdueSnap = await db
          .collection(`companies/${companyId}/tm-tasks`)
          .where('dueDate',  '<', nowTs)
          .where('isActive', '==', true)
          .get();

        const overdueTasks = overdueSnap.docs.filter(d => {
          const status = d.data()['status'] as string;
          return status !== 'done' && status !== 'cancelled';
        });

        if (overdueTasks.length === 0) {
          companiesProcessed++;
          continue;
        }

        const batch = db.batch();
        for (const taskDoc of overdueTasks) {
          const taskData = taskDoc.data();
          const notifRef = db.collection(`companies/${companyId}/notifications`).doc();
          batch.set(notifRef, {
            type:        'task_overdue',
            taskId:      taskDoc.id,
            taskTitle:   taskData['title']       ?? '',
            projectId:   taskData['projectId']   ?? '',
            projectName: taskData['projectName'] ?? '',
            targetIds:   taskData['assigneeIds'] ?? [],
            createdAt:   nowTs,
            read:        false,
          });
          notificationsWritten++;
        }

        await batch.commit();
        companiesProcessed++;
      }

      logger.info('[detectOverdueTasksScheduled] Completado.', { companiesProcessed, notificationsWritten });
    } catch (err) {
      logger.error('[detectOverdueTasksScheduled] Error.', { err });
    }
  }
);
