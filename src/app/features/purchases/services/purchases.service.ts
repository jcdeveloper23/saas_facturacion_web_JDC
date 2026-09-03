import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc,
  query, orderBy, where, Timestamp, runTransaction
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  Purchase, PurchaseStatus,
  buildPurchaseFullNumber
} from '../models/purchase.interface';

export type PurchaseCreateInput = Omit<Purchase,
  'id' | 'number' | 'fullNumber' | 'createdAt' | 'updatedAt' | 'createdBy' | 'stockProcessed'
>;

@Injectable({ providedIn: 'root' })
export class PurchasesService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/purchases`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<Purchase[]> {
    return new Observable<Purchase[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('date', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Purchase)),
        error: err  => observer.error(err),
      });
    });
  }

  getById(id: string): Observable<Purchase | undefined> {
    return new Observable<Purchase | undefined>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Purchase : undefined),
        error: err  => observer.error(err),
      });
    });
  }

  getByStatus(status: PurchaseStatus): Observable<Purchase[]> {
    return new Observable<Purchase[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, where('status', '==', status), orderBy('date', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Purchase)),
        error: err  => observer.error(err),
      });
    });
  }

  getBySupplier(supplierId: string): Observable<Purchase[]> {
    return new Observable<Purchase[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, where('supplierId', '==', supplierId), orderBy('date', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Purchase)),
        error: err  => observer.error(err),
      });
    });
  }

  /**
   * Load purchases within an optional date range and/or status filter.
   * When dateFrom + dateTo are provided, uses Firestore range query on `date`.
   * Client-side filtering by supplier/costCenter/status is done in the component.
   */
  getPurchases(filters: {
    dateFrom?: Timestamp;
    dateTo?:   Timestamp;
    status?:   PurchaseStatus;
  } = {}): Observable<Purchase[]> {
    return new Observable<Purchase[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      let constraints: any[];

      if (filters.dateFrom && filters.dateTo) {
        constraints = [
          where('date', '>=', filters.dateFrom),
          where('date', '<=', filters.dateTo),
          orderBy('date', 'desc'),
        ];
      } else if (filters.status) {
        constraints = [where('status', '==', filters.status), orderBy('date', 'desc')];
      } else {
        constraints = [orderBy('date', 'desc')];
      }

      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Purchase)),
        error: err  => { console.error('[PurchasesService] getPurchases error:', err); observer.error(err); }
      });
    });
  }

  // ─── Firestore safe serialization ─────────────────────────────────────────

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

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(input: PurchaseCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const number = await this.nextNumber(input.serie, input.year);
    const fullNumber = buildPurchaseFullNumber(input.serie, input.year, number);
    const now = Timestamp.now();

    const purchase: Omit<Purchase, 'id'> = {
      ...input,
      number,
      fullNumber,
      stockProcessed: false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(purchase));
    return ref.id;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    changes: Partial<Omit<Purchase, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({
      ...changes,
      updatedAt: Timestamp.now(),
      updatedBy: userId,
    }));
  }

  // ─── Status transitions ────────────────────────────────────────────────────

  async markSent(id: string): Promise<void> {
    await this.update(id, { status: 'sent' });
  }

  async markReceived(id: string): Promise<void> {
    await this.update(id, { status: 'received' });
  }

  async markPaid(id: string, bankAccountId: string, date: string): Promise<void> {
    const update: Record<string, any> = {
      status: 'paid',
      isPaid: true,
      paidAt: Timestamp.fromDate(new Date(date + 'T00:00:00')),
    };
    if (bankAccountId) update['paymentBankAccountId'] = bankAccountId;
    await this.update(id, update);
  }

  async cancel(id: string): Promise<void> {
    await this.update(id, { status: 'cancelled', isVoid: true, voidedAt: Timestamp.now() });
  }

  // ─── Auto-increment counter (atomic) ──────────────────────────────────────

  private async nextNumber(serie: string, year: number): Promise<number> {
    const key        = `${serie}_${year}`;
    const counterRef = doc(this.firestore, `companies/${this.companyId}/counters/purchases`);

    return runTransaction(this.firestore, async tx => {
      const snap    = await tx.get(counterRef);
      const current = (snap.data()?.[key] as number) ?? 0;
      const next    = current + 1;
      tx.set(counterRef, { [key]: next }, { merge: true });
      return next;
    });
  }

  // ─── Peek next number (read-only, no transaction) ─────────────────────────

  async peekNextNumber(serie: string, year: number): Promise<number> {
    const key        = `${serie}_${year}`;
    const counterRef = doc(this.firestore, `companies/${this.companyId}/counters/purchases`);
    return runTransaction(this.firestore, async tx => {
      const snap = await tx.get(counterRef);
      return ((snap.data()?.[key] as number) ?? 0) + 1;
    });
  }
}
