import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, Timestamp,
  orderBy, limit, query, getDocs, doc, getDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { FirestoreService } from '../../../core/services/firestore.service';
import { TenantService }    from '../../../core/services/tenant.service';
import { Customer, CustomerInput } from '../models/customer.interface';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private fs            = inject(FirestoreService);
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  // ─── Read ─────────────────────────────────────────────────────────────────

  getCustomers(): Observable<Customer[]> {
    return this.fs.getCollectionQuery<Customer>('customers', orderBy('code'));
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const companyId = this.tenantService.companyId;
    const ref  = doc(this.firestore, `companies/${companyId}/customers/${id}`);
    const snap = await getDoc(ref);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Customer) : null;
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async createCustomer(data: CustomerInput): Promise<string> {
    const code      = await this.nextCode();
    const companyId = this.tenantService.companyId;
    const now       = Timestamp.now();
    const ref       = collection(this.firestore, `companies/${companyId}/customers`);
    const docRef    = await addDoc(ref, {
      ...this.clean(data),
      code,
      isActive:  data.isActive ?? true,
      createdAt: now,
      updatedAt: now
    });
    return docRef.id;
  }

  async updateCustomer(id: string, data: Partial<CustomerInput>): Promise<void> {
    return this.fs.updateDocument<Customer>('customers', id, this.clean(data) as any);
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    return this.fs.updateDocument<Customer>('customers', id, { isActive } as any);
  }

  async deleteCustomer(id: string): Promise<void> {
    return this.fs.softDelete('customers', id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Removes undefined, null and empty-string values from an object so
   * Firestore never receives "Unsupported field value: undefined".
   * Keeps false and 0 (valid Firestore values).
   */
  private clean<T extends object>(obj: T): Partial<T> {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      // Recurse into plain arrays (addresses, bankAccounts)
      if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'object' && item !== null ? this.clean(item) : item
        );
        continue;
      }
      result[key] = value;
    }
    return result as Partial<T>;
  }

  private async nextCode(): Promise<string> {
    const companyId = this.tenantService.companyId;
    const ref  = collection(this.firestore, `companies/${companyId}/customers`);
    const q    = query(ref, orderBy('code', 'desc'), limit(1));
    const snap = await getDocs(q);
    const last = snap.empty ? 0 : parseInt((snap.docs[0].data() as any)['code'] ?? '0', 10);
    return String(last + 1).padStart(6, '0');
  }
}
