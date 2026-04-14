import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs, Timestamp
} from '@angular/fire/firestore';
import * as XLSX from 'xlsx';

import { TenantService }    from '../../../core/services/tenant.service';
import { PersonasService }  from '../../personas/services/personas.service';
import { ProductsService }  from '../../products/services/products.service';
import { SettingsService }  from '../../settings/services/settings.service';
import { PurchasesService } from './purchases.service';
import {
  PurchaseLine,
  calcPurchaseLine,
  calcPurchaseTotals,
} from '../models/purchase.interface';
import { Warehouse } from '../../settings/models/settings.interfaces';

// ─── Public interfaces ─────────────────────────────────────────────────────────

export interface SriImportLine {
  sku:         string;
  description: string;
  qty:         number;
  unitCost:    number;
  discount:    number;
  taxRate:     number;
}

export interface SriImportRecord {
  sourceFile:            string;
  format:                'xml' | 'excel';
  supplierRuc:           string;
  supplierName:          string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate:   Date;
  supplierAccessKey?:    string;
  lines:                 SriImportLine[];
  subtotal:              number;
  totalTax:              number;
  total:                 number;
  status:                'ok' | 'duplicate' | 'error';
  errorMsg?:             string;
  existingPurchaseId?:   string;
}

export interface ImportSummary {
  imported:   number;
  duplicates: number;
  errors:     number;
  total:      number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PurchaseImporterService {
  private readonly firestore        = inject(Firestore);
  private readonly tenantService    = inject(TenantService);
  private readonly personasService  = inject(PersonasService);
  private readonly productsService  = inject(ProductsService);
  private readonly settingsService  = inject(SettingsService);
  private readonly purchasesService = inject(PurchasesService);

  private get companyId(): string { return this.tenantService.companyId; }

  // ─── Entry points ──────────────────────────────────────────────────────────

  async parseFiles(files: File[]): Promise<SriImportRecord[]> {
    const all: SriImportRecord[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'xml') {
        all.push(...await this.parseXmlFile(file));
      } else if (ext === 'xlsx' || ext === 'xls') {
        all.push(...await this.parseExcelFile(file));
      }
    }
    return this.checkDuplicates(all);
  }

  async importRecords(
    records: SriImportRecord[],
    onProgress: (current: number, total: number) => void
  ): Promise<ImportSummary> {
    const toImport = records.filter(r => r.status === 'ok');
    const summary: ImportSummary = {
      imported:   0,
      duplicates: records.filter(r => r.status === 'duplicate').length,
      errors:     records.filter(r => r.status === 'error').length,
      total:      records.length,
    };

    const warehouse = await this.getDefaultWarehouse();

    for (let i = 0; i < toImport.length; i++) {
      onProgress(i, toImport.length);
      try {
        await this.doImport(toImport[i], warehouse);
        summary.imported++;
      } catch (err) {
        summary.errors++;
        console.error('[PurchaseImporter] Error importando:', toImport[i].supplierInvoiceNumber, err);
      }
    }
    onProgress(toImport.length, toImport.length);
    return summary;
  }

  // ─── XML parsing ───────────────────────────────────────────────────────────

  private async parseXmlFile(file: File): Promise<SriImportRecord[]> {
    const errorRecord = (msg: string): SriImportRecord => ({
      sourceFile: file.name, format: 'xml',
      supplierRuc: '', supplierName: '', supplierInvoiceNumber: '',
      supplierInvoiceDate: new Date(), lines: [],
      subtotal: 0, totalTax: 0, total: 0,
      status: 'error', errorMsg: msg,
    });

    let text: string;
    try { text = await file.text(); }
    catch { return [errorRecord('No se pudo leer el archivo')]; }

    const parser = new DOMParser();
    const outer  = parser.parseFromString(text, 'application/xml');

    if (outer.querySelector('parsererror')) {
      return [errorRecord('Archivo XML inválido o corrupto')];
    }

    // Unwrap authorization envelope: <autorizacion><comprobante><![CDATA[...]]></comprobante></autorizacion>
    let facturaDoc = outer;
    const comprobanteEl = outer.querySelector('comprobante');
    if (comprobanteEl) {
      const inner = parser.parseFromString(comprobanteEl.textContent ?? '', 'application/xml');
      if (!inner.querySelector('parsererror')) {
        facturaDoc = inner;
      }
    }

    const codDoc = this.xmlText(facturaDoc, 'codDoc');
    if (codDoc && codDoc !== '01') {
      return [errorRecord(`Solo se importan facturas (codDoc=01). Este archivo es codDoc=${codDoc}.`)];
    }

    try {
      return [this.extractXml(file.name, facturaDoc)];
    } catch (err: any) {
      return [errorRecord(err?.message ?? 'Error al leer campos del XML')];
    }
  }

