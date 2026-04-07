import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, Timestamp,
  limit, query, getDocs, where
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { FirestoreService } from '../../../core/services/firestore.service';
import { TenantService }    from '../../../core/services/tenant.service';
import {
  Person, PersonRole, CustomerData, SupplierData, EmployeeData
} from '../models/person.interface';

// Payload types for create/update (codes are managed by the service on create)
export type CustomerDataInput = Omit<CustomerData, 'code'>;
export type SupplierDataInput = Omit<SupplierData, 'code'>;
export type EmployeeDataInput = Omit<EmployeeData, 'code'>;

export type PersonCreateInput = Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & {
  customerData?: CustomerDataInput;
  supplierData?: SupplierDataInput;
  employeeData?: EmployeeDataInput;
};

export type PersonUpdateInput = Omit<Person, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class PersonasService {
  private fs            = inject(FirestoreService);
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  // ─── Read ─────────────────────────────────────────────────────────────────

  getPersonas(roleFilter?: PersonRole | null): Observable<Person[]> {
    // Note: no orderBy in Firestore to avoid composite index requirement.
    // Sorting is done client-side in the list component.
    if (roleFilter) {
      return this.fs.getCollectionQuery<Person>(
        'personas',
        where('roles', 'array-contains', roleFilter)
      );
    }
    return this.fs.getCollection<Person>('personas');
  }

  async getPerson(id: string): Promise<Person | null> {
    return this.fs.getDocumentOnce<Person>('personas', id);
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async createPerson(data: PersonCreateInput): Promise<string> {
    const companyId = this.tenantService.companyId;
    const now       = Timestamp.now();

    // Generate independent codes per active role
    const customerCode = data.roles.includes('customer') ? await this.nextCode('customer') : undefined;
    const supplierCode = data.roles.includes('supplier') ? await this.nextCode('supplier') : undefined;
    const employeeCode = data.roles.includes('employee') ? await this.nextCode('employee') : undefined;

    const payload: any = {
      ...this.clean(data),
      isActive:  data.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };

    // Inject generated codes into role data
    if (data.customerData && customerCode) {
      payload.customerData = this.clean({ ...data.customerData, code: customerCode });
    }
    if (data.supplierData && supplierCode) {
      payload.supplierData = this.clean({ ...data.supplierData, code: supplierCode });
    }
    if (data.employeeData && employeeCode) {
      payload.employeeData = this.clean({ ...data.employeeData, code: employeeCode });
    }

    const ref    = collection(this.firestore, `companies/${companyId}/personas`);
    const docRef = await addDoc(ref, payload);
    return docRef.id;
  }

  async updatePerson(id: string, data: PersonUpdateInput): Promise<void> {
    return this.fs.updateDocument<Person>('personas', id, this.clean(data) as any);
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    return this.fs.updateDocument<Person>('personas', id, { isActive } as any);
  }

  async deletePerson(id: string): Promise<void> {
    return this.fs.softDelete('personas', id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Removes undefined, null, and empty-string values.
   * Recurses into plain objects (for role data sub-objects).
   * Preserves false, 0, and Timestamp objects.
   */
  private clean<T extends object>(obj: T): Partial<T> {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'object' && item !== null ? this.clean(item) : item
        );
        continue;
      }
      // Recurse into plain objects, skip Timestamps and Dates
      if (
        typeof value === 'object' &&
        !('seconds' in (value as any)) &&
        !(value instanceof Date)
      ) {
        const nested = this.clean(value as object);
        if (Object.keys(nested).length > 0) result[key] = nested;
        continue;
      }
      result[key] = value;
    }
    return result as Partial<T>;
  }

  /**
   * Generates the next sequential code for a given role.
   * Queries all personas with that role and finds the max code in memory.
   * Each role maintains an independent sequence: customerData.code, supplierData.code, etc.
   */
  private async nextCode(role: PersonRole): Promise<string> {
    const companyId = this.tenantService.companyId;
    const ref = collection(this.firestore, `companies/${companyId}/personas`);
    const q   = query(ref, where('roles', 'array-contains', role), limit(500));
    const snap = await getDocs(q);

    let max = 0;
    for (const docSnap of snap.docs) {
      const d = docSnap.data() as any;
      let codeStr = '0';
      if (role === 'customer') codeStr = d.customerData?.code ?? '0';
      if (role === 'supplier') codeStr = d.supplierData?.code ?? '0';
      if (role === 'employee') codeStr = d.employeeData?.code ?? '0';
      const n = parseInt(codeStr, 10);
      if (!isNaN(n) && n > max) max = n;
    }

    return String(max + 1).padStart(6, '0');
  }
}
