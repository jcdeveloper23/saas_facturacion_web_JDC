import { Injectable, inject } from '@angular/core';
import { Firestore, collection, limit, onSnapshot, orderBy, query, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import {
  LoanStatus, LoanType, PayrollAccountMap, PayrollGroup, PayrollLoan,
} from '../models/payroll-loans.models';

/**
 * Grupos de colaboradores y préstamos (NOMINA_GRUPOS_PRESTAMOS.md). Lecturas
 * con onSnapshot y un solo campo en el where (sin índices compuestos); las
 * escrituras solo por las callables.
 */
@Injectable({ providedIn: 'root' })
export class PayrollLoansService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private tenant = inject(TenantService);

  private get companyId(): string { return this.tenant.companyId; }
  private col(c: string) { return collection(this.firestore, `companies/${this.companyId}/${c}`); }

  private watch<T>(q: any, map: (id: string, d: Record<string, any>) => T): Observable<T[]> {
    return new Observable<T[]>((obs) => onSnapshot(q, {
      next: (snap: any) => obs.next(snap.docs.map((d: any) => map(d.id, d.data()))),
      error: (err: unknown) => { console.error('[PayrollLoansService]', err); obs.error(err); },
    }));
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────

  /** Los grupos son pocos: se escuchan enteros (con tope). */
  groups(): Observable<PayrollGroup[]> {
    return this.watch(query(this.col('payrollGroups'), limit(200)), toGroup);
  }

  /** Por estado, por empleado, o los últimos `n` creados. */
  loans(filter: { status?: LoanStatus; employeeId?: string } = {}, n = 300): Observable<PayrollLoan[]> {
    const c = this.col('payrollLoans');
    const q = filter.employeeId ? query(c, where('employeeId', '==', filter.employeeId), limit(n))
      : filter.status ? query(c, where('status', '==', filter.status), limit(n))
        : query(c, orderBy('createdAt', 'desc'), limit(n));
    return this.watch(q, toLoan);
  }

  // ─── Callables (functions/src/payroll/payroll-group-loan-callables.ts) ─────

  private async call<T = any>(name: string, data: Record<string, unknown>): Promise<T> {
    const r = await httpsCallable(this.functions, name)({ companyId: this.companyId, ...data });
    return r.data as T;
  }

  /** `accounts` reemplaza las del grupo; las vacías no se guardan. */
  upsertGroup(g: { groupId?: string; name: string; description: string; accounts: PayrollAccountMap; isActive: boolean }) {
    return this.call<{ groupId: string; created: boolean }>('upsertPayrollGroup', g);
  }

  deleteGroup(groupId: string) { return this.call<{ groupId: string }>('deletePayrollGroup', { groupId }); }

  createLoan(input: {
    employeeId: string; type: LoanType; amountCents: number; balanceCents?: number; installmentCents: number;
    startPeriod: string; accountCode?: string; notes?: string;
    disbursement?: { date: string; reference?: string } & Record<string, unknown>;
  }) {
    return this.call<{ loanId: string; number: string; entryId: string | null }>('createPayrollLoan', input);
  }

  updateLoan(loanId: string, changes: { installmentCents?: number; balanceCents?: number; notes?: string }) {
    return this.call<{ loanId: string }>('updatePayrollLoan', { loanId, ...changes });
  }

  cancelLoan(loanId: string, reason: string) {
    return this.call<{ loanId: string; reversalEntryId: string | null }>('cancelPayrollLoan', { loanId, reason });
  }
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;

export function toGroup(id: string, d: Record<string, any>): PayrollGroup {
  const a = d['accounts'] && typeof d['accounts'] === 'object' ? d['accounts'] : {};
  return {
    id, name: str(d['name']), description: str(d['description']), isActive: d['isActive'] !== false,
    accounts: Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === 'string' && v)) as PayrollAccountMap,
  };
}

export function toLoan(id: string, d: Record<string, any>): PayrollLoan {
  const x = d['disbursement'];
  const status = d['status'] === 'paid' || d['status'] === 'cancelled' ? d['status'] : 'active';
  return {
    id, number: str(d['number']), employeeId: str(d['employeeId']), employeeName: str(d['employeeName']),
    type: d['type'] ?? 'companyLoan', amountCents: num(d['amountCents']), balanceCents: num(d['balanceCents']),
    installmentCents: num(d['installmentCents']), startPeriod: str(d['startPeriod']), accountCode: str(d['accountCode']),
    status, notes: str(d['notes']), cancelReason: str(d['cancelReason']),
    disbursement: x ? {
      date: str(x.date), entryId: str(x.entryId), sourceLabel: str(x.sourceLabel), chequeNumber: str(x.chequeNumber),
      reference: str(x.reference), reversalEntryId: str(x.reversalEntryId),
    } : null,
  };
}
