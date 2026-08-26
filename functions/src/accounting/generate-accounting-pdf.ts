import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../utils/callable-auth';
import {
  buildPdfDocument, buildTheme,
  renderCorporateHeader, renderFilterBadges,
  renderTableHeader, renderTableRow, renderTotalRow,
  renderSectionBanner, renderCorporateFooter,
  checkPageBreak, rowRealHeight, fmt2,
  CompanyInfo, ReportMeta, FilterParam,
  PDF_COLORS, PDF_FONT, PDF_SPACING, PdfTheme, ColDef, CellDef,
} from './pdf-template';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | 'libro-diario'
  | 'libro-mayor'
  | 'balance-comprobacion'
  | 'estado-resultados'
  | 'balance-general'
  | 'flujo-efectivo'
  | 'cost-centers';

interface ReportLine { [key: string]: string | number | ReportLine[] }

interface GenerateAccountingPdfInput {
  reportType:  ReportType;
  companyId:   string;
  periodName:  string;
  data:        ReportLine[];
  extraData?:  Record<string, any>;
}

// ─── Report Titles / Subtitles ────────────────────────────────────────────────

const REPORT_INFO: Record<ReportType, { title: string; subtitle: string; landscape?: boolean }> = {
  'libro-diario':         { title: 'LIBRO DIARIO',                  subtitle: 'Registro cronológico de asientos contables', landscape: true  },
  'libro-mayor':          { title: 'LIBRO MAYOR',                   subtitle: 'Movimientos por cuenta contable'             },
  'balance-comprobacion': { title: 'BALANCE DE COMPROBACIÓN',       subtitle: 'Sumas y saldos por cuenta'                  },
  'estado-resultados':    { title: 'ESTADO DE RESULTADOS',          subtitle: 'Ingresos y gastos del período'               },
  'balance-general':      { title: 'BALANCE GENERAL',               subtitle: 'Situación financiera de la empresa',        landscape: true  },
  'flujo-efectivo':       { title: 'ESTADO DE FLUJO DE EFECTIVO',   subtitle: 'Movimientos de efectivo del período'        },
  'cost-centers':         { title: 'CENTROS DE COSTO',              subtitle: 'Consulta de centros de costos',             landscape: true  },
};

// ─── Report Builders ──────────────────────────────────────────────────────────

function buildLibroDiario(
  doc:   PDFKit.PDFDocument,
  data:  ReportLine[],
  extra: Record<string, any>,
  ml:    number,
  pageW: number,
  theme: PdfTheme
): void {
  const cols: ColDef[] = [
    { label: 'N°',                    width: 30  },
    { label: 'Fecha',                 width: 65  },
    { label: 'Descripción / Cuenta',  width: 175 },
    { label: 'Referencia',            width: 80  },
    { label: 'Débito',                width: 70, align: 'right' },
    { label: 'Crédito',               width: 70, align: 'right' },
  ];

  renderTableHeader(doc, cols, theme);

  data.forEach((row, i) => {
    const lines = (row['lines'] as ReportLine[] | undefined) ?? [];

    const headerCells: CellDef[] = [
      { value: String(row['number'] ?? ''),      width: 30,  bold: true },
      { value: String(row['date']   ?? ''),      width: 65,  bold: true },
      { value: String(row['description'] ?? ''), width: 175, bold: true },
      { value: String(row['reference'] ?? ''),   width: 80  },
      { value: Number(row['totalDebit']  ?? 0),  width: 70, align: 'right', bold: true },
      { value: Number(row['totalCredit'] ?? 0),  width: 70, align: 'right', bold: true },
    ];

    const lineCells: CellDef[][] = lines.map(line => {
      const debit  = Number(line['debit']  ?? 0);
      const credit = Number(line['credit'] ?? 0);
      return [
        { value: '', width: 30 },
        { value: '', width: 65 },
        { value: `   ${line['accountCode'] ?? ''} — ${line['accountName'] ?? ''}`, width: 175, color: PDF_COLORS.textLight },
        { value: '', width: 80 },
        { value: debit  > 0 ? debit  : '' as any, width: 70, align: 'right', color: PDF_COLORS.textLight },
        { value: credit > 0 ? credit : '' as any, width: 70, align: 'right', color: PDF_COLORS.textLight },
      ];
    });

    const neededH = rowRealHeight(doc, headerCells) + lineCells.reduce((s, c) => s + rowRealHeight(doc, c), 0);
    if (checkPageBreak(doc, neededH)) renderTableHeader(doc, cols, theme);

    renderTableRow(doc, headerCells, i, theme);
    for (const cells of lineCells) {
      if (checkPageBreak(doc, rowRealHeight(doc, cells))) renderTableHeader(doc, cols, theme);
      renderTableRow(doc, cells, -1, theme); // -1 → no shading on subrows
    }
  });

  doc.moveDown(0.3);
  renderTotalRow(doc, 'TOTALES', [
    { value: '', width: 350 },
    { value: Number(extra['totalDebit']  ?? 0), width: 70, align: 'right' },
    { value: Number(extra['totalCredit'] ?? 0), width: 70, align: 'right' },
  ], theme);
}

