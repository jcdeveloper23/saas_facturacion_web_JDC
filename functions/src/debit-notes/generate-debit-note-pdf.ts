import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebitNoteMotivo {
  razon: string;
  valor: number;
}

interface DebitNote {
  fullNumber:             string;
  date:                   admin.firestore.Timestamp;
  sriStatus?:             string;
  accessKey?:             string;
  authorizationNumber?:   string;
  authorizedAt?:          admin.firestore.Timestamp;
  customerName:           string;
  customerTaxId:          string;
  customerTaxIdType?:     string;
  originalInvoiceNumber:  string;
  originalInvoiceDate?:   admin.firestore.Timestamp;
  originalInvoiceAuth?:   string;
  codDocModificado?:      string;
  motivos:                DebitNoteMotivo[];
  vatPct:                 number;
  totalSinImpuestos:      number;
  vatAmount:              number;
  total:                  number;
  notes?:                 string;
}

interface SriCompanyConfig {
  razonSocial:              string;
  nombreComercial?:         string;
  direccionMatriz:          string;
  direccionEstablecimiento: string;
  telefono?:                string;
  correo?:                  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt2(n: number): string { return n.toFixed(2); }

function fmtDate(ts: admin.firestore.Timestamp | undefined): string {
  if (!ts) return '';
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

const ID_TYPE_LABELS: Record<string, string> = {
  '04': 'RUC', '05': 'Cédula', '06': 'Pasaporte', '07': 'Cons. Final',
};

// ─── PDF builder ──────────────────────────────────────────────────────────────

async function buildDebitNotePdf(opts: {
  debitNote:   DebitNote;
  companyRuc:  string;
  sriConfig:   SriCompanyConfig;
  qrBuffer?:   Buffer | null;
}): Promise<Buffer> {
  const { debitNote, companyRuc, sriConfig, qrBuffer } = opts;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: {
      Title: `Nota de Débito ${debitNote.fullNumber}`,
      Author: sriConfig.razonSocial,
    }});

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW    = doc.page.width - 80;
    const LEFT  = 40;
    const GRAY  = '#555555';
    const DARK  = '#111111';
    const ACCENT = '#c47a1a';   // amber for debit notes
    const LGRAY  = '#cccccc';

    const hr = (y: number, lw = 1) => {
      doc.moveTo(LEFT, y).lineTo(LEFT + PW, y).strokeColor(LGRAY).lineWidth(lw).stroke();
    };

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
      .text('NOTA DE DÉBITO', LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.3).fontSize(10).font('Helvetica')
      .text(`No. ${debitNote.fullNumber}`, LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.25)
      .text(`Fecha de emisión: ${fmtDate(debitNote.date)}`, LEFT, doc.y, { width: PW, align: 'center' });

    hr(doc.y + 6); doc.y = doc.y + 14;

