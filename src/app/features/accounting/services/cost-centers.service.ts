import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, getDoc,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, where, Timestamp, limit
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

  getActiveCostCenters(): Observable<CostCenter[]> {
    return new Observable<CostCenter[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('isActive', '==', true), orderBy('code', 'asc')),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as CostCenter))),
          error: err  => observer.error(err)
        }
      );
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

  // ─── Check if code exists ─────────────────────────────────────────────────

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath), where('code', '==', code))
    );
    return snap.docs.some(d => d.id !== excludeId);
  }

  // ─── Check if center has sub-centers ──────────────────────────────────────

  async hasChildren(id: string): Promise<boolean> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath), where('parentId', '==', id), limit(1))
    );
    return !snap.empty;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createCostCenter(input: CostCenterCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();

    // Validate: código único
    if (await this.codeExists(input.code)) {
      throw new Error(`Ya existe un centro de costo con el código "${input.code}". Use un código diferente.`);
    }

    // Validate: el centro superior debe existir
    if (input.parentId) {
      const parentSnap = await getDoc(doc(this.firestore, `${this.colPath}/${input.parentId}`));
      if (!parentSnap.exists()) {
        throw new Error(`No existe el centro superior seleccionado. Seleccione uno válido.`);
      }
    }

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

    // Validate: código único al cambiar
    if (changes.code) {
      if (await this.codeExists(changes.code, id)) {
        throw new Error(`Ya existe un centro de costo con el código "${changes.code}". Use un código diferente.`);
      }
    }

    await updateDoc(ref, this.cleanDoc({ ...changes, updatedAt: Timestamp.now(), updatedBy: userId }));
  }

  // ─── Toggle active ────────────────────────────────────────────────────────

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, this.cleanDoc({ isActive, updatedAt: Timestamp.now(), updatedBy: userId }));
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteCostCenter(id: string): Promise<void> {
    // Validate: no eliminar si tiene subcentros
    if (await this.hasChildren(id)) {
      const snap = await getDoc(doc(this.firestore, `${this.colPath}/${id}`));
      const data = snap.data() as CostCenter | undefined;
      const label = data ? `"${data.code} — ${data.name}"` : `id: ${id}`;
      throw new Error(
        `No se puede eliminar el centro ${label}: tiene subcentros dependientes. ` +
        `Elimine primero todos los subcentros.`
      );
    }
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }
}
