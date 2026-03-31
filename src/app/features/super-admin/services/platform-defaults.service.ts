import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection, doc,
  onSnapshot,
  setDoc, addDoc, updateDoc, deleteDoc,
  Timestamp, writeBatch
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import {
  PlatformConfig,
  DefaultTaxRate, DefaultPaymentTerm, DefaultDocumentSeries, DefaultWarehouse,
  DefaultCurrency, DefaultCountry
} from '../models/platform-defaults.interface';
import { SEED_CURRENCIES, SEED_COUNTRIES } from './platform-seed.constants';

const DEFAULTS_DOC = 'platform/defaults';
const sub = (name: string) => `${DEFAULTS_DOC}/${name}`;

/**
 * PlatformDefaultsService
 *
 * Manages /platform/defaults and its sub-collections.
 * Only accessible to super_admin.
 *
 * Firestore structure:
 *   /platform/defaults            ← PlatformConfig (country, currency, vatRate)
 *   /platform/defaults/taxRates/{id}
 *   /platform/defaults/paymentTerms/{id}
 *   /platform/defaults/documentSeries/{id}
 *   /platform/defaults/warehouses/{id}
 *
 * Uses onSnapshot directly (same pattern as FirestoreService) to avoid
 * collectionData/docData type-mismatch issues with some AngularFire versions.
 */
@Injectable({ providedIn: 'root' })
export class PlatformDefaultsService {
  private fs = inject(Firestore);

  // ── Config General ──────────────────────────────────────────────────

  getConfig(): Observable<PlatformConfig | undefined> {
    return new Observable(observer => {
      const ref = doc(this.fs, DEFAULTS_DOC);
      return onSnapshot(ref, {
        next: snap => {
          console.log('[PlatformDefaults] config snapshot:', snap.exists() ? snap.data() : 'no doc');
          observer.next(snap.exists() ? (snap.data() as PlatformConfig) : undefined);
        },
        error: err => {
          console.error('[PlatformDefaults] getConfig error:', err);
          observer.error(err);
        }
      });
    });
  }

  async saveConfig(data: PlatformConfig): Promise<void> {
    console.log('[PlatformDefaults] saveConfig:', data);
    await setDoc(doc(this.fs, DEFAULTS_DOC), { ...data, updatedAt: Timestamp.now() }, { merge: true });
  }

  // ── Tax Rates ────────────────────────────────────────────────────────

