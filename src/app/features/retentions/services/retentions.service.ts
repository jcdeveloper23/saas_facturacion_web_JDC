import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, runTransaction
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  Retention, RetentionStatus, buildRetentionFullNumber
} from '../models/retention.interface';

export type RetentionCreateInput = Omit<Retention,
  'id' | 'number' | 'fullNumber' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

@Injectable({ providedIn: 'root' })
export class RetentionsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/retentions`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getRetentions(filters: { year?: string; status?: RetentionStatus } = {}): Observable<Retention[]> {
    return new Observable<Retention[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      const constraints: any[] = [orderBy('date', 'desc')];
      if (filters.year)   constraints.unshift(where('fiscalYear', '==', filters.year));
      if (filters.status) constraints.unshift(where('status',    '==', filters.status));
      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Retention))),
        error: err  => observer.error(err),
      });
    });
  }

  getRetention(id: string): Observable<Retention | null> {
    return new Observable<Retention | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Retention : null),
        error: err  => observer.error(err),
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

  // ─── Create ───────────────────────────────────────────────────────────────

  async createRetention(input: RetentionCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const number = await this.nextNumber(input.seriesEstablishment, input.seriesEmissionPoint, input.fiscalYear);
    const fullNumber = buildRetentionFullNumber(
      input.seriesEstablishment, input.seriesEmissionPoint, number
    );
    const now = Timestamp.now();

    const retention: Omit<Retention, 'id'> = {
      ...input,
      number,
      fullNumber,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(retention));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateRetention(
    id: string,
    changes: Partial<Omit<Retention, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({
      ...changes,
      updatedAt: Timestamp.now(),
      updatedBy: userId,
    }));
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  async markIssued(id: string): Promise<void> {
    await this.updateRetention(id, { status: 'issued', isVoid: false });
  }

  async markVoid(id: string): Promise<void> {
    await this.updateRetention(id, {
      status: 'void', isVoid: true, voidedAt: Timestamp.now()
    });
  }

  // ─── Delete (draft only) ─────────────────────────────────────────────────

  async deleteRetention(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }

  // ─── Auto-increment counter (atomic) ─────────────────────────────────────

  private async nextNumber(estab: string, pto: string, fiscalYear: string): Promise<number> {
    const key        = `${estab}_${pto}_${fiscalYear}`;
    const counterRef = doc(this.firestore, `companies/${this.companyId}/counters/retentions`);

    return runTransaction(this.firestore, async tx => {
      const snap    = await tx.get(counterRef);
      const current = (snap.data()?.[key] as number) ?? 0;
      const next    = current + 1;
      tx.set(counterRef, { [key]: next }, { merge: true });
      return next;
    });
  }
}
