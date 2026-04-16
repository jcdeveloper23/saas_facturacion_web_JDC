import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * onTaskStatusChanged
 *
 * Firestore trigger that recalculates project.completionPct whenever a task
 * status changes. completionPct = done_tasks / total_active_tasks * 100.
 *
 * Only runs when the status field actually changes to avoid unnecessary reads.
 *
 * Path: companies/{companyId}/tm-tasks/{taskId}
 */
export const onTaskStatusChanged = onDocumentUpdated(
  'companies/{companyId}/tm-tasks/{taskId}',
  async (event) => {
    const before = event.data?.before.data() as Record<string, any> | undefined;
    const after  = event.data?.after.data()  as Record<string, any> | undefined;

    if (!before || !after) return;

    // Only proceed when status actually changed
    if (before['status'] === after['status']) return;

    const companyId = event.params['companyId'];
    const projectId = after['projectId'] as string | undefined;

    if (!projectId) {
      logger.warn('[onTaskStatusChanged] projectId ausente en tarea.', { companyId, taskId: event.params['taskId'] });
      return;
    }

    const db = admin.firestore();

    try {
      const tasksSnap = await db
        .collection(`companies/${companyId}/tm-tasks`)
        .where('projectId', '==', projectId)
        .where('isActive',  '==', true)
        .get();

      const total = tasksSnap.size;
      const done  = tasksSnap.docs.filter(d => d.data()['status'] === 'done').length;
      const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

      await db.doc(`companies/${companyId}/tm-projects/${projectId}`)
        .update({ completionPct });

      logger.info('[onTaskStatusChanged] completionPct actualizado.', {
        companyId, projectId, total, done, completionPct
      });
    } catch (err) {
      logger.error('[onTaskStatusChanged] Error al recalcular completionPct.', { companyId, projectId, err });
    }
  }
);
