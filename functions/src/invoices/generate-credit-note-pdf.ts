import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditNoteLine {
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

interface CreditNote {
  number: string;
  fullNumber?: string;
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
  lines: CreditNoteLine[];
  notes?: string;
  // Credit-note-specific fields
  rectifiedInvoiceNumber?: string;   // serie de la factura original (fullNumber)
  rectifiedInvoiceDate?: admin.firestore.Timestamp | string;  // fecha de la factura original
  rectifiedInvoiceAuthNumber?: string; // N° autorización SRI de la factura original
  creditNoteMotivo?: string;           // motivo de la nota de crédito
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

function formatDateRectified(value: admin.firestore.Timestamp | string | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  return formatDate(value as admin.firestore.Timestamp);
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

// ─── PDF builder ──────────────────────────────────────────────────────────────

interface BuildCreditNotePdfOptions {
  creditNote: CreditNote;
  companyId: string;
  companyRuc: string;
  sriConfig: SriCompanyConfig;
  qrBuffer?: Buffer | null;
}

async function buildCreditNotePdfBuffer(opts: BuildCreditNotePdfOptions): Promise<Buffer> {
  const { creditNote, companyRuc, sriConfig } = opts;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Nota de Crédito ${creditNote.fullNumber ?? creditNote.number}`,
        Author: sriConfig.razonSocial,
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W   = doc.page.width - 80;
    const LEFT     = 40;
    const GRAY     = '#555555';
    const DARK     = '#111111';
    const ACCENT   = '#1a4c94';  // azul oscuro para nota de crédito
    const LINE_GRAY = '#cccccc';

    // ── Header ───────────────────────────────────────────────────────────────
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

    // Document title — "NOTA DE CRÉDITO" in dark blue
    doc.moveDown(0.8)
      .fontSize(14).fillColor(ACCENT).font('Helvetica-Bold')
      .text('NOTA DE CRÉDITO', LEFT, doc.y, { width: PAGE_W, align: 'center' });

    doc.moveDown(0.3).fontSize(10).fillColor(DARK).font('Helvetica')
      .text(`No. ${creditNote.fullNumber ?? creditNote.number}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });

    doc.moveDown(0.3)
      .text(`Fecha de emisión: ${formatDate(creditNote.date)}`, LEFT, doc.y, { width: PAGE_W, align: 'center' });

    // Horizontal rule
    const afterHeader = doc.y + 6;
    doc.moveTo(LEFT, afterHeader).lineTo(LEFT + PAGE_W, afterHeader)
      .strokeColor(LINE_GRAY).lineWidth(1).stroke();
    doc.y = afterHeader + 8;

    // ── Authorization block ──────────────────────────────────────────────────
    if (creditNote.authorizationNumber) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('NÚMERO DE AUTORIZACIÓN SRI:', LEFT, doc.y);
      doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
        .text(creditNote.authorizationNumber, LEFT, doc.y, { width: PAGE_W });

      if (creditNote.authorizedAt) {
        doc.moveDown(0.2).fillColor(GRAY).font('Helvetica-Bold')
          .text('FECHA/HORA AUTORIZACIÓN:', LEFT, doc.y);
        doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
          .text(formatDatetime(creditNote.authorizedAt), LEFT, doc.y);
      }
      doc.moveDown(0.5);
    }

    // ── Access Key + QR ──────────────────────────────────────────────────────
    if (creditNote.accessKey) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('CLAVE DE ACCESO:', LEFT, doc.y);
      doc.moveDown(0.2).font('Courier').fillColor(DARK).fontSize(7)
        .text(creditNote.accessKey, LEFT, doc.y, { width: PAGE_W - 80 });

      const qrX = LEFT + PAGE_W - 72;
      const qrY = doc.y - 12;

      if (opts.qrBuffer) {
        doc.image(opts.qrBuffer, qrX, qrY, { width: 70, height: 70 });
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
    const idLabel = idTypeMap[creditNote.customerIdentificationType ?? '04'] ?? 'RUC';

    const buyerInfo: [string, string][] = [
      ['Razón Social / Nombre:', creditNote.customerName],
      [`${idLabel}:`, creditNote.customerTaxId],
    ];
    if (creditNote.customerEmail)   buyerInfo.push(['Email:', creditNote.customerEmail]);
    if (creditNote.customerAddress) buyerInfo.push(['Dirección:', creditNote.customerAddress]);

    doc.font('Helvetica').fontSize(8).fillColor(DARK);
    for (const [label, value] of buyerInfo) {
      doc.text(`${label} ${value}`, LEFT, doc.y, { width: PAGE_W });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.3);

    // Horizontal rule
    let hr = doc.y;
    doc.moveTo(LEFT, hr).lineTo(LEFT + PAGE_W, hr)
      .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
    doc.y = hr + 8;

    // ── Comprobante modificado ───────────────────────────────────────────────
    doc.fontSize(9).fillColor(ACCENT).font('Helvetica-Bold')
      .text('DATOS DEL COMPROBANTE MODIFICADO', LEFT, doc.y);
    doc.moveDown(0.3);

    // Box background
    const boxTop = doc.y;
    const boxPad = 6;
    const modFields: [string, string][] = [
      ['Tipo:', 'FACTURA (01)'],
      ['Serie:', creditNote.rectifiedInvoiceNumber ?? '—'],
      ['Fecha:', formatDateRectified(creditNote.rectifiedInvoiceDate)],
      ['N° Autorización:', creditNote.rectifiedInvoiceAuthNumber ?? '—'],
      ['Motivo:', creditNote.creditNoteMotivo ?? '—'],
    ];

    // Two-column layout for first four fields, motivo full-width
    doc.font('Helvetica').fontSize(8).fillColor(DARK);
    const halfW = (PAGE_W - boxPad * 2) / 2;

    // Draw background rect (height estimated: 4 rows of ~14pt + motivo ~14pt + padding)
    const boxHeight = modFields.length * 14 + boxPad * 2 + 4;
    doc.rect(LEFT, boxTop, PAGE_W, boxHeight).fillAndStroke('#eef2fa', ACCENT);
    doc.fillColor(DARK);

    let fieldY = boxTop + boxPad;
    const col1X = LEFT + boxPad;
    const col2X = LEFT + boxPad + halfW;

    // Row 1: Tipo | Serie
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GRAY)
      .text('Tipo:', col1X, fieldY, { width: halfW, lineBreak: false });
    doc.font('Helvetica').fillColor(DARK)
      .text('FACTURA (01)', col1X + 32, fieldY, { width: halfW - 32, lineBreak: false });

    doc.font('Helvetica-Bold').fillColor(GRAY)
      .text('Serie:', col2X, fieldY, { width: halfW, lineBreak: false });
    doc.font('Helvetica').fillColor(DARK)
      .text(creditNote.rectifiedInvoiceNumber ?? '—', col2X + 32, fieldY, { width: halfW - 32, lineBreak: false });
    fieldY += 14;

    // Row 2: Fecha | N° Autorización
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GRAY)
      .text('Fecha:', col1X, fieldY, { width: halfW, lineBreak: false });
    doc.font('Helvetica').fillColor(DARK)
      .text(formatDateRectified(creditNote.rectifiedInvoiceDate), col1X + 38, fieldY, { width: halfW - 38, lineBreak: false });

    doc.font('Helvetica-Bold').fillColor(GRAY)
      .text('N° Autorización:', col2X, fieldY, { width: halfW, lineBreak: false });
    doc.font('Helvetica').fillColor(DARK)
      .text(creditNote.rectifiedInvoiceAuthNumber ?? '—', col2X + 72, fieldY, { width: halfW - 72, lineBreak: false });
    fieldY += 14;

    // Row 3: Motivo (full width)
    doc.font('Helvetica-Bold').fontSize(7).fillColor(GRAY)
      .text('Motivo:', col1X, fieldY, { width: PAGE_W - boxPad * 2, lineBreak: false });
    doc.font('Helvetica').fillColor(DARK)
      .text(creditNote.creditNoteMotivo ?? '—', col1X + 40, fieldY, { width: PAGE_W - boxPad * 2 - 40, lineBreak: false });

    doc.y = boxTop + boxHeight + 8;

    // Horizontal rule
    hr = doc.y;
    doc.moveTo(LEFT, hr).lineTo(LEFT + PAGE_W, hr)
      .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
    doc.y = hr + 8;

    // ── Lines table ──────────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('DETALLE DE PRODUCTOS / SERVICIOS', LEFT, doc.y);
    doc.moveDown(0.4);

    const COL = {
      desc:  PAGE_W * 0.32,
      qty:   PAGE_W * 0.09,
      price: PAGE_W * 0.12,
      disc:  PAGE_W * 0.09,
      sub:   PAGE_W * 0.13,
      iva:   PAGE_W * 0.09,
      total: PAGE_W * 0.16,
    };

    const tableTop = doc.y;
    doc.rect(LEFT, tableTop, PAGE_W, 14).fill('#dce6f5');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7);
    let cx = LEFT + 2;
    doc.text('Descripción',  cx, tableTop + 3, { width: COL.desc,  lineBreak: false }); cx += COL.desc;
    doc.text('Cant.',        cx, tableTop + 3, { width: COL.qty,   lineBreak: false, align: 'right' }); cx += COL.qty;
    doc.text('P. Unit.',     cx, tableTop + 3, { width: COL.price, lineBreak: false, align: 'right' }); cx += COL.price;
    doc.text('Desc.',        cx, tableTop + 3, { width: COL.disc,  lineBreak: false, align: 'right' }); cx += COL.disc;
    doc.text('Subtotal',     cx, tableTop + 3, { width: COL.sub,   lineBreak: false, align: 'right' }); cx += COL.sub;
    doc.text('IVA',          cx, tableTop + 3, { width: COL.iva,   lineBreak: false, align: 'right' }); cx += COL.iva;
    doc.text('Total',        cx, tableTop + 3, { width: COL.total, lineBreak: false, align: 'right' });

    doc.y = tableTop + 16;
    doc.font('Helvetica').fontSize(7).fillColor(DARK);

    let rowEven = false;
    for (const line of creditNote.lines) {
      const rowY      = doc.y;
      const rowHeight = 18;

      if (rowEven) {
        doc.rect(LEFT, rowY, PAGE_W, rowHeight).fill('#f0f4fb');
        doc.fillColor(DARK);
      }
      rowEven = !rowEven;

      const desc = line.sku ? `[${line.sku}] ${line.description}` : line.description;
      cx = LEFT + 2;
      doc.text(desc,                    cx, rowY + 4, { width: COL.desc - 4,  lineBreak: false }); cx += COL.desc;
      doc.text(fmt2(line.quantity),     cx, rowY + 4, { width: COL.qty,       lineBreak: false, align: 'right' }); cx += COL.qty;
      doc.text(fmt2(line.unitPrice),    cx, rowY + 4, { width: COL.price,     lineBreak: false, align: 'right' }); cx += COL.price;
      doc.text(fmt2(line.discount),     cx, rowY + 4, { width: COL.disc,      lineBreak: false, align: 'right' }); cx += COL.disc;
      doc.text(fmt2(line.lineTotal),    cx, rowY + 4, { width: COL.sub,       lineBreak: false, align: 'right' }); cx += COL.sub;
      doc.text(`${line.taxRate}%`,      cx, rowY + 4, { width: COL.iva,       lineBreak: false, align: 'right' }); cx += COL.iva;
      doc.text(fmt2(line.lineTotal + line.taxAmount), cx, rowY + 4, { width: COL.total - 2, lineBreak: false, align: 'right' });

      doc.y = rowY + rowHeight;
    }

    // Bottom border of table
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + PAGE_W, doc.y)
      .strokeColor(LINE_GRAY).lineWidth(0.5).stroke();
    doc.moveDown(0.6);

    // ── Totals block (right-aligned) — "VALOR MODIFICACIÓN" instead of "TOTAL"
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

    totalRow('Subtotal sin impuestos:', `$ ${fmt2(creditNote.subtotal)}`);
    totalRow('Descuento total:',        `$ ${fmt2(creditNote.discount)}`);

    const ivaGroups: Map<number, { base: number; tax: number }> = new Map();
    for (const line of creditNote.lines) {
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

    // Key difference: "VALOR MODIFICACIÓN" instead of "IMPORTE TOTAL"
    totalRow('VALOR MODIFICACIÓN:', `$ ${fmt2(creditNote.total)}`, true);

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
    if (creditNote.notes) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('OBSERVACIONES:', LEFT, doc.y);
      doc.font('Helvetica').fillColor(DARK)
        .text(creditNote.notes, LEFT, doc.y, { width: PAGE_W });
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

export async function generateCreditNotePdfInternal(
  creditNoteId: string,
  companyId: string
): Promise<void> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  console.log('[generate-credit-note-pdf] Inicio:', { creditNoteId, companyId });

  // 1. Read Credit Note
  const cnSnap = await db.doc(`companies/${companyId}/invoices/${creditNoteId}`).get();
  if (!cnSnap.exists) {
    throw new Error(`Nota de crédito no encontrada: ${creditNoteId}`);
  }
  const creditNote = cnSnap.data() as CreditNote;

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

  console.log('[generate-credit-note-pdf] Datos leídos. Generando QR...');

  // 4. Generate QR code for access key
  let qrBuffer: Buffer | null = null;
  if (creditNote.accessKey) {
    try {
      qrBuffer = await QRCode.toBuffer(creditNote.accessKey, {
        type: 'png',
        width: 150,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      console.log('[generate-credit-note-pdf] QR generado, bytes:', (qrBuffer as Buffer).length);
    } catch (err) {
      console.warn('[generate-credit-note-pdf] No se pudo generar QR:', err);
    }
  }

  // 5. Build PDF
  console.log('[generate-credit-note-pdf] Construyendo PDF...');
  const pdfBuffer = await buildCreditNotePdfBuffer({
    creditNote,
    companyId,
    companyRuc,
    sriConfig,
    qrBuffer,
  });

  console.log('[generate-credit-note-pdf] PDF generado, bytes:', pdfBuffer.length);

  // 6. Upload to Storage — path: companies/{companyId}/pdf/cn-{creditNoteId}.pdf
  const pdfPath = `companies/${companyId}/pdf/cn-${creditNoteId}.pdf`;
  const pdfFile = bucket.file(pdfPath);

  try {
    await pdfFile.save(pdfBuffer, {
      metadata: { contentType: 'application/pdf' },
    });
    console.log('[generate-credit-note-pdf] PDF subido a Storage:', pdfPath);
  } catch (err) {
    console.error('[generate-credit-note-pdf] Error subiendo PDF:', err);
    throw new Error('Error al guardar PDF de nota de crédito en Storage');
  }

  await pdfFile.makePublic();
  const pdfUrl = `https://storage.googleapis.com/${pdfFile.bucket.name}/${pdfFile.name}`;

  // 7. Update Credit Note document with pdfUrl
  await db.doc(`companies/${companyId}/invoices/${creditNoteId}`).update({
    pdfUrl,
    updatedAt: now,
  });

  console.log('[generate-credit-note-pdf] Nota de crédito actualizada con pdfUrl');
}

// ─── Callable function ────────────────────────────────────────────────────────

export const generateCreditNotePdf = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { creditNoteId, companyId } = request.data as { creditNoteId: string; companyId: string };

  if (!creditNoteId || typeof creditNoteId !== 'string') {
    throw new HttpsError('invalid-argument', 'creditNoteId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    await generateCreditNotePdfInternal(creditNoteId, companyId);
    return { success: true };
  } catch (err) {
    console.error('[generate-credit-note-pdf] Error callable:', err);
    const message = err instanceof Error ? err.message : 'Error generando PDF de nota de crédito';
    throw new HttpsError('internal', message);
  }
});
