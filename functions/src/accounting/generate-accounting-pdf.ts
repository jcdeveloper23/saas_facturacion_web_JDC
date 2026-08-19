import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | 'libro-diario'
  | 'libro-mayor'
  | 'balance-comprobacion'
  | 'estado-resultados'
  | 'balance-general';

interface ReportLine { [key: string]: string | number }

interface GenerateAccountingPdfInput {
  reportType:  ReportType;
  companyId:   string;
  periodName:  string;
  data:        ReportLine[];         // pre-computed rows from the frontend
  extraData?:  Record<string, any>;  // optional: totals, sections, etc.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt2(n: number | string | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

function pageHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  companyName: string,
  companyRuc: string,
  periodName: string
): void {
  const pageW = doc.page.width;
  const ml    = doc.page.margins.left;

  doc.fontSize(9).fillColor('#555').text(companyName, ml, 30, { align: 'center', width: pageW - ml * 2 });
  doc.fontSize(8).fillColor('#888').text(`RUC: ${companyRuc}`, { align: 'center' });
  doc.fontSize(11).fillColor('#222').font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(8).fillColor('#666').font('Helvetica').text(periodName, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(ml, doc.y).lineTo(pageW - ml, doc.y).stroke('#ccc');
  doc.moveDown(0.5);
}

function tableHeader(doc: PDFKit.PDFDocument, cols: { label: string; width: number; align?: string }[]): void {
  const ml   = doc.page.margins.left;
  const rowH = 14;
  const y    = doc.y;

  doc.rect(ml, y, doc.page.width - ml * 2, rowH).fill('#f0f4f8');

  let x = ml;
  doc.fontSize(7).fillColor('#444').font('Helvetica-Bold');
  for (const col of cols) {
    doc.text(col.label, x + 2, y + 3, { width: col.width - 4, align: (col.align as any) ?? 'left' });
    x += col.width;
  }
  doc.font('Helvetica');
  doc.y = y + rowH;
  doc.moveTo(ml, doc.y).lineTo(doc.page.width - ml, doc.y).stroke('#ddd');
}

function tableRow(
  doc: PDFKit.PDFDocument,
  cols: { value: string | number; width: number; align?: string; bold?: boolean; color?: string }[],
  ml: number,
  shade = false
): void {
  const rowH = 12;
  const y    = doc.y;

  if (shade) doc.rect(ml, y, doc.page.width - ml * 2, rowH).fill('#fafbfc');

  let x = ml;
  for (const col of cols) {
    const txt = typeof col.value === 'number' ? fmt2(col.value) : (col.value ?? '');
    doc.fontSize(7)
       .fillColor(col.color ?? '#222')
       .font(col.bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(String(txt), x + 2, y + 2, { width: col.width - 4, align: (col.align as any) ?? 'left' });
    x += col.width;
  }
  doc.y = y + rowH;
}

function totalRow(
  doc: PDFKit.PDFDocument,
  label: string,
  cols: { value: string | number; width: number; align?: string }[],
  ml: number,
  pageW: number,
  color = '#1a56db'
): void {
  const rowH = 14;
  const y    = doc.y;
  doc.moveTo(ml, y).lineTo(pageW - ml, y).stroke('#bbb');
  doc.rect(ml, y, pageW - ml * 2, rowH).fill('#eef2ff');

  const labelWidth = cols.reduce((s, c) => s + c.width, 0) - (cols[cols.length - 1]?.width ?? 0);
  doc.fontSize(7.5).fillColor(color).font('Helvetica-Bold')
     .text(label, ml + 2, y + 3, { width: labelWidth - 4, align: 'right' });

  let x = ml + labelWidth;
  for (let i = cols.length - 1; i < cols.length; i++) {
    const col = cols[i];
    doc.text(String(typeof col.value === 'number' ? fmt2(col.value) : col.value), x + 2, y + 3,
             { width: col.width - 4, align: (col.align as any) ?? 'right' });
  }
  doc.y = y + rowH;
}

// ─── Report builders ──────────────────────────────────────────────────────────

function buildLibroDiario(doc: PDFKit.PDFDocument, data: ReportLine[], extra: Record<string, any>, ml: number, pageW: number): void {
  const cols = [
    { label: 'N°',          width: 30  },
    { label: 'Fecha',       width: 65  },
    { label: 'Descripción', width: 190 },
    { label: 'Referencia',  width: 85  },
    { label: 'Débito',      width: 70, align: 'right' },
    { label: 'Crédito',     width: 70, align: 'right' },
  ];
  tableHeader(doc, cols);

  data.forEach((row, i) => {
    if (doc.y > doc.page.height - 60) { doc.addPage(); tableHeader(doc, cols); }
    tableRow(doc, [
      { value: String(row['number'] ?? ''),      width: 30 },
      { value: String(row['date']   ?? ''),      width: 65 },
      { value: String(row['description'] ?? ''), width: 190 },
      { value: String(row['reference'] ?? ''),   width: 85 },
      { value: Number(row['totalDebit']  ?? 0),  width: 70, align: 'right' },
      { value: Number(row['totalCredit'] ?? 0),  width: 70, align: 'right' },
    ], ml, i % 2 === 0);
  });

  doc.moveDown(0.3);
  totalRow(doc, 'TOTALES', [
    { value: '', width: 370 },
    { value: Number(extra['totalDebit']  ?? 0), width: 70, align: 'right' },
    { value: Number(extra['totalCredit'] ?? 0), width: 70, align: 'right' },
  ], ml, pageW);
}

function buildLibroMayor(doc: PDFKit.PDFDocument, data: ReportLine[], extra: Record<string, any>, ml: number, pageW: number): void {
  const accountName = String(extra['accountName'] ?? '');
  const accountCode = String(extra['accountCode'] ?? '');
  doc.fontSize(8).fillColor('#333').font('Helvetica-Bold')
     .text(`Cuenta: ${accountCode} — ${accountName}`, ml);
  doc.moveDown(0.3);

  const cols = [
    { label: 'N°',          width: 30  },
    { label: 'Fecha',       width: 65  },
    { label: 'Descripción', width: 195 },
    { label: 'Tipo',        width: 60  },
    { label: 'Débito',      width: 65, align: 'right' },
    { label: 'Crédito',     width: 65, align: 'right' },
    { label: 'Saldo',       width: 70, align: 'right' },
  ];
  tableHeader(doc, cols);

  data.forEach((row, i) => {
    if (doc.y > doc.page.height - 60) { doc.addPage(); tableHeader(doc, cols); }
    const bal = Number(row['balance'] ?? 0);
    tableRow(doc, [
      { value: String(row['entryNumber'] ?? ''),  width: 30 },
      { value: String(row['date']        ?? ''),  width: 65 },
      { value: String(row['description'] ?? ''),  width: 195 },
      { value: String(row['type']        ?? ''),  width: 60 },
      { value: Number(row['debit']       ?? 0),   width: 65, align: 'right' },
      { value: Number(row['credit']      ?? 0),   width: 65, align: 'right' },
      { value: bal, width: 70, align: 'right', color: bal < 0 ? '#c00' : '#222' },
    ], ml, i % 2 === 0);
  });

  doc.moveDown(0.3);
  totalRow(doc, 'TOTALES', [
    { value: '', width: 350 },
    { value: Number(extra['totalDebit']  ?? 0), width: 65, align: 'right' },
    { value: Number(extra['totalCredit'] ?? 0), width: 65, align: 'right' },
    { value: Number(extra['finalBalance'] ?? 0), width: 70, align: 'right' },
  ], ml, pageW);
}

function buildBalanceComprobacion(doc: PDFKit.PDFDocument, data: ReportLine[], extra: Record<string, any>, ml: number, pageW: number): void {
  const cols = [
    { label: 'Código',   width: 70  },
    { label: 'Cuenta',   width: 195 },
    { label: 'Tipo',     width: 65  },
    { label: 'Débitos',  width: 65, align: 'right' },
    { label: 'Créditos', width: 65, align: 'right' },
    { label: 'Sd. Deud.',width: 60, align: 'right' },
    { label: 'Sd. Acr.', width: 60, align: 'right' },
  ];
  tableHeader(doc, cols);

  data.forEach((row, i) => {
    if (doc.y > doc.page.height - 60) { doc.addPage(); tableHeader(doc, cols); }
    const deb   = Number(row['sumDebit']  ?? 0);
    const cred  = Number(row['sumCredit'] ?? 0);
    tableRow(doc, [
      { value: String(row['accountCode'] ?? ''), width: 70, bold: true },
      { value: String(row['accountName'] ?? ''), width: 195 },
      { value: String(row['accountType'] ?? ''), width: 65 },
      { value: deb,                              width: 65, align: 'right' },
      { value: cred,                             width: 65, align: 'right' },
      { value: deb  > cred ? deb  - cred : 0,   width: 60, align: 'right' },
      { value: cred > deb  ? cred - deb  : 0,   width: 60, align: 'right' },
    ], ml, i % 2 === 0);
  });

  doc.moveDown(0.3);
  const td = Number(extra['totalDebit'] ?? 0);
  const tc = Number(extra['totalCredit'] ?? 0);
  totalRow(doc, `TOTALES — ${Math.abs(td - tc) < 0.01 ? 'CUADRADO' : 'DESCUADRADO'}`, [
    { value: '', width: 330 },
    { value: td, width: 65, align: 'right' },
    { value: tc, width: 65, align: 'right' },
    { value: td > tc ? td - tc : 0, width: 60, align: 'right' },
    { value: tc > td ? tc - td : 0, width: 60, align: 'right' },
  ], ml, pageW, Math.abs(td - tc) < 0.01 ? '#1a7c3e' : '#c00');
}

function buildEstadoResultados(doc: PDFKit.PDFDocument, _data: ReportLine[], extra: Record<string, any>, ml: number, pageW: number): void {
  const bodyW  = pageW - ml * 2;
  const amtW   = 100;
  const labelW = bodyW - amtW;

  const section = (title: string, color: string) => {
    doc.rect(ml, doc.y, bodyW, 14).fill(color);
    doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
       .text(title, ml + 4, doc.y - 11, { width: bodyW - 8 });
    doc.y += 3;
  };

  const lineRow = (label: string, amount: number, indent = 0, bold = false, separator = false) => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    if (separator) { doc.moveTo(ml, doc.y).lineTo(pageW - ml, doc.y).stroke('#ddd'); }
    const y = doc.y;
    doc.fontSize(7.5).fillColor('#222').font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, ml + 4 + indent, y + 2, { width: labelW - indent - 4 });
    doc.text(fmt2(amount), ml + labelW, y + 2, { width: amtW - 4, align: 'right' });
    doc.y = y + 13;
  };

  const ingresos: ReportLine[] = (extra['ingresos'] ?? []);
  const costos:   ReportLine[] = (extra['costos']   ?? []);

  section('INGRESOS', '#1a7c3e');
  ingresos.forEach(l => lineRow(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), 8));
  lineRow('TOTAL INGRESOS', Number(extra['totalIngresos'] ?? 0), 0, true, true);

  doc.moveDown(0.5);
  section('COSTOS Y GASTOS', '#9f2020');
  costos.forEach(l => lineRow(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), 8));
  lineRow('TOTAL COSTOS Y GASTOS', Number(extra['totalCostos'] ?? 0), 0, true, true);

  doc.moveDown(0.8);
  const utilidad = Number(extra['utilidad'] ?? 0);
  const isGain   = utilidad >= 0;
  doc.rect(ml, doc.y, bodyW, 18).fill(isGain ? '#e8f5e9' : '#fce8e8');
  const resultLabel = isGain ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO';
  const y = doc.y;
  doc.fontSize(9).fillColor(isGain ? '#1a7c3e' : '#9f2020').font('Helvetica-Bold')
     .text(resultLabel, ml + 4, y + 4, { width: labelW - 4 });
  doc.text(fmt2(Math.abs(utilidad)), ml + labelW, y + 4, { width: amtW - 4, align: 'right' });
  doc.y = y + 20;
}

