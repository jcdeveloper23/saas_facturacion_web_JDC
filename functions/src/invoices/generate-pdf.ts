import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  sriTaxCode?: string;
  lineTotal: number;
  taxAmount: number;
}

interface Invoice {
  number: string;
  date: admin.firestore.Timestamp;
  status: string;
  sriStatus?: string;
  accessKey?: string;
  authorizationNumber?: string;
  authorizedAt?: admin.firestore.Timestamp;
  customerName: string;
  customerTaxId: string;
  customerIdentificationType?: string;
  customerEmail?: string;
  customerAddress?: string;
  subtotal: number;
  discount: number;
  taxableBase: number;
  vatAmount: number;
  total: number;
  lines: InvoiceLine[];
  paymentMethod?: string;
  paymentDays?: number;
  notes?: string;
}

interface SriCompanyConfig {
  razonSocial: string;
  nombreComercial?: string;
  direccionMatriz: string;
  direccionEstablecimiento: string;
  telefono?: string;
  correo?: string;
  obligadoContabilidad: 'SI' | 'NO';
  additionalInfoFields?: Array<{ nombre: string; valor: string }>;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt2(n: number): string { return n.toFixed(2); }

function formatDate(ts: admin.firestore.Timestamp): string {
  const d = ts.toDate();
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDatetime(ts: admin.firestore.Timestamp): string {
  const d = ts.toDate();
  return d.toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    timeZone: 'America/Guayaquil',
  });
}