function buildLibroMayor(
  doc:   PDFKit.PDFDocument,
  data:  ReportLine[],
  extra: Record<string, any>,
  ml:    number,
  _pageW: number,
  theme:  PdfTheme
): void {
  const accountName = String(extra['accountName'] ?? '');
  const accountCode = String(extra['accountCode'] ?? '');

  doc.fontSize(PDF_FONT.md).fillColor(PDF_COLORS.textDark).font('Helvetica-Bold')
     .text(`Cuenta: ${accountCode} — ${accountName}`, ml);
  doc.moveDown(0.3);

  const cols: ColDef[] = [
    { label: 'N°',          width: 30  },
    { label: 'Fecha',       width: 65  },
    { label: 'Descripción', width: 195 },
    { label: 'Tipo',        width: 60  },
    { label: 'Débito',      width: 65, align: 'right' },
    { label: 'Crédito',     width: 65, align: 'right' },
    { label: 'Saldo',       width: 70, align: 'right' },
  ];
  renderTableHeader(doc, cols, theme);

  data.forEach((row, i) => {
    if (checkPageBreak(doc, PDF_SPACING.rowMinH + 4)) renderTableHeader(doc, cols, theme);
    const bal = Number(row['balance'] ?? 0);
    renderTableRow(doc, [
      { value: String(row['entryNumber'] ?? ''),  width: 30  },
      { value: String(row['date']        ?? ''),  width: 65  },
      { value: String(row['description'] ?? ''),  width: 195 },
      { value: String(row['type']        ?? ''),  width: 60  },
      { value: Number(row['debit']       ?? 0),   width: 65, align: 'right' },
      { value: Number(row['credit']      ?? 0),   width: 65, align: 'right' },
      { value: bal, width: 70, align: 'right', color: bal < 0 ? PDF_COLORS.red : PDF_COLORS.textDark },
    ], i, theme);
  });

  doc.moveDown(0.3);
  renderTotalRow(doc, 'TOTALES', [
    { value: '', width: 350 },
    { value: Number(extra['totalDebit']   ?? 0), width: 65, align: 'right' },
    { value: Number(extra['totalCredit']  ?? 0), width: 65, align: 'right' },
    { value: Number(extra['finalBalance'] ?? 0), width: 70, align: 'right' },
  ], theme);
}

function buildBalanceComprobacion(
  doc:   PDFKit.PDFDocument,
  data:  ReportLine[],
  extra: Record<string, any>,
  _ml:   number,
  _pageW: number,
  theme:  PdfTheme
): void {
  const cols: ColDef[] = [
    { label: 'Código',    width: 70  },
    { label: 'Cuenta',    width: 195 },
    { label: 'Tipo',      width: 65  },
    { label: 'Débitos',   width: 65, align: 'right' },
    { label: 'Créditos',  width: 65, align: 'right' },
    { label: 'Sd. Deud.', width: 60, align: 'right' },
    { label: 'Sd. Acr.',  width: 60, align: 'right' },
  ];
  renderTableHeader(doc, cols, theme);

  data.forEach((row, i) => {
    if (checkPageBreak(doc, PDF_SPACING.rowMinH + 4)) renderTableHeader(doc, cols, theme);
    const deb  = Number(row['sumDebit']  ?? 0);
    const cred = Number(row['sumCredit'] ?? 0);
    renderTableRow(doc, [
      { value: String(row['accountCode'] ?? ''), width: 70, bold: true },
      { value: String(row['accountName'] ?? ''), width: 195 },
      { value: String(row['accountType'] ?? ''), width: 65 },
      { value: deb,  width: 65, align: 'right' },
      { value: cred, width: 65, align: 'right' },
      { value: deb  > cred ? deb  - cred : 0, width: 60, align: 'right' },
      { value: cred > deb  ? cred - deb  : 0, width: 60, align: 'right' },
    ], i, theme);
  });

  doc.moveDown(0.3);
  const td = Number(extra['totalDebit']  ?? 0);
  const tc = Number(extra['totalCredit'] ?? 0);
  const cuadrado = Math.abs(td - tc) < 0.01;
  renderTotalRow(
    doc,
    `TOTALES — ${cuadrado ? 'CUADRADO ✓' : 'DESCUADRADO ✗'}`,
    [
      { value: '', width: 330 },
      { value: td, width: 65, align: 'right' },
      { value: tc, width: 65, align: 'right' },
      { value: td > tc ? td - tc : 0, width: 60, align: 'right' },
      { value: tc > td ? tc - td : 0, width: 60, align: 'right' },
    ],
    theme,
    { color: cuadrado ? PDF_COLORS.green : PDF_COLORS.red, bgColor: cuadrado ? PDF_COLORS.greenBg : PDF_COLORS.redBg }
  );
}