function buildBalanceGeneral(doc: PDFKit.PDFDocument, _data: ReportLine[], extra: Record<string, any>, ml: number, pageW: number): void {
  const colW   = (pageW - ml * 2 - 10) / 2;
  const amtW   = 80;
  const labelW = colW - amtW;

  const sectionTitle = (title: string, x: number, color: string) => {
    doc.rect(x, doc.y, colW, 13).fill(color);
    doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
       .text(title, x + 3, doc.y - 10, { width: colW - 6 });
    doc.y += 2;
  };

  const subTitle = (title: string, x: number) => {
    const y = doc.y;
    doc.rect(x, y, colW, 11).fill('#f4f6f9');
    doc.fontSize(7).fillColor('#555').font('Helvetica-Bold')
       .text(title, x + 3, y + 2, { width: colW - 6 });
    doc.y = y + 11;
  };

  const lineRow2 = (label: string, amount: number, x: number) => {
    const y = doc.y;
    doc.fontSize(7).fillColor('#222').font('Helvetica')
       .text(label, x + 4, y + 1, { width: labelW - 4 });
    doc.text(fmt2(amount), x + labelW, y + 1, { width: amtW - 4, align: 'right' });
    doc.y = y + 11;
  };

  const subtotalRow = (label: string, amount: number, x: number) => {
    const y = doc.y;
    doc.moveTo(x, y).lineTo(x + colW, y).stroke('#ccc');
    doc.rect(x, y, colW, 12).fill('#e8edf5');
    doc.fontSize(7.5).fillColor('#333').font('Helvetica-Bold')
       .text(label, x + 4, y + 2, { width: labelW - 4 });
    doc.text(fmt2(amount), x + labelW, y + 2, { width: amtW - 4, align: 'right' });
    doc.y = y + 12;
  };

  const startY = doc.y;
  const leftX  = ml;
  const rightX = ml + colW + 10;

  // Left: Activos
  let leftY = startY;
  doc.y = leftY;
  sectionTitle('ACTIVOS', leftX, '#1a56db'); leftY = doc.y;

  doc.y = leftY; subTitle('Activo Corriente', leftX); leftY = doc.y;
  (extra['activoCorriente'] ?? []).forEach((l: ReportLine) => {
    doc.y = leftY;
    lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), leftX);
    leftY = doc.y;
  });
  doc.y = leftY; subtotalRow('Subtotal Activo Corriente', Number(extra['totalActivoCorriente'] ?? 0), leftX); leftY = doc.y;

  doc.y = leftY; subTitle('Activo No Corriente', leftX); leftY = doc.y;
  (extra['activoNoCorriente'] ?? []).forEach((l: ReportLine) => {
    doc.y = leftY;
    lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), leftX);
    leftY = doc.y;
  });
  doc.y = leftY; subtotalRow('Subtotal Activo No Corriente', Number(extra['totalActivoNoCorriente'] ?? 0), leftX); leftY = doc.y;

  doc.y = leftY;
  doc.moveTo(leftX, doc.y).lineTo(leftX + colW, doc.y).stroke('#aaa');
  doc.rect(leftX, doc.y, colW, 14).fill('#dbeafe');
  const ty = doc.y;
  doc.fontSize(8).fillColor('#1a56db').font('Helvetica-Bold')
     .text('TOTAL ACTIVOS', leftX + 4, ty + 3, { width: labelW - 4 });
  doc.text(fmt2(Number(extra['totalActivos'] ?? 0)), leftX + labelW, ty + 3, { width: amtW - 4, align: 'right' });
  leftY = ty + 16;

  // Right: Pasivos + Patrimonio
  let rightY = startY;
  doc.y = rightY;
  sectionTitle('PASIVOS Y PATRIMONIO', rightX, '#c27803'); rightY = doc.y;

  doc.y = rightY; subTitle('Pasivo Corriente', rightX); rightY = doc.y;
  (extra['pasivoCorriente'] ?? []).forEach((l: ReportLine) => {
    doc.y = rightY;
    lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), rightX);
    rightY = doc.y;
  });
  doc.y = rightY; subtotalRow('Subtotal Pasivo Corriente', Number(extra['totalPasivoCorriente'] ?? 0), rightX); rightY = doc.y;

  doc.y = rightY; subTitle('Pasivo No Corriente', rightX); rightY = doc.y;
  (extra['pasivoNoCorriente'] ?? []).forEach((l: ReportLine) => {
    doc.y = rightY;
    lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), rightX);
    rightY = doc.y;
  });
  doc.y = rightY; subtotalRow('Subtotal Pasivo No Corriente', Number(extra['totalPasivoNoCorriente'] ?? 0), rightX); rightY = doc.y;

  doc.y = rightY; subTitle('Patrimonio', rightX); rightY = doc.y;
  (extra['patrimonio'] ?? []).forEach((l: ReportLine) => {
    doc.y = rightY;
    lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), rightX);
    rightY = doc.y;
  });
  doc.y = rightY; subtotalRow('Subtotal Patrimonio', Number(extra['totalPatrimonio'] ?? 0), rightX); rightY = doc.y;

  doc.y = rightY;
  doc.moveTo(rightX, doc.y).lineTo(rightX + colW, doc.y).stroke('#aaa');
  doc.rect(rightX, doc.y, colW, 14).fill('#fef9c3');
  const ty2 = doc.y;
  const isCuadrado = Math.abs(Number(extra['totalActivos'] ?? 0) - Number(extra['totalPasivoPatrimonio'] ?? 0)) < 0.01;
  doc.fontSize(8).fillColor('#c27803').font('Helvetica-Bold')
     .text('TOTAL PAS. + PATR.', rightX + 4, ty2 + 3, { width: labelW - 4 });
  doc.text(fmt2(Number(extra['totalPasivoPatrimonio'] ?? 0)), rightX + labelW, ty2 + 3, { width: amtW - 4, align: 'right' });
  rightY = ty2 + 16;

  doc.y = Math.max(leftY, rightY) + 4;

  // Cuadre line
  doc.rect(ml, doc.y, pageW - ml * 2, 13)
     .fill(isCuadrado ? '#dcfce7' : '#fee2e2');
  const cy = doc.y;
  doc.fontSize(8).fillColor(isCuadrado ? '#1a7c3e' : '#9f2020').font('Helvetica-Bold')
     .text(
       isCuadrado ? 'BALANCE CUADRADO — Activos = Pasivos + Patrimonio' : `BALANCE DESCUADRADO — Diferencia: ${fmt2(Math.abs(Number(extra['totalActivos'] ?? 0) - Number(extra['totalPasivoPatrimonio'] ?? 0)))}`,
       ml + 4, cy + 3, { width: pageW - ml * 2 - 8, align: 'center' }
     );
  doc.y = cy + 15;
}

