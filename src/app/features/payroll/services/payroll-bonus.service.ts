import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, limit, onSnapshot, orderBy, query, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import {
  BonusKind, BonusRegion, BonusRunTotals, PayrollBonusRun, PayrollVacation, VacationBalance,
} from '../models/payroll-bonus.models';

/**
 * Décimos acumulados y vacaciones (NOMINA_DECIMOS.md). Lecturas con onSnapshot
 * y un solo campo en el where; las escrituras solo por las callables.
 */
@Injectable({ providedIn: 'root' })
export class PayrollBonusService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private tenant = inject(TenantService);

  private get companyId(): string { return this.tenant.companyId; }
  private path(c: string) { return `companies/${this.companyId}/${c}`; }

  private watch<T>(q: any, map: (id: string, d: Record<string, any>) => T): Observable<T[]> {
    return new Observable<T[]>((obs) => onSnapshot(q, {
      next: (snap: any) => obs.next(snap.docs.map((d: any) => map(d.id, d.data()))),
      error: (err: unknown) => { console.error('[PayrollBonusService]', err); obs.error(err); },
    }));
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────

  /** Los lotes de un año (los ids empiezan por el tipo, así que se filtra por el campo `year`). */
  bonusRuns(year: number): Observable<PayrollBonusRun[]> {
    return this.watch(query(collection(this.firestore, this.path('payrollBonusRuns')), where('year', '==', year), limit(100)), toBonusRun);
  }

  bonusRun(id: string): Observable<PayrollBonusRun | null> {
    return new Observable((obs) => onSnapshot(doc(this.firestore, this.path('payrollBonusRuns'), id), {
      next: (d) => obs.next(d.exists() ? toBonusRun(d.id, d.data()) : null),
      error: (err) => obs.error(err),
    }));
  }

  vacations(employeeId: string): Observable<PayrollVacation[]> {
    return this.watch(query(collection(this.firestore, this.path('payrollVacations')),
      where('employeeId', '==', employeeId), limit(200)), toVacation);
  }

  recentVacations(n = 50): Observable<PayrollVacation[]> {
    return this.watch(query(collection(this.firestore, this.path('payrollVacations')),
      orderBy('createdAt', 'desc'), limit(n)), toVacation);
  }

  // ─── Callables ─────────────────────────────────────────────────────────────

  private async call<T = any>(name: string, data: Record<string, unknown>): Promise<T> {
    const r = await httpsCallable(this.functions, name)({ companyId: this.companyId, ...data });
    return r.data as T;
  }

  createBonusRun(kind: BonusKind, year: number, region: BonusRegion | null) {
    return this.call<{ bonusRunId: string; version: number; totals: BonusRunTotals }>(
      'createPayrollBonusRun', { kind, year, ...(kind === 'fourteenth' ? { region } : {}) });
  }

  recalculateBonusRun(bonusRunId: string) {
    return this.call<{ bonusRunId: string; totals: BonusRunTotals }>('recalculatePayrollBonusRun', { bonusRunId });
  }

  /** `source` sale de moneySourcePayload. */
  payBonusRun(input: { bonusRunId: string; date: string; source: Record<string, unknown>; reference?: string; notes?: string }) {
    const { source, ...rest } = input;
    return this.call<{ bonusRunId: string; entryId: string; totalCents: number }>('payPayrollBonusRun', { ...rest, ...source });
  }

  /** Borrador: lo descarta. Pagado: reversa el asiento. */
  voidBonusRun(bonusRunId: string, reason: string) {
    return this.call<{ bonusRunId: string; reversalEntryId: string | null }>('voidPayrollBonusRun', { bonusRunId, reason });
  }

  vacationBalance(employeeId: string, asOf?: string) {
    return this.call<VacationBalance>('getPayrollVacationBalance', { employeeId, ...(asOf ? { asOf } : {}) });
  }

  registerVacation(input: { employeeId: string; from: string; to: string; allowAdvance?: boolean; notes?: string }) {
    return this.call<{ vacationId: string; days: number; balance: VacationBalance }>('registerPayrollVacation', input);
  }

  voidVacation(vacationId: string, reason: string) {
    return this.call<{ vacationId: string }>('voidPayrollVacation', { vacationId, reason });
  }
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;

function toBonusRun(id: string, d: Record<string, any>): PayrollBonusRun {
  const t = d['totals'] ?? {};
  const status = d['status'] === 'paid' || d['status'] === 'voided' ? d['status'] : 'draft';
  return {
    id, kind: d['kind'] === 'fourteenth' ? 'fourteenth' : 'thirteenth', year: num(d['year']),
    region: d['region'] === 'sierra' || d['region'] === 'costa' ? d['region'] : null, version: num(d['version']) || 1,
    from: str(d['from']), to: str(d['to']), label: str(d['label']), status,
    lines: (d['lines'] ?? []).map((l: any) => ({
      employeeId: str(l?.employeeId), employeeName: str(l?.employeeName), from: str(l?.from), to: str(l?.to),
      totalIncomeCents: num(l?.totalIncomeCents), monthsWorked: num(l?.monthsWorked), monthsAccumulated: num(l?.monthsAccumulated),
      amountCents: num(l?.amountCents), provisionedCents: num(l?.provisionedCents), adjustmentCents: num(l?.adjustmentCents),
      alreadyPaidCents: num(l?.alreadyPaidCents), balanceCents: num(l?.balanceCents),
      errors: Array.isArray(l?.errors) ? l.errors.map(str) : [],
    })),
    totals: {
      employees: num(t['employees']), amountCents: num(t['amountCents']), provisionedCents: num(t['provisionedCents']),
      adjustmentCents: num(t['adjustmentCents']), balanceCents: num(t['balanceCents']),
    },
    calculatedFor: str(d['calculatedFor']), paidCents: num(d['paidCents']), paymentDate: str(d['paymentDate']),
    entryId: str(d['entryId']), sourceLabel: str(d['sourceLabel']), chequeNumber: str(d['chequeNumber']),
    reference: str(d['reference']), notes: str(d['notes']), voidReason: str(d['voidReason']),
    reversalEntryId: str(d['reversalEntryId']),
  };
}

function toVacation(id: string, d: Record<string, any>): PayrollVacation {
  return {
    id, employeeId: str(d['employeeId']), employeeName: str(d['employeeName']), from: str(d['from']), to: str(d['to']),
    days: num(d['days']), isAdvance: d['isAdvance'] === true, status: d['status'] === 'voided' ? 'voided' : 'posted',
    notes: str(d['notes']), voidReason: str(d['voidReason']),
  };
}
