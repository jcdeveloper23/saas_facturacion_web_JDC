/**
 * pdf-template.ts
 *
 * Corporate PDF Design System — reusable layout module for all reports.
 */

import PDFDocument from 'pdfkit';

// ─── Design Tokens ────────────────────────────────────────────────────────────

export const PDF_COLORS = {
  textDark:    '#111827',
  textMed:     '#374151',
  textLight:   '#6b7280',
  textMuted:   '#9ca3af',
  bgRowAlt:    '#f8fafc',
  bgTotal:     '#eef2ff',
  bgChip:      '#f3f4f6',
  green:       '#15803d',
  greenBg:     '#dcfce7',
  red:         '#b91c1c',
  redBg:       '#fce8e8',
  borderLight: '#e5e7eb',
  borderMed:   '#d1d5db',
} as const;

export const PDF_FONT = {
  sm:  6.5,
  base: 7.5,
  md:  8.5,
  lg:  10,
  xl:  12,
} as const;

export const PDF_SPACING = {
  margin:       40,
  marginTop:    50,
  marginBottom: 38,
  rowMinH:      13,
  rowPadV:      3,
  rowPadH:      4,
  chipH:        14,
  chipPadH:     6,
  chipPadV:     2.5,
  footerH:      28,
} as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CompanyInfo {
  name:         string;
  ruc?:         string;
  address?:     string;
  email?:       string;
  logoBuffer?:  Buffer | null;
  brandColor?:  string | null;
  brandAccent?: string | null;
}

export interface ReportMeta {
  title:       string;
  subtitle?:   string;
  generatedAt: Date;
  userName?:   string;
  saasName?:   string;
}

export interface FilterParam {
  label: string;
  value: string;
}

export interface ColDef {
  label:  string;
  width:  number;
  align?: 'left' | 'center' | 'right';
}

export interface CellDef {
  value:  string | number;
  width:  number;
  align?: 'left' | 'center' | 'right';
  bold?:  boolean;
  color?: string;
}

