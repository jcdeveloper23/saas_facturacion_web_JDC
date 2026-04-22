import { Timestamp } from '@angular/fire/firestore';

// ─── Period Status ────────────────────────────────────────────────────────────

export type AccountingPeriodStatus = 'open' | 'closed' | 'locked';

export const PERIOD_STATUS_LABELS: Record<AccountingPeriodStatus, string> = {
  open:   'Abierto',
  closed: 'Cerrado',
  locked: 'Bloqueado'
};

export const PERIOD_STATUS_COLORS: Record<AccountingPeriodStatus, string> = {
  open:   'success',
  closed: 'warning',
  locked: 'danger'
};

// ─── Accounting Period document ───────────────────────────────────────────────
// Stored at: /companies/{companyId}/accounting_periods/{periodId}

export interface AccountingPeriod {
  id: string;
  year: number;               // e.g. 2025
  name: string;               // e.g. "Ejercicio 2025"
  startDate: Timestamp;       // e.g. 2025-01-01
  endDate: Timestamp;         // e.g. 2025-12-31
  status: AccountingPeriodStatus;
  openingEntryId?: string;    // ID of the opening journal entry
  closingEntryId?: string;    // ID of the closing journal entry
  closedAt?: Timestamp;
  closedBy?: string;
  lockedAt?: Timestamp;
  lockedBy?: string;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}
