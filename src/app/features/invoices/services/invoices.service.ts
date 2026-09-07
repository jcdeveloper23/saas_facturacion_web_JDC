import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, Timestamp, writeBatch,
  runTransaction
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  Invoice, InvoiceLine, InvoiceStatus,
  buildFullNumber, calcLine, calcInvoiceTotals
} from '../models/invoice.interface';

export type InvoiceCreateInput = Omit<Invoice,
  'id' | 'number' | 'fullNumber' | 'createdAt' | 'updatedAt' | 'createdBy'
  | 'grossAmount' | 'discountAmount' | 'netAmount' | 'vatSummary' | 'vatAmount' | 'total'
>;

@Injectable({ providedIn: 'root' })
export class InvoicesService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string { return `companies/${this.companyId}/invoices`; }

  // ─── List ────────────────────────────────────────────────────────────────

  /**
   * Load invoices within a date range.
   * Uses `where('date', '>=', from) + where('date', '<=', to) + orderBy('date', 'desc')`.
   * When `filters.year` is supplied (legacy / full-year mode) it falls back to the
   * old `where('fiscalYear', '==', year) + orderBy('number', 'desc')` query so that
   * existing indexes are reused without extra reads.
   */
  getInvoices(filters: {
    year?: string;
    status?: InvoiceStatus;
    dateFrom?: Timestamp;
    dateTo?:   Timestamp;
  } = {}): Observable<Invoice[]> {
    return new Observable<Invoice[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      let constraints: any[];

      if (filters.dateFrom && filters.dateTo) {
        // Date-range mode — primary path going forward
        constraints = [
          where('date', '>=', filters.dateFrom),
          where('date', '<=', filters.dateTo),
          orderBy('date', 'desc'),
        ];
      } else if (filters.year) {
        // Full-year fallback (legacy)
        constraints = [orderBy('number', 'desc'), where('fiscalYear', '==', filters.year)];
      } else {
        constraints = [orderBy('number', 'desc')];
      }

      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice))),
        error: err  => { console.error('[InvoicesService] getInvoices error:', err); observer.error(err); }
      });
    });
  }

  getInvoice(id: string): Observable<Invoice | null> {
    return new Observable<Invoice | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Invoice : null),
        error: err  => { console.error('[InvoicesService] getInvoice error:', err); observer.error(err); }
      });
    });
  }

  // ─── Firestore safe serialization ────────────────────────────────────────

  /** Firestore rejects `undefined` values — replace them with `null`.
   *  Preserves Timestamp and other class instances (does not JSON-serialize). */
  private cleanDoc<T>(obj: T): T {
    if (obj === undefined) return null as T;
    if (obj === null)      return null as T;
    if (typeof obj !== 'object') return obj;          // string, number, boolean — no Object.keys
    if (Array.isArray(obj)) return obj.map(i => this.cleanDoc(i)) as unknown as T;
    if ((obj as any).constructor !== Object) return obj; // Timestamp, Date, etc.
    const result: any = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = this.cleanDoc((obj as any)[key]);
    }
    return result as T;
  }

  // ─── Create ──────────────────────────────────────────────────────────────

  async createInvoice(input: InvoiceCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const number = await this.nextNumber(input.seriesEstablishment, input.seriesEmissionPoint, input.fiscalYear);
    const fullNumber = buildFullNumber(input.seriesEstablishment, input.seriesEmissionPoint, number);
    const totals = calcInvoiceTotals(input.lines, input.globalDiscountPct);
    const now = Timestamp.now();

    const invoice: Omit<Invoice, 'id'> = {
      ...input,
      number,
      fullNumber,
      ...totals,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(invoice));
    return ref.id;
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  async updateInvoice(id: string, changes: Partial<Omit<Invoice, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    // If lines or globalDiscountPct changed, recalculate totals
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref = doc(this.firestore, `${this.colPath}/${id}`);
    const payload: any = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };

    if (changes.lines !== undefined || changes.globalDiscountPct !== undefined) {
      const snap = await (await import('@angular/fire/firestore')).getDoc(ref);
      const current = snap.data() as Invoice;
      const lines   = changes.lines ?? current.lines;
      const disc    = changes.globalDiscountPct ?? current.globalDiscountPct;
      Object.assign(payload, calcInvoiceTotals(lines, disc));
    }

    await updateDoc(ref, this.cleanDoc(payload));
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  async markIssued(id: string): Promise<void> {
    await this.updateInvoice(id, { status: 'issued', isVoid: false, isPaid: false });
  }

  async markPaid(id: string, bankAccountId: string, date: string): Promise<void> {
    const update: Record<string, any> = {
      status: 'paid',
      isPaid: true,
      paidAt: Timestamp.fromDate(new Date(date + 'T00:00:00')),
    };
    if (bankAccountId) update['paymentBankAccountId'] = bankAccountId;
    await this.updateInvoice(id, update);
  }

  async markVoid(id: string): Promise<void> {
    await this.updateInvoice(id, { status: 'void', isVoid: true, voidedAt: Timestamp.now() });
  }

  // ─── Delete (draft only) ─────────────────────────────────────────────────

  async deleteInvoice(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }

  // ─── Auto-increment number per establishment+emissionPoint+year (atomic) ────
  //
  // Uses a counter document at companies/{companyId}/counters/invoices
  // with one field per estab_pto_year key, e.g. { "001_001_2025": 12 }.
  // Key includes establishment and emission point to support multi-establishment
  // companies where each point of sale has an independent sequential counter.
  // runTransaction ensures no two concurrent creates can read the same value.

  private async nextNumber(estab: string, pto: string, fiscalYear: string): Promise<number> {
    const key        = `${estab}_${pto}_${fiscalYear}`;
    const counterRef = doc(this.firestore, `companies/${this.companyId}/counters/invoices`);

    return runTransaction(this.firestore, async tx => {
      const snap    = await tx.get(counterRef);
      const current = (snap.data()?.[key] as number) ?? 0;
      const next    = current + 1;
      tx.set(counterRef, { [key]: next }, { merge: true });
      return next;
    });
  }
}
