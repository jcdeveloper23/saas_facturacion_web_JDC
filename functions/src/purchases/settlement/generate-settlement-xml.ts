// ─── XML de la liquidación de compra (codDoc 03) desde la compra guardada ────
//
// 2026-11-05. Lee la compra que creó `issuePurchaseSettlement`, arma el XML con
// el constructor puro (utils/sri-settlement-xml.ts, validado contra el XSD) y
// lo deja en Storage como `xml/lc-{id}.xml`. Guarda la clave de acceso en
// `accessKey` (la lee send-to-sri) y en `supplierAccessKey` (la lee el ATS).

import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { buildPurchaseSettlementXml } from '../../utils/sri-settlement-xml';
import { formatFechaClaveAccesoEC } from '../../utils/sri-date';
import { generateAccessKey, assertValidAccessKey } from '../../utils/sri-access-key';
import { sriVatCode } from '../../utils/sri-vat-codes';
import { resolveEmissionSeries, resolveEstablishmentAddress } from '../../utils/establishments';
import { buildAdditionalInfo } from '../../utils/additional-info';
import { resolveSoftwareProviderRuc } from '../../utils/software-provider';
import { settlementSupplierIdType } from './settlement-logic';

function genCodigo(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

export async function generateSettlementXmlInternal(
  purchaseId: string,
  companyId: string,
): Promise<{ accessKey: string; xmlUrl: string }> {
  const db = admin.firestore();
  const ref = db.doc(`companies/${companyId}/purchases/${purchaseId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Liquidación no encontrada: ${purchaseId}`);
  const p = snap.data() as Record<string, any>;
  if (p['issuedByCompany'] !== true || p['sriDocumentType'] !== '03') {
    throw new Error('La compra no es una liquidación emitida por la empresa.');
  }

  const company = (await db.doc(`companies/${companyId}`).get()).data() as Record<string, any> | undefined;
  if (!company) throw new Error(`Empresa no encontrada: ${companyId}`);
  const sri = company['sri'] ?? {};
  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriConfigSnap.exists) throw new Error(`Configuración SRI no encontrada: ${companyId}`);
  const sriConfig = sriConfigSnap.data() as Record<string, any>;
  const platform = (await db.doc('platform/defaults/sriConfig/data').get()).data() as Record<string, any> | undefined;

  const series = resolveEmissionSeries(p, sri);
  const dirEstablecimiento = await resolveEstablishmentAddress(
    db, companyId, series.establishment, sriConfig['direccionEstablecimiento'],
  );

  const issueDate: Date = p['date'].toDate();
  const ruc = String(sri.ruc);
  const ambiente: '1' | '2' = sri.environment === 'production' ? '2' : '1';
  const secuencial = String(p['settlement']?.['sequential'] ?? '').padStart(9, '0');
  if (!/^\d{9}$/.test(secuencial) || secuencial === '000000000') throw new Error('La liquidación no tiene secuencial.');
  const codigoNumerico: string = p['codigoNumerico'] ?? genCodigo();
  const accessKey = generateAccessKey({
    fechaEmision: formatFechaClaveAccesoEC(issueDate),
    tipoComprobante: '03',
    ruc,
    ambiente,
    establecimiento: series.establishment,
    puntoEmision: series.emissionPoint,
    secuencial,
    codigoNumerico,
    tipoEmision: '1',
  });
  assertValidAccessKey(accessKey);

  const tipo = settlementSupplierIdType(p['supplierTaxIdType']);
  if (!tipo) throw new Error(`Tipo de identificación del proveedor no admitido: ${p['supplierTaxIdType']}`);

  const lines = (p['lines'] ?? []) as Array<Record<string, any>>;
  const taxCodes = platform?.['taxCodes'];
  const groups = new Map<number, { base: number; tax: number }>();
  for (const l of lines) {
    const g = groups.get(Number(l['taxRate'])) ?? { base: 0, tax: 0 };
    g.base += Number(l['subtotal'] ?? 0);
    g.tax += Number(l['taxAmount'] ?? 0);
    groups.set(Number(l['taxRate']), g);
  }

  const additionalInfo = buildAdditionalInfo({
    companyFields: sriConfig['additionalInfoFields'],
    docFields: p['additionalInfo'],
    doc: p as any,
    company: { name: sriConfig['razonSocial'], ruc },
    providerRuc: await resolveSoftwareProviderRuc(company as any),
  });

  const xml = buildPurchaseSettlementXml({
    issuer: {
      ambiente,
      razonSocial: sriConfig['razonSocial'],
      nombreComercial: sriConfig['nombreComercial'],
      ruc,
      accessKey,
      establishment: series.establishment,
      emissionPoint: series.emissionPoint,
      secuencial,
      dirMatriz: sriConfig['direccionMatriz'],
      dirEstablecimiento,
      contribuyenteEspecial: sri.contribuyenteEspecial,
      obligadoContabilidad: sriConfig['obligadoContabilidad'] ?? (sri.accountingRequired ? 'SI' : 'NO'),
    },
    supplier: {
      tipoIdentificacion: tipo,
      razonSocial: p['supplierName'],
      identificacion: p['supplierRuc'],
      direccion: p['supplierAddress'] ?? '',
    },
    issueDate,
    totalSinImpuestos: Number(p['subtotal'] ?? 0),
    totalDescuento: Number(p['totalDiscount'] ?? 0),
    taxGroups: [...groups.entries()].map(([rate, g]) => ({
      vatCode: sriVatCode(rate, taxCodes), vatRate: rate, base: g.base, tax: g.tax,
    })),
    importeTotal: Number(p['subtotal'] ?? 0) + Number(p['totalTax'] ?? 0),
    payments: [{
      code: p['paymentMethodCode'],
      total: Number(p['subtotal'] ?? 0) + Number(p['totalTax'] ?? 0),
      term: Number(p['paymentTermDays'] ?? 0),
      timeUnit: 'dias',
    }],
    lines: lines.map((l) => ({
      code: l['productSku'],
      description: l['description'] ?? l['productName'],
      unit: l['unit'],
      quantity: Number(l['qty']),
      unitPrice: Number(l['unitCost']),
      discount: Number(l['discountAmount'] ?? 0),
      lineTotal: Number(l['subtotal']),
      vatCode: sriVatCode(Number(l['taxRate']), taxCodes),
      vatRate: Number(l['taxRate']),
      vatAmount: Number(l['taxAmount']),
    })),
    additionalInfo,
  });

  const bucket = getStorage().bucket();
  const xmlPath = `companies/${companyId}/xml/lc-${purchaseId}.xml`;
  await bucket.file(xmlPath).save(Buffer.from(xml, 'utf8'), { metadata: { contentType: 'application/xml' } });
  const xmlUrl = `https://storage.googleapis.com/${bucket.name}/${xmlPath}`;

  await ref.update({
    codigoNumerico,
    accessKey,
    supplierAccessKey: accessKey,
    sriStatus: 'xml_generated',
    updatedAt: admin.firestore.Timestamp.now(),
  });
  return { accessKey, xmlUrl };
}