function buildEstadoResultados(
  doc:    PDFKit.PDFDocument,
  _data:  ReportLine[],
  extra:  Record<string, any>,
  ml:     number,
  pageW:  number,
  _theme: PdfTheme
): void {
  const bodyW  = pageW - ml * 2;
  const amtW   = 100;
  const labelW = bodyW - amtW;

  const lineRow = (label: string, amount: number, indent = 0, bold = false, separator = false) => {
    if (checkPageBreak(doc, 14)) { /* already added page */ }
    if (separator) {
      doc.moveTo(ml, doc.y).lineTo(pageW - ml, doc.y)
         .strokeColor(PDF_COLORS.borderLight).lineWidth(0.5).stroke().lineWidth(1);
    }
    const y = doc.y;
    doc.fontSize(PDF_FONT.base).fillColor(PDF_COLORS.textDark).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, ml + 4 + indent, y + 2, { width: labelW - indent - 4 });
    doc.fontSize(PDF_FONT.base).fillColor(PDF_COLORS.textDark).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(fmt2(amount), ml + labelW, y + 2, { width: amtW - 4, align: 'right' });
    doc.y = y + 13;
  };

  const ingresos: ReportLine[] = extra['ingresos'] ?? [];
  const costos:   ReportLine[] = extra['costos']   ?? [];

  renderSectionBanner(doc, 'INGRESOS',         { bgColor: PDF_COLORS.green });
  ingresos.forEach(l => lineRow(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), 8));
  lineRow('TOTAL INGRESOS', Number(extra['totalIngresos'] ?? 0), 0, true, true);

  doc.moveDown(0.5);
  renderSectionBanner(doc, 'COSTOS Y GASTOS',  { bgColor: '#9f2020' });
  costos.forEach(l => lineRow(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), 8));
  lineRow('TOTAL COSTOS Y GASTOS', Number(extra['totalCostos'] ?? 0), 0, true, true);

  doc.moveDown(0.8);
  const utilidad = Number(extra['utilidad'] ?? 0);
  const isGain   = utilidad >= 0;
  doc.rect(ml, doc.y, bodyW, 18).fill(isGain ? PDF_COLORS.greenBg : PDF_COLORS.redBg);
  const resultLabel = isGain ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO';
  const cy = doc.y;
  doc.fontSize(PDF_FONT.md).fillColor(isGain ? PDF_COLORS.green : PDF_COLORS.red).font('Helvetica-Bold')
     .text(resultLabel, ml + 4, cy + 4, { width: labelW - 4 });
  doc.text(fmt2(Math.abs(utilidad)), ml + labelW, cy + 4, { width: amtW - 4, align: 'right' });
  doc.y = cy + 20;
}

