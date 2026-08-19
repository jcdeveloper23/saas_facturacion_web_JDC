import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, query, orderBy, where, Timestamp, getDocs
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { AccountingPeriod, AccountingPeriodStatus } from '../models/accounting-period.interface';

export type PeriodCreateInput = Omit<AccountingPeriod,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

@Injectable({ providedIn: 'root' })
export class AccountingPeriodsService {
  private firestore     = inject(Firestore);
  private functions     = inject(Functions);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/accounting_periods`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getPeriods(): Observable<AccountingPeriod[]> {
    return new Observable<AccountingPeriod[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('year', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingPeriod))),
        error: err  => { console.error('[AccountingPeriodsService] getPeriods error:', err); observer.error(err); }
      });
    });
  }

  getPeriod(id: string): Observable<AccountingPeriod | null> {
    return new Observable<AccountingPeriod | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as AccountingPeriod : null),
        error: err  => observer.error(err)
      });
    });
  }

  async getOpenPeriod(): Promise<AccountingPeriod | null> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath), where('status', '==', 'open'))
    );
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as AccountingPeriod;
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

  // ─── Create ───────────────────────────────────────────────────────────────

  async createPeriod(input: PeriodCreateInput): Promise<string> {
    // Guard: no two 'open' periods for the same year
    if (input.status === 'open') {
      const existing = await getDocs(
        query(
          collection(this.firestore, this.colPath),
          where('year',   '==', input.year),
          where('status', '==', 'open')
        )
      );
      if (!existing.empty) {
        throw new Error(`Ya existe un ejercicio abierto para el año ${input.year}. Ciérrelo antes de crear uno nuevo.`);
      }
    }

    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();

    const period: Omit<AccountingPeriod, 'id'> = {
      ...input,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(period));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updatePeriod(id: string, changes: Partial<Omit<AccountingPeriod, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({ ...changes, updatedAt: Timestamp.now(), updatedBy: userId }));
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  async closePeriod(id: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'closeAccountingPeriod');
    await fn({ companyId: this.companyId, periodId: id });
  }

  async generateOpeningEntry(newPeriodId: string): Promise<{ entryId: string; message: string }> {
    const fn = httpsCallable<{ companyId: string; newPeriodId: string }, { entryId: string; message: string }>(
      this.functions, 'generateOpeningEntry'
    );
    const result = await fn({ companyId: this.companyId, newPeriodId });
    return result.data;
  }

  async lockPeriod(id: string): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    await this.updatePeriod(id, {
      status:   'locked',
      lockedAt: Timestamp.now(),
      lockedBy: userId
    });
  }

  async reopenPeriod(id: string): Promise<void> {
    await this.updatePeriod(id, {
      status:    'open',
      closedAt:  undefined as any,
      closedBy:  undefined as any,
      lockedAt:  undefined as any,
      lockedBy:  undefined as any
    });
  }
}