    // ── Authorization block ───────────────────────────────────────────────────
    if (debitNote.authorizationNumber) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('NÚMERO DE AUTORIZACIÓN SRI:', LEFT, doc.y);
      doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
        .text(debitNote.authorizationNumber, LEFT, doc.y, { width: PW });
      if (debitNote.authorizedAt) {
        doc.moveDown(0.2).fillColor(GRAY).font('Helvetica-Bold')
          .text('FECHA/HORA AUTORIZACIÓN:', LEFT, doc.y);
        doc.moveDown(0.2).font('Helvetica').fillColor(DARK)
          .text(fmtDatetime(debitNote.authorizedAt), LEFT, doc.y);
      }
      doc.moveDown(0.5);
    }

    // ── Access Key + QR ───────────────────────────────────────────────────────
    if (debitNote.accessKey) {
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
        .text('CLAVE DE ACCESO:', LEFT, doc.y);
      doc.moveDown(0.2).font('Courier').fillColor(DARK).fontSize(7)
        .text(debitNote.accessKey, LEFT, doc.y, { width: PW - 80 });

      if (qrBuffer) {
        doc.image(qrBuffer, LEFT + PW - 72, doc.y - 12, { width: 70, height: 70 });
      }
      doc.moveDown(0.5);
    }

    hr(doc.y + 2, 0.5); doc.y = doc.y + 10;

    // ── Comprobante modificado ────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
      .text('COMPROBANTE QUE SE MODIFICA', LEFT, doc.y);
    doc.moveDown(0.3).font('Helvetica').fillColor(DARK);
    const codDoc = debitNote.codDocModificado ?? '01';
    const docTypeMap: Record<string, string> = { '01': 'Factura', '04': 'Nota de Crédito' };
    doc.text(`Tipo: ${codDoc} — ${docTypeMap[codDoc] ?? 'Comprobante'}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Número: ${debitNote.originalInvoiceNumber}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    if (debitNote.originalInvoiceDate) {
      doc.text(`Fecha: ${fmtDate(debitNote.originalInvoiceDate)}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    }
    if (debitNote.originalInvoiceAuth) {
      doc.text(`Autorización: ${debitNote.originalInvoiceAuth}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    }
    doc.moveDown(0.3);

    hr(doc.y, 0.5); doc.y = doc.y + 8;

    // ── Datos del cliente ─────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
      .text('DATOS DEL CLIENTE', LEFT, doc.y);
    doc.moveDown(0.3).font('Helvetica').fillColor(DARK);
    const idLabel = ID_TYPE_LABELS[debitNote.customerTaxIdType ?? '04'] ?? 'RUC';
    doc.text(`${idLabel}: ${debitNote.customerTaxId}`, LEFT, doc.y, { width: PW }); doc.moveDown(0.2);
    doc.text(`Razón Social / Nombre: ${debitNote.customerName}`, LEFT, doc.y, { width: PW });
    doc.moveDown(0.5);

    hr(doc.y, 0.5); doc.y = doc.y + 8;

    // ── Tabla de motivos ──────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('MOTIVOS', LEFT, doc.y);
    doc.moveDown(0.4);

    const COL = { num: PW * 0.06, razon: PW * 0.76, valor: PW * 0.18 };

    const tableTop = doc.y;
    doc.rect(LEFT, tableTop, PW, 14).fill('#f5ead8');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7);
    let cx = LEFT + 2;
    doc.text('No.',    cx, tableTop + 3, { width: COL.num,   lineBreak: false }); cx += COL.num;
    doc.text('Razón',  cx, tableTop + 3, { width: COL.razon, lineBreak: false }); cx += COL.razon;
    doc.text('Valor',  cx, tableTop + 3, { width: COL.valor - 2, lineBreak: false, align: 'right' });

    doc.y = tableTop + 16;
    doc.font('Helvetica').fontSize(7).fillColor(DARK);

    let even = false;
    debitNote.motivos.forEach((m, i) => {
      const rowY = doc.y;
      if (even) { doc.rect(LEFT, rowY, PW, 16).fill('#fdf6ec'); doc.fillColor(DARK); }
      even = !even;

      cx = LEFT + 2;
      doc.text(String(i + 1),          cx, rowY + 4, { width: COL.num,   lineBreak: false }); cx += COL.num;
      doc.text(m.razon,                 cx, rowY + 4, { width: COL.razon - 4, lineBreak: false }); cx += COL.razon;
      doc.text(`$ ${fmt2(m.valor)}`,    cx, rowY + 4, { width: COL.valor - 2, lineBreak: false, align: 'right' });
      doc.y = rowY + 16;
    });

    hr(doc.y, 0.5); doc.moveDown(0.6);

    // ── Totales ───────────────────────────────────────────────────────────────
    const TLEFT = LEFT + PW * 0.6;
    const TW    = PW * 0.4;
    const LW    = TW * 0.6;
    const VW    = TW * 0.4;

    const totRow = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(DARK)
        .text(label, TLEFT, y, { width: LW, lineBreak: false })
        .text(value, TLEFT + LW, y, { width: VW, lineBreak: false, align: 'right' });
      doc.moveDown(0.35);
    };

    totRow('Subtotal sin impuestos:', `$ ${fmt2(debitNote.totalSinImpuestos)}`);
    totRow(`IVA ${debitNote.vatPct}%:`, `$ ${fmt2(debitNote.vatAmount)}`);
    totRow('IMPORTE TOTAL:',            `$ ${fmt2(debitNote.total)}`, true);

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (debitNote.notes) {
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold').text('OBSERVACIONES:', LEFT, doc.y);
      doc.font('Helvetica').fillColor(DARK)
        .text(debitNote.notes, LEFT, doc.y, { width: PW });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveDown(1.2);
    hr(doc.y); doc.moveDown(0.4);
    doc.fontSize(9).fillColor(ACCENT).font('Helvetica-Bold')
      .text('DOCUMENTO AUTORIZADO POR EL SRI', LEFT, doc.y, { width: PW, align: 'center' });
    doc.moveDown(0.3).fontSize(7).fillColor(GRAY).font('Helvetica')
      .text('Generado por SaasFacturacion — Ecuador', LEFT, doc.y, { width: PW, align: 'center' });

    doc.end();
  });
}

// ─── Core logic ───────────────────────────────────────────────────────────────

export async function generateDebitNotePdfInternal(
  debitNoteId: string,
  companyId: string
): Promise<{ pdfUrl: string }> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();
  const now = admin.firestore.Timestamp.now();

  console.log('[generate-debit-note-pdf] Inicio:', { debitNoteId, companyId });

  const dnSnap = await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).get();
  if (!dnSnap.exists) throw new Error(`Nota de débito no encontrada: ${debitNoteId}`);
  const debitNote = dnSnap.data() as DebitNote;

  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new Error(`Empresa no encontrada: ${companyId}`);
  const companyRuc: string = (companySnap.data() as Record<string, any>)['sri']?.['ruc'] ?? '';

  const sriCfgSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriCfgSnap.exists) throw new Error(`Configuración SRI no encontrada: ${companyId}`);
  const sriConfig = sriCfgSnap.data() as SriCompanyConfig;

  let qrBuffer: Buffer | null = null;
  if (debitNote.accessKey) {
    try {
      qrBuffer = await QRCode.toBuffer(debitNote.accessKey, {
        type: 'png', width: 150, margin: 1, errorCorrectionLevel: 'M',
      });
    } catch (err) {
      console.warn('[generate-debit-note-pdf] No se pudo generar QR:', err);
    }
  }

  console.log('[generate-debit-note-pdf] Construyendo PDF...');
  const pdfBuffer = await buildDebitNotePdf({ debitNote, companyRuc, sriConfig, qrBuffer });
  console.log('[generate-debit-note-pdf] PDF generado, bytes:', pdfBuffer.length);

  const pdfPath = `companies/${companyId}/pdf/dn-${debitNoteId}.pdf`;
  const pdfFile = bucket.file(pdfPath);
  await pdfFile.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });

  await pdfFile.makePublic();
  const pdfUrl = `https://storage.googleapis.com/${pdfFile.bucket.name}/${pdfFile.name}`;

  await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
    pdfUrl, updatedAt: now,
  });

  console.log('[generate-debit-note-pdf] PDF subido:', pdfPath);
  return { pdfUrl };
}

// ─── Callable ─────────────────────────────────────────────────────────────────

export const generateDebitNotePdf = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const { debitNoteId, companyId } = request.data as { debitNoteId: string; companyId: string };
  if (!debitNoteId || !companyId) {
    throw new HttpsError('invalid-argument', 'debitNoteId y companyId son requeridos.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Sin permisos para esta empresa.');
  }

  try {
    return await generateDebitNotePdfInternal(debitNoteId, companyId);
  } catch (err) {
    console.error('[generate-debit-note-pdf] Error:', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Error generando PDF');
  }
});