function buildBalanceGeneral(
  doc:    PDFKit.PDFDocument,
  _data:  ReportLine[],
  extra:  Record<string, any>,
  ml:     number,
  pageW:  number,
  theme:  PdfTheme
): void {
  const colW   = (pageW - ml * 2 - 10) / 2;
  const amtW   = 80;
  const labelW = colW - amtW;

  const sectionTitle = (title: string, x: number, color: string) => {
    doc.rect(x, doc.y, colW, 13).fill(color);
    doc.fontSize(PDF_FONT.base).fillColor('#fff').font('Helvetica-Bold')
       .text(title, x + 3, doc.y - 10, { width: colW - 6 });
    doc.y += 2;
  };

  const subTitle = (title: string, x: number) => {
    const y = doc.y;
    doc.rect(x, y, colW, 11).fill(PDF_COLORS.bgRowAlt);
    doc.fontSize(PDF_FONT.sm).fillColor(PDF_COLORS.textMed).font('Helvetica-Bold')
       .text(title, x + 3, y + 2, { width: colW - 6 });
    doc.y = y + 11;
  };

  const lineRow2 = (label: string, amount: number, x: number) => {
    const y = doc.y;
    doc.fontSize(PDF_FONT.sm).fillColor(PDF_COLORS.textDark).font('Helvetica')
       .text(label, x + 4, y + 1, { width: labelW - 4 });
    doc.text(fmt2(amount), x + labelW, y + 1, { width: amtW - 4, align: 'right' });
    doc.y = y + 11;
  };

  const subtotalRow = (label: string, amount: number, x: number) => {
    const y = doc.y;
    doc.moveTo(x, y).lineTo(x + colW, y).strokeColor(PDF_COLORS.borderMed).lineWidth(0.5).stroke().lineWidth(1);
    doc.rect(x, y, colW, 12).fill('#e8edf5');
    doc.fontSize(PDF_FONT.base).fillColor(PDF_COLORS.textMed).font('Helvetica-Bold')
       .text(label, x + 4, y + 2, { width: labelW - 4 });
    doc.text(fmt2(amount), x + labelW, y + 2, { width: amtW - 4, align: 'right' });
    doc.y = y + 12;
  };

  const startY = doc.y;
  const leftX  = ml;
  const rightX = ml + colW + 10;

  let leftY = startY;
  doc.y = leftY;
  sectionTitle('ACTIVOS', leftX, theme.primary); leftY = doc.y;

  doc.y = leftY; subTitle('Activo Corriente', leftX); leftY = doc.y;
  (extra['activoCorriente'] ?? []).forEach((l: ReportLine) => { doc.y = leftY; lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), leftX); leftY = doc.y; });
  doc.y = leftY; subtotalRow('Subtotal Activo Corriente', Number(extra['totalActivoCorriente'] ?? 0), leftX); leftY = doc.y;

  doc.y = leftY; subTitle('Activo No Corriente', leftX); leftY = doc.y;
  (extra['activoNoCorriente'] ?? []).forEach((l: ReportLine) => { doc.y = leftY; lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), leftX); leftY = doc.y; });
  doc.y = leftY; subtotalRow('Subtotal Activo No Corriente', Number(extra['totalActivoNoCorriente'] ?? 0), leftX); leftY = doc.y;

  doc.y = leftY;
  doc.moveTo(leftX, doc.y).lineTo(leftX + colW, doc.y).strokeColor(PDF_COLORS.borderMed).lineWidth(0.8).stroke().lineWidth(1);
  doc.rect(leftX, doc.y, colW, 14).fill(theme.primaryLight);
  const ty = doc.y;
  doc.fontSize(PDF_FONT.base).fillColor(theme.primary).font('Helvetica-Bold')
     .text('TOTAL ACTIVOS', leftX + 4, ty + 3, { width: labelW - 4 });
  doc.text(fmt2(Number(extra['totalActivos'] ?? 0)), leftX + labelW, ty + 3, { width: amtW - 4, align: 'right' });
  leftY = ty + 16;

  let rightY = startY;
  doc.y = rightY;
  sectionTitle('PASIVOS Y PATRIMONIO', rightX, '#c27803'); rightY = doc.y;

  doc.y = rightY; subTitle('Pasivo Corriente', rightX); rightY = doc.y;
  (extra['pasivoCorriente'] ?? []).forEach((l: ReportLine) => { doc.y = rightY; lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), rightX); rightY = doc.y; });
  doc.y = rightY; subtotalRow('Subtotal Pasivo Corriente', Number(extra['totalPasivoCorriente'] ?? 0), rightX); rightY = doc.y;

  doc.y = rightY; subTitle('Pasivo No Corriente', rightX); rightY = doc.y;
  (extra['pasivoNoCorriente'] ?? []).forEach((l: ReportLine) => { doc.y = rightY; lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), rightX); rightY = doc.y; });
  doc.y = rightY; subtotalRow('Subtotal Pasivo No Corriente', Number(extra['totalPasivoNoCorriente'] ?? 0), rightX); rightY = doc.y;

  doc.y = rightY; subTitle('Patrimonio', rightX); rightY = doc.y;
  (extra['patrimonio'] ?? []).forEach((l: ReportLine) => { doc.y = rightY; lineRow2(String(l['accountName'] ?? ''), Number(l['netBalance'] ?? 0), rightX); rightY = doc.y; });
  doc.y = rightY; subtotalRow('Subtotal Patrimonio', Number(extra['totalPatrimonio'] ?? 0), rightX); rightY = doc.y;

  doc.y = rightY;
  doc.moveTo(rightX, doc.y).lineTo(rightX + colW, doc.y).strokeColor(PDF_COLORS.borderMed).lineWidth(0.8).stroke().lineWidth(1);
  doc.rect(rightX, doc.y, colW, 14).fill('#fef9c3');
  const ty2 = doc.y;
  const isCuadrado = Math.abs(Number(extra['totalActivos'] ?? 0) - Number(extra['totalPasivoPatrimonio'] ?? 0)) < 0.01;
  doc.fontSize(PDF_FONT.base).fillColor('#c27803').font('Helvetica-Bold')
     .text('TOTAL PAS. + PATR.', rightX + 4, ty2 + 3, { width: labelW - 4 });
  doc.text(fmt2(Number(extra['totalPasivoPatrimonio'] ?? 0)), rightX + labelW, ty2 + 3, { width: amtW - 4, align: 'right' });
  rightY = ty2 + 16;

  doc.y = Math.max(leftY, rightY) + 4;

  const bodyW = pageW - ml * 2;
  doc.rect(ml, doc.y, bodyW, 13).fill(isCuadrado ? PDF_COLORS.greenBg : PDF_COLORS.redBg);
  const cy = doc.y;
  doc.fontSize(PDF_FONT.base).fillColor(isCuadrado ? PDF_COLORS.green : PDF_COLORS.red).font('Helvetica-Bold')
     .text(
       isCuadrado
         ? 'BALANCE CUADRADO — Activos = Pasivos + Patrimonio ✓'
         : `BALANCE DESCUADRADO — Diferencia: ${fmt2(Math.abs(Number(extra['totalActivos'] ?? 0) - Number(extra['totalPasivoPatrimonio'] ?? 0)))} ✗`,
       ml + 4, cy + 3, { width: bodyW - 8, align: 'center' }
     );
  doc.y = cy + 15;
}

