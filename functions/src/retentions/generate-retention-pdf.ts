import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetentionTaxLine {
  taxCode:        string;   // '1'=IR, '2'=IVA
  taxCodeName:    string;   // 'IR', 'IVA'
  pctCode:        string;   // '303', '304', '3', ...
  pctName:        string;
  rate:           number;
  taxableBase:    number;
  retainedAmount: number;
}

interface Retention {
  fullNumber:          string;
  date:                admin.firestore.Timestamp;
  fiscalYear:          string;
  periodoFiscal:       string;
  sriStatus?:          string;
  accessKey?:          string;
  authorizationNumber?:string;
  authorizedAt?:       admin.firestore.Timestamp;
  supplierName:        string;
  supplierTaxId:       string;
  supplierTaxIdType:   string;
  supportDocType:      string;
  supportDocNumber:    string;
  supportDocDate:      admin.firestore.Timestamp;
  supportDocTotal:     number;
  taxes:               RetentionTaxLine[];
  totalRetained:       number;
  notes?:              string;
}

interface SriCompanyConfig {
  razonSocial:              string;
  nombreComercial?:         string;
  direccionMatriz:          string;
  direccionEstablecimiento: string;
  telefono?:                string;
  correo?:                  string;
  obligadoContabilidad:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt2(n: number): string { return n.toFixed(2); }

function fmtDate(ts: admin.firestore.Timestamp): string {
  return ts.toDate().toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function fmtDatetime(ts: admin.firestore.Timestamp): string {
  return ts.toDate().toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/Guayaquil',
  });
}

const SUPPORT_DOC_LABELS: Record<string, string> = {
  '01': 'Factura',
  '02': 'Nota o Boleta de Venta',
  '04': 'Nota de Crédito',
  '05': 'Nota de Débito',
  '09': 'Tiquete',
  '11': 'Pasaje Aéreo',
  '12': 'Inst. Cambio',
  '15': 'Comprobante de Venta emitido en el exterior',
  '16': 'RISE',
  '18': 'Liquidación de Compras de Bienes',
  '20': 'Liquidación por Reclasificación de Bienes',
  '21': 'Liquidación por Diferencias en Mermas',
};

const ID_TYPE_LABELS: Record<string, string> = {
  '04': 'RUC', '05': 'Cédula', '06': 'Pasaporte', '08': 'Identificación Exterior',
};

// ─── PDF builder ──────────────────────────────────────────────────────────────