export interface PdfTheme {
  primary:      string;
  primaryLight: string;
  primaryText:  string;
  accent:       string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmt2(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return isNaN(num as number) ? '0.00' : currencyFmt.format(num as number);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function validHex(hex: string | null | undefined, fallback: string): string {
  if (hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  return fallback;
}

function lightenHex(hex: string, factor = 0.88): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ─── Theme Builder ────────────────────────────────────────────────────────────

export function buildTheme(brandColor?: string | null, brandAccent?: string | null): PdfTheme {
  const primary      = validHex(brandColor, '#1a56db');
  const primaryLight = lightenHex(primary, 0.88);
  const primaryText  = luminance(primary) > 0.4 ? '#111827' : '#ffffff';
  const accent       = validHex(brandAccent, '#0f9d58');
  return { primary, primaryLight, primaryText, accent };
}

// ─── Document Factory ─────────────────────────────────────────────────────────

export function buildPdfDocument(opts: { orientation?: 'portrait' | 'landscape' } = {}): PDFKit.PDFDocument {
  return new PDFDocument({
    size:    'A4',
    layout:  opts.orientation ?? 'portrait',
    margins: {
      top:    PDF_SPACING.marginTop,
      bottom: PDF_SPACING.marginBottom,
      left:   PDF_SPACING.margin,
      right:  PDF_SPACING.margin,
    },
    bufferPages:   true,
    autoFirstPage: true,
  } as any);
}

// ─── Corporate Header ─────────────────────────────────────────────────────────

export function renderCorporateHeader(
  doc:     PDFKit.PDFDocument,
  company: CompanyInfo,
  meta:    ReportMeta,
  theme:   PdfTheme
): void {
  const ml    = doc.page.margins.left;
  const pageW = doc.page.width;
  const bodyW = pageW - ml * 2;

  const leftW  = bodyW * 0.52;
  const rightW = bodyW * 0.48;
  const startY = doc.page.margins.top - 14;

  // ── Left: Logo + company info ──────────────────────────────────────────────
  let textX = ml;
  let textY = startY;

  if (company.logoBuffer) {
    const logoSize = 42;
    try { doc.image(company.logoBuffer, ml, startY, { fit: [logoSize, logoSize] }); } catch { /* ignore */ }
    textX = ml + logoSize + 8;
  }

  const textAvailW = leftW - (textX - ml);

  doc.fontSize(PDF_FONT.md + 0.5)
     .fillColor(PDF_COLORS.textDark)
     .font('Helvetica-Bold')
     .text(company.name || 'Empresa', textX, textY, { width: textAvailW, lineBreak: false });
  textY += 13;

  if (company.ruc) {
    doc.fontSize(PDF_FONT.base)
       .fillColor(PDF_COLORS.textMed)
       .font('Helvetica')
       .text(`RUC: ${company.ruc}`, textX, textY, { width: textAvailW });
    textY += 11;
  }
  if (company.address) {
    doc.fontSize(PDF_FONT.sm)
       .fillColor(PDF_COLORS.textLight)
       .text(company.address, textX, textY, { width: textAvailW });
    textY += 10;
  }
  if (company.email) {
    doc.fontSize(PDF_FONT.sm)
       .fillColor(PDF_COLORS.textLight)
       .text(company.email, textX, textY, { width: textAvailW });
  }

  // ── Right: Report title ────────────────────────────────────────────────────
  const rightX  = ml + leftW;
  const titleH  = 30;

  doc.rect(rightX, startY, rightW, titleH).fill(theme.primaryLight);

  doc.fontSize(PDF_FONT.xl)
     .fillColor(theme.primary)
     .font('Helvetica-Bold')
     .text(meta.title, rightX + 6, startY + 5, {
       width: rightW - 10,
       align: 'right',
       lineBreak: false,
     });

  if (meta.subtitle) {
    doc.fontSize(PDF_FONT.sm)
       .fillColor(PDF_COLORS.textMed)
       .font('Helvetica')
       .text(meta.subtitle, rightX + 6, startY + titleH + 3, {
         width: rightW - 10,
         align: 'right',
       });
  }

  doc.fontSize(PDF_FONT.sm)
     .fillColor(PDF_COLORS.textLight)
     .font('Helvetica')
     .text(`Generado: ${fmtDateTime(meta.generatedAt)}`, rightX, startY + titleH + (meta.subtitle ? 15 : 5), {
       width: rightW - 2,
       align: 'right',
     });

  // ── Decorative accent bar ──────────────────────────────────────────────────
  const barY = startY + 58;
  doc.rect(ml, barY, bodyW, 2.5).fill(theme.primary);

  doc.y = barY + 9;
}

// ─── Filter Badges ────────────────────────────────────────────────────────────

export function renderFilterBadges(
  doc:     PDFKit.PDFDocument,
  filters: FilterParam[],
  theme:   PdfTheme
): void {
  if (!filters.length) return;

  const ml    = doc.page.margins.left;
  const pageW = doc.page.width;
  const bodyW = pageW - ml * 2;
  const chipH = PDF_SPACING.chipH;
  const y     = doc.y;

  let x = ml;
  doc.fontSize(PDF_FONT.sm).font('Helvetica');

  for (const f of filters) {
    const labelTxt = `${f.label}:`;
    const labelW   = doc.widthOfString(labelTxt) + PDF_SPACING.chipPadH * 2;
    const valueW   = doc.widthOfString(f.value) + PDF_SPACING.chipPadH * 2;
    const totalW   = labelW + valueW + 2;

    if (x + totalW > ml + bodyW) break;

    doc.roundedRect(x, y, labelW, chipH, 3).fill(PDF_COLORS.bgChip);
    doc.fontSize(PDF_FONT.sm)
       .fillColor(PDF_COLORS.textLight)
       .font('Helvetica')
       .text(labelTxt, x + PDF_SPACING.chipPadH / 2, y + PDF_SPACING.chipPadV, { width: labelW, lineBreak: false });

    doc.roundedRect(x + labelW + 1, y, valueW, chipH, 3).fill(theme.primaryLight);
    doc.fontSize(PDF_FONT.sm)
       .fillColor(theme.primary)
       .font('Helvetica-Bold')
       .text(f.value, x + labelW + 1 + PDF_SPACING.chipPadH / 2, y + PDF_SPACING.chipPadV, { width: valueW, lineBreak: false });

    x += totalW + 8;
  }

  doc.y = y + chipH + 8;
}

// ─── Table Header ─────────────────────────────────────────────────────────────

export function renderTableHeader(
  doc:   PDFKit.PDFDocument,
  cols:  ColDef[],
  theme: PdfTheme
): void {
  const ml    = doc.page.margins.left;
  const rowH  = 16;
  const y     = doc.y;
  const totalW = cols.reduce((s, c) => s + c.width, 0);

  doc.rect(ml, y, totalW, rowH).fill(theme.primary);
  doc.rect(ml, y, 3, rowH).fill(theme.accent);

  doc.fontSize(PDF_FONT.sm).font('Helvetica-Bold').fillColor(theme.primaryText);

  let x = ml;
  for (const col of cols) {
    const padLeft = x === ml ? PDF_SPACING.rowPadH + 3 : PDF_SPACING.rowPadH;
    const w       = col.width - padLeft - PDF_SPACING.rowPadH;
    doc.text(col.label, x + padLeft, y + (rowH - PDF_FONT.sm) / 2, {
      width:     w,
      align:     col.align ?? 'left',
      lineBreak: false,
    });
    x += col.width;
  }

  doc.y = y + rowH;
  doc.moveTo(ml, doc.y).lineTo(ml + totalW, doc.y)
     .strokeColor(theme.primary).lineWidth(0.5).stroke().lineWidth(1);
}

// ─── Table Row ────────────────────────────────────────────────────────────────

export function rowRealHeight(doc: PDFKit.PDFDocument, cells: CellDef[], minH: number = PDF_SPACING.rowMinH): number {
  doc.fontSize(PDF_FONT.base).font('Helvetica');
  let h = minH;
  for (const cell of cells) {
    const txt = typeof cell.value === 'number' ? fmt2(cell.value) : String(cell.value ?? '');
    if (!txt) continue;
    const needed = doc.heightOfString(txt, { width: cell.width - PDF_SPACING.rowPadH * 2 }) + PDF_SPACING.rowPadV * 2;
    if (needed > h) h = needed;
  }
  return h;
}

export function renderTableRow(
  doc:      PDFKit.PDFDocument,
  cells:    CellDef[],
  rowIndex: number,
  _theme:   PdfTheme
): number {
  const ml     = doc.page.margins.left;
  const rowH   = rowRealHeight(doc, cells);
  const y      = doc.y;
  const totalW = cells.reduce((s, c) => s + c.width, 0);

  if (rowIndex % 2 === 0) {
    doc.rect(ml, y, totalW, rowH).fill(PDF_COLORS.bgRowAlt);
  }

  doc.moveTo(ml, y + rowH).lineTo(ml + totalW, y + rowH)
     .strokeColor(PDF_COLORS.borderLight).lineWidth(0.3).stroke().lineWidth(1);

  let x = ml;
  for (const cell of cells) {
    const txt = typeof cell.value === 'number' ? fmt2(cell.value) : String(cell.value ?? '');
    doc.fontSize(PDF_FONT.base)
       .fillColor(cell.color ?? PDF_COLORS.textDark)
       .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(txt, x + PDF_SPACING.rowPadH, y + PDF_SPACING.rowPadV, {
         width:     cell.width - PDF_SPACING.rowPadH * 2,
         align:     cell.align ?? 'left',
         lineBreak: true,
       });
    x += cell.width;
  }

  doc.y = y + rowH;
  return rowH;
}

// ─── Total Row ────────────────────────────────────────────────────────────────

export function renderTotalRow(
  doc:     PDFKit.PDFDocument,
  label:   string,
  cells:   CellDef[],
  theme:   PdfTheme,
  options: { color?: string; bgColor?: string } = {}
): void {
  const ml     = doc.page.margins.left;
  const rowH   = 16;
  const y      = doc.y;
  const totalW = cells.reduce((s, c) => s + c.width, 0);
  const bg     = options.bgColor ?? PDF_COLORS.bgTotal;
  const fg     = options.color   ?? theme.primary;

  doc.moveTo(ml, y).lineTo(ml + totalW, y)
     .strokeColor(PDF_COLORS.borderMed).lineWidth(0.8).stroke().lineWidth(1);
  doc.rect(ml, y, totalW, rowH).fill(bg);

  // Label across all but last column
  const lastW  = cells[cells.length - 1]?.width ?? 80;
  const labelW = totalW - lastW;

  doc.fontSize(PDF_FONT.base)
     .fillColor(fg)
     .font('Helvetica-Bold')
     .text(label, ml + PDF_SPACING.rowPadH, y + 4, {
       width:     labelW - PDF_SPACING.rowPadH * 2,
       align:     'right',
       lineBreak: false,
     });

  const lastCell = cells[cells.length - 1];
  if (lastCell) {
    const txt = typeof lastCell.value === 'number' ? fmt2(lastCell.value) : String(lastCell.value ?? '');
    doc.fontSize(PDF_FONT.base)
       .fillColor(lastCell.color ?? fg)
       .font('Helvetica-Bold')
       .text(txt, ml + labelW + PDF_SPACING.rowPadH, y + 4, {
         width:     lastW - PDF_SPACING.rowPadH * 2,
         align:     lastCell.align ?? 'right',
         lineBreak: false,
       });
  }

  doc.y = y + rowH;
}

// ─── Section Banner ────────────────────────────────────────────────────────────

export function renderSectionBanner(
  doc:     PDFKit.PDFDocument,
  title:   string,
  options: { bgColor?: string; textColor?: string; height?: number } = {}
): void {
  const ml    = doc.page.margins.left;
  const pageW = doc.page.width;
  const bodyW = pageW - ml * 2;
  const h     = options.height ?? 15;
  const y     = doc.y;

  doc.rect(ml, y, bodyW, h).fill(options.bgColor ?? '#1a56db');
  doc.fontSize(PDF_FONT.base)
     .fillColor(options.textColor ?? '#ffffff')
     .font('Helvetica-Bold')
     .text(title, ml + 6, y + (h - PDF_FONT.base) / 2, { width: bodyW - 12, lineBreak: false });

  doc.y = y + h + 1;
}

// ─── Page Break Helper ────────────────────────────────────────────────────────

export function checkPageBreak(doc: PDFKit.PDFDocument, neededH: number): boolean {
  const available = doc.page.height - doc.page.margins.bottom - doc.y;
  if (available < neededH) {
    doc.addPage();
    return true;
  }
  return false;
}

// ─── Corporate Footer (all pages) ─────────────────────────────────────────────

export function renderCorporateFooter(
  doc:   PDFKit.PDFDocument,
  meta:  ReportMeta,
  theme: PdfTheme
): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const ml    = doc.page.margins.left;

  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);

    const pageW   = doc.page.width;
    const bodyW   = pageW - ml * 2;
    const footerY = doc.page.height - PDF_SPACING.footerH;

    doc.moveTo(ml, footerY - 4)
       .lineTo(ml + bodyW, footerY - 4)
       .strokeColor(PDF_COLORS.borderLight).lineWidth(0.5).stroke().lineWidth(1);

    const saas      = meta.saasName || 'SaaS';
    const dateStr   = fmtDateTime(meta.generatedAt);
    const pageLabel = `Página ${i - range.start + 1} de ${total}`;

    doc.fontSize(PDF_FONT.sm)
       .fillColor(theme.primary)
       .font('Helvetica-Bold')
       .text(saas, ml, footerY, { width: bodyW / 3, lineBreak: false });

    doc.fontSize(PDF_FONT.sm)
       .fillColor(PDF_COLORS.textMuted)
       .font('Helvetica')
       .text(dateStr, ml + bodyW / 3, footerY, { width: bodyW / 3, align: 'center', lineBreak: false });

    doc.fontSize(PDF_FONT.sm)
       .fillColor(PDF_COLORS.textLight)
       .font('Helvetica')
       .text(pageLabel, ml + (bodyW * 2) / 3, footerY, { width: bodyW / 3, align: 'right', lineBreak: false });
  }
}