  private extractXml(fileName: string, doc: Document): SriImportRecord {
    const ruc         = this.xmlText(doc, 'ruc');
    const razonSocial = this.xmlText(doc, 'razonSocial');
    const claveAcceso = this.xmlText(doc, 'claveAcceso');
    const estab       = this.xmlText(doc, 'estab');
    const ptoEmi      = this.xmlText(doc, 'ptoEmi');
    const secuencial  = this.xmlText(doc, 'secuencial');
    const fechaStr    = this.xmlText(doc, 'fechaEmision');
    const importeTotal = parseFloat(this.xmlText(doc, 'importeTotal') || '0');
    const totalSin     = parseFloat(this.xmlText(doc, 'totalSinImpuestos') || '0');

    if (!ruc)      throw new Error('No se encontró el RUC del emisor en el XML');
    if (!fechaStr) throw new Error('No se encontró la fecha de emisión en el XML');

    const invoiceNumber = `${estab}-${ptoEmi}-${secuencial}`;
    const invoiceDate   = this.parseSriDate(fechaStr);

    // Parse product lines
    const lines: SriImportLine[] = [];
    doc.querySelectorAll('detalle').forEach(det => {
      const sku         = det.querySelector('codigoPrincipal')?.textContent?.trim() ?? '';
      const description = det.querySelector('descripcion')?.textContent?.trim() ?? '';
      const qty         = parseFloat(det.querySelector('cantidad')?.textContent ?? '1');
      const unitCost    = parseFloat(det.querySelector('precioUnitario')?.textContent ?? '0');
      const tarifaEl    = det.querySelector('impuesto tarifa') ?? det.querySelector('tarifa');
      const taxRate     = parseFloat(tarifaEl?.textContent ?? '0');
      lines.push({ sku, description, qty, unitCost, discount: 0, taxRate });
    });

    // If no lines were parsed (non-standard XML), create one generic line
    if (!lines.length) {
      lines.push({
        sku: '', description: `Factura ${invoiceNumber}`,
        qty: 1, unitCost: totalSin, discount: 0,
        taxRate: importeTotal > totalSin ? 15 : 0,
      });
    }

    // Total IVA from totalConImpuestos
    let totalTax = 0;
    doc.querySelectorAll('totalImpuesto').forEach(ti => {
      if (ti.querySelector('codigo')?.textContent?.trim() === '2') {
        totalTax += parseFloat(ti.querySelector('valor')?.textContent ?? '0');
      }
    });

    return {
      sourceFile:            fileName,
      format:                'xml',
      supplierRuc:           ruc,
      supplierName:          razonSocial,
      supplierInvoiceNumber: invoiceNumber,
      supplierInvoiceDate:   invoiceDate,
      supplierAccessKey:     claveAcceso || undefined,
      lines,
      subtotal:  Math.round(totalSin    * 100) / 100,
      totalTax:  Math.round(totalTax    * 100) / 100,
      total:     importeTotal,
      status:    'ok',
    };
  }

  // ─── Excel parsing ─────────────────────────────────────────────────────────

  private async parseExcelFile(file: File): Promise<SriImportRecord[]> {
    const buffer   = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) return [];