async function buildRetentionPdf(opts: {
  retention:   Retention;
  companyRuc:  string;
  sriConfig:   SriCompanyConfig;
  qrBuffer?:   Buffer | null;
}): Promise<Buffer> {
  const { retention, companyRuc, sriConfig, qrBuffer } = opts;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: {
      Title: `Comprobante de Retención ${retention.fullNumber}`,
      Author: sriConfig.razonSocial,
    }});

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW    = doc.page.width - 80;
    const LEFT  = 40;
    const GRAY  = '#555555';
    const DARK  = '#111111';
    const ACCENT = '#1a56c4';
    const LGRAY  = '#cccccc';

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(15).fillColor(ACCENT).font('Helvetica-Bold')
      .text(sriConfig.razonSocial.toUpperCase(), LEFT, 40, { width: PW, align: 'center' });

    if (sriConfig.nombreComercial) {
      doc.moveDown(0.2).fontSize(10).fillColor(GRAY).font('Helvetica')
        .text(sriConfig.nombreComercial, LEFT, doc.y, { width: PW, align: 'center' });
    }

    doc.moveDown(0.3).fontSize(8).fillColor(GRAY)
      .text(`RUC: ${companyRuc}`, LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.2)
      .text(`Dirección: ${sriConfig.direccionMatriz}`, LEFT, doc.y, { width: PW, align: 'center' });
    if (sriConfig.telefono) {
      doc.moveDown(0.2)
        .text(`Tel: ${sriConfig.telefono}`, LEFT, doc.y, { width: PW, align: 'center' });
    }

    doc.moveDown(0.8).fontSize(13).fillColor(DARK).font('Helvetica-Bold')
      .text('COMPROBANTE DE RETENCIÓN', LEFT, doc.y, { width: PW, align: 'center' });

    doc.moveDown(0.3).fontSize(10).font('Helvetica')
      .text(`No. ${retention.fullNumber}`, LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.25)
      .text(`Fecha de emisión: ${fmtDate(retention.date)}`, LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.15)
      .text(`Período fiscal: ${retention.periodoFiscal}`, LEFT, doc.y, { width: PW, align: 'center' });

    const hr = (y: number, lw = 1) => {
      doc.moveTo(LEFT, y).lineTo(LEFT + PW, y).strokeColor(LGRAY).lineWidth(lw).stroke();
    };

    hr(doc.y + 6); doc.y = doc.y + 14;

    // ── Authorization block ───────────────────────────────────────────────────
    if (retention.authorizationNumber) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('NÚMERO DE AUTORIZACIÓN SRI:', LEFT, doc.y);
      doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
        .text(retention.authorizationNumber, LEFT, doc.y, { width: PW });
      if (retention.authorizedAt) {
        doc.moveDown(0.2).fillColor(GRAY).font('Helvetica-Bold')
          .text('FECHA/HORA AUTORIZACIÓN:', LEFT, doc.y);
        doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
          .text(fmtDatetime(retention.authorizedAt), LEFT, doc.y);
      }
      doc.moveDown(0.5);
    }

    // ── Access Key + QR ───────────────────────────────────────────────────────
    if (retention.accessKey) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('CLAVE DE ACCESO:', LEFT, doc.y);
      doc.moveDown(0.2).font('Courier').fillColor(DARK).fontSize(7)
        .text(retention.accessKey, LEFT, doc.y, { width: PW - 80 });

      if (qrBuffer) {
        const qrX = LEFT + PW - 72;
        const qrY = doc.y - 12;
        doc.image(qrBuffer, qrX, qrY, { width: 70, height: 70 });
      }
      doc.moveDown(0.5);
    }

    hr(doc.y + 2, 0.5); doc.y = doc.y + 10;

    // ── Agente (emisor) ───────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
      .text('AGENTE DE RETENCIÓN (EMISOR)', LEFT, doc.y);
    doc.moveDown(0.3).font('Helvetica').fillColor(DARK);
    doc.text(`RUC: ${companyRuc}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Razón Social: ${sriConfig.razonSocial}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Dirección: ${sriConfig.direccionEstablecimiento}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Obligado a llevar Contabilidad: ${sriConfig.obligadoContabilidad}`, LEFT, doc.y, { width: PW });
    doc.moveDown(0.5);

    hr(doc.y, 0.5); doc.y = doc.y + 8;

    // ── Proveedor (sujeto retenido) ───────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
      .text('SUJETO RETENIDO (PROVEEDOR)', LEFT, doc.y);
    doc.moveDown(0.3).font('Helvetica').fillColor(DARK);
    const idLabel = ID_TYPE_LABELS[retention.supplierTaxIdType] ?? 'ID';
    doc.text(`${idLabel}: ${retention.supplierTaxId}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Razón Social / Nombre: ${retention.supplierName}`, LEFT, doc.y, { width: PW });
    doc.moveDown(0.5);

    hr(doc.y, 0.5); doc.y = doc.y + 8;

    // ── Documento sustento ────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
      .text('DOCUMENTO SUSTENTO', LEFT, doc.y);
    doc.moveDown(0.3).font('Helvetica').fillColor(DARK);
    const docTypeLabel = SUPPORT_DOC_LABELS[retention.supportDocType] ?? retention.supportDocType;
    doc.text(`Tipo: ${retention.supportDocType} — ${docTypeLabel}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Número: ${retention.supportDocNumber}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Fecha: ${fmtDate(retention.supportDocDate)}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Total del Documento: $ ${fmt2(retention.supportDocTotal)}`, LEFT, doc.y, { width: PW });
    doc.moveDown(0.5);

    hr(doc.y, 0.5); doc.y = doc.y + 8;

    // ── Tabla de impuestos retenidos ──────────────────────────────────────────
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('IMPUESTOS RETENIDOS', LEFT, doc.y);
    doc.moveDown(0.4);

    const COL = {
      periodo: PW * 0.12,
      impuesto: PW * 0.09,
      codigo:  PW * 0.10,
      concepto: PW * 0.30,
      base:    PW * 0.15,
      pct:     PW * 0.09,
      valor:   PW * 0.15,
    };

    // Header row
    const tableTop = doc.y;
    doc.rect(LEFT, tableTop, PW, 14).fill('#e8ecf5');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7);
    let cx = LEFT + 2;
    doc.text('Ej. Fiscal',  cx, tableTop + 3, { width: COL.periodo,  lineBreak: false }); cx += COL.periodo;
    doc.text('Imp.',         cx, tableTop + 3, { width: COL.impuesto, lineBreak: false }); cx += COL.impuesto;
    doc.text('Código',       cx, tableTop + 3, { width: COL.codigo,   lineBreak: false }); cx += COL.codigo;
    doc.text('Concepto',     cx, tableTop + 3, { width: COL.concepto, lineBreak: false }); cx += COL.concepto;
    doc.text('Base Imp.',    cx, tableTop + 3, { width: COL.base,     lineBreak: false, align: 'right' }); cx += COL.base;
    doc.text('%',            cx, tableTop + 3, { width: COL.pct,      lineBreak: false, align: 'right' }); cx += COL.pct;
    doc.text('Retenido',     cx, tableTop + 3, { width: COL.valor - 2, lineBreak: false, align: 'right' });

    doc.y = tableTop + 16;
    doc.font('Helvetica').fontSize(7).fillColor(DARK);

    let even = false;
    for (const tax of retention.taxes) {
      const rowY = doc.y;
      if (even) { doc.rect(LEFT, rowY, PW, 16).fill('#f7f8fc'); doc.fillColor(DARK); }
      even = !even;

      cx = LEFT + 2;
      doc.text(retention.fiscalYear,   cx, rowY + 4, { width: COL.periodo,  lineBreak: false }); cx += COL.periodo;
      doc.text(tax.taxCodeName,        cx, rowY + 4, { width: COL.impuesto, lineBreak: false }); cx += COL.impuesto;
      doc.text(tax.pctCode,            cx, rowY + 4, { width: COL.codigo,   lineBreak: false }); cx += COL.codigo;
      doc.text(tax.pctName,            cx, rowY + 4, { width: COL.concepto - 4, lineBreak: false }); cx += COL.concepto;
      doc.text(`$ ${fmt2(tax.taxableBase)}`,    cx, rowY + 4, { width: COL.base,  lineBreak: false, align: 'right' }); cx += COL.base;
      doc.text(`${tax.rate}%`,                  cx, rowY + 4, { width: COL.pct,   lineBreak: false, align: 'right' }); cx += COL.pct;
      doc.text(`$ ${fmt2(tax.retainedAmount)}`, cx, rowY + 4, { width: COL.valor - 2, lineBreak: false, align: 'right' });
      doc.y = rowY + 16;
    }

    hr(doc.y, 0.5); doc.moveDown(0.6);

    // ── Total retenido ────────────────────────────────────────────────────────
    const TLEFT = LEFT + PW * 0.6;
    const TW    = PW * 0.4;
    const LW    = TW * 0.6;
    const VW    = TW * 0.4;

    const totalRow = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(DARK)
        .text(label, TLEFT, y, { width: LW, lineBreak: false })
        .text(value, TLEFT + LW, y, { width: VW, lineBreak: false, align: 'right' });
      doc.moveDown(0.4);
    };

    totalRow('TOTAL RETENIDO:', `$ ${fmt2(retention.totalRetained)}`, true);

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (retention.notes) {
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('OBSERVACIONES:', LEFT, doc.y);
      doc.font('Helvetica').fillColor(DARK)
        .text(retention.notes, LEFT, doc.y, { width: PW });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveDown(1.2);
    hr(doc.y); doc.moveDown(0.4);
    doc.fontSize(9).fillColor(ACCENT).font('Helvetica-Bold')
      .text('COMPROBANTE AUTORIZADO POR EL SRI', LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.3).fontSize(7).fillColor(GRAY).font('Helvetica')
      .text('Generado por SaasFacturacion — Ecuador', LEFT, doc.y, { width: PW, align: 'center' });

    doc.end();
  });
}

