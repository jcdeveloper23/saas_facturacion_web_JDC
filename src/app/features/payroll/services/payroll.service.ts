import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, documentId, getDocs, limit, onSnapshot, query, where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import {
  PayrollEmployee, PayrollEmployeeInput, PayrollNovelty, PayrollRun, Payslip, NoveltyType,
} from '../models/payroll.models';

/**
 * Nómina en la web (PLAN_NOMINA.md §7.2, E5): lecturas con onSnapshot (nunca
 * collectionData) y las callables de E3. Las reglas solo dejan leer al admin y
 * al contador; nadie escribe desde el navegador.
 */
@Injectable({ providedIn: 'root' })
export class PayrollService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private tenant = inject(TenantService);

  private get companyId(): string { return this.tenant.companyId; }
  private path(c: string) { return `companies/${this.companyId}/${c}`; }

  private watch<T>(q: any, map: (id: string, d: Record<string, any>) => T): Observable<T[]> {
    return new Observable<T[]>((obs) => onSnapshot(q, {
      next: (snap: any) => obs.next(snap.docs.map((d: any) => map(d.id, d.data()))),
      error: (err: unknown) => { console.error('[PayrollService]', err); obs.error(err); },
    }));
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────

  employees(): Observable<PayrollEmployee[]> {
    return this.watch(query(collection(this.firestore, this.path('payrollEmployees')), limit(1000)), toEmployee);
  }

  /** Las nóminas de un año: los ids empiezan por 'AAAA-' (rango por id, sin índice compuesto). */
  runs(year: number): Observable<PayrollRun[]> {
    const q = query(collection(this.firestore, this.path('payrollRuns')),
      where(documentId(), '>=', `${year}-`), where(documentId(), '<', `${year + 1}-`));
    return this.watch(q, toRun);
  }

  run(runId: string): Observable<PayrollRun | null> {
    return new Observable((obs) => onSnapshot(doc(this.firestore, this.path('payrollRuns'), runId), {
      next: (d) => obs.next(d.exists() ? toRun(d.id, d.data()) : null),
      error: (err) => obs.error(err),
    }));
  }

  payslips(runId: string): Observable<Payslip[]> {
    return this.watch(query(collection(this.firestore, this.path('payslips')), where('runId', '==', runId)), toPayslip);
  }

  payslip(id: string): Observable<Payslip | null> {
    return new Observable((obs) => onSnapshot(doc(this.firestore, this.path('payslips'), id), {
      next: (d) => obs.next(d.exists() ? toPayslip(d.id, d.data()) : null),
      error: (err) => obs.error(err),
    }));
  }

  novelties(period: string): Observable<PayrollNovelty[]> {
    return this.watch(query(collection(this.firestore, this.path('payrollNovelties')), where('period', '==', period)),
      (id, d) => ({ id, ...d } as PayrollNovelty));
  }

  parameters(): Observable<{ id: string; data: Record<string, any> }[]> {
    return this.watch(collection(this.firestore, 'payrollParameters'), (id, data) => ({ id, data }));
  }

  /** Las personas marcadas como empleado en Personas (el id del empleado es el de la persona). */
  async employeePersonas(): Promise<{ id: string; name: string; taxId: string; email: string }[]> {
    const snap = await getDocs(query(collection(this.firestore, this.path('personas')),
      where('roles', 'array-contains', 'employee'), limit(500)));
    return snap.docs.map((d) => {
      const x = d.data() as Record<string, any>;
      return { id: d.id, name: String(x['legalName'] || x['name'] || ''), taxId: String(x['taxId'] ?? ''), email: String(x['email'] ?? '') };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── Callables (functions/src/payroll/) ────────────────────────────────────

  private async call<T = any>(name: string, data: Record<string, unknown>, timeout?: number): Promise<T> {
    const r = await httpsCallable(this.functions, name, timeout ? { timeout } : undefined)({ companyId: this.companyId, ...data });
    return r.data as T;
  }

  upsertEmployee(personaId: string, employee: PayrollEmployeeInput) { return this.call('upsertPayrollEmployee', { personaId, employee }); }
  addNovelty(period: string, n: { employeeId: string; type: NoveltyType; qty?: number; amountCents?: number; accountCode?: string; note?: string }) {
    return this.call('savePayrollNovelties', { period, add: [n] });
  }
  deleteNovelty(period: string, id: string) { return this.call('savePayrollNovelties', { period, delete: [id] }); }
  createRun(period: string) { return this.call<{ runId: string; version: number }>('createPayrollRun', { period }); }
  recalculate(runId: string) { return this.call('recalculatePayrollRun', { runId }); }
  approve(runId: string) { return this.call<{ accountingEntryId: string; number: number }>('approvePayrollRun', { runId }); }
  reverse(runId: string, reason: string) { return this.call('reversePayrollRun', { runId, reason }); }
  sendEmails(runId: string, payslipIds: string[] = []) {
    return this.call<{ sent: number; failed: number; skipped: number; alreadySent: number }>(
      // El servidor tiene 300 s (payroll-email.ts); el SDK cortaría a los 70 s.
      'sendPayslipEmails', { runId, ...(payslipIds.length ? { payslipIds } : {}) }, 300_000);
  }

  /** El PDF llega en base64 (sin URL pública, §5.5) y se descarga como archivo. */
  async downloadPayslipPdf(payslipId: string): Promise<void> {
    const r = await this.call<{ base64: string; fileName: string }>('getPayslipPdf', { payslipId });
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.fileName || 'rol.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** El mensaje que mostrar de un error de callable o de Firestore. */
export function payrollErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'permission-denied' || e?.code === 'functions/permission-denied') {
    return 'La nómina la operan solo el administrador de la empresa y el contador.';
  }
  return e?.message || 'No se pudo completar la operación.';
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;
const date = (v: any): Date | null => (v?.toDate ? v.toDate() : null);

function toEmployee(id: string, d: Record<string, any>): PayrollEmployee {
  return {
    id, name: str(d['name']), taxId: str(d['taxId']), email: str(d['email']), iessNumber: str(d['iessNumber']),
    hireDate: str(d['hireDate']), endDate: d['endDate'] ? str(d['endDate']) : null,
    contractType: str(d['contractType']) || 'indefinite', salaryCents: num(d['salaryCents']),
    workdayType: d['workdayType'] === 'efficient' ? 'efficient' : 'full',
    region: d['region'] === 'costa' ? 'costa' : 'sierra', expenseGroup: d['expenseGroup'] === 'sales' ? 'sales' : 'admin',
    thirteenthMode: d['thirteenthMode'] ?? 'monthly', fourteenthMode: d['fourteenthMode'] ?? 'monthly',
    reserveFundMode: d['reserveFundMode'] ?? 'monthly', bankAccount: str(d['bankAccount']), isActive: d['isActive'] !== false,
  };
}

function toRun(id: string, d: Record<string, any>): PayrollRun {
  const t = d['totals'] ?? {};
  return {
    id, period: str(d['period']), version: num(d['version']) || 1, status: d['status'] ?? 'draft',
    totals: {
      employees: num(t['employees']), grossCents: num(t['grossCents']), deductionsCents: num(t['deductionsCents']),
      netCents: num(t['netCents']), employerCostsCents: num(t['employerCostsCents']), provisionsCents: num(t['provisionsCents']),
    },
    warnings: (d['warnings'] ?? []).map((w: any) => str(w?.message ?? w)).filter(Boolean),
    blockingErrors: (d['blockingErrors'] ?? []).map(str).filter(Boolean),
    accountingEntryId: d['accountingEntryId'] ?? null, reversalEntryId: d['reversalEntryId'] ?? null,
    reversalReason: str(d['reversalReason']), approvedAt: date(d['approvedAt']), reversedAt: date(d['reversedAt']),
  };
}

function toPayslip(id: string, d: Record<string, any>): Payslip {
  const e = d['employee'] ?? {};
  return {
    id, runId: str(d['runId']), period: str(d['period']), employeeId: str(d['employeeId']), status: d['status'] ?? 'draft',
    employee: { name: str(e['name']), taxId: str(e['taxId']), email: str(e['email']), position: str(e['position']), iessNumber: str(e['iessNumber']) },
    workedDays: num(d['workedDays']),
    earnings: d['earnings'] ?? [], deductions: d['deductions'] ?? [], employerCosts: d['employerCosts'] ?? [], provisions: d['provisions'] ?? [],
    netCents: num(d['netCents']), emailSent: d['emailSent'] === true, emailTo: str(d['emailTo']), emailError: str(d['emailError']),
  };
}
