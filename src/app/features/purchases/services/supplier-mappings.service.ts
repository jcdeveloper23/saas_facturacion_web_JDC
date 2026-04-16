import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, where, getDocs, Timestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { SupplierProductMapping } from '../models/supplier-mapping.interface';

export type MappingCreateInput = Omit<SupplierProductMapping,
  'id' | 'createdAt' | 'updatedAt'
>;

@Injectable({ providedIn: 'root' })
export class SupplierMappingsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath():   string { return `companies/${this.companyId}/supplier-product-mappings`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<SupplierProductMapping[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SupplierProductMapping)),
        error: err  => observer.error(err),
      });
    });
  }

  // ─── Find single mapping by supplierId + supplierSku ─────────────────────

  async findMapping(
    supplierId: string,
    supplierSku: string,
  ): Promise<SupplierProductMapping | null> {
    const skuNorm = supplierSku.trim().toUpperCase();
    if (!supplierId || !skuNorm) return null;

    const ref  = collection(this.firestore, this.colPath);
    const snap = await getDocs(query(
      ref,
      where('supplierId',  '==', supplierId),
      where('supplierSku', '==', skuNorm),
    ));

    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as SupplierProductMapping;
  }

  // ─── Find multiple mappings for a supplier in one shot ────────────────────

  async findMappingsBySupplier(supplierId: string): Promise<Map<string, SupplierProductMapping>> {
    const ref  = collection(this.firestore, this.colPath);
    const snap = await getDocs(query(ref, where('supplierId', '==', supplierId)));
    const map  = new Map<string, SupplierProductMapping>();
    snap.docs.forEach(d => {
      const m = { id: d.id, ...d.data() } as SupplierProductMapping;
      map.set(m.supplierSku, m);
    });
    return map;
  }

  // ─── Save (upsert by supplierId + supplierSku) ────────────────────────────

  async save(input: MappingCreateInput): Promise<string> {
    const skuNorm  = input.supplierSku.trim().toUpperCase();
    const existing = await this.findMapping(input.supplierId, skuNorm);
    const now      = Timestamp.now();

    if (existing) {
      const ref = doc(this.firestore, `${this.colPath}/${existing.id}`);
      await updateDoc(ref, {
        productId:   input.productId,
        productName: input.productName,
        productSku:  input.productSku,
        supplierDescription: input.supplierDescription,
        updatedAt:   now,
      });
      return existing.id;
    }

    const docRef = await addDoc(collection(this.firestore, this.colPath), {
      ...input,
      supplierSku: skuNorm,
      createdAt:   now,
      updatedAt:   now,
    });
    return docRef.id;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }
}