// ─── Core logic ───────────────────────────────────────────────────────────────

export async function generateRetentionPdfInternal(
  retentionId: string,
  companyId: string
): Promise<{ pdfUrl: string }> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();
  const now = admin.firestore.Timestamp.now();

  console.log('[generate-retention-pdf] Inicio:', { retentionId, companyId });

  const retSnap = await db.doc(`companies/${companyId}/retentions/${retentionId}`).get();
  if (!retSnap.exists) throw new Error(`Retención no encontrada: ${retentionId}`);
  const retention = retSnap.data() as Retention;

  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new Error(`Empresa no encontrada: ${companyId}`);
  const companyRuc: string = (companySnap.data() as Record<string, any>)['sri']?.['ruc'] ?? '';

  const sriCfgSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriCfgSnap.exists) throw new Error(`Configuración SRI no encontrada: ${companyId}`);
  const sriConfig = sriCfgSnap.data() as SriCompanyConfig;

  // QR code
  let qrBuffer: Buffer | null = null;
  if (retention.accessKey) {
    try {
      qrBuffer = await QRCode.toBuffer(retention.accessKey, {
        type: 'png', width: 150, margin: 1, errorCorrectionLevel: 'M',
      });
    } catch (err) {
      console.warn('[generate-retention-pdf] No se pudo generar QR:', err);
    }
  }

  console.log('[generate-retention-pdf] Construyendo PDF...');
  const pdfBuffer = await buildRetentionPdf({ retention, companyRuc, sriConfig, qrBuffer });
  console.log('[generate-retention-pdf] PDF generado, bytes:', pdfBuffer.length);

  const pdfPath = `companies/${companyId}/pdf/ret-${retentionId}.pdf`;
  const pdfFile = bucket.file(pdfPath);
  await pdfFile.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });

  const [pdfUrl] = await pdfFile.getSignedUrl({
    action: 'read',
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    pdfUrl, updatedAt: now,
  });

  console.log('[generate-retention-pdf] PDF subido:', pdfPath);
  return { pdfUrl };
}

// ─── Callable ─────────────────────────────────────────────────────────────────

export const generateRetentionPdf = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const { retentionId, companyId } = request.data as { retentionId: string; companyId: string };
  if (!retentionId || !companyId) {
    throw new HttpsError('invalid-argument', 'retentionId y companyId son requeridos.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Sin permisos para esta empresa.');
  }

  try {
    return await generateRetentionPdfInternal(retentionId, companyId);
  } catch (err) {
    console.error('[generate-retention-pdf] Error:', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Error generando PDF');
  }
});