    // Find header row (first with 'ruc' in any cell, up to row 10)
    let hi = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i].join('|').toLowerCase().includes('ruc')) { hi = i; break; }
    }
    const headers = (rows[hi] as any[]).map(h => String(h).toLowerCase().trim());

    const col = (...kws: string[]): number => {
      for (const kw of kws) {
        const idx = headers.findIndex(h => h.includes(kw));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const cRuc      = col('ruc emisor', 'ruc del emisor', 'ruc');
    const cName     = col('razón social', 'razon social', 'emisor');
    const cTipo     = col('tipo de comprobante', 'tipo comprobante', 'tipo');
    const cNumber   = col('número de comprobante', 'numero de comprobante', 'número comprobante', 'numero comprobante');
    const cKey      = col('clave de acceso', 'clave acceso', 'clave');
    const cFecha    = col('fecha de emisión', 'fecha emisión', 'fecha emision', 'fecha de emision');
    const cSubtotal = col('subtotal sin impuestos', 'subtotal sin', 'base imponible iva', 'base imponible', 'subtotal');
    const cIva      = col('iva 15%', 'iva 12%', 'valor iva', 'total iva', 'iva');
    const cTotal    = col('importe total', 'total');

    const records: SriImportRecord[] = [];

    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i] as any[];
      if (!row || row.every(c => c === '' || c == null)) continue;

      // Skip non-factura rows when type column is present
      const tipo = cTipo >= 0 ? String(row[cTipo]).toUpperCase().trim() : '';
      if (tipo && !tipo.includes('FACTURA')) continue;

      const ruc      = String(row[cRuc]    ?? '').trim();
      const name     = String(row[cName]   ?? '').trim();
      const number   = String(row[cNumber] ?? '').trim();
      const key      = cKey >= 0 ? String(row[cKey] ?? '').trim() : '';
      const subtotal = parseFloat(String(row[cSubtotal] ?? '0').replace(',', '.')) || 0;
      const iva      = parseFloat(String(row[cIva]      ?? '0').replace(',', '.')) || 0;
      const total    = parseFloat(String(row[cTotal]    ?? '0').replace(',', '.')) || 0;

      if (!ruc || !number) continue;

      const fechaRaw    = row[cFecha];
      const invoiceDate = fechaRaw instanceof Date ? fechaRaw : this.parseSriDate(String(fechaRaw ?? ''));
      const taxRate     = iva > 0 ? 15 : 0;

      records.push({
        sourceFile:            file.name,
        format:                'excel',
        supplierRuc:           ruc,
        supplierName:          name,
        supplierInvoiceNumber: number,
        supplierInvoiceDate:   invoiceDate,
        supplierAccessKey:     key.length === 49 ? key : undefined,
        lines: [{
          sku: '', description: `Importado desde SRI - ${number}`,
          qty: 1, unitCost: subtotal, discount: 0, taxRate,
        }],
        subtotal,
        totalTax:  Math.round(iva   * 100) / 100,
        total:     total || Math.round((subtotal + iva) * 100) / 100,
        status:    'ok',
      });
    }

    return records;
  }

  // ─── Duplicate check ───────────────────────────────────────────────────────

  private async checkDuplicates(records: SriImportRecord[]): Promise<SriImportRecord[]> {
    const purchasesCol = collection(this.firestore, `companies/${this.companyId}/purchases`);

    // Batch check by supplierAccessKey (max 30 per 'in' query)
    const keys    = records.filter(r => r.status === 'ok' && r.supplierAccessKey).map(r => r.supplierAccessKey!);
    const keyToId = new Map<string, string>();

    for (let i = 0; i < keys.length; i += 30) {
      const batch = keys.slice(i, i + 30);
      const snap  = await getDocs(query(purchasesCol, where('supplierAccessKey', 'in', batch)));
      snap.docs.forEach(d => keyToId.set((d.data() as any).supplierAccessKey, d.id));
    }

    const result: SriImportRecord[] = [];
    for (const r of records) {
      if (r.status !== 'ok') { result.push(r); continue; }

      if (r.supplierAccessKey && keyToId.has(r.supplierAccessKey)) {
        result.push({ ...r, status: 'duplicate', existingPurchaseId: keyToId.get(r.supplierAccessKey) });
        continue;
      }

      if (!r.supplierAccessKey) {
        // Fallback: check by RUC + invoice number
        const snap = await getDocs(query(purchasesCol,
          where('supplierRuc', '==', r.supplierRuc),
          where('supplierInvoiceNumber', '==', r.supplierInvoiceNumber)
        ));
        if (!snap.empty) {
          result.push({ ...r, status: 'duplicate', existingPurchaseId: snap.docs[0].id });
          continue;
        }
      }

      result.push(r);
    }
    return result;
  }

  // ─── Import single record ──────────────────────────────────────────────────

  private async doImport(record: SriImportRecord, warehouse: Warehouse): Promise<void> {
    const supplier = await this.findOrCreateSupplier(record.supplierRuc, record.supplierName);

    const lines: PurchaseLine[] = [];
    for (const l of record.lines) {
      const product = await this.findOrCreateProduct(l.sku, l.description, l.unitCost, l.taxRate);
      lines.push({
        id:          crypto.randomUUID(),
        productId:   product.id,
        productSku:  product.sku,
        productName: product.name,
        description: l.description,
        qty:         l.qty,
        unitCost:    l.unitCost,
        discount:    l.discount,
        taxRate:     l.taxRate,
        ...calcPurchaseLine(l.qty, l.unitCost, l.discount, l.taxRate),
      });
    }

    const totals = calcPurchaseTotals(lines, supplier.irRetentionPct, supplier.vatRetentionPct);
    const year   = record.supplierInvoiceDate.getFullYear();

    await this.purchasesService.create({
      serie:                 'C',
      year,
      supplierInvoiceNumber: record.supplierInvoiceNumber,
      supplierInvoiceDate:   Timestamp.fromDate(record.supplierInvoiceDate),
      supplierAccessKey:     record.supplierAccessKey,
      supplierId:            supplier.id,
      supplierName:          supplier.name,
      supplierRuc:           supplier.ruc,
      supplierTaxIdType:     'ruc',
      irRetentionPct:        supplier.irRetentionPct,
      vatRetentionPct:       supplier.vatRetentionPct,
      warehouseCode:         warehouse.code,
      warehouseName:         warehouse.name,
      date:                  Timestamp.fromDate(record.supplierInvoiceDate),
      notes:                 `Importado desde archivo: ${record.sourceFile}`,
      lines,
      status:                'draft',
      ...totals,
    });
  }

  // ─── Supplier: find or create ──────────────────────────────────────────────

  private async findOrCreateSupplier(
    ruc: string,
    name: string
  ): Promise<{ id: string; name: string; ruc: string; irRetentionPct: number; vatRetentionPct: number }> {
    const ref  = collection(this.firestore, `companies/${this.companyId}/personas`);
    const snap = await getDocs(query(ref, where('taxId', '==', ruc)));

    if (!snap.empty) {
      const data = snap.docs[0].data() as any;
      return {
        id:              snap.docs[0].id,
        name:            data.name,
        ruc,
        irRetentionPct:  data.supplierData?.irRetentionPct  ?? 0,
        vatRetentionPct: data.supplierData?.vatRetentionPct ?? 0,
      };
    }

    const id = await this.personasService.createPerson({
      roles:        ['supplier'],
      taxId:        ruc,
      taxIdType:    'RUC',
      isCompany:    true,
      name,
      legalName:    name,
      addresses:    [],
      bankAccounts: [],
      isActive:     true,
      supplierData: { code: '', currency: 'USD', paymentTermCode: '', vatRegime: 'General' },
    });

    return { id, name, ruc, irRetentionPct: 0, vatRetentionPct: 0 };
  }

  // ─── Product: find or create ───────────────────────────────────────────────

  private async findOrCreateProduct(
    sku: string,
    description: string,
    unitCost: number,
    taxRate: number
  ): Promise<{ id: string; sku: string; name: string }> {
    const skuUp = sku.trim().toUpperCase();

    if (skuUp) {
      const ref  = collection(this.firestore, `companies/${this.companyId}/products`);
      const snap = await getDocs(query(ref, where('sku', '==', skuUp)));
      if (!snap.empty) {
        const p = snap.docs[0].data() as any;
        return { id: snap.docs[0].id, sku: p.sku, name: p.name };
      }
    }

    const finalSku = skuUp || `IMP-${Date.now()}`;
    const id = await this.productsService.createProduct({
      sku:         finalSku,
      name:        description || finalSku,
      type:        'product',
      isSold:      false,
      isPurchased: true,
      isPublic:    false,
      isBlocked:   false,
      isActive:    true,
      taxRateCode: taxRate > 0 ? '15' : '0',
      taxRate,
      salePrice:   0,
      costPrice:   unitCost,
      trackStock:  true,
      noStock:     false,
      stockMin:    0,
      stockMax:    0,
      hasVariants: false,
      traceable:   false,
    });

    return { id, sku: finalSku, name: description || finalSku };
  }

  // ─── Warehouse helper ──────────────────────────────────────────────────────

  private getDefaultWarehouse(): Promise<Warehouse> {
    return new Promise((resolve, reject) => {
      const sub = this.settingsService.getWarehouses().subscribe({
        next: list => {
          sub.unsubscribe();
          const wh = list.find(w => w.isMain && w.isActive) ?? list.find(w => w.isActive);
          if (!wh) { reject(new Error('No hay almacenes activos configurados')); return; }
          resolve(wh);
        },
        error: reject,
      });
    });
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────

  private xmlText(doc: Document, tag: string): string {
    return doc.querySelector(tag)?.textContent?.trim() ?? '';
  }

  private parseSriDate(str: string): Date {
    if (!str) return new Date();
    if (str.includes('/')) {
      const [d, m, y] = str.split('/');
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
}
