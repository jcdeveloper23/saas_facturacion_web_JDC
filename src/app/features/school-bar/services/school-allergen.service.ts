import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, query, where, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { SchoolAllergen, ALLERGEN_SEED_NAMES } from '../models/school-allergen.interface';

@Injectable({ providedIn: 'root' })
export class SchoolAllergenService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private get companyId():     string { return this.tenantService.companyId; }
  private get allergensPath(): string { return `companies/${this.companyId}/school_allergens`; }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /** Todos los alérgenos del tenant, ordenados por nombre */
  getAllergens(): Observable<SchoolAllergen[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.allergensPath);
      return onSnapshot(
        query(ref, where('companyId', '==', this.companyId), orderBy('name', 'asc')),
        {
          next: snap => observer.next(
            snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolAllergen)
          ),
          error: err => { console.error('[SchoolAllergenService]', err); observer.error(err); }
        }
      );
    });
  }

  /** Solo los alérgenos activos (state=true), para mostrar en selectores */
  getActiveAllergens(): Observable<SchoolAllergen[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.allergensPath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('state', '==', true),
          orderBy('name', 'asc')
        ),
        {
          next: snap => observer.next(
            snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolAllergen)
          ),
          error: err => observer.error(err)
        }
      );
    });
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async createAllergen(name: string, isDefault = false): Promise<string> {
    const now = Timestamp.now();
    const ref = await addDoc(collection(this.firestore, this.allergensPath), {
      companyId: this.companyId,
      name:      name.trim(),
      isDefault,
      state:     true,
      order:     0,
      createdAt: now,
      updatedAt: now
    });
    return ref.id;
  }

  async updateAllergen(id: string, changes: Partial<Pick<SchoolAllergen, 'name' | 'isDefault' | 'state'>>): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.allergensPath}/${id}`),
      { ...changes, updatedAt: Timestamp.now() }
    );
  }

  async deleteAllergen(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.allergensPath}/${id}`));
  }

  // ─── Seed ──────────────────────────────────────────────────────────────────

  /**
   * Crea los alérgenos del seed que aún no existen en el catálogo.
   * Seguro de llamar múltiples veces (idempotente por nombre).
   */
  async seedDefaultAllergens(existing: SchoolAllergen[]): Promise<number> {
    const existingNames = new Set(existing.map(a => a.name.trim().toLowerCase()));
    const missing = ALLERGEN_SEED_NAMES.filter(n => !existingNames.has(n.toLowerCase()));
    for (const name of missing) {
      await this.createAllergen(name, false);
    }
    return missing.length;
  }
}