function paymentMethodName(code: string): string {
  const map: Record<string, string> = {
    '01': 'Sin utilización del sistema financiero',
    '15': 'Compensación de deudas',
    '16': 'Tarjeta de débito',
    '17': 'Dinero electrónico',
    '18': 'Tarjeta prepago',
    '19': 'Tarjeta de crédito',
    '20': 'Otros con utilización del sistema financiero',
    '21': 'Endoso de títulos',
  };
  return map[code] ?? code;
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

interface BuildPdfOptions {
  invoice: Invoice;
  companyId: string;
  companyRuc: string;
  sriConfig: SriCompanyConfig;
}

async function buildPdfBuffer(opts: BuildPdfOptions): Promise<Buffer> {
  const { invoice, companyRuc, sriConfig } = opts;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Letter-ish page, narrow margins
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Factura ${invoice.number}`,
        Author: sriConfig.razonSocial,
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width - 80; // usable width after margins
    const LEFT = 40;
    const GRAY = '#555555';
    const DARK = '#111111';
    const ACCENT = '#1a56c4';
    const LINE_GRAY = '#cccccc';

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(16).fillColor(ACCENT).font('Helvetica-Bold')
      .text(sriConfig.razonSocial.toUpperCase(), LEFT, 40, { width: PAGE_W, align: 'center' });

    if (sriConfig.nombreComercial) {
      doc.moveDown(0.2).fontSize(11).fillColor(GRAY).font('Helvetica')
        .text(sriConfig.nombreComercial, LEFT, doc.y, { width: PAGE_W, align: 'center' });
    }

    doc.moveDown(0.3).fontSize(9).fillColor(GRAY)
      .text(`RUC: ${companyRuc}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });

    doc.moveDown(0.2)
      .text(`Dirección: ${sriConfig.direccionMatriz}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });

    if (sriConfig.telefono) {
      doc.moveDown(0.2)
        .text(`Tel: ${sriConfig.telefono}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });
    }

    // Document title
    doc.moveDown(0.8)
      .fontSize(13).fillColor(DARK).font('Helvetica-Bold')
      .text('FACTURA', LEFT, doc.y, { width: PAGE_W, align: 'center' });

    doc.moveDown(0.3).fontSize(10).font('Helvetica')
      .text(`No. ${invoice.number}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });

    doc.moveDown(0.3)
      .text(`Fecha de emisión: ${formatDate(invoice.date)}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });

    // Horizontal rule
    const afterHeader = doc.y + 6;
    doc.moveTo(LEFT, afterHeader).lineTo(LEFT + PAGE_W, afterHeader)
      .strokeColor(LINE_GRAY).lineWidth(1).stroke();
    doc.y = afterHeader + 8;

    // ── Authorization block ──────────────────────────────────────────────────
    if (invoice.authorizationNumber) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('NÚMERO DE AUTORIZACIÓN SRI:', LEFT, doc.y);
      doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
        .text(invoice.authorizationNumber, LEFT, doc.y, { width: PAGE_W });

      if (invoice.authorizedAt) {
        doc.moveDown(0.2).fillColor(GRAY).font('Helvetica-Bold')
          .text('FECHA/HORA AUTORIZACIÓN:', LEFT, doc.y);
        doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
          .text(formatDatetime(invoice.authorizedAt), LEFT, doc.y);
      }
      doc.moveDown(0.5);
    }

    // ── Access Key + QR ──────────────────────────────────────────────────────
    if (invoice.accessKey) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('CLAVE DE ACCESO:', LEFT, doc.y);
      doc.moveDown(0.2).font('Courier').fillColor(DARK).fontSize(7)
        .text(invoice.accessKey, LEFT, doc.y, { width: PAGE_W - 80 });

      // QR placeholder — will be replaced with actual image below
      const qrX = LEFT + PAGE_W - 72;
      const qrY = doc.y - 12;

      // Generate QR synchronously by encoding to buffer
      // (QRCode.toBuffer is async; we handle it before building PDF)
      // See outer async wrapper — qrBuffer is passed in as opts.qrBuffer
      if ((opts as any).qrBuffer) {
        doc.image((opts as any).qrBuffer, qrX, qrY, { width: 70, height: 70 });
      }

      doc.moveDown(0.5);
    }

    // Horizontal rule
    const afterAuth = doc.y + 2;
    doc.moveTo(LEFT, afterAuth).lineTo(LEFT + PAGE_W, afterAuth)
      .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
    doc.y = afterAuth + 8;

    // ── Buyer data ───────────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('DATOS DEL COMPRADOR', LEFT, doc.y);
    doc.moveDown(0.3);

    const idTypeMap: Record<string, string> = { '04': 'RUC', '05': 'Cédula', '07': 'Pasaporte' };
    const idLabel = idTypeMap[invoice.customerIdentificationType ?? '04'] ?? 'RUC';

    const buyerInfo = [
      [`Razón Social / Nombre:`, invoice.customerName],
      [`${idLabel}:`, invoice.customerTaxId],
    ];
    if (invoice.customerEmail) buyerInfo.push(['Email:', invoice.customerEmail]);
    if (invoice.customerAddress) buyerInfo.push(['Dirección:', invoice.customerAddress]);

    doc.font('Helvetica').fontSize(8).fillColor(DARK);
    for (const [label, value] of buyerInfo) {
      doc.text(`${label} ${value}`, LEFT, doc.y, { width: PAGE_W });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.3);

    // Horizontal rule
    const afterBuyer = doc.y;
    doc.moveTo(LEFT, afterBuyer).lineTo(LEFT + PAGE_W, afterBuyer)
      .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
    doc.y = afterBuyer + 8;

    // ── Lines table ──────────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('DETALLE DE PRODUCTOS / SERVICIOS', LEFT, doc.y);
    doc.moveDown(0.4);

    // Column widths (total = PAGE_W)
    const COL = {
      desc:  PAGE_W * 0.32,
      qty:   PAGE_W * 0.09,
      price: PAGE_W * 0.12,
      disc:  PAGE_W * 0.09,
      sub:   PAGE_W * 0.13,
      iva:   PAGE_W * 0.09,
      total: PAGE_W * 0.16,
    };

    // Table header
    const tableTop = doc.y;
    doc.rect(LEFT, tableTop, PAGE_W, 14).fill('#e8ecf5');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7);
    let cx = LEFT + 2;
    doc.text('Descripción',         cx, tableTop + 3, { width: COL.desc, lineBreak: false }); cx += COL.desc;
    doc.text('Cant.',               cx, tableTop + 3, { width: COL.qty,  lineBreak: false, align: 'right' }); cx += COL.qty;
    doc.text('P. Unit.',            cx, tableTop + 3, { width: COL.price,lineBreak: false, align: 'right' }); cx += COL.price;
    doc.text('Desc.',               cx, tableTop + 3, { width: COL.disc, lineBreak: false, align: 'right' }); cx += COL.disc;
    doc.text('Subtotal',            cx, tableTop + 3, { width: COL.sub,  lineBreak: false, align: 'right' }); cx += COL.sub;
    doc.text('IVA',                 cx, tableTop + 3, { width: COL.iva,  lineBreak: false, align: 'right' }); cx += COL.iva;
    doc.text('Total',               cx, tableTop + 3, { width: COL.total,lineBreak: false, align: 'right' });

    doc.y = tableTop + 16;
    doc.font('Helvetica').fontSize(7).fillColor(DARK);

    let rowEven = false;
    for (const line of invoice.lines) {
      const rowY = doc.y;
      const rowHeight = 18;

      if (rowEven) {
        doc.rect(LEFT, rowY, PAGE_W, rowHeight).fill('#f7f8fc');
        doc.fillColor(DARK);
      }
      rowEven = !rowEven;

      const desc = line.sku ? `[${line.sku}] ${line.description}` : line.description;
      cx = LEFT + 2;
      doc.text(desc,                   cx, rowY + 4, { width: COL.desc - 4, lineBreak: false }); cx += COL.desc;
      doc.text(fmt2(line.quantity),    cx, rowY + 4, { width: COL.qty,  lineBreak: false, align: 'right' }); cx += COL.qty;
      doc.text(fmt2(line.unitPrice),   cx, rowY + 4, { width: COL.price,lineBreak: false, align: 'right' }); cx += COL.price;
      doc.text(fmt2(line.discount),    cx, rowY + 4, { width: COL.disc, lineBreak: false, align: 'right' }); cx += COL.disc;
      doc.text(fmt2(line.lineTotal),   cx, rowY + 4, { width: COL.sub,  lineBreak: false, align: 'right' }); cx += COL.sub;
      doc.text(`${line.taxRate}%`,     cx, rowY + 4, { width: COL.iva,  lineBreak: false, align: 'right' }); cx += COL.iva;
      doc.text(fmt2(line.lineTotal + line.taxAmount), cx, rowY + 4, { width: COL.total - 2, lineBreak: false, align: 'right' });

      doc.y = rowY + rowHeight;
    }

    // Bottom border of table
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + PAGE_W, doc.y)
      .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
    doc.moveDown(0.6);

    // ── Totals block (right-aligned) ─────────────────────────────────────────
    const TOTAL_LEFT = LEFT + PAGE_W * 0.55;
    const TOTAL_W    = PAGE_W * 0.45;
    const LABEL_W    = TOTAL_W * 0.6;
    const VALUE_W    = TOTAL_W * 0.4;

    function totalRow(label: string, value: string, bold = false) {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(DARK)
        .text(label, TOTAL_LEFT, y, { width: LABEL_W, lineBreak: false })
        .text(value, TOTAL_LEFT + LABEL_W, y, { width: VALUE_W, lineBreak: false, align: 'right' });
      doc.moveDown(0.35);
    }

    totalRow('Subtotal sin impuestos:', `$ ${fmt2(invoice.subtotal)}`);
    totalRow('Descuento total:',        `$ ${fmt2(invoice.discount)}`);

    // Group IVA by rate
    const ivaGroups: Map<number, { base: number; tax: number }> = new Map();
    for (const line of invoice.lines) {
      const existing = ivaGroups.get(line.taxRate) ?? { base: 0, tax: 0 };
      ivaGroups.set(line.taxRate, {
        base: existing.base + line.lineTotal,
        tax:  existing.tax  + line.taxAmount,
      });
    }
    for (const [rate, { base, tax }] of ivaGroups) {
      totalRow(`Base IVA ${rate}%:`, `$ ${fmt2(base)}`);
      totalRow(`IVA ${rate}%:`,      `$ ${fmt2(tax)}`);
    }

    totalRow('IMPORTE TOTAL:', `$ ${fmt2(invoice.total)}`, true);

    doc.moveDown(0.5);

    // ── Payment method ────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
      .text('FORMA DE PAGO:', LEFT, doc.y);
    doc.font('Helvetica').fillColor(DARK)
      .text(
        `${paymentMethodName(invoice.paymentMethod ?? '01')}` +
        (invoice.paymentDays ? ` — Plazo: ${invoice.paymentDays} días` : ''),
        LEFT, doc.y, { width: PAGE_W }
      );
    doc.moveDown(0.5);

    // ── Additional info ───────────────────────────────────────────────────────
    if (sriConfig.additionalInfoFields && sriConfig.additionalInfoFields.length > 0) {
      doc.moveTo(LEFT, doc.y).lineTo(LEFT + PAGE_W, doc.y)
        .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('INFORMACIÓN ADICIONAL', LEFT, doc.y);
      doc.moveDown(0.3);
      doc.font('Helvetica').fillColor(DARK).fontSize(7);
      for (const field of sriConfig.additionalInfoFields) {
        doc.text(`${field.nombre}: ${field.valor}`, LEFT, doc.y, { width: PAGE_W });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.3);
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (invoice.notes) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('OBSERVACIONES:', LEFT, doc.y);
      doc.font('Helvetica').fillColor(DARK)
        .text(invoice.notes, LEFT, doc.y, { width: PAGE_W });
      doc.moveDown(0.5);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveDown(1);
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + PAGE_W, doc.y)
      .strokeColor(LINE_GRAY).lineWidth(1).stroke();
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor(ACCENT).font('Helvetica-Bold')
      .text('DOCUMENTO AUTORIZADO', LEFT, doc.y, { width: PAGE_W, align: 'center' });
    doc.moveDown(0.3).fontSize(7).fillColor(GRAY).font('Helvetica')
      .text('Generado por SaasFacturacion — Ecuador', LEFT, doc.y, { width: PAGE_W, align: 'center' });

    doc.end();
  });
}

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

