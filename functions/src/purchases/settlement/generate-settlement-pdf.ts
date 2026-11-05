// ─── RIDE de la liquidación de compra (codDoc 03) ────────────────────────────
//
// 2026-11-05. Mismo estilo que el RIDE de la nota de débito. `buildSettlementPdf`
// es puro (recibe todo resuelto) para probarlo sin Firestore; el «Internal» lee
// la compra, lo arma, lo sube a `pdf/lc-{id}.pdf` y guarda `pdfUrl`.

import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getStorage } from 'firebase-admin/storage';
import { drawLogo, loadCompanyLogo } from '../../utils/company-logo';
import { contributorTypeLabel } from '../../utils/contributor-type';

export interface SettlementPdfData {
  fullNumber: string;
  date: Date;
  accessKey?: string;
  authorizationNumber?: string;
  authorizedAt?: Date;
  ambiente: 'PRUEBAS' | 'PRODUCCIÓN';
  supplierName: string;
  supplierTaxId: string;
  supplierTaxIdType: string;
  supplierAddress?: string;
  lines: Array<{
    code?: string; description: string; qty: number; unitCost: number;
    discountAmount: number; subtotal: number; taxRate: number;
  }>;
  subtotal: number;
  totalDiscount: number;
  taxGroups: Array<{ vatRate: number; base: number; tax: number }>;
  total: number;
  paymentLabel?: string;
  notes?: string;
  additionalInfo?: Array<{ nombre: string; valor: string }>;
}

export interface SettlementIssuerPdf {
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;
  direccionMatriz: string;
  direccionEstablecimiento?: string;
  telefono?: string;
  obligadoContabilidad?: string;
  tipoContribuyente?: string;
}

const ID_TYPE_LABELS: Record<string, string> = { '05': 'Cédula', '06': 'Pasaporte' };

const fmt2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const fmtQty = (n: number) => String(Math.round((Number(n) || 0) * 1e6) / 1e6);
/** Precio unitario: 2 decimales, o hasta 6 si los tiene (el XML lleva 6). */
const fmtPrice = (n: number) => {
  const v = Math.round((Number(n) || 0) * 1e6) / 1e6;
  return Math.round(v * 100) / 100 === v ? v.toFixed(2) : String(v);
};

function fmtDate(d: Date | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Guayaquil' });
}

function fmtDatetime(d: Date): string {
  return d.toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/Guayaquil',
  });
}

