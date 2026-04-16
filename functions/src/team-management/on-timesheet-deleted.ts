import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * onTimesheetDeleted
 *
 * Firestore trigger that runs when a timesheet entry is deleted.
 * Decrements loggedHours on the linked task and project.
 *
 * Note: Firestore rules block client-side deletes (audit trail inmutable).
 * This trigger acts as a safeguard for Admin SDK deletions performed by
 * privileged backend operations.
 *
 * Path: companies/{companyId}/tm-timesheets/{timesheetId}
 */
export const onTimesheetDeleted = onDocumentDeleted(
  'companies/{companyId}/tm-timesheets/{timesheetId}',
  async (event) => {
    const data      = event.data?.data() as Record<string, any> | undefined;
    const companyId = event.params['companyId'];
    const timesheetId = event.params['timesheetId'];

    if (!data) {
      logger.warn('[onTimesheetDeleted] No data in event — saliendo.', { companyId, timesheetId });
      return;
    }

    const hours     = Number(data['hours'] ?? 0);
    const taskId    = data['taskId']    as string | undefined;
    const projectId = data['projectId'] as string | undefined;

    if (hours <= 0 || !taskId || !projectId) {
      logger.info('[onTimesheetDeleted] Nada que revertir.', { companyId, timesheetId, hours, taskId, projectId });
      return;
    }

    const db    = admin.firestore();
    const batch = db.batch();

    batch.update(
      db.doc(`companies/${companyId}/tm-tasks/${taskId}`),
      { loggedHours: admin.firestore.FieldValue.increment(-hours) }
    );
    batch.update(
      db.doc(`companies/${companyId}/tm-projects/${projectId}`),
      { loggedHours: admin.firestore.FieldValue.increment(-hours) }
    );

    try {
      await batch.commit();
      logger.info('[onTimesheetDeleted] loggedHours revertido.', { companyId, timesheetId, taskId, projectId, hours });
    } catch (err) {
      logger.error('[onTimesheetDeleted] Error al revertir loggedHours.', { companyId, timesheetId, err });
    }
  }
);
