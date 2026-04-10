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
  PlatformConfig, SriPlatformConfig, SmtpPlatformConfig,
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

  // ── SRI Platform Config ──────────────────────────────────────────────

  getSriPlatformConfig(): Observable<SriPlatformConfig | undefined> {
    return new Observable(observer => {
      const ref = doc(this.fs, `${DEFAULTS_DOC}/sriConfig/data`);
      return onSnapshot(ref, {
        next: snap => observer.next(snap.exists() ? (snap.data() as SriPlatformConfig) : undefined),
        error: err => { console.error('[PlatformDefaults] getSriPlatformConfig error:', err); observer.error(err); }
      });
    });
  }

  async saveSriPlatformConfig(data: Partial<SriPlatformConfig>, updatedBy: string): Promise<void> {
    await setDoc(doc(this.fs, `${DEFAULTS_DOC}/sriConfig/data`), {
      ...data,
      updatedAt: Timestamp.now(),
      updatedBy
    }, { merge: true });
  }

  // ── SMTP Platform Config ─────────────────────────────────────────────

  getSmtpConfig(): Observable<SmtpPlatformConfig | undefined> {
    return new Observable(observer => {
      const ref = doc(this.fs, `${DEFAULTS_DOC}/smtpConfig/data`);
      return onSnapshot(ref, {
        next: snap => observer.next(snap.exists() ? (snap.data() as SmtpPlatformConfig) : undefined),
        error: err => { console.error('[PlatformDefaults] getSmtpConfig error:', err); observer.error(err); }
      });
    });
  }

  async saveSmtpConfig(data: Omit<SmtpPlatformConfig, 'updatedAt' | 'updatedBy'>, updatedBy: string): Promise<void> {
    await setDoc(doc(this.fs, `${DEFAULTS_DOC}/smtpConfig/data`), {
      ...data,
      updatedAt: Timestamp.now(),
      updatedBy,
    }, { merge: true });
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
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'VAT15', name: 'IVA 15%', rate: 15, sriCode: '4', isDefault: true, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'VAT5', name: 'IVA 5%', rate: 5, sriCode: '5', isDefault: false, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'VAT0', name: 'IVA 0%', rate: 0, sriCode: '0', isDefault: false, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'NO_OBJETO', name: 'No objeto de IVA', rate: 0, sriCode: '6', isDefault: false, isActive: true, isExempt: true, ...base });
    batch.set(doc(collection(this.fs, sub('taxRates'))), { code: 'EXEMPT', name: 'Exento de IVA', rate: 0, sriCode: '7', isDefault: false, isActive: true, isExempt: true, ...base });

    // PaymentTerms
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'CASH', name: 'Contado', days: 0, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'D30', name: '30 días', days: 30, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'D60', name: '60 días', days: 60, isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('paymentTerms'))), { code: 'D90', name: '90 días', days: 90, isActive: true, ...base });

    // DocumentSeries
    batch.set(doc(collection(this.fs, sub('documentSeries'))), { code: '001', name: 'Serie Facturas', documentType: 'invoice', isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('documentSeries'))), { code: '001', name: 'Serie Notas de Débito', documentType: 'debitNote', isActive: true, ...base });
    batch.set(doc(collection(this.fs, sub('documentSeries'))), { code: '001', name: 'Serie Retenciones', documentType: 'retention', isActive: true, ...base });
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

    // SRI Platform Config — Ficha Técnica v2.32, oct 2025
    batch.set(doc(this.fs, `${DEFAULTS_DOC}/sriConfig/data`), {
      // Versiones de schema
      facturaVersion:     '1.0.0',
      notaCreditoVersion: '1.0.0',
      notaDebitoVersion:  '1.0.0',

      // Endpoints WSDL (secciones 7.2 y 8.2)
      endpoints: {
        testing: {
          receptionUrl:           'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
          authorizationUrl:       'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
          consultaComprobanteUrl: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl',
          consultaFacturaUrl:     'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl',
        },
        production: {
          receptionUrl:           'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
          authorizationUrl:       'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
          consultaComprobanteUrl: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl',
          consultaFacturaUrl:     'https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaFactura?wsdl',
        },
      },

      // Configuración general (TABLAS 2 y 4)
      emissionType: '1',
      environmentCodes: { testing: '1', production: '2' },
      consumidorFinalId:           '9999999999999',
      consumidorFinalMaxAmountUsd: 50,

      // Tipos de comprobante (TABLA 3)
      documentTypeCodes: {
        invoice:     '01',
        liquidacion: '03',
        creditNote:  '04',
        debitNote:   '05',
        remission:   '06',
        retention:   '07',
      },

      // Códigos de tipo de impuesto para campo <codigo> en XML (TABLA 16)
      taxTypeCodes: { iva: '2', ice: '3', irbpnr: '5' },

      // Tarifas IVA para <codigoPorcentaje> en XML (TABLA 17)
      taxCodes: [
        { vatPct: 15, sriCode: '4', name: 'IVA 15%' },
        { vatPct: 5,  sriCode: '5', name: 'IVA 5%' },
        { vatPct: 8,  sriCode: '8', name: 'IVA diferenciado 8% (turismo)' },
        { vatPct: 0,  sriCode: '0', name: 'IVA 0%' },
        { vatPct: 0,  sriCode: '6', name: 'No objeto de IVA', isExempt: true },
        { vatPct: 0,  sriCode: '7', name: 'Exento de IVA',   isExempt: true },
      ],

      // Retención por tipo de impuesto (TABLA 19)
      retentionTaxCodes: [
        { taxName: 'RENTA', taxLabel: 'Impuesto a la Renta',         code: '1' },
        { taxName: 'IVA',   taxLabel: 'IVA',                         code: '2' },
        { taxName: 'ISD',   taxLabel: 'Impuesto a la Salida Divisas', code: '6' },
      ],

      // Retención IVA — % → código (TABLA 20)
      ivaRetentionCodes: [
        { pct: 10,  code: '9',  description: 'Retención IVA 10%' },
        { pct: 20,  code: '10', description: 'Retención IVA 20%' },
        { pct: 30,  code: '1',  description: 'Retención IVA 30%' },
        { pct: 50,  code: '11', description: 'Retención IVA 50%' },
        { pct: 70,  code: '2',  description: 'Retención IVA 70%' },
        { pct: 100, code: '3',  description: 'Retención IVA 100%' },
        { pct: 0,   code: '7',  description: 'Retención en cero (0%)' },
        { pct: 0,   code: '8',  description: 'No procede retención (0%)' },
      ],

      // Códigos ICE (TABLA 18) — tarifas vigentes
      iceCodes: [
        { code: '3011', description: 'Cigarrillos Rubios',                             especificaUsd: 0.16 },
        { code: '3021', description: 'Cigarrillos Negros',                              especificaUsd: 0.16 },
        { code: '3023', description: 'Tabaco y Sucedáneos (excl. cigarrillos)',          adValoremPct: 150 },
        { code: '3031', description: 'Bebidas Alcohólicas',                             adValoremPct: 75, especificaUsd: 10.00 },
        { code: '3033', description: 'Alcohol',                                         adValoremPct: 75, especificaUsd: 10.00 },
        { code: '3041', description: 'Cerveza Industrial Gran Escala',                  adValoremPct: 75 },
        { code: '3043', description: 'Cerveza Artesanal',                               especificaUsd: 1.50 },
        { code: '3053', description: 'Bebidas Gaseosas Alto Contenido Azúcar',          especificaUsd: 0.18 },
        { code: '3054', description: 'Bebidas Gaseosas Bajo Contenido Azúcar',          adValoremPct: 10 },
        { code: '3073', description: 'Vehículos Motorizados PVP ≤ USD 20.000',          adValoremPct: 5 },
        { code: '3075', description: 'Vehículos Motorizados PVP USD 30.000–40.000',     adValoremPct: 15 },
        { code: '3077', description: 'Vehículos Motorizados PVP USD 40.000–50.000',     adValoremPct: 20 },
        { code: '3078', description: 'Vehículos Motorizados PVP USD 50.000–60.000',     adValoremPct: 25 },
        { code: '3079', description: 'Vehículos Motorizados PVP USD 60.000–70.000',     adValoremPct: 30 },
        { code: '3080', description: 'Vehículos Motorizados PVP > USD 70.000',          adValoremPct: 35 },
        { code: '3081', description: 'Aviones, Tricares, Yates, Barcos de Recreo',      adValoremPct: 10 },
        { code: '3084', description: 'Vehículos Motorizados camionetas/rescate ≤ 30000',adValoremPct: 5 },
        { code: '3086', description: 'Vehículos excl. camionetas PVP 20.000–30.000',    adValoremPct: 10 },
        { code: '3088', description: 'Vehículos Híbridos PVP ≤ USD 35.000',             adValoremPct: 0 },
        { code: '3091', description: 'Vehículos Híbridos PVP USD 35.000–40.000',        adValoremPct: 8 },
        { code: '3092', description: 'Servicios TV Prepagada',                          adValoremPct: 0 },
        { code: '3093', description: 'Servicios Telefonía Sociedades',                  adValoremPct: 15 },
        { code: '3101', description: 'Bebidas Energizantes',                            adValoremPct: 10 },
        { code: '3111', description: 'Bebidas No Alcohólicas',                          especificaUsd: 0.18 },
        { code: '3610', description: 'Perfumes y Aguas de Tocador',                     adValoremPct: 20 },
        { code: '3620', description: 'Videojuegos',                                     adValoremPct: 0 },
        { code: '3630', description: 'Armas de Fuego, Deportivas y Municiones',         adValoremPct: 300 },
        { code: '3640', description: 'Focos Incandescentes',                            adValoremPct: 100 },
        { code: '3660', description: 'Cuotas, Membresías, Afiliaciones, Acciones',      adValoremPct: 35 },
        { code: '3671', description: 'Calefones y Sist. Calentamiento Agua a Gas',      adValoremPct: 100 },
        { code: '3680', description: 'Fundas Plásticas',                                especificaUsd: 0.08 },
        { code: '3681', description: 'Servicios Telefonía Móvil Personas Naturales',    adValoremPct: 0 },
        { code: '3682', description: 'Consumibles Tabaco Calentado y Líquidos Nicotina',adValoremPct: 150 },
      ],

      // Formas de pago (TABLA 24)
      paymentMethodCodes: [
        { code: '01', name: 'Sin utilización del sistema financiero' },
        { code: '15', name: 'Compensación de deudas' },
        { code: '16', name: 'Tarjeta de débito' },
        { code: '17', name: 'Dinero electrónico Ecuador' },
        { code: '18', name: 'Tarjeta prepago' },
        { code: '19', name: 'Tarjeta de crédito' },
        { code: '20', name: 'Otros con utilización del sistema financiero' },
        { code: '21', name: 'Endoso de títulos' },
      ],

      // Tipos de identificación (TABLA 6)
      identificationTypes: [
        { code: '04', name: 'RUC',                        isRuc:    true },
        { code: '05', name: 'Cédula de Identidad',        isCedula: true },
        { code: '06', name: 'Pasaporte' },
        { code: '07', name: 'Consumidor Final',            isFinal:  true },
        { code: '08', name: 'Identificación del Exterior' },
      ],

      updatedAt: now,
      updatedBy: 'seed',
    });

    await batch.commit();
    console.log('[PlatformDefaults] seedDefaults: all collections written');
  }
}
