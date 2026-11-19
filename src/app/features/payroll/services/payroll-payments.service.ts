import { Injectable, inject } from '@angular/core';
import { Firestore, collection, limit, onSnapshot, orderBy, query, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import {
  PayrollAccountKey, PayrollAccountsView, PayrollAdvance, PayrollPayment, PaymentDocStatus,
} from '../models/payroll-payments.models';

/**
 * Pago de roles, anticipos a empleados y cuentas de nómina (NOMINA_PAGOS.md).
 * Lecturas con onSnapshot (nunca collectionData), sin índices compuestos (§4);
 * las escrituras solo por las callables.
 */
@Injectable({ providedIn: 'root' })
export class PayrollPaymentsService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private tenant = inject(TenantService);

  private get companyId(): string { return this.tenant.companyId; }
  private col(c: string) { return collection(this.firestore, `companies/${this.companyId}/${c}`); }

  private watch<T>(q: any, map: (id: string, d: Record<string, any>) => T): Observable<T[]> {
    return new Observable<T[]>((obs) => onSnapshot(q, {
      next: (snap: any) => obs.next(snap.docs.map((d: any) => map(d.id, d.data()))),
      error: (err: unknown) => { console.error('[PayrollPaymentsService]', err); obs.error(err); },
    }));
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────

  /** Los pagos de una nómina. */
  payments(runId: string): Observable<PayrollPayment[]> {
    return this.watch(query(this.col('payrollPayments'), where('runId', '==', runId)), toPayment);
  }

  /** Los anticipos que se descuentan en un mes ('AAAA-MM'). */
  advances(period: string): Observable<PayrollAdvance[]> {
    return this.watch(query(this.col('payrollAdvances'), where('period', '==', period)), toAdvance);
  }

  /** Los últimos anticipos registrados. */
  recentAdvances(n = 50): Observable<PayrollAdvance[]> {
    return this.watch(query(this.col('payrollAdvances'), orderBy('createdAt', 'desc'), limit(n)), toAdvance);
  }

  // ─── Callables (functions/src/payroll/) ────────────────────────────────────

  private async call<T = any>(name: string, data: Record<string, unknown>): Promise<T> {
    const r = await httpsCallable(this.functions, name)({ companyId: this.companyId, ...data });
    return r.data as T;
  }

  /** `source` sale de moneySourcePayload. */
  payRun(input: { runId: string; payslipIds: string[]; date: string; source: Record<string, unknown>; reference?: string; notes?: string }) {
    const { source, ...rest } = input;
    return this.call<{ paymentId: string; number: string; entryId: string; totalCents: number }>(
      'payPayrollRun', { ...rest, ...source });
  }

  voidPayment(paymentId: string, reason: string) {
    return this.call<{ paymentId: string; reversalEntryId: string }>('voidPayrollPayment', { paymentId, reason });
  }

  registerAdvance(input: {
    employeeId: string; amountCents: number; date: string; period: string;
    source: Record<string, unknown>; reference?: string; notes?: string;
  }) {
    const { source, ...rest } = input;
    return this.call<{ advanceId: string; number: string; entryId: string }>('registerPayrollAdvance', { ...rest, ...source });
  }

  voidAdvance(advanceId: string, reason: string) {
    return this.call<{ advanceId: string; reversalEntryId: string }>('voidPayrollAdvance', { advanceId, reason });
  }

  getAccounts() { return this.call<PayrollAccountsView>('getPayrollAccounts', {}); }

  /** Una región por empresa para el 14.º (cambia el periodo de los borradores). */
  saveRegion(region: 'sierra' | 'costa') { return this.call<PayrollAccountsView>('savePayrollRegion', { region }); }

  /** Solo las claves que cambian; '' vuelve a la sugerida. */
  saveAccounts(accounts: Partial<Record<PayrollAccountKey, string>>) {
    return this.call<PayrollAccountsView>('savePayrollAccounts', { accounts });
  }
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;
const docStatus = (v: unknown): PaymentDocStatus => (v === 'voided' ? 'voided' : 'posted');

function toPayment(id: string, d: Record<string, any>): PayrollPayment {
  return {
    id, number: str(d['number']), runId: str(d['runId']), period: str(d['period']), date: str(d['date']),
    status: docStatus(d['status']), paymentMode: d['paymentMode'] === 'account' ? 'account' : 'bank',
    sourceLabel: str(d['sourceLabel']), paymentMethodCode: str(d['paymentMethodCode']), chequeNumber: str(d['chequeNumber']),
    reference: str(d['reference']), notes: str(d['notes']),
    lines: (d['lines'] ?? []).map((l: any) => ({
      payslipId: str(l?.payslipId), employeeId: str(l?.employeeId), name: str(l?.name),
      amountCents: num(l?.amountCents), netPayableAccount: str(l?.netPayableAccount),
    })),
    totalCents: num(d['totalCents']), entryId: str(d['entryId']), voidReason: str(d['voidReason']),
  };
}

export function toAdvance(id: string, d: Record<string, any>): PayrollAdvance {
  return {
    id, number: str(d['number']), employeeId: str(d['employeeId']), employeeName: str(d['employeeName']),
    date: str(d['date']), period: str(d['period']), amountCents: num(d['amountCents']), status: docStatus(d['status']),
    paymentMode: d['paymentMode'] === 'account' ? 'account' : 'bank', sourceLabel: str(d['sourceLabel']),
    paymentMethodCode: str(d['paymentMethodCode']), chequeNumber: str(d['chequeNumber']),
    reference: str(d['reference']), notes: str(d['notes']), noveltyId: str(d['noveltyId']),
    entryId: str(d['entryId']), voidReason: str(d['voidReason']),
  };
}
