import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-timesheets/{timesheetId}
// IMPORTANTE: Los documentos de timesheet son inmutables (audit trail).
// Solo el admin puede actualizar el campo approved/approvedBy.

export type TimesheetEntryType = 'regular' | 'overtime' | 'support' | 'meeting' | 'training';

export const TIMESHEET_TYPE_LABELS: Record<TimesheetEntryType, string> = {
  regular:   'Regular',
  overtime:  'Hora Extra',
  support:   'Soporte',
  meeting:   'Reunión',
  training:  'Capacitación',
};

export const TIMESHEET_TYPE_COLORS: Record<TimesheetEntryType, string> = {
  regular:   'primary',
  overtime:  'warning',
  support:   'info',
  meeting:   'secondary',
  training:  'success',
};

export interface TimesheetEntry extends BaseDocument {
  taskId: string;
  taskTitle: string;         // snapshot
  projectId: string;
  projectName: string;       // snapshot
  userId: string;            // uid Firebase Auth
  userName: string;          // snapshot
  date: Timestamp;           // fecha del trabajo (no createdAt)
  hours: number;             // mínimo 0.5, múltiplos de 0.5
  type: TimesheetEntryType;
  description?: string;
  approved: boolean;
  approvedBy?: string;       // uid admin que aprobó
  approvedAt?: Timestamp;
}

export type TimesheetCreateInput = Omit<TimesheetEntry,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'approved' | 'approvedBy' | 'approvedAt'
>;

// ─── Helpers puros ────────────────────────────────────────────────────────────

export function roundHours(h: number): number {
  return Math.round(h * 2) / 2;
}

export function isOvertimeWeek(totalHoursInWeek: number): boolean {
  return totalHoursInWeek > 40;
}