export async function generatePdfInternal(
  invoiceId: string,
  companyId: string
): Promise<{ pdfUrl: string }> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();
  const now = admin.firestore.Timestamp.now();

  console.log('[generate-pdf] Inicio:', { invoiceId, companyId });

  // 1. Read Invoice
  const invoiceSnap = await db.doc(`companies/${companyId}/invoices/${invoiceId}`).get();
  if (!invoiceSnap.exists) {
    throw new Error(`Factura no encontrada: ${invoiceId}`);
  }
  const invoice = invoiceSnap.data() as Invoice;

  // 2. Read Company
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) {
    throw new Error(`Empresa no encontrada: ${companyId}`);
  }
  const companyData = companySnap.data() as Record<string, any>;
  const companyRuc: string = companyData['sri']?.['ruc'] ?? '';

  // 3. Read SRI config
  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriConfigSnap.exists) {
    throw new Error(`Configuración SRI no encontrada para empresa: ${companyId}`);
  }
  const sriConfig = sriConfigSnap.data() as SriCompanyConfig;

  console.log('[generate-pdf] Datos leídos. Generando QR...');

  // 4. Generate QR code for access key
  let qrBuffer: Buffer | null = null;
  if (invoice.accessKey) {
    try {
      qrBuffer = await QRCode.toBuffer(invoice.accessKey, {
        type: 'png',
        width: 150,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      console.log('[generate-pdf] QR generado, bytes:', qrBuffer!.length);
    } catch (err) {
      console.warn('[generate-pdf] No se pudo generar QR:', err);
    }
  }

  // 5. Build PDF
  console.log('[generate-pdf] Construyendo PDF...');
  const pdfBuffer = await buildPdfBuffer({
    invoice,
    companyId,
    companyRuc,
    sriConfig,
    qrBuffer,
  } as any);

  console.log('[generate-pdf] PDF generado, bytes:', pdfBuffer.length);

  // 6. Upload to Storage
  const pdfPath = `companies/${companyId}/pdf/${invoiceId}.pdf`;
  const pdfFile = bucket.file(pdfPath);

  try {
    await pdfFile.save(pdfBuffer, {
      metadata: { contentType: 'application/pdf' },
    });
    console.log('[generate-pdf] PDF subido a Storage:', pdfPath);
  } catch (err) {
    console.error('[generate-pdf] Error subiendo PDF:', err);
    throw new Error('Error al guardar PDF en Storage');
  }

  await pdfFile.makePublic();
  const pdfUrl = `https://storage.googleapis.com/${pdfFile.bucket.name}/${pdfFile.name}`;

  // 7. Update Invoice
  await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
    pdfUrl,
    updatedAt: now,
  });

  console.log('[generate-pdf] Factura actualizada con pdfUrl');
  return { pdfUrl };
}

// ─── Callable function ────────────────────────────────────────────────────────

export const generatePdf = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { invoiceId, companyId } = request.data as { invoiceId: string; companyId: string };

  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new HttpsError('invalid-argument', 'invoiceId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }

  const callerRole = request.auth.token['role'] as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await generatePdfInternal(invoiceId, companyId);
  } catch (err) {
    console.error('[generate-pdf] Error callable:', err);
    const message = err instanceof Error ? err.message : 'Error generando PDF';
    throw new HttpsError('internal', message);
  }
});