function buildFlujoEfectivo(
  doc:    PDFKit.PDFDocument,
  _data:  ReportLine[],
  extra:  Record<string, any>,
  ml:     number,
  pageW:  number,
  _theme: PdfTheme
): void {
  const bodyW  = pageW - ml * 2;
  const amtW   = 100;
  const labelW = bodyW - amtW;

  const lineRow = (label: string, amount: number, indent = 0, bold = false, separator = false) => {
    checkPageBreak(doc, 14);
    if (separator) {
      doc.moveTo(ml, doc.y).lineTo(pageW - ml, doc.y)
         .strokeColor(PDF_COLORS.borderLight).lineWidth(0.5).stroke().lineWidth(1);
    }
    const y = doc.y;
    doc.fontSize(PDF_FONT.base).fillColor(PDF_COLORS.textDark).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, ml + 4 + indent, y + 2, { width: labelW - indent - 4 });
    doc.text(fmt2(amount), ml + labelW, y + 2, { width: amtW - 4, align: 'right' });
    doc.y = y + 13;
  };

  const banner = (label: string, amount: number, bg: string, fg: string) => {
    checkPageBreak(doc, 18);
    doc.rect(ml, doc.y, bodyW, 16).fill(bg);
    const y = doc.y;
    doc.fontSize(PDF_FONT.md).fillColor(fg).font('Helvetica-Bold')
       .text(label, ml + 4, y + 3, { width: labelW - 4 });
    doc.text(fmt2(amount), ml + labelW, y + 3, { width: amtW - 4, align: 'right' });
    doc.y = y + 19;
  };

  banner('EFECTIVO AL INICIO DEL PERÍODO', Number(extra['efectivoInicial'] ?? 0), '#eef2f7', '#334155');
  doc.moveDown(0.3);

  renderSectionBanner(doc, 'FLUJO DE ACTIVIDADES DE OPERACIÓN',    { bgColor: '#1a56db' });
  (extra['operacion']      ?? []).forEach((l: ReportLine) => lineRow(String(l['accountName'] ?? ''), Number(l['amount'] ?? 0), 8));
  lineRow('Efectivo neto de Operación', Number(extra['totalOperacion'] ?? 0), 0, true, true);

  doc.moveDown(0.4);
  renderSectionBanner(doc, 'FLUJO DE ACTIVIDADES DE INVERSIÓN',    { bgColor: '#7c3aed' });
  (extra['inversion']      ?? []).forEach((l: ReportLine) => lineRow(String(l['accountName'] ?? ''), Number(l['amount'] ?? 0), 8));
  lineRow('Efectivo neto de Inversión', Number(extra['totalInversion'] ?? 0), 0, true, true);

  doc.moveDown(0.4);
  renderSectionBanner(doc, 'FLUJO DE ACTIVIDADES DE FINANCIAMIENTO', { bgColor: '#c27803' });
  (extra['financiamiento'] ?? []).forEach((l: ReportLine) => lineRow(String(l['accountName'] ?? ''), Number(l['amount'] ?? 0), 8));
  lineRow('Efectivo neto de Financiamiento', Number(extra['totalFinanciamiento'] ?? 0), 0, true, true);

  doc.moveDown(0.6);
  const variacion  = Number(extra['variacionNeta'] ?? 0);
  const isPositive = variacion >= 0;
  banner('VARIACIÓN NETA DE EFECTIVO',   variacion, isPositive ? PDF_COLORS.greenBg : PDF_COLORS.redBg, isPositive ? PDF_COLORS.green : PDF_COLORS.red);
  banner('EFECTIVO AL FINAL DEL PERÍODO', Number(extra['efectivoFinal'] ?? 0), '#dbeafe', '#1a56db');
}

