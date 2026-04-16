import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * onTimesheetCreated
 *
 * Firestore trigger that runs when a new timesheet entry is created.
 * Increments loggedHours on the linked task and project using FieldValue.increment
 * so concurrent writes are safe.
 *
 * Path: companies/{companyId}/tm-timesheets/{timesheetId}
 */
export const onTimesheetCreated = onDocumentCreated(
  'companies/{companyId}/tm-timesheets/{timesheetId}',
  async (event) => {
    const data      = event.data?.data() as Record<string, any> | undefined;
    const companyId = event.params['companyId'];
    const timesheetId = event.params['timesheetId'];

    if (!data) {
      logger.warn('[onTimesheetCreated] No data in event — saliendo.', { companyId, timesheetId });
      return;
    }

    const hours     = Number(data['hours'] ?? 0);
    const taskId    = data['taskId']    as string | undefined;
    const projectId = data['projectId'] as string | undefined;

    if (hours <= 0) {
      logger.info('[onTimesheetCreated] hours <= 0 — nada que incrementar.', { companyId, timesheetId });
      return;
    }

    if (!taskId || !projectId) {
      logger.warn('[onTimesheetCreated] taskId o projectId ausente — saliendo.', { companyId, timesheetId, taskId, projectId });
      return;
    }

    const db    = admin.firestore();
    const batch = db.batch();

    batch.update(
      db.doc(`companies/${companyId}/tm-tasks/${taskId}`),
      { loggedHours: admin.firestore.FieldValue.increment(hours) }
    );
    batch.update(
      db.doc(`companies/${companyId}/tm-projects/${projectId}`),
      { loggedHours: admin.firestore.FieldValue.increment(hours) }
    );

    try {
      await batch.commit();
      logger.info('[onTimesheetCreated] loggedHours actualizado.', { companyId, timesheetId, taskId, projectId, hours });
    } catch (err) {
      logger.error('[onTimesheetCreated] Error al actualizar loggedHours.', { companyId, timesheetId, err });
    }
  }
);
