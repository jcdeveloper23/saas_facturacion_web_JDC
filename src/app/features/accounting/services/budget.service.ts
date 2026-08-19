import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  setDoc, deleteDoc, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { Budget } from '../models/budget.interface';

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/budgets`; }

  // ─── Get single budget by periodId (doc ID = periodId) ───────────────────

  getBudget(periodId: string): Observable<Budget | null> {
    return new Observable<Budget | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${periodId}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Budget : null),
        error: err  => { console.error('[BudgetService] getBudget error:', err); observer.error(err); }
      });
    });
  }

  // ─── Save (upsert) — uses periodId as doc ID ─────────────────────────────

  async saveBudget(budget: Budget): Promise<void> {
    const now = Timestamp.now();
    const ref = doc(this.firestore, `${this.colPath}/${budget.periodId}`);

    const payload = this.cleanDoc<Omit<Budget, 'id'>>({
      periodId:     budget.periodId,
      periodName:   budget.periodName,
      year:         budget.year,
      lines:        budget.lines,
      totalIncome:  budget.totalIncome,
      totalExpense: budget.totalExpense,
      notes:        budget.notes ?? undefined,
      updatedAt:    now,
      createdAt:    budget.createdAt ?? now
    });

    await setDoc(ref, payload, { merge: true });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteBudget(periodId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${periodId}`));
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
}
