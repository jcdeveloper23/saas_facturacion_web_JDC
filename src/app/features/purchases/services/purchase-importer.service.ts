import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs, Timestamp
} from '@angular/fire/firestore';

import { TenantService }    from '../../../core/services/tenant.service';
import { PersonasService }  from '../../personas/services/personas.service';
import { ProductsService }  from '../../products/services/products.service';
import { SettingsService }  from '../../settings/services/settings.service';
import { PurchasesService } from './purchases.service';
import { SupplierMappingsService } from './supplier-mappings.service';
import {
  PurchaseLine,
  calcPurchaseLine,
  calcPurchaseTotals,
} from '../models/purchase.interface';
import { Warehouse } from '../../settings/models/settings.interfaces';

// ─── Public interfaces ─────────────────────────────────────────────────────────

export interface SriImportLine {
  sku:                  string;
  description:          string;
  qty:                  number;
  unitCost:             number;
  discount:             number;
  taxRate:              number;
  // Homologation — filled by applyMappings() or by the user in the UI
  mappedProductId?:     string;
  mappedProductName?:   string;
  mappedProductSku?:    string;
  needsMapping?:        boolean;  // true = no saved mapping found for this line
  rememberMapping?:     boolean;  // user flag: persist this mapping on import
}

export interface SriImportRecord {
  sourceFile:            string;
  format:                'xml' | 'txt';
  supplierRuc:           string;
  supplierName:          string;
  supplierId?:           string;   // filled after findOrCreate during applyMappings
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
  unmappedCount?:        number;   // lines with needsMapping=true
  enrichedWithXml?:      boolean;  // TXT record enriched with an XML file's lines
  xmlFileName?:          string;   // name of the XML that enriched this record
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
  private readonly mappingsSvc      = inject(SupplierMappingsService);

  private get companyId(): string { return this.tenantService.companyId; }

  // ─── Company RUC cache (loaded once per import session) ───────────────────

  private _companyRuc: string | null = null;

  private async getCompanyRuc(): Promise<string> {
    if (this._companyRuc) return this._companyRuc;
    return new Promise((resolve, reject) => {
      const sub = this.settingsService.getCompanySettings().subscribe({
        next: s => {
          sub.unsubscribe();
          if (!s?.taxId) { reject(new Error('No se encontró el RUC de la empresa en configuración')); return; }
          this._companyRuc = s.taxId.trim();
          resolve(this._companyRuc);
        },
        error: reject,
      });
    });
  }

  // ─── Entry points ──────────────────────────────────────────────────────────

