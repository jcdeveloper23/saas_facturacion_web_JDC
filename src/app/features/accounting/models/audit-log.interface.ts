import { Timestamp } from '@angular/fire/firestore';

export type AuditLogAction = 'create' | 'update' | 'delete';

export const AUDIT_ACTION_LABELS: Record<AuditLogAction, string> = {
  create: 'Creado',
  update: 'Modificado',
  delete: 'Eliminado'
};

export const AUDIT_ACTION_COLORS: Record<AuditLogAction, string> = {
  create: 'success',
  update: 'info',
  delete: 'danger'
};

export const AUDIT_COLLECTION_LABELS: Record<string, string> = {
  journal_entries:     'Asiento Contable',
  chart_of_accounts:   'Cuenta Contable',
  accounting_periods:  'Ejercicio Contable'
};

// ─── Audit Log document ────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/audit_log/{logId}
// Escrito únicamente por Cloud Functions (audit-log-trigger.ts) — inmutable
// desde el cliente (firestore.rules: allow write: if false).

export interface AuditLogEntry {
  id: string;
  collection:    string;             // 'journal_entries' | 'chart_of_accounts' | 'accounting_periods'
  docId:         string;
  action:        AuditLogAction;
  changedFields: string[];           // ['*'] para create/delete
  before:        Record<string, any> | null;
  after:         Record<string, any> | null;
  userId:        string;
  timestamp:     Timestamp;
}
