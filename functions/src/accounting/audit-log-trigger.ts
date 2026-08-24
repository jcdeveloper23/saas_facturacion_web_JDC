import { onDocumentWritten, FirestoreEvent, Change, DocumentSnapshot } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

// ─── Log de auditoría inmutable ────────────────────────────────────────────────
//
// Registra cada create/update/delete sobre las colecciones contables más
// sensibles (asientos, plan de cuentas, ejercicios) en un log append-only que
// nadie puede editar ni borrar desde el cliente (ver firestore.rules:
// audit_log solo permite `read` a admin, `write` siempre false — solo estas
// Cloud Functions, con Admin SDK, pueden escribir).
//
// createdBy/updatedBy en cada documento se sobrescriben en cada edición — este
// log es lo único que conserva el histórico de quién cambió qué y cuándo.

type ChangeAction = 'create' | 'update' | 'delete';

function diffFields(before: Record<string, any> | null, after: Record<string, any> | null): string[] {
  if (!before || !after) return ['*'];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    // Los timestamps updatedAt siempre cambian — no aportan al diff de auditoría
    if (k === 'updatedAt') continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  }
  return changed;
}

async function logChange(
  collectionName: string,
  event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>
): Promise<void> {
  const companyId = event.params['companyId'];
  const docId     = event.params['docId'];
  if (!companyId || !docId) return;

  const beforeExists = event.data?.before.exists ?? false;
  const afterExists   = event.data?.after.exists ?? false;
  const before = beforeExists ? (event.data!.before.data() as Record<string, any>) : null;
  const after  = afterExists  ? (event.data!.after.data()  as Record<string, any>) : null;

  const action: ChangeAction = !beforeExists ? 'create' : !afterExists ? 'delete' : 'update';
  const changedFields = diffFields(before, after);

  // Update sin cambios reales (ej. un write que solo toca updatedAt) — no vale la pena auditarlo
  if (action === 'update' && changedFields.length === 0) return;

  const userId = after?.['updatedBy'] ?? after?.['createdBy'] ?? before?.['updatedBy'] ?? 'system';

  const db = admin.firestore();
  await db.collection(`companies/${companyId}/audit_log`).add({
    collection:    collectionName,
    docId,
    action,
    changedFields,
    before,
    after,
    userId,
    timestamp: admin.firestore.Timestamp.now()
  });
}

export const auditLogJournalEntries = onDocumentWritten(
  'companies/{companyId}/journal_entries/{docId}',
  async (event) => { await logChange('journal_entries', event); }
);

export const auditLogChartOfAccounts = onDocumentWritten(
  'companies/{companyId}/chart_of_accounts/{docId}',
  async (event) => { await logChange('chart_of_accounts', event); }
);

export const auditLogAccountingPeriods = onDocumentWritten(
  'companies/{companyId}/accounting_periods/{docId}',
  async (event) => { await logChange('accounting_periods', event); }
);
