import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, Timestamp } from '@angular/fire/firestore';
import { orderBy, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
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
    return this.fs.getCollectionQuery<Warehouse>(
      'warehouses',
      where('isActive', '==', true),
      orderBy('name')
    );
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
    return this.fs.getCollectionQuery<DocumentSeries>(
      'document-series',
      where('isActive', '==', true),
      orderBy('documentType'),
      orderBy('code')
    );
  }

  async createDocumentSeries(data: DocumentSeriesFormData): Promise<string> {
    return this.fs.addDocument<DocumentSeriesFormData>('document-series', data);
  }

  async updateDocumentSeries(id: string, data: Partial<DocumentSeriesFormData>): Promise<void> {
    return this.fs.updateDocument<DocumentSeries>('document-series', id, data);
  }

  async deleteDocumentSeries(id: string): Promise<void> {
    return this.fs.softDelete('document-series', id);
  }

  // ─── Payment Terms ────────────────────────────────────────────────────────

  getPaymentTerms(): Observable<PaymentTerm[]> {
    return this.fs.getCollectionQuery<PaymentTerm>(
      'payment-terms',
      where('isActive', '==', true),
      orderBy('days')
    );
  }

  async createPaymentTerm(data: PaymentTermFormData): Promise<string> {
    return this.fs.addDocument<PaymentTermFormData>('payment-terms', data);
  }

  async updatePaymentTerm(id: string, data: Partial<PaymentTermFormData>): Promise<void> {
    return this.fs.updateDocument<PaymentTerm>('payment-terms', id, data);
  }

  async deletePaymentTerm(id: string): Promise<void> {
    return this.fs.softDelete('payment-terms', id);
  }

  // ─── Tax Rates ────────────────────────────────────────────────────────────

  getTaxRates(): Observable<TaxRate[]> {
    return this.fs.getCollectionQuery<TaxRate>(
      'tax-rates',
      where('isActive', '==', true),
      orderBy('rate', 'desc')
    );
  }

  async createTaxRate(data: TaxRateFormData): Promise<string> {
    return this.fs.addDocument<TaxRateFormData>('tax-rates', data);
  }

  async updateTaxRate(id: string, data: Partial<TaxRateFormData>): Promise<void> {
    return this.fs.updateDocument<TaxRate>('tax-rates', id, data);
  }

  async deleteTaxRate(id: string): Promise<void> {
    return this.fs.softDelete('tax-rates', id);
  }

  async setDefaultTaxRate(id: string, allIds: string[]): Promise<void> {
    for (const tid of allIds) {
      await this.fs.updateDocument<TaxRate>('tax-rates', tid, { isDefault: tid === id } as any);
    }
  }

  // ─── Currencies ───────────────────────────────────────────────────────────

  getCurrencies(): Observable<Currency[]> {
    return this.fs.getCollectionQuery<Currency>(
      'currencies',
      where('isActive', '==', true),
      orderBy('code')
    );
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
    return this.fs.getCollectionQuery<Country>(
      'countries',
      where('isActive', '==', true),
      orderBy('name')
    );
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

