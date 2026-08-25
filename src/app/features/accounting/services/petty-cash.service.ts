import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, updateDoc,
  addDoc, query, where, orderBy, limit, Timestamp
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { JournalEntriesService }    from './journal-entries.service';
import { AccountingPeriodsService } from './accounting-periods.service';
import { PettyCashFund, PettyCashMovement } from '../models/petty-cash.interface';

export type PettyCashFundCreateInput = Omit<PettyCashFund,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'openingEntryId'
>;

export interface CreateMovementInput {
  fundId:  string;
  fundName: string;
  date:    string; // yyyy-mm-dd
  description: string;
  amount:  number;
  expenseAccountCode: string;
  expenseAccountName: string;
  receiptRef?: string;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

@Injectable({ providedIn: 'root' })
export class PettyCashService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);
  private journalSvc    = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get fundsPath(): string { return `companies/${this.companyId}/petty_cash_funds`; }
  private get movementsPath(): string { return `companies/${this.companyId}/petty_cash_movements`; }

  // ─── Funds ───────────────────────────────────────────────────────────────

  getFunds(): Observable<PettyCashFund[]> {
    return new Observable<PettyCashFund[]>(observer => {
      const ref = collection(this.firestore, this.fundsPath);
      return onSnapshot(query(ref, orderBy('name', 'asc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as PettyCashFund))),
        error: err  => { console.error('[PettyCashService] getFunds error:', err); observer.error(err); }
      });
    });
  }

  /** Da de alta el fondo. Si fixedAmount > 0, contabiliza el asiento de apertura (Debe Caja Chica / Haber Banco). */
  async createFund(input: PettyCashFundCreateInput, fundingBankAccount?: { linkedGlCode: string; linkedGlName: string }): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();

    const fund: Omit<PettyCashFund, 'id'> = { ...input, createdBy: userId, createdAt: now, updatedAt: now };
    const ref = await addDoc(collection(this.firestore, this.fundsPath), this.cleanDoc(fund));

    if (input.fixedAmount > 0 && fundingBankAccount) {
      const period = await this.resolveOpenPeriod(new Date().toISOString().slice(0, 10));
      const amount = round2(input.fixedAmount);
      const desc   = `Alta fondo de caja chica — ${input.name}`;

      const entryId = await this.journalSvc.createEntry({
        date: now,
        description: desc,
        periodId:   period.id,
        periodYear: period.year,
        type:       'manual',
        status:     'draft',
        reference:  input.name,
        lines: [
          { id: crypto.randomUUID(), accountCode: input.linkedGlCode, accountName: input.linkedGlName, debit: amount, credit: 0, costCenterId: null, costCenterName: null, description: desc },
          { id: crypto.randomUUID(), accountCode: fundingBankAccount.linkedGlCode, accountName: fundingBankAccount.linkedGlName, debit: 0, credit: amount, costCenterId: null, costCenterName: null, description: desc },
        ]
      });
      await this.journalSvc.postEntry(entryId);
      await updateDoc(doc(this.firestore, `${this.fundsPath}/${ref.id}`), { openingEntryId: entryId, updatedAt: Timestamp.now() });
    }

    return ref.id;
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, `${this.fundsPath}/${id}`), { isActive, updatedAt: Timestamp.now() });
  }

  // ─── Movements ───────────────────────────────────────────────────────────

  getMovements(fundId: string): Observable<PettyCashMovement[]> {
    return new Observable<PettyCashMovement[]>(observer => {
      const ref = collection(this.firestore, this.movementsPath);
      // limit(200): ya filtrado por fundId, pero acotamos por seguridad. Ver FIREBASE_PAGINATION_GUIDELINES.md
      return onSnapshot(query(ref, where('fundId', '==', fundId), orderBy('date', 'desc'), limit(200)), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as PettyCashMovement))),
        error: err  => { console.error('[PettyCashService] getMovements error:', err); observer.error(err); }
      });
    });
  }

  /** Registra un gasto pagado desde el fondo. No contabiliza todavía — se acumula pendiente de reposición. */
  async createMovement(input: CreateMovementInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const movement: Omit<PettyCashMovement, 'id'> = {
      fundId:   input.fundId,
      fundName: input.fundName,
      date:     Timestamp.fromDate(new Date(input.date + 'T00:00:00')),
      description: input.description,
      amount:      round2(input.amount),
      expenseAccountCode: input.expenseAccountCode,
      expenseAccountName: input.expenseAccountName,
      receiptRef:  input.receiptRef || undefined,
      reimbursed:  false,
      createdBy:   userId,
      createdAt:   Timestamp.now(),
    };
    const ref = await addDoc(collection(this.firestore, this.movementsPath), this.cleanDoc(movement));
    return ref.id;
  }

  /**
   * Reposición: agrupa los movimientos pendientes por cuenta de gasto y
   * postea un asiento (Debe [cada cuenta de gasto] / Haber Banco) que
   * devuelve el fondo a su monto fijo. Marca los movimientos incluidos.
   */
  async replenish(
    fund: PettyCashFund, pendingMovements: PettyCashMovement[],
    fundingBankAccount: { linkedGlCode: string; linkedGlName: string }
  ): Promise<string> {
    if (!pendingMovements.length) throw new Error('No hay gastos pendientes de reponer.');

    const expenseByAccount = new Map<string, { name: string; total: number }>();
    for (const m of pendingMovements) {
      const cur = expenseByAccount.get(m.expenseAccountCode) ?? { name: m.expenseAccountName, total: 0 };
      cur.total = round2(cur.total + m.amount);
      expenseByAccount.set(m.expenseAccountCode, cur);
    }
    const totalAmount = round2([...expenseByAccount.values()].reduce((s, e) => s + e.total, 0));

    const period = await this.resolveOpenPeriod(new Date().toISOString().slice(0, 10));
    const desc = `Reposición caja chica — ${fund.name}`;

    const expenseLines = [...expenseByAccount.entries()].map(([code, { name, total }]) => ({
      id: crypto.randomUUID(), accountCode: code, accountName: name,
      debit: total, credit: 0, costCenterId: null, costCenterName: null, description: desc
    }));
    const bankLine = {
      id: crypto.randomUUID(), accountCode: fundingBankAccount.linkedGlCode, accountName: fundingBankAccount.linkedGlName,
      debit: 0, credit: totalAmount, costCenterId: null, costCenterName: null, description: desc
    };

    const entryId = await this.journalSvc.createEntry({
      date: Timestamp.now(),
      description: desc,
      periodId:   period.id,
      periodYear: period.year,
      type:       'manual',
      status:     'draft',
      reference:  fund.name,
      lines: [...expenseLines, bankLine],
    });
    await this.journalSvc.postEntry(entryId);

    await Promise.all(pendingMovements.map(m =>
      updateDoc(doc(this.firestore, `${this.movementsPath}/${m.id}`), {
        reimbursed: true, reimbursementEntryId: entryId
      })
    ));

    return entryId;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async resolveOpenPeriod(dateStr: string): Promise<{ id: string; year: number }> {
    const year = new Date(dateStr + 'T00:00:00').getFullYear();
    const periods = await firstValueFrom(this.periodsSvc.getPeriods().pipe(take(1)));
    const period = periods.find(p => p.year === year && p.status === 'open');
    if (!period) throw new Error(`No hay un período contable abierto para ${year}.`);
    return { id: period.id, year: period.year };
  }

  private cleanDoc<T>(obj: T): T {
    if (obj === undefined) return null as T;
    if (obj === null)      return null as T;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(i => this.cleanDoc(i)) as unknown as T;
    if ((obj as any).constructor !== Object) return obj;
    const result: any = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = this.cleanDoc((obj as any)[key]);
    }
    return result as T;
  }
}