  getTaxRates(): Observable<DefaultTaxRate[]> {
    return new Observable(observer => {
      const ref = collection(this.fs, sub('taxRates'));
      return onSnapshot(ref, {
        next: snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as DefaultTaxRate);
          console.log('[PlatformDefaults] taxRates snapshot:', items.length, 'items');
          observer.next(items);
        },
        error: err => {
          console.error('[PlatformDefaults] getTaxRates error:', err);
          observer.error(err);
        }
      });
    });
  }

  async addTaxRate(data: Omit<DefaultTaxRate, 'id'>): Promise<void> {
    const now = Timestamp.now();
    console.log('[PlatformDefaults] addTaxRate:', data);
    await addDoc(collection(this.fs, sub('taxRates')), { ...data, createdAt: now, updatedAt: now });
  }

  async updateTaxRate(id: string, data: Partial<Omit<DefaultTaxRate, 'id'>>): Promise<void> {
    console.log('[PlatformDefaults] updateTaxRate:', id, data);
    await updateDoc(doc(this.fs, `${sub('taxRates')}/${id}`), { ...data, updatedAt: Timestamp.now() });
  }

  async deleteTaxRate(id: string): Promise<void> {
    console.log('[PlatformDefaults] deleteTaxRate:', id);
    await deleteDoc(doc(this.fs, `${sub('taxRates')}/${id}`));
  }

  // ── Payment Terms ─────────────────────────────────────────────────────

  getPaymentTerms(): Observable<DefaultPaymentTerm[]> {
    return new Observable(observer => {
      const ref = collection(this.fs, sub('paymentTerms'));
      return onSnapshot(ref, {
        next: snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as DefaultPaymentTerm);
          console.log('[PlatformDefaults] paymentTerms snapshot:', items.length, 'items');
          observer.next(items);
        },
        error: err => {
          console.error('[PlatformDefaults] getPaymentTerms error:', err);
          observer.error(err);
        }
      });
    });
  }

  async addPaymentTerm(data: Omit<DefaultPaymentTerm, 'id'>): Promise<void> {
    const now = Timestamp.now();
    console.log('[PlatformDefaults] addPaymentTerm:', data);
    await addDoc(collection(this.fs, sub('paymentTerms')), { ...data, createdAt: now, updatedAt: now });
  }

  async updatePaymentTerm(id: string, data: Partial<Omit<DefaultPaymentTerm, 'id'>>): Promise<void> {
    console.log('[PlatformDefaults] updatePaymentTerm:', id, data);
    await updateDoc(doc(this.fs, `${sub('paymentTerms')}/${id}`), { ...data, updatedAt: Timestamp.now() });
  }

  async deletePaymentTerm(id: string): Promise<void> {
    console.log('[PlatformDefaults] deletePaymentTerm:', id);
    await deleteDoc(doc(this.fs, `${sub('paymentTerms')}/${id}`));
  }

  // ── Document Series ───────────────────────────────────────────────────

  getDocumentSeries(): Observable<DefaultDocumentSeries[]> {
    return new Observable(observer => {
      const ref = collection(this.fs, sub('documentSeries'));
      return onSnapshot(ref, {
        next: snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as DefaultDocumentSeries);
          console.log('[PlatformDefaults] documentSeries snapshot:', items.length, 'items');
          observer.next(items);
        },
        error: err => {
          console.error('[PlatformDefaults] getDocumentSeries error:', err);
          observer.error(err);
        }
      });
    });
  }

  async addDocumentSeries(data: Omit<DefaultDocumentSeries, 'id'>): Promise<void> {
    const now = Timestamp.now();
    console.log('[PlatformDefaults] addDocumentSeries:', data);
    await addDoc(collection(this.fs, sub('documentSeries')), { ...data, createdAt: now, updatedAt: now });
  }

  async updateDocumentSeries(id: string, data: Partial<Omit<DefaultDocumentSeries, 'id'>>): Promise<void> {
    console.log('[PlatformDefaults] updateDocumentSeries:', id, data);
    await updateDoc(doc(this.fs, `${sub('documentSeries')}/${id}`), { ...data, updatedAt: Timestamp.now() });
  }

  async deleteDocumentSeries(id: string): Promise<void> {
    console.log('[PlatformDefaults] deleteDocumentSeries:', id);
    await deleteDoc(doc(this.fs, `${sub('documentSeries')}/${id}`));
  }

  // ── Warehouses ────────────────────────────────────────────────────────

  getWarehouses(): Observable<DefaultWarehouse[]> {
    return new Observable(observer => {
      const ref = collection(this.fs, sub('warehouses'));
      return onSnapshot(ref, {
        next: snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as DefaultWarehouse);
          console.log('[PlatformDefaults] warehouses snapshot:', items.length, 'items');
          observer.next(items);
        },
        error: err => {
          console.error('[PlatformDefaults] getWarehouses error:', err);
          observer.error(err);
        }
      });
    });
  }

  async addWarehouse(data: Omit<DefaultWarehouse, 'id'>): Promise<void> {
    const now = Timestamp.now();
    console.log('[PlatformDefaults] addWarehouse:', data);
    await addDoc(collection(this.fs, sub('warehouses')), { ...data, createdAt: now, updatedAt: now });
  }

  async updateWarehouse(id: string, data: Partial<Omit<DefaultWarehouse, 'id'>>): Promise<void> {
    console.log('[PlatformDefaults] updateWarehouse:', id, data);
    await updateDoc(doc(this.fs, `${sub('warehouses')}/${id}`), { ...data, updatedAt: Timestamp.now() });
  }

  async deleteWarehouse(id: string): Promise<void> {
    console.log('[PlatformDefaults] deleteWarehouse:', id);
    await deleteDoc(doc(this.fs, `${sub('warehouses')}/${id}`));
  }

  // ── Currencies ────────────────────────────────────────────────────────

  getCurrencies(): Observable<DefaultCurrency[]> {
    return new Observable(observer => {
      const ref = collection(this.fs, sub('currencies'));
      return onSnapshot(ref, {
        next: snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as DefaultCurrency);
          observer.next(items);
        },
        error: err => { console.error('[PlatformDefaults] getCurrencies error:', err); observer.error(err); }
      });
    });
  }

  async addCurrency(data: Omit<DefaultCurrency, 'id'>): Promise<void> {
    const now = Timestamp.now();
    await setDoc(doc(this.fs, `${sub('currencies')}/${data.code}`), { ...data, createdAt: now, updatedAt: now });
  }

  async updateCurrency(id: string, data: Partial<Omit<DefaultCurrency, 'id'>>): Promise<void> {
    await updateDoc(doc(this.fs, `${sub('currencies')}/${id}`), { ...data, updatedAt: Timestamp.now() });
  }

  async deleteCurrency(id: string): Promise<void> {
    await deleteDoc(doc(this.fs, `${sub('currencies')}/${id}`));
  }

  // ── Countries ─────────────────────────────────────────────────────────

  getCountries(): Observable<DefaultCountry[]> {
    return new Observable(observer => {
      const ref = collection(this.fs, sub('countries'));
      return onSnapshot(ref, {
        next: snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as DefaultCountry);
          observer.next(items);
        },
        error: err => { console.error('[PlatformDefaults] getCountries error:', err); observer.error(err); }
      });
    });
  }

  async addCountry(data: Omit<DefaultCountry, 'id'>): Promise<void> {
    const now = Timestamp.now();
    await setDoc(doc(this.fs, `${sub('countries')}/${data.code2 || data.code3}`), { ...data, createdAt: now, updatedAt: now });
  }

  async updateCountry(id: string, data: Partial<Omit<DefaultCountry, 'id'>>): Promise<void> {
    await updateDoc(doc(this.fs, `${sub('countries')}/${id}`), { ...data, updatedAt: Timestamp.now() });
  }

  async deleteCountry(id: string): Promise<void> {
    await deleteDoc(doc(this.fs, `${sub('countries')}/${id}`));
  }

  // ── Seed initial defaults ─────────────────────────────────────────────


  async seedDefaults(): Promise<void> {
    console.log('[PlatformDefaults] seedDefaults: start');
    const now = Timestamp.now();
    const batch = writeBatch(this.fs);

    // Config
    batch.set(doc(this.fs, DEFAULTS_DOC), {
      country: 'Ecuador',
      defaultCurrency: 'USD',
      defaultVatRate: 15,
      updatedAt: now
    });
    console.log('[PlatformDefaults] seedDefaults: config doc written');

    const base = { createdAt: now, updatedAt: now };

    // TaxRates
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'VAT15', name: 'IVA 15%', rate: 15, sriCode: '3', isDefault: true, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'VAT5', name: 'IVA 5%', rate: 5, sriCode: '5', isDefault: false, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'VAT0', name: 'IVA 0%', rate: 0, sriCode: '2', isDefault: false, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'EXEMPT', name: 'Exento', rate: 0, sriCode: '6', isDefault: false, isActive: true, ...base });

    // PaymentTerms
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'CASH', name: 'Contado', days: 0, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'D30', name: '30 días', days: 30, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'D60', name: '60 días', days: 60, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'D90', name: '90 días', days: 90, isActive: true, ...base });

    // DocumentSeries
    batch.set(doc(collection(this.fs, sub('documentSeries'))), { code: '001', name: 'Serie Facturas', documentType: 'invoice', isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('documentSeries'))), { code: '001', name: 'Serie Presupuestos', documentType: 'quote', isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('documentSeries'))), { code: '001', name: 'Serie Pedidos', documentType: 'order', isActive: true, ...base });

    // Warehouses
    batch.set(doc(collection(this.fs, sub('warehouses'))), { code: 'BOD-01', name: 'Bodega Principal', isMain: true, isActive: true, ...base });

    // Currencies
    for (const c of SEED_CURRENCIES) {
      batch.set(doc(this.fs, `${sub('currencies')}/${c.code}`), c);
    }

    // Countries
    for (const c of SEED_COUNTRIES) {
      const code3 = c[0];
      const code2 = c[1];
      const name = c[2];
      batch.set(doc(this.fs, `${sub('countries')}/${code2 || code3}`), {
        code3, code2, name, isActive: true
      });
    }

    await batch.commit();
    console.log('[PlatformDefaults] seedDefaults: all collections written');
  }
}
