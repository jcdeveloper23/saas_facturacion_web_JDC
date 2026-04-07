import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, Timestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FirestoreService } from '../../../core/services/firestore.service';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  CompanySettings,
  Warehouse, WarehouseFormData,
  DocumentSeries, DocumentSeriesFormData,
  PaymentTerm, PaymentTermFormData,
  TaxRate, TaxRateFormData,
  Currency, CurrencyFormData,
  Country, CountryFormData
} from '../models/settings.interfaces';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private fs = inject(FirestoreService);
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);

  // ─── Company Settings (single document) ──────────────────────────────────

  getCompanySettings(): Observable<CompanySettings | undefined> {
    return this.fs.getDocument<CompanySettings>('configuration', 'general');
  }

  async saveCompanySettings(data: Partial<CompanySettings>): Promise<void> {
    const companyId = this.tenantService.companyId;
    const ref = doc(this.firestore, `companies/${companyId}/configuration/general`);
    await setDoc(ref, {
      ...data,
      updatedAt: Timestamp.now(),
      updatedBy: this.authService.user()?.uid ?? ''
    }, { merge: true });
  }

  // ─── Warehouses ───────────────────────────────────────────────────────────

  getWarehouses(): Observable<Warehouse[]> {
    return this.fs.getCollection<Warehouse>('warehouses')
      .pipe(map(list =>
        list
          .filter(w => w.isActive !== false)
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      ));
  }

  async createWarehouse(data: WarehouseFormData): Promise<string> {
    return this.fs.addDocument<WarehouseFormData>('warehouses', data);
  }

  async updateWarehouse(id: string, data: Partial<WarehouseFormData>): Promise<void> {
    return this.fs.updateDocument<Warehouse>('warehouses', id, data);
  }

  async deleteWarehouse(id: string): Promise<void> {
    return this.fs.softDelete('warehouses', id);
  }

  // ─── Document Series ──────────────────────────────────────────────────────

  getDocumentSeries(): Observable<DocumentSeries[]> {
    return this.fs.getCollection<DocumentSeries>('documentSeries')
      .pipe(map(list =>
        list
          .filter(s => s.isActive !== false)
          .sort((a, b) =>
            a.documentType.localeCompare(b.documentType, 'es') ||
            a.code.localeCompare(b.code, 'es')
          )
      ));
  }

  async createDocumentSeries(data: DocumentSeriesFormData): Promise<string> {
    return this.fs.addDocument<DocumentSeriesFormData>('documentSeries', data);
  }

  async updateDocumentSeries(id: string, data: Partial<DocumentSeriesFormData>): Promise<void> {
    return this.fs.updateDocument<DocumentSeries>('documentSeries', id, data);
  }

  async deleteDocumentSeries(id: string): Promise<void> {
    return this.fs.softDelete('documentSeries', id);
  }

  // ─── Payment Terms ────────────────────────────────────────────────────────

  getPaymentTerms(): Observable<PaymentTerm[]> {
    return this.fs.getCollection<PaymentTerm>('paymentTerms')
      .pipe(map(list =>
        list
          .filter(p => p.isActive !== false)
          .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
      ));
  }

  async createPaymentTerm(data: PaymentTermFormData): Promise<string> {
    return this.fs.addDocument<PaymentTermFormData>('paymentTerms', data);
  }

  async updatePaymentTerm(id: string, data: Partial<PaymentTermFormData>): Promise<void> {
    return this.fs.updateDocument<PaymentTerm>('paymentTerms', id, data);
  }

  async deletePaymentTerm(id: string): Promise<void> {
    return this.fs.softDelete('paymentTerms', id);
  }

  // ─── Tax Rates ────────────────────────────────────────────────────────────

  getTaxRates(): Observable<TaxRate[]> {
    return this.fs.getCollection<TaxRate>('taxRates')
      .pipe(map(list =>
        list
          .filter(t => t.isActive !== false)   // include docs with missing isActive field
          .sort((a, b) => b.rate - a.rate)
      ));
  }

  async createTaxRate(data: TaxRateFormData): Promise<string> {
    return this.fs.addDocument<TaxRateFormData>('taxRates', data);
  }

  async updateTaxRate(id: string, data: Partial<TaxRateFormData>): Promise<void> {
    return this.fs.updateDocument<TaxRate>('taxRates', id, data);
  }

  async deleteTaxRate(id: string): Promise<void> {
    return this.fs.softDelete('taxRates', id);
  }

  async setDefaultTaxRate(id: string, allIds: string[]): Promise<void> {
    for (const tid of allIds) {
      await this.fs.updateDocument<TaxRate>('taxRates', tid, { isDefault: tid === id } as any);
    }
  }

  // ─── Currencies ───────────────────────────────────────────────────────────

  getCurrencies(): Observable<Currency[]> {
    return this.fs.getCollection<Currency>('currencies')
      .pipe(map(list =>
        list
          .filter(c => c.isActive !== false)
          .sort((a, b) => a.code.localeCompare(b.code))
      ));
  }

  async createCurrency(data: CurrencyFormData): Promise<string> {
    return this.fs.addDocument<CurrencyFormData>('currencies', data);
  }

  async updateCurrency(id: string, data: Partial<CurrencyFormData>): Promise<void> {
    return this.fs.updateDocument<Currency>('currencies', id, data);
  }

  async deleteCurrency(id: string): Promise<void> {
    return this.fs.softDelete('currencies', id);
  }

  // ─── Countries ────────────────────────────────────────────────────────────

  getCountries(): Observable<Country[]> {
    return this.fs.getCollection<Country>('countries')
      .pipe(map(list =>
        list
          .filter(c => c.isActive !== false)
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      ));
  }

  async createCountry(data: CountryFormData): Promise<string> {
    return this.fs.addDocument<CountryFormData>('countries', data);
  }

  async updateCountry(id: string, data: Partial<CountryFormData>): Promise<void> {
    return this.fs.updateDocument<Country>('countries', id, data);
  }

  async deleteCountry(id: string): Promise<void> {
    return this.fs.softDelete('countries', id);
  }
}