export function buildSettlementPdf(opts: {
  data: SettlementPdfData;
  issuer: SettlementIssuerPdf;
  qrBuffer?: Buffer | null;
  logoBuffer?: Buffer | null;
}): Promise<Buffer> {
  const { data, issuer, qrBuffer, logoBuffer } = opts;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: {
      Title: `Liquidación de compra ${data.fullNumber}`, Author: issuer.razonSocial,
    } });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width - 80;
    const LEFT = 40;
    const GRAY = '#555555';
    const DARK = '#111111';
    const ACCENT = '#2f6f4f';
    const LGRAY = '#cccccc';
    const hr = (y: number, lw = 1) => {
      doc.moveTo(LEFT, y).lineTo(LEFT + PW, y).strokeColor(LGRAY).lineWidth(lw).stroke();
    };
    const center = (text: string) => doc.text(text, LEFT, doc.y, { width: PW, align: 'center' });

    // ── Emisor ────────────────────────────────────────────────────────────────
    const LOGO_W = 200;
    const logoH = drawLogo(doc, logoBuffer, LEFT + (PW - LOGO_W) / 2, 40, LOGO_W, 60, 'center');
    const headerTop = logoH > 0 ? 40 + logoH + 6 : 40;
    doc.fontSize(15).fillColor(ACCENT).font('Helvetica-Bold')
      .text(issuer.razonSocial.toUpperCase(), LEFT, headerTop, { width: PW, align: 'center' });
    if (issuer.nombreComercial) { doc.moveDown(0.2).fontSize(10).fillColor(GRAY).font('Helvetica'); center(issuer.nombreComercial); }
    doc.moveDown(0.3).fontSize(8).fillColor(GRAY).font('Helvetica');
    center(`RUC: ${issuer.ruc}`);
    doc.moveDown(0.2); center(`Dirección matriz: ${issuer.direccionMatriz}`);
    if (issuer.direccionEstablecimiento && issuer.direccionEstablecimiento !== issuer.direccionMatriz) {
      doc.moveDown(0.2); center(`Dirección establecimiento: ${issuer.direccionEstablecimiento}`);
    }
    if (issuer.telefono) { doc.moveDown(0.2); center(`Tel: ${issuer.telefono}`); }
    if (issuer.obligadoContabilidad) { doc.moveDown(0.2); center(`Obligado a llevar contabilidad: ${issuer.obligadoContabilidad}`); }
    if (issuer.tipoContribuyente) { doc.moveDown(0.2); center(`Tipo de contribuyente: ${issuer.tipoContribuyente}`); }

    doc.moveDown(0.8).fontSize(12).fillColor(DARK).font('Helvetica-Bold');
    center('LIQUIDACIÓN DE COMPRA DE BIENES Y PRESTACIÓN DE SERVICIOS');
    doc.moveDown(0.3).fontSize(10).font('Helvetica'); center(`No. ${data.fullNumber}`);
    doc.moveDown(0.25); center(`Fecha de emisión: ${fmtDate(data.date)}`);
    doc.moveDown(0.25).fontSize(8).fillColor(GRAY); center(`Ambiente: ${data.ambiente} · Emisión: NORMAL`);
    hr(doc.y + 6); doc.y = doc.y + 14;

    // ── Autorización y clave ─────────────────────────────────────────────────
    if (data.authorizationNumber) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('NÚMERO DE AUTORIZACIÓN SRI:', LEFT, doc.y);
      doc.moveDown(0.2).font('Helvetica').fillColor(DARK).text(data.authorizationNumber, LEFT, doc.y, { width: PW });
      if (data.authorizedAt) {
        doc.moveDown(0.2).fillColor(GRAY).font('Helvetica-Bold').text('FECHA/HORA AUTORIZACIÓN:', LEFT, doc.y);
        doc.moveDown(0.2).font('Helvetica').fillColor(DARK).text(fmtDatetime(data.authorizedAt), LEFT, doc.y);
      }
      doc.moveDown(0.5);
    }
    if (data.accessKey) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('CLAVE DE ACCESO:', LEFT, doc.y);
      doc.moveDown(0.2).font('Courier').fillColor(DARK).fontSize(7).text(data.accessKey, LEFT, doc.y, { width: PW - 80 });
      if (qrBuffer) doc.image(qrBuffer, LEFT + PW - 72, doc.y - 12, { width: 70, height: 70 });
      doc.moveDown(0.5);
    }
    hr(doc.y + 2, 0.5); doc.y = doc.y + 10;

    // ── Proveedor ────────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('DATOS DEL PROVEEDOR', LEFT, doc.y);
    doc.moveDown(0.3).font('Helvetica').fillColor(DARK);
    const idLabel = ID_TYPE_LABELS[data.supplierTaxIdType] ?? 'Identificación';
    doc.text(`Razón social / Nombre: ${data.supplierName}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`${idLabel}: ${data.supplierTaxId}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    if (data.supplierAddress) { doc.text(`Dirección: ${data.supplierAddress}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2); }
    doc.moveDown(0.3); hr(doc.y, 0.5); doc.y = doc.y + 8;

    // ── Detalle ──────────────────────────────────────────────────────────────
    const COL = { code: PW * 0.12, desc: PW * 0.38, qty: PW * 0.1, price: PW * 0.13, disc: PW * 0.12, total: PW * 0.15 };
    const header = (y: number) => {
      doc.rect(LEFT, y, PW, 14).fill('#e3efe8');
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7);
      let x = LEFT + 2;
      const cells: Array<[string, number, 'left' | 'right']> = [
        ['Código', COL.code, 'left'], ['Descripción', COL.desc, 'left'], ['Cant.', COL.qty, 'right'],
        ['P. unitario', COL.price, 'right'], ['Descuento', COL.disc, 'right'], ['Total', COL.total, 'right'],
      ];
      for (const [t, w, align] of cells) { doc.text(t, x, y + 3, { width: w - 4, lineBreak: false, align }); x += w; }
      doc.y = y + 16;
    };
    header(doc.y);
    doc.font('Helvetica').fontSize(7).fillColor(DARK);
    let even = false;
    for (const l of data.lines) {
      const descH = doc.heightOfString(l.description, { width: COL.desc - 4 });
      const rowH = Math.max(14, descH + 6);
      if (doc.y + rowH > doc.page.height - 60) { doc.addPage(); header(40); doc.font('Helvetica').fontSize(7).fillColor(DARK); }
      const y = doc.y;
      if (even) { doc.rect(LEFT, y, PW, rowH).fill('#f5faf7'); doc.fillColor(DARK); }
      even = !even;
      let x = LEFT + 2;
      doc.text(l.code ?? '', x, y + 3, { width: COL.code - 4, lineBreak: false }); x += COL.code;
      doc.text(l.description, x, y + 3, { width: COL.desc - 4 }); x += COL.desc;
      doc.text(fmtQty(l.qty), x, y + 3, { width: COL.qty - 4, lineBreak: false, align: 'right' }); x += COL.qty;
      doc.text(fmtPrice(l.unitCost), x, y + 3, { width: COL.price - 4, lineBreak: false, align: 'right' }); x += COL.price;
      doc.text(fmt2(l.discountAmount), x, y + 3, { width: COL.disc - 4, lineBreak: false, align: 'right' }); x += COL.disc;
      doc.text(fmt2(l.subtotal), x, y + 3, { width: COL.total - 4, lineBreak: false, align: 'right' });
      doc.y = y + rowH;
    }
    hr(doc.y, 0.5); doc.moveDown(0.6);

    // ── Info adicional (izquierda) y totales (derecha) ───────────────────────
    const blockTop = doc.y;
    const info = (data.additionalInfo ?? []).filter((f) => f.nombre && f.valor);
    if (data.paymentLabel) info.unshift({ nombre: 'Forma de pago', valor: data.paymentLabel });
    if (info.length) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('INFORMACIÓN ADICIONAL', LEFT, blockTop);
      doc.font('Helvetica').fillColor(DARK).fontSize(7);
      for (const f of info) { doc.moveDown(0.2).text(`${f.nombre}: ${f.valor}`, LEFT, doc.y, { width: PW * 0.55 }); }
    }
    const leftBottom = doc.y;
    const TLEFT = LEFT + PW * 0.6;
    const LW = PW * 0.24;
    const VW = PW * 0.16;
    doc.y = blockTop;
    const totRow = (label: string, value: number, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(DARK)
        .text(label, TLEFT, y, { width: LW, lineBreak: false })
        .text(`$ ${fmt2(value)}`, TLEFT + LW, y, { width: VW, lineBreak: false, align: 'right' });
      doc.y = y + 12;
    };
    for (const g of data.taxGroups) totRow(`Subtotal ${g.vatRate} %:`, g.base);
    totRow('Subtotal sin impuestos:', data.subtotal);
    totRow('Total descuento:', data.totalDiscount);
    for (const g of data.taxGroups.filter((x) => x.vatRate > 0)) totRow(`IVA ${g.vatRate} %:`, g.tax);
    totRow('VALOR TOTAL:', data.total, true);
    doc.y = Math.max(doc.y, leftBottom);

    if (data.notes) {
      doc.moveDown(0.8);
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('OBSERVACIONES:', LEFT, doc.y);
      doc.font('Helvetica').fillColor(DARK).text(data.notes, LEFT, doc.y, { width: PW });
    }

    doc.moveDown(1.2); hr(doc.y); doc.moveDown(0.4);
    doc.fontSize(9).fillColor(ACCENT).font('Helvetica-Bold');
    center(data.authorizationNumber ? 'DOCUMENTO AUTORIZADO POR EL SRI' : 'DOCUMENTO SIN AUTORIZACIÓN DEL SRI');
    doc.end();
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  '01': 'Sin utilización del sistema financiero',
  '15': 'Compensación de deudas',
  '16': 'Tarjeta de débito',
  '17': 'Dinero electrónico',
  '18': 'Tarjeta prepago',
  '19': 'Tarjeta de crédito',
  '20': 'Otros con utilización del sistema financiero',
  '21': 'Endoso de títulos',
};

export async function generateSettlementPdfInternal(purchaseId: string, companyId: string): Promise<{ pdfUrl: string }> {
  const db = admin.firestore();
  const ref = db.doc(`companies/${companyId}/purchases/${purchaseId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Liquidación no encontrada: ${purchaseId}`);
  const p = snap.data() as Record<string, any>;
  if (p['issuedByCompany'] !== true) throw new Error('La compra no es una liquidación emitida por la empresa.');

  const companyData = (await db.doc(`companies/${companyId}`).get()).data() as Record<string, any>;
  const sriCfg = ((await db.doc(`companies/${companyId}/configuration/sri`).get()).data() ?? {}) as Record<string, any>;
  const sri = companyData?.['sri'] ?? {};

  const lines = (p['lines'] ?? []) as Array<Record<string, any>>;
  const groups = new Map<number, { base: number; tax: number }>();
  for (const l of lines) {
    const g = groups.get(Number(l['taxRate'])) ?? { base: 0, tax: 0 };
    g.base += Number(l['subtotal'] ?? 0);
    g.tax += Number(l['taxAmount'] ?? 0);
    groups.set(Number(l['taxRate']), g);
  }

  let qrBuffer: Buffer | null = null;
  if (p['accessKey']) {
    try {
      qrBuffer = await QRCode.toBuffer(p['accessKey'], { type: 'png', width: 150, margin: 1, errorCorrectionLevel: 'M' });
    } catch (err) {
      console.warn('[generate-settlement-pdf] No se pudo generar el QR:', err);
    }
  }
  const logoBuffer = await loadCompanyLogo(companyId, companyData, 'generate-settlement-pdf');

  const pdf = await buildSettlementPdf({
    data: {
      fullNumber: p['settlement']?.['fullNumber'] ?? p['supplierInvoiceNumber'],
      date: p['date'].toDate(),
      accessKey: p['accessKey'],
      authorizationNumber: p['authorizationNumber'],
      authorizedAt: p['authorizedAt']?.toDate?.(),
      ambiente: sri.environment === 'production' ? 'PRODUCCIÓN' : 'PRUEBAS',
      supplierName: p['supplierName'],
      supplierTaxId: p['supplierRuc'],
      supplierTaxIdType: p['supplierTaxIdType'],
      supplierAddress: p['supplierAddress'],
      lines: lines.map((l) => ({
        code: l['productSku'], description: l['description'] ?? l['productName'] ?? '',
        qty: Number(l['qty']), unitCost: Number(l['unitCost']), discountAmount: Number(l['discountAmount'] ?? 0),
        subtotal: Number(l['subtotal']), taxRate: Number(l['taxRate']),
      })),
      subtotal: Number(p['subtotal'] ?? 0),
      totalDiscount: Number(p['totalDiscount'] ?? 0),
      taxGroups: [...groups.entries()].sort(([a], [b]) => b - a).map(([vatRate, g]) => ({ vatRate, base: g.base, tax: g.tax })),
      total: Number(p['subtotal'] ?? 0) + Number(p['totalTax'] ?? 0),
      paymentLabel: PAYMENT_LABELS[p['paymentMethodCode']] ?? p['paymentMethodCode'],
      notes: p['notes'],
      additionalInfo: p['additionalInfo'],
    },
    issuer: {
      razonSocial: sriCfg['razonSocial'] ?? '',
      nombreComercial: sriCfg['nombreComercial'],
      ruc: sri.ruc ?? '',
      direccionMatriz: sriCfg['direccionMatriz'] ?? '',
      direccionEstablecimiento: sriCfg['direccionEstablecimiento'],
      telefono: sriCfg['telefono'],
      obligadoContabilidad: sriCfg['obligadoContabilidad'] ?? (sri.accountingRequired ? 'SI' : 'NO'),
      tipoContribuyente: contributorTypeLabel(sri.contributorType),
    },
    qrBuffer,
    logoBuffer,
  });

  const file = getStorage().bucket().file(`companies/${companyId}/pdf/lc-${purchaseId}.pdf`);
  await file.save(pdf, { metadata: { contentType: 'application/pdf' } });
  await file.makePublic(); // como el resto de RIDE (decisión D4, abierta)
  const pdfUrl = `https://storage.googleapis.com/${file.bucket.name}/${file.name}`;
  await ref.update({ pdfUrl, updatedAt: admin.firestore.Timestamp.now() });
  return { pdfUrl };
}
