import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { CostCenter } from '../models/cost-center.interface';

export type CostCenterCreateInput = Omit<CostCenter,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

@Injectable({ providedIn: 'root' })
export class CostCentersService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/cost_centers`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getCostCenters(): Observable<CostCenter[]> {
    return new Observable<CostCenter[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('code', 'asc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as CostCenter))),
        error: err  => { console.error('[CostCentersService] getCostCenters error:', err); observer.error(err); }
      });
    });
  }

  getCostCenter(id: string): Observable<CostCenter | null> {
    return new Observable<CostCenter | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as CostCenter : null),
        error: err  => observer.error(err)
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

  async createCostCenter(input: CostCenterCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();

    const cc: Omit<CostCenter, 'id'> = {
      ...input,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(cc));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateCostCenter(id: string, changes: Partial<Omit<CostCenter, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({ ...changes, updatedAt: Timestamp.now(), updatedBy: userId }));
  }

  // ─── Toggle active ────────────────────────────────────────────────────────

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.updateCostCenter(id, { isActive });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteCostCenter(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }
}