function buildCostCenters(
  doc:   PDFKit.PDFDocument,
  data:  ReportLine[],
  extra: Record<string, any>,
  ml:    number,
  pageW: number,
  theme: PdfTheme
): void {
  const contentW = pageW - ml * 2;

  // ── Filter badges ──────────────────────────────────────────────────────────
  const filters: FilterParam[] = [];
  if (extra['filterStatus']) filters.push({ label: 'Estado', value: String(extra['filterStatus']) });
  filters.push({ label: 'Registros', value: String(data.length) });
  if (extra['generatedDate']) filters.push({ label: 'Fecha', value: String(extra['generatedDate']) });

  renderFilterBadges(doc, filters, theme);

  // ── Table ──────────────────────────────────────────────────────────────────
  const descW = contentW - 80 - 185 - 100 - 120 - 65;
  const cols: ColDef[] = [
    { label: 'Código',          width: 80   },
    { label: 'Nombre',          width: 185  },
    { label: 'Tipo',            width: 100  },
    { label: 'Centro Superior', width: 120  },
    { label: 'Estado',          width: 65   },
    { label: 'Descripción',     width: Math.max(descW, 40) },
  ];

  renderTableHeader(doc, cols, theme);

  data.forEach((row, i) => {
    const depth    = Number(row['depth'] ?? 0);
    const indent   = '  '.repeat(depth);
    const isActive = String(row['isActive'] ?? '') === 'Activo';

    const cells: CellDef[] = [
      { value: String(row['code']        ?? ''), width: cols[0].width, bold: depth === 0 },
      { value: indent + String(row['name'] ?? ''), width: cols[1].width, bold: depth === 0,
        color: depth === 0 ? PDF_COLORS.textDark : PDF_COLORS.textMed },
      { value: String(row['type']        ?? ''), width: cols[2].width, color: PDF_COLORS.textMed },
      { value: String(row['parentName']  ?? ''), width: cols[3].width, color: PDF_COLORS.textLight },
      {
        value: String(row['isActive'] ?? ''),
        width: cols[4].width,
        bold:  true,
        color: isActive ? PDF_COLORS.green : PDF_COLORS.red,
      },
      { value: String(row['description'] ?? ''), width: cols[5].width, color: PDF_COLORS.textLight },
    ];

    if (checkPageBreak(doc, rowRealHeight(doc, cells) + 4)) renderTableHeader(doc, cols, theme);
    renderTableRow(doc, cells, i, theme);
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  doc.moveDown(0.5);
  doc.fontSize(PDF_FONT.base).fillColor(PDF_COLORS.textMed).font('Helvetica-Bold')
     .text(`Total registros: ${data.length}`, ml);
}

// ─── Main callable ─────────────────────────────────────────────────────────────

export const generateAccountingPdf = onCall<GenerateAccountingPdfInput>(
  { timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    const { reportType, companyId, periodName, data, extraData = {} } = request.data;

    if (!reportType || !companyId) {
      throw new HttpsError('invalid-argument', 'reportType y companyId son requeridos');
    }

    requireCompanyRole(request, companyId, ['admin', 'accountant']);

    const db = admin.firestore();

    // Load company info from Firestore
    const companySnap = await db.doc(`companies/${companyId}`).get();
    const company     = companySnap.data() as Record<string, any> | undefined;
    const companyName = String(company?.['name'] ?? company?.['businessName'] ?? 'Empresa');
    const companyRuc  = String(company?.['taxId'] ?? company?.['ruc'] ?? '');

    // Brand colors: prefer extraData (from frontend) over Firestore snapshot
    const brandColor  = String(extraData['brandColor']  ?? company?.['brandColor']  ?? '');
    const brandAccent = String(extraData['brandAccent'] ?? company?.['brandAccentColor'] ?? '');

    const theme = buildTheme(brandColor || null, brandAccent || null);

    // Logo
    let logoBuffer: Buffer | null = null;
    const showLogo = extraData['showLogo'] === true;
    const logoUrl  = typeof extraData['logoUrl'] === 'string' ? extraData['logoUrl'] : '';
    if (showLogo && logoUrl) {
      try {
        const resp = await fetch(logoUrl);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          logoBuffer = Buffer.from(ab);
        }
      } catch { /* logo not available */ }
    }

    const userName  = typeof extraData['userName']  === 'string' ? extraData['userName']  : '';
    const saasName  = typeof extraData['saasName']  === 'string' ? extraData['saasName']  : 'FacturaSec';

    const reportInfo = REPORT_INFO[reportType];
    const generatedAt = new Date();

    const companyInfo: CompanyInfo = {
      name:        companyName,
      ruc:         companyRuc,
      address:     typeof extraData['companyAddress'] === 'string' ? extraData['companyAddress'] : undefined,
      email:       typeof extraData['companyEmail']   === 'string' ? extraData['companyEmail']   : undefined,
      logoBuffer,
      brandColor:  brandColor  || null,
      brandAccent: brandAccent || null,
    };

    const reportMeta: ReportMeta = {
      title:       reportInfo.title,
      subtitle:    periodName || reportInfo.subtitle,
      generatedAt,
      userName:    userName || undefined,
      saasName,
    };

    // Generate PDF
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const doc = buildPdfDocument({
        orientation: reportInfo.landscape ? 'landscape' : 'portrait',
      });

      doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
      doc.on('end',   resolve);
      doc.on('error', reject);

      const ml    = doc.page.margins.left;
      const pageW = doc.page.width;

      // Render corporate header on first page
      renderCorporateHeader(doc, companyInfo, reportMeta, theme);

      // Render report content
      switch (reportType) {
        case 'libro-diario':
          buildLibroDiario(doc, data, extraData, ml, pageW, theme);
          break;
        case 'libro-mayor':
          buildLibroMayor(doc, data, extraData, ml, pageW, theme);
          break;
        case 'balance-comprobacion':
          buildBalanceComprobacion(doc, data, extraData, ml, pageW, theme);
          break;
        case 'estado-resultados':
          buildEstadoResultados(doc, data, extraData, ml, pageW, theme);
          break;
        case 'balance-general':
          buildBalanceGeneral(doc, data, extraData, ml, pageW, theme);
          break;
        case 'flujo-efectivo':
          buildFlujoEfectivo(doc, data, extraData, ml, pageW, theme);
          break;
        case 'cost-centers':
          buildCostCenters(doc, data, extraData, ml, pageW, theme);
          break;
      }

      // Render footer on ALL pages (must be before doc.end())
      renderCorporateFooter(doc, reportMeta, theme);

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const safePeriod = periodName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    return {
      pdf:      pdfBuffer.toString('base64'),
      filename: `${reportType}-${safePeriod}.pdf`,
    };
  }
);