// ─── Main callable ─────────────────────────────────────────────────────────────

export const generateAccountingPdf = onCall<GenerateAccountingPdfInput>(
  { timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    const { reportType, companyId, periodName, data, extraData = {} } = request.data;

    if (!reportType || !companyId) {
      throw new HttpsError('invalid-argument', 'reportType y companyId son requeridos');
    }

    const db = admin.firestore();

    // Load company info for the PDF header
    const companySnap = await db.doc(`companies/${companyId}`).get();
    const company     = companySnap.data() as Record<string, any> | undefined;
    const companyName = company?.['name'] ?? company?.['businessName'] ?? 'Empresa';
    const companyRuc  = company?.['taxId']  ?? company?.['ruc'] ?? '';

    const TITLES: Record<ReportType, string> = {
      'libro-diario':         'LIBRO DIARIO',
      'libro-mayor':          'LIBRO MAYOR',
      'balance-comprobacion': 'BALANCE DE COMPROBACIÓN',
      'estado-resultados':    'ESTADO DE RESULTADOS',
      'balance-general':      'BALANCE GENERAL',
    };

    const title = TITLES[reportType] ?? reportType.toUpperCase();

    // Generate PDF in memory
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size:   'LETTER',
        layout: reportType === 'balance-general' ? 'landscape' : 'portrait',
        margins: { top: 55, bottom: 40, left: 36, right: 36 }
      });

      doc.on('data',  chunk => chunks.push(chunk));
      doc.on('end',   resolve);
      doc.on('error', reject);

      const ml    = doc.page.margins.left;
      const pageW = doc.page.width;

      pageHeader(doc, title, companyName, companyRuc, periodName);

      switch (reportType) {
        case 'libro-diario':
          buildLibroDiario(doc, data, extraData, ml, pageW);
          break;
        case 'libro-mayor':
          buildLibroMayor(doc, data, extraData, ml, pageW);
          break;
        case 'balance-comprobacion':
          buildBalanceComprobacion(doc, data, extraData, ml, pageW);
          break;
        case 'estado-resultados':
          buildEstadoResultados(doc, data, extraData, ml, pageW);
          break;
        case 'balance-general':
          buildBalanceGeneral(doc, data, extraData, ml, pageW);
          break;
      }

      // Page numbers footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor('#aaa').font('Helvetica')
           .text(
             `Generado: ${new Date().toLocaleString('es-EC')}  |  Página ${i - range.start + 1} de ${range.count}`,
             ml, doc.page.height - 28,
             { width: pageW - ml * 2, align: 'center' }
           );
      }

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    return { pdf: pdfBuffer.toString('base64'), filename: `${reportType}-${periodName.replace(/\s+/g, '_')}.pdf` };
  }
);
