import { Injectable, inject, signal } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';

export interface CompanyConfig {
  id: string;
  name: string;
  tradeName?: string;
  taxId: string;
  fiscalAddress?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  defaultCurrency: 'USD' | 'EUR';
  vatRate: number;
  fiscalYear: number;
  plan: 'basic' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  sri: {
    environment: 'testing' | 'production';
    ruc: string;
    businessName: string;
    establishment: string;
    emissionPoint: string;
  };
}

/**
 * TenantService — holds the active company context.
 * companyId comes from Firebase Auth custom claims (set by AuthService).
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private firestore = inject(Firestore);

  private _companyId = signal<string>('');
  private _company = signal<CompanyConfig | null>(null);

  get companyId(): string {
    return this._companyId();
  }

  get company(): CompanyConfig | null {
    return this._company();
  }

  setCompanyId(id: string): void {
    if (!id || id === this._companyId()) return;
    this._companyId.set(id);
    this.loadCompany(id);
  }

  private loadCompany(companyId: string): void {
    const ref = doc(this.firestore, `companies/${companyId}`);
    docData(ref, { idField: 'id' }).subscribe({
      next: (data) => this._company.set(data as CompanyConfig ?? null),
      error: (err) => console.error('[TenantService] Failed to load company:', err)
    });
  }
}