  async parseFiles(files: File[]): Promise<SriImportRecord[]> {
    this._companyRuc = null; // reset per-session cache so tenant switches take effect
    const all: SriImportRecord[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'xml') {
        all.push(...await this.parseXmlFile(file));
      } else if (ext === 'txt') {
        all.push(...await this.parseTxtFile(file));
      } else if (ext === 'zip') {
        all.push(...await this.parseZipFile(file));
      }
    }
    const matched    = this.autoMatchXmlToTxt(all);
    const withDupes  = await this.checkDuplicates(matched);
    return this.applyMappings(withDupes);
  }

  // ─── Public: enrich a single TXT record with a user-supplied XML file ──────

  async enrichRecordWithXml(record: SriImportRecord, xmlFile: File): Promise<SriImportRecord> {
    const xmlRecords = await this.parseXmlFile(xmlFile);
    if (!xmlRecords.length || xmlRecords[0].status === 'error') {
      throw new Error(xmlRecords[0]?.errorMsg ?? 'Error al leer el XML');
    }
    const xml = xmlRecords[0];

    // ── Security: verify the XML matches this specific TXT row ───────────────
    if (xml.supplierRuc && record.supplierRuc && xml.supplierRuc !== record.supplierRuc) {
      throw new Error(
        `El XML pertenece al proveedor RUC ${xml.supplierRuc} (${xml.supplierName}), ` +
        `pero esta fila corresponde al RUC ${record.supplierRuc} (${record.supplierName}).`
      );
    }
    if (xml.supplierInvoiceNumber && record.supplierInvoiceNumber) {
      const normXml = this.normalizeInvoiceNumber(xml.supplierInvoiceNumber);
      const normRec = this.normalizeInvoiceNumber(record.supplierInvoiceNumber);
      if (normXml !== normRec) {
        throw new Error(
          `El XML corresponde a la factura ${xml.supplierInvoiceNumber}, ` +
          `pero esta fila es la factura ${record.supplierInvoiceNumber}. ` +
          `Verifica que estás subiendo el XML correcto.`
        );
      }
    }

    const enriched: SriImportRecord = {
      ...record,
      lines:             xml.lines,
      subtotal:          xml.subtotal,
      totalTax:          xml.totalTax,
      total:             xml.total,
      supplierAccessKey: xml.supplierAccessKey ?? record.supplierAccessKey,
      enrichedWithXml:   true,
      xmlFileName:       xmlFile.name,
      unmappedCount:     0,
    };

    // Re-apply saved mappings using the record's already-resolved supplierId
    if (record.supplierId) {
      const map = await this.mappingsSvc.findMappingsBySupplier(record.supplierId);
      let unmapped = 0;
      enriched.lines = enriched.lines.map(line => {
        const key   = line.sku.trim().toUpperCase();
        const saved = key ? map.get(key) : undefined;
        if (saved) {
          return { ...line, mappedProductId: saved.productId, mappedProductName: saved.productName, mappedProductSku: saved.productSku, needsMapping: false };
        }
        if (key) { unmapped++; return { ...line, needsMapping: true }; }
        return line;
      });
      enriched.unmappedCount = unmapped;
    }

    return enriched;
  }

  // ─── Homologation: apply saved mappings to parsed records ─────────────────

  private async applyMappings(records: SriImportRecord[]): Promise<SriImportRecord[]> {
    const result: SriImportRecord[] = [];

    for (const record of records) {
      if (record.status !== 'ok') { result.push(record); continue; }

      // Resolve supplierId once per record
      let supplierId = record.supplierId;
      if (!supplierId) {
        const ref  = collection(this.firestore, `companies/${this.companyId}/personas`);
        const snap = await getDocs(query(ref, where('taxId', '==', record.supplierRuc)));
        supplierId = snap.empty ? undefined : snap.docs[0].id;
      }

      if (!supplierId) {
        // Supplier not in system yet — all lines need mapping or will be auto-created
        result.push({ ...record, supplierId, unmappedCount: 0 });
        continue;
      }

      // Load all mappings for this supplier in a single query
      const mappingsByKey = await this.mappingsSvc.findMappingsBySupplier(supplierId);

      let unmapped = 0;
      const mappedLines: SriImportLine[] = record.lines.map(line => {
        const skuKey = line.sku.trim().toUpperCase();
        const saved  = skuKey ? mappingsByKey.get(skuKey) : undefined;

        if (saved) {
          return {
            ...line,
            mappedProductId:   saved.productId,
            mappedProductName: saved.productName,
            mappedProductSku:  saved.productSku,
            needsMapping:      false,
          };
        }

        // XML lines with sku can be mapped; TXT lines (empty sku) are auto-created
        const canMap = skuKey.length > 0;
        if (canMap) unmapped++;
        return { ...line, needsMapping: canMap };
      });

      result.push({ ...record, supplierId, lines: mappedLines, unmappedCount: unmapped });
    }

    return result;
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

    // ── Security: verify receiver matches active company ─────────────────────
    // infoTributaria > ruc  = emisor (proveedor)
    // comprador > identificacionComprador = receptor (nuestra empresa)
    const buyerRuc = (
      facturaDoc.querySelector('comprador identificacionComprador')
        ?? facturaDoc.querySelector('identificacionComprador')
    )?.textContent?.trim() ?? '';

    if (buyerRuc) {
      let companyRuc: string;
      try   { companyRuc = await this.getCompanyRuc(); }
      catch  { companyRuc = ''; }

      if (companyRuc) {
        // Una persona natural puede tener guardada su cédula (10 dígitos).
        // El XML siempre contiene el RUC (cédula + "001"), así que comparamos ambas formas.
        const companyRucFull  = companyRuc.length === 10 ? companyRuc + '001' : companyRuc;
        const buyerMatches    = buyerRuc === companyRuc || buyerRuc === companyRucFull;

        if (!buyerMatches) {
          return [errorRecord(
            `Este XML no corresponde a esta empresa. ` +
            `El receptor del comprobante es ${buyerRuc}, ` +
            `pero la empresa activa tiene ${companyRuc}.`
          )];
        }
      }
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
      const sku            = det.querySelector('codigoPrincipal')?.textContent?.trim() ?? '';
      const description    = det.querySelector('descripcion')?.textContent?.trim() ?? '';
      const qty            = parseFloat(det.querySelector('cantidad')?.textContent ?? '1');
      const unitCost       = parseFloat(det.querySelector('precioUnitario')?.textContent ?? '0');
      const descuentoAmt   = parseFloat(det.querySelector('descuento')?.textContent ?? '0');
      const tarifaEl       = det.querySelector('impuesto tarifa') ?? det.querySelector('tarifa');
      const taxRate        = parseFloat(tarifaEl?.textContent ?? '0');
      const basePrice      = qty * unitCost;
      const discount       = basePrice > 0 ? Math.round((descuentoAmt / basePrice) * 10000) / 100 : 0;
      lines.push({ sku, description, qty, unitCost, discount, taxRate });
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

  // ─── ZIP parsing ──────────────────────────────────────────────────────────

  private async parseZipFile(file: File): Promise<SriImportRecord[]> {
    try {
      const JSZip = (await import('jszip')).default;
      const zip   = await JSZip.loadAsync(file);
      const results: SriImportRecord[] = [];

      for (const [filename, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext !== 'xml') continue;

        const blob    = await entry.async('blob');
        const xmlFile = new File([blob], filename.split('/').pop() ?? filename, { type: 'text/xml' });
        results.push(...await this.parseXmlFile(xmlFile));
      }

      return results;
    } catch (err: any) {
      return [{
        sourceFile: file.name, format: 'xml',
        supplierRuc: '', supplierName: '', supplierInvoiceNumber: '',
        supplierInvoiceDate: new Date(), lines: [],
        subtotal: 0, totalTax: 0, total: 0,
        status: 'error', errorMsg: `Error al descomprimir ZIP: ${err?.message ?? err}`,
      }];
    }
  }

  // ─── Auto-match: merge XML records into TXT records by access key / invoice ─

  private autoMatchXmlToTxt(records: SriImportRecord[]): SriImportRecord[] {
    const xmlRecords = records.filter(r => r.format === 'xml' && r.status === 'ok');
    const txtRecords = records.filter(r => r.format === 'txt');
    const errors     = records.filter(r => r.status === 'error');

    if (!xmlRecords.length || !txtRecords.length) return records;

    // Index XMLs by access key and by ruc+invoice
    const byKey        = new Map<string, SriImportRecord>();
    const byRucInvoice = new Map<string, SriImportRecord>();
    for (const xml of xmlRecords) {
      if (xml.supplierAccessKey) byKey.set(xml.supplierAccessKey, xml);
      byRucInvoice.set(`${xml.supplierRuc}|${xml.supplierInvoiceNumber}`, xml);
    }

    const usedXmlKeys = new Set<string>();

    const enrichedTxt: SriImportRecord[] = txtRecords.map(txt => {
      const matchKey = (txt.supplierAccessKey && byKey.get(txt.supplierAccessKey))
        ? txt.supplierAccessKey
        : undefined;
      const matchRucInv = `${txt.supplierRuc}|${txt.supplierInvoiceNumber}`;
      const xml = (matchKey && byKey.get(matchKey)) ?? byRucInvoice.get(matchRucInv);

      if (!xml) return txt;

      // Track which XMLs were consumed
      if (xml.supplierAccessKey) usedXmlKeys.add(xml.supplierAccessKey);
      usedXmlKeys.add(`${xml.supplierRuc}|${xml.supplierInvoiceNumber}`);

      return {
        ...txt,
        lines:             xml.lines,
        subtotal:          xml.subtotal,
        totalTax:          xml.totalTax,
        total:             xml.total,
        supplierAccessKey: xml.supplierAccessKey ?? txt.supplierAccessKey,
        enrichedWithXml:   true,
        xmlFileName:       xml.sourceFile,
      };
    });

    // Keep XML records that were NOT matched to any TXT (uploaded standalone)
    const standaloneXml = xmlRecords.filter(xml => {
      if (xml.supplierAccessKey && usedXmlKeys.has(xml.supplierAccessKey)) return false;
      if (usedXmlKeys.has(`${xml.supplierRuc}|${xml.supplierInvoiceNumber}`)) return false;
      return true;
    });

    return [...enrichedTxt, ...standaloneXml, ...errors];
  }

  // ─── TXT parsing (reporte masivo SRI) ─────────────────────────────────────
  // Formato: columnas separadas por tabulaciones
  // Columnas: RUC_EMISOR  RAZON_SOCIAL_EMISOR  TIPO_COMPROBANTE  SERIE_COMPROBANTE
  //           CLAVE_ACCESO  FECHA_AUTORIZACION  FECHA_EMISION  IDENTIFICACION_RECEPTOR
  //           VALOR_SIN_IMPUESTOS  IVA  IMPORTE_TOTAL  NUMERO_DOCUMENTO_MODIFICADO

  private async parseTxtFile(file: File): Promise<SriImportRecord[]> {
    let text: string;
    try { text = await file.text(); }
    catch { return [this.txtErrorRecord(file.name, 'No se pudo leer el archivo')]; }

    const rawLines = text.split(/\r?\n/);
    const lines    = rawLines.filter(l => l.trim());
    if (lines.length < 2) return [];

    // Detect separator: prefer tab; fallback to 4+ spaces
    const isTab       = lines[0].includes('\t');
    const splitRow    = (l: string) =>
      isTab ? l.split('\t').map(c => c.trim())
            : l.split(/\t|\s{4,}/).map(c => c.trim());

    const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/_/g, ' '));

    const col = (...kws: string[]): number => {
      for (const kw of kws) {
        const idx = headers.findIndex(h => h === kw || h.includes(kw));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const cRuc      = col('ruc emisor', 'ruc');
    const cName     = col('razon social emisor', 'razon social', 'emisor');
    const cTipo     = col('tipo comprobante', 'tipo');
    const cSerie    = col('serie comprobante', 'serie', 'numero comprobante', 'numero');
    const cKey      = col('clave acceso');
    const cFechaEm  = col('fecha emision');
    const cSubtotal = col('valor sin impuestos', 'subtotal sin impuestos', 'subtotal');
    const cIva      = col('iva');
    const cTotal    = col('importe total', 'total');

    const records: SriImportRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = splitRow(lines[i]);
      if (!row || row.every(c => c === '')) continue;

      const tipo = cTipo >= 0 ? (row[cTipo] ?? '').toUpperCase().trim() : '';
      if (tipo && !tipo.includes('FACTURA')) continue;

      const ruc      = (row[cRuc]    ?? '').trim();
      const name     = (row[cName]   ?? '').trim();
      const serie    = (row[cSerie]  ?? '').trim();
      const key      = cKey >= 0 ? (row[cKey] ?? '').trim() : '';
      const subtotal = parseFloat((row[cSubtotal] ?? '0').replace(',', '.')) || 0;
      const iva      = parseFloat((row[cIva]      ?? '0').replace(',', '.')) || 0;
      const total    = parseFloat((row[cTotal]    ?? '0').replace(',', '.')) || 0;

      if (!ruc || !serie) continue;

      const invoiceDate = this.parseSriDate((row[cFechaEm] ?? '').trim());
      const taxRate     = iva > 0 ? 15 : 0;

      records.push({
        sourceFile:            file.name,
        format:                'txt',
        supplierRuc:           ruc,
        supplierName:          name,
        supplierInvoiceNumber: serie,
        supplierInvoiceDate:   invoiceDate,
        supplierAccessKey:     key.length === 49 ? key : undefined,
        lines: [{
          sku: '', description: `Importado desde SRI - ${serie}`,
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

  private txtErrorRecord(fileName: string, msg: string): SriImportRecord {
    return {
      sourceFile: fileName, format: 'txt',
      supplierRuc: '', supplierName: '', supplierInvoiceNumber: '',
      supplierInvoiceDate: new Date(), lines: [],
      subtotal: 0, totalTax: 0, total: 0,
      status: 'error', errorMsg: msg,
    };
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
      let product: { id: string; sku: string; name: string };

      if (l.mappedProductId) {
        // Use user-selected or saved mapping
        product = {
          id:   l.mappedProductId,
          sku:  l.mappedProductSku  ?? l.sku,
          name: l.mappedProductName ?? l.description,
        };

        // Persist the mapping if the user flagged it
        if (l.rememberMapping && l.sku) {
          await this.mappingsSvc.save({
            supplierId:          supplier.id,
            supplierRuc:         record.supplierRuc,
            supplierName:        record.supplierName,
            supplierSku:         l.sku,
            supplierDescription: l.description,
            productId:           product.id,
            productName:         product.name,
            productSku:          product.sku,
          });
        }
      } else {
        // Fallback: find by SKU or auto-create
        product = await this.findOrCreateProduct(l.sku, l.description, l.unitCost, l.taxRate);
      }

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

  /**
   * Normalizes SRI invoice numbers for comparison.
   * "001-001-000000001" and "001-001-1" are treated as the same invoice.
   */
  private normalizeInvoiceNumber(n: string): string {
    return n.trim().split('-').map((part, i) =>
      i === 2 ? parseInt(part, 10).toString() : part.trim()
    ).join('-');
  }

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
