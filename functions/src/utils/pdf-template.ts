/**
 * pdf-template.ts — Plantilla corporativa reutilizable para todos los PDF del SaaS.
 *
 * USO BÁSICO
 * ──────────
 *   const doc = createCorporatePdfDoc('landscape');
 *   const ctx = makeCtx(doc, brandColor);
 *   const cols = [ { label: 'Código', width: 80 }, ... ];
 *
 *   drawCorporateHeader(doc, ctx, { logoBuffer, companyName, companyRuc, reportTitle, ... });
 *   drawFiltersBar(doc, ctx, [{ label: 'Estado', value: 'Activos' }, ...]);
 *   drawTableHeader(doc, ctx, cols);
 *
 *   for (const [i, row] of data.entries()) {
 *     if (willOverflow(doc, ctx, measureRowHeight(doc, rowCells))) {
 *       addPageWithTableHeader(doc, ctx, cols, headerOpts);
 *     }
 *     drawTableRow(doc, ctx, rowCells, i);
 *   }
 *
 *   drawSummaryRow(doc, ctx, 'Total', [{ value: n, width: 80, align: 'right' }]);
 *   drawAllPageFooters(doc, ctx, { saasName: 'FacturaSec', ... });
 *   doc.end();
 *
 * GUÍA DE NUEVOS REPORTES
 * ───────────────────────
 *   1. Calcula contentW (ctx.contentW) y distribuye anchos de columnas.
 *   2. Llama drawCorporateHeader → drawFiltersBar → drawTableHeader.
 *   3. Por cada fila: verificar willOverflow → si true addPageWithTableHeader → drawTableRow.
 *   4. Totales opcionales con drawSummaryRow o drawTotalBand.
 *   5. Al final: drawAllPageFooters antes de doc.end().
 */

import PDFDocument from 'pdfkit';

// ─── Palette ───────────────────────────────────────────────────────────────────

export interface CorpColors {
  headerBg:     string;   // fondo del encabezado principal (normalmente brandColor)
  headerText:   string;   // texto sobre headerBg
  primary:      string;   // color primario (títulos, líneas de acento)
  textDark:     string;   // texto principal
  textMid:      string;   // texto secundario
  textLight:    string;   // texto terciario / etiquetas
  bgLight:      string;   // fondo alterno de filas
  bgMid:        string;   // fondo del sub-header y filtros
  tableHeader:  string;   // fondo del encabezado de tabla
  border:       string;   // bordes / separadores
  success:      string;   // estado activo / positivo
  danger:       string;   // estado inactivo / negativo / alerta
  total:        string;   // fondo de fila total
}

export function makeColors(brandColor?: string): CorpColors {
  // Brand fallback: azul corporativo estándar
  const primary = brandColor ?? '#2563eb';

  // Derive un dark-shade del brandColor o usar fijo
  const headerBg = brandColor ?? '#1e3a8a';

  return {
    headerBg,
    headerText:  '#ffffff',
    primary,
    textDark:    '#1e293b',
    textMid:     '#475569',
    textLight:   '#94a3b8',
    bgLight:     '#f8fafc',
    bgMid:       '#f1f5f9',
    tableHeader: '#e8edf5',
    border:      '#e2e8f0',
    success:     '#15803d',
    danger:      '#b91c1c',
    total:       '#eef2ff',
  };
}

// ─── Context ───────────────────────────────────────────────────────────────────

export interface PdfCtx {
  pageW:    number;
  pageH:    number;
  ml:       number;
  mr:       number;
  contentW: number;
  colors:   CorpColors;
}

/** Crea el contexto a partir de un PDFDocument ya inicializado. */
export function makeCtx(doc: PDFKit.PDFDocument, brandColor?: string): PdfCtx {
  const ml = doc.page.margins.left;
  const mr = doc.page.margins.right;
  return {
    pageW:    doc.page.width,
    pageH:    doc.page.height,
    ml,
    mr,
    contentW: doc.page.width - ml - mr,
    colors:   makeColors(brandColor),
  };
}

// ─── Document factory ──────────────────────────────────────────────────────────

/**
 * Crea el PDFDocument corporativo en A4.
 * Márgenes laterales 40px; top/bottom 0 (el header/footer los controla directamente).
 * bufferPages = true es OBLIGATORIO para la numeración de páginas al final.
 */
export function createCorporatePdfDoc(layout: 'portrait' | 'landscape' = 'portrait'): PDFKit.PDFDocument {
  return new PDFDocument({
    size:     'A4',
    layout,
    margins:  { top: 0, bottom: 0, left: 40, right: 40 },
    bufferPages: true,
    info: { Creator: 'FacturaSec' },
  });
}

// ─── Header dimensions ─────────────────────────────────────────────────────────

const DARK_H    = 68;   // altura de la banda oscura principal
const SUB_H     = 34;   // altura del sub-encabezado gris claro
const FILTER_H  = 26;   // altura de la barra de filtros (si se dibuja)
const REPEAT_H  = 26;   // altura del mini-header en páginas 2+
const FOOTER_H  = 36;   // altura reservada para el footer al final de cada página
const GAP       = 8;    // espacio entre secciones

// ─── Corporate header (página 1) ──────────────────────────────────────────────

export interface CorporateHeaderOpts {
  logoBuffer?:     Buffer | null;
  companyName:     string;
  companyRuc:      string;
  companyAddress?: string;
  reportTitle:     string;       // p.e. "CENTROS DE COSTO"
  reportSubtitle?: string;       // p.e. "Listado de centros de costo registrados"
  generatedAt:     string;       // fecha/hora formateada
  userName?:       string;
}

/**
 * Dibuja el encabezado corporativo completo en la página actual.
 * Devuelve el valor de doc.y donde empieza el contenido (después del header).
 */
export function drawCorporateHeader(
  doc:  PDFKit.PDFDocument,
  ctx:  PdfCtx,
  opts: CorporateHeaderOpts
): number {
  const { ml, mr, pageW, contentW, colors } = ctx;

  // ── Banda oscura ────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, DARK_H).fill(colors.headerBg);

  // Logo
  let logoEndX = ml;
  if (opts.logoBuffer) {
    try {
      doc.image(opts.logoBuffer, ml, 9, { fit: [50, 50] });
      logoEndX = ml + 58;
    } catch { /* imagen inválida */ }
  }

  // Datos de empresa (a la derecha del logo)
  const companyTextW = contentW - (logoEndX - ml) - 120;
  doc.fontSize(10.5).fillColor(colors.headerText).font('Helvetica-Bold')
     .text(opts.companyName, logoEndX, 12, { width: companyTextW, lineBreak: false });
  doc.fontSize(7.5).fillColor('rgba(255,255,255,0.72)').font('Helvetica')
     .text(`RUC: ${opts.companyRuc}`, logoEndX, 26, { width: companyTextW });
  if (opts.companyAddress) {
    doc.fontSize(7).fillColor('rgba(255,255,255,0.55)')
       .text(opts.companyAddress, logoEndX, 38, { width: companyTextW });
  }

  // Badge de tipo de reporte (derecha)
  const BADGE_W = 110;
  const badgeX  = pageW - mr - BADGE_W;
  doc.rect(badgeX, 8, BADGE_W, 52)
     .fillAndStroke('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.18)');
  doc.roundedRect(badgeX, 8, BADGE_W, 52, 4)
     .fillAndStroke('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.18)');
  doc.fontSize(6.5).fillColor('rgba(255,255,255,0.55)').font('Helvetica')
     .text('REPORTE', badgeX, 18, { width: BADGE_W, align: 'center' });
  doc.fontSize(8.5).fillColor(colors.headerText).font('Helvetica-Bold')
     .text(opts.reportTitle, badgeX, 31, { width: BADGE_W, align: 'center' });

  // Línea de acento al borde inferior de la banda oscura
  doc.moveTo(0, DARK_H).lineTo(pageW, DARK_H)
     .strokeColor(colors.primary).lineWidth(2).stroke().lineWidth(1);

  // ── Sub-encabezado gris ─────────────────────────────────────────────────
  const subY = DARK_H;
  doc.rect(0, subY, pageW, SUB_H).fill(colors.bgMid);

  // Título izquierda
  doc.fontSize(12).fillColor(colors.textDark).font('Helvetica-Bold')
     .text(opts.reportTitle, ml, subY + 7, { width: contentW * 0.58, lineBreak: false });
  if (opts.reportSubtitle) {
    doc.fontSize(7).fillColor(colors.textMid).font('Helvetica')
       .text(opts.reportSubtitle, ml, subY + 22, { width: contentW * 0.58 });
  }

  // Meta derecha
  const metaX = ml + contentW * 0.6;
  const metaW = contentW * 0.4;
  doc.fontSize(7).fillColor(colors.textMid).font('Helvetica')
     .text(`Generado: ${opts.generatedAt}`, metaX, subY + 7, { width: metaW, align: 'right' });
  if (opts.userName) {
    doc.fontSize(7).fillColor(colors.textLight)
       .text(`Por: ${opts.userName}`, metaX, subY + 18, { width: metaW, align: 'right' });
  }

  // Borde inferior del sub-header
  doc.moveTo(0, subY + SUB_H).lineTo(pageW, subY + SUB_H)
     .strokeColor(colors.border).lineWidth(0.5).stroke().lineWidth(1);

  const contentStartY = DARK_H + SUB_H + GAP;
  doc.y = contentStartY;
  return contentStartY;
}

// ─── Mini-header para páginas 2+ ──────────────────────────────────────────────

export interface RepeatHeaderOpts {
  companyName:  string;
  reportTitle:  string;
  generatedAt:  string;
}

/**
 * Dibuja un encabezado compacto en páginas 2+.
 * Devuelve la Y donde empieza el contenido.
 */
export function drawRepeatHeader(
  doc:  PDFKit.PDFDocument,
  ctx:  PdfCtx,
  opts: RepeatHeaderOpts
): number {
  const { ml, mr: _mr, pageW, contentW, colors } = ctx;

  doc.rect(0, 0, pageW, REPEAT_H).fill(colors.bgMid);
  doc.fontSize(7).fillColor(colors.textMid).font('Helvetica-Bold')
     .text(opts.companyName, ml, 9, { width: contentW * 0.5, lineBreak: false });
  doc.fontSize(7).fillColor(colors.textLight).font('Helvetica')
     .text(opts.reportTitle, ml + contentW * 0.5, 9, { width: contentW * 0.5, align: 'right' });

  doc.moveTo(0, REPEAT_H).lineTo(pageW, REPEAT_H)
     .strokeColor(colors.primary).lineWidth(1.5).stroke().lineWidth(1);

  const y = REPEAT_H + 4;
  doc.y = y;
  return y;
}

// ─── Filters bar ──────────────────────────────────────────────────────────────

export interface FilterParam { label: string; value: string }

/**
 * Dibuja la barra de filtros/parámetros del reporte.
 * Devuelve la Y donde termina la barra.
 */
export function drawFiltersBar(
  doc:     PDFKit.PDFDocument,
  ctx:     PdfCtx,
  filters: FilterParam[]
): void {
  if (!filters.length) return;
  const { ml, contentW, colors } = ctx;
  const y = doc.y;

  doc.rect(ml, y, contentW, FILTER_H)
     .fillAndStroke(colors.bgLight, colors.border);

  const slotW = Math.floor(contentW / filters.length);
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    const x = ml + i * slotW + 10;

    doc.fontSize(6).fillColor(colors.textLight).font('Helvetica')
       .text(f.label.toUpperCase(), x, y + 4, { width: slotW - 15, lineBreak: false });
    doc.fontSize(8).fillColor(colors.textDark).font('Helvetica-Bold')
       .text(f.value, x, y + 13, { width: slotW - 15, lineBreak: false });

    if (i < filters.length - 1) {
      doc.moveTo(ml + (i + 1) * slotW, y + 5)
         .lineTo(ml + (i + 1) * slotW, y + FILTER_H - 5)
         .strokeColor(colors.border).lineWidth(0.5).stroke().lineWidth(1);
    }
  }

  doc.y = y + FILTER_H + GAP;
}

// ─── Table header ──────────────────────────────────────────────────────────────

export interface ColDef {
  label:  string;
  width:  number;
  align?: 'left' | 'center' | 'right';
}

const TABLE_HEADER_H = 17;

/**
 * Dibuja el encabezado de la tabla (repetible en cada página).
 */
export function drawTableHeader(doc: PDFKit.PDFDocument, ctx: PdfCtx, cols: ColDef[]): void {
  const { ml, contentW, colors } = ctx;
  const y = doc.y;

  doc.rect(ml, y, contentW, TABLE_HEADER_H).fill(colors.tableHeader);

  // Línea superior de acento
  doc.moveTo(ml, y).lineTo(ml + contentW, y)
     .strokeColor(colors.primary).lineWidth(1).stroke().lineWidth(1);

  let x = ml;
  for (const col of cols) {
    doc.fontSize(6.5).fillColor(colors.textMid).font('Helvetica-Bold')
       .text(col.label.toUpperCase(), x + 4, y + 5, {
         width: col.width - 8,
         align:  col.align ?? 'left',
         lineBreak: false,
       });
    x += col.width;
  }

  doc.moveTo(ml, y + TABLE_HEADER_H).lineTo(ml + contentW, y + TABLE_HEADER_H)
     .strokeColor(colors.primary).lineWidth(0.5).stroke().lineWidth(1);

  doc.y = y + TABLE_HEADER_H;
}

// ─── Cell definition ───────────────────────────────────────────────────────────

export interface CellDef {
  value:     string | number;
  width:     number;
  align?:    'left' | 'center' | 'right';
  bold?:     boolean;
  color?:    string;         // sobrescribe el color de texto por defecto
  fontSize?: number;         // sobrescribe el tamaño de fuente (default 7.5)
  indent?:   number;         // padding izquierdo extra (para jerarquías)
  noWrap?:   boolean;        // trunca el texto en 1 línea
}

// ─── Row height ────────────────────────────────────────────────────────────────

const NUM_FMT = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cellText(cell: CellDef): string {
  return typeof cell.value === 'number' ? NUM_FMT.format(cell.value) : String(cell.value ?? '');
}

const ROW_MIN_H  = 15;
const ROW_PAD_V  = 5;   // padding vertical por celda

/**
 * Calcula la altura real que necesita una fila (respeta wrap de texto).
 */
export function measureRowHeight(doc: PDFKit.PDFDocument, cells: CellDef[], minH = ROW_MIN_H): number {
  doc.fontSize(7.5);
  let h = minH;
  for (const cell of cells) {
    const txt = cellText(cell);
    if (!txt) continue;
    const innerW = cell.width - 8 - (cell.indent ?? 0);
    if (innerW <= 0) continue;
    const opts = cell.noWrap ? { lineBreak: false } : { width: innerW };
    const needed = doc.heightOfString(txt, opts) + ROW_PAD_V;
    if (needed > h) h = needed;
  }
  return h;
}

// ─── Table row ─────────────────────────────────────────────────────────────────

/**
 * Dibuja una fila de datos.
 * `rowIndex` se usa para el sombreado alterno (par = blanco, impar = bgLight).
 * Devuelve la altura real consumida.
 */
export function drawTableRow(
  doc:      PDFKit.PDFDocument,
  ctx:      PdfCtx,
  cells:    CellDef[],
  rowIndex: number
): number {
  const { ml, contentW, colors } = ctx;
  const h = measureRowHeight(doc, cells);
  const y = doc.y;

  if (rowIndex % 2 === 1) {
    doc.rect(ml, y, contentW, h).fill(colors.bgLight);
  }

  let x = ml;
  for (const cell of cells) {
    const txt = cellText(cell);
    const fs  = cell.fontSize ?? 7.5;
    const px  = x + 4 + (cell.indent ?? 0);
    const w   = cell.width - 8 - (cell.indent ?? 0);

    doc.fontSize(fs)
       .fillColor(cell.color ?? colors.textDark)
       .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica');

    if (w > 0) {
      const textOpts: PDFKit.Mixins.TextOptions = {
        align: cell.align ?? 'left',
        ...(cell.noWrap ? { lineBreak: false } : { width: w }),
      };
      doc.text(txt, px, y + 3, textOpts);
    }
    x += cell.width;
  }

  doc.moveTo(ml, y + h).lineTo(ml + contentW, y + h)
     .strokeColor(colors.border).lineWidth(0.3).stroke().lineWidth(1);

  doc.y = y + h;
  return h;
}

// ─── Summary / total rows ──────────────────────────────────────────────────────

export interface SummaryCellDef {
  value: string | number;
  width: number;
  align?: 'left' | 'center' | 'right';
}

/**
 * Dibuja una fila de subtotal/total al final de una sección.
 * `labelCols` es el ancho combinado de las columnas de etiqueta (izquierda).
 */
export function drawSummaryRow(
  doc:       PDFKit.PDFDocument,
  ctx:       PdfCtx,
  label:     string,
  labelCols: number,         // ancho total de columnas de etiqueta (px)
  valueCols: SummaryCellDef[],
  opts: { color?: string; bg?: string } = {}
): void {
  const { ml, contentW, colors } = ctx;
  const ROW_H = 16;
  const y     = doc.y;

  doc.moveTo(ml, y).lineTo(ml + contentW, y)
     .strokeColor(colors.primary).lineWidth(0.8).stroke().lineWidth(1);
  doc.rect(ml, y, contentW, ROW_H).fill(opts.bg ?? colors.total);

  const textColor = opts.color ?? colors.primary;

  doc.fontSize(7.5).fillColor(textColor).font('Helvetica-Bold')
     .text(label, ml + 4, y + 4, { width: labelCols - 8, align: 'right' });

  let x = ml + labelCols;
  for (const cell of valueCols) {
    const txt = typeof cell.value === 'number' ? NUM_FMT.format(cell.value) : String(cell.value);
    doc.text(txt, x + 4, y + 4, { width: cell.width - 8, align: cell.align ?? 'right' });
    x += cell.width;
  }

  doc.y = y + ROW_H + 2;
}

/** Fila de total grande con fondo de color (para totales finales). */
export function drawTotalBand(
  doc:   PDFKit.PDFDocument,
  ctx:   PdfCtx,
  label: string,
  value: number | string,
  opts:  { bg?: string; fg?: string; valueWidth?: number } = {}
): void {
  const { ml, contentW, colors } = ctx;
  const BAND_H = 18;
  const y      = doc.y;
  const bg     = opts.bg ?? colors.total;
  const fg     = opts.fg ?? colors.primary;
  const vW     = opts.valueWidth ?? 100;
  const lW     = contentW - vW;

  doc.moveTo(ml, y).lineTo(ml + contentW, y)
     .strokeColor(fg).lineWidth(1).stroke().lineWidth(1);
  doc.rect(ml, y, contentW, BAND_H).fill(bg);

  const txt = typeof value === 'number' ? NUM_FMT.format(value) : String(value);
  doc.fontSize(8).fillColor(fg).font('Helvetica-Bold')
     .text(label, ml + 4, y + 4, { width: lW - 4 });
  doc.text(txt, ml + lW, y + 4, { width: vW - 4, align: 'right' });

  doc.y = y + BAND_H + 4;
}

// ─── Section header ────────────────────────────────────────────────────────────

/** Encabezado de sección coloreado (para reportes con múltiples secciones). */
export function drawSectionHeader(
  doc:   PDFKit.PDFDocument,
  ctx:   PdfCtx,
  label: string,
  opts:  { bg?: string; fg?: string } = {}
): void {
  const { ml, contentW, colors } = ctx;
  const H  = 15;
  const y  = doc.y;
  const bg = opts.bg ?? colors.primary;
  const fg = opts.fg ?? '#ffffff';

  doc.rect(ml, y, contentW, H).fill(bg);
  doc.fontSize(8).fillColor(fg).font('Helvetica-Bold')
     .text(label, ml + 6, y + 3, { width: contentW - 12 });
  doc.y = y + H + 2;
}

// ─── Overflow check ────────────────────────────────────────────────────────────

/**
 * Devuelve true si la siguiente fila (neededH) no cabe en la página actual.
 * `safeBottom` es el margen inferior reservado (por defecto: footer + buffer).
 */
export function willOverflow(
  doc:        PDFKit.PDFDocument,
  ctx:        PdfCtx,
  neededH:    number,
  safeBottom: number = FOOTER_H + 10
): boolean {
  return doc.y + neededH > ctx.pageH - safeBottom;
}

// ─── Add page with repeat header + table header ────────────────────────────────

export interface PageAddOpts {
  companyName: string;
  reportTitle: string;
  generatedAt: string;
}

/**
 * Agrega una nueva página con el mini-header corporativo y
 * repite el encabezado de la tabla.
 */
export function addPageWithTableHeader(
  doc:      PDFKit.PDFDocument,
  ctx:      PdfCtx,
  cols:     ColDef[],
  pageOpts: PageAddOpts
): void {
  doc.addPage();
  drawRepeatHeader(doc, ctx, pageOpts);
  drawTableHeader(doc, ctx, cols);
}

// ─── Corporate footer (todas las páginas) ─────────────────────────────────────

export interface FooterOpts {
  saasName?:   string;
  userName?:   string;
  pdfFooter?:  string;
  generatedAt: string;
}

/**
 * Dibuja el footer corporativo en TODAS las páginas del documento.
 * Debe llamarse ANTES de doc.end(), usando bufferedPageRange().
 * El documento debe haberse creado con bufferPages: true.
 */
export function drawAllPageFooters(
  doc:  PDFKit.PDFDocument,
  ctx:  PdfCtx,
  opts: FooterOpts
): void {
  const range = doc.bufferedPageRange();
  const total = range.count;

  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);

    const { ml, mr, pageW, pageH, contentW, colors } = ctx;
    const footerY = pageH - 28;

    // Línea separadora
    doc.moveTo(ml, footerY - 4).lineTo(pageW - mr, footerY - 4)
       .strokeColor(colors.border).lineWidth(0.5).stroke().lineWidth(1);

    // Izquierda: nombre del SaaS
    doc.fontSize(6.5).fillColor(colors.textLight).font('Helvetica')
       .text(opts.saasName ?? 'FacturaSec', ml, footerY, { width: contentW / 3, align: 'left', lineBreak: false });

    // Centro: fecha + usuario
    const center = [
      opts.generatedAt,
      opts.userName ? `Por: ${opts.userName}` : null,
    ].filter(Boolean).join('  ·  ');
    doc.text(center, ml + contentW / 3, footerY, { width: contentW / 3, align: 'center', lineBreak: false });

    // Derecha: número de página
    doc.fontSize(6.5).fillColor(colors.textMid).font('Helvetica-Bold')
       .text(
         `Página ${i - range.start + 1} de ${total}`,
         ml + (contentW * 2) / 3, footerY,
         { width: contentW / 3, align: 'right', lineBreak: false }
       );

    // Mensaje personalizado opcional
    if (opts.pdfFooter) {
      doc.fontSize(6).fillColor(colors.textLight).font('Helvetica')
         .text(opts.pdfFooter, ml, footerY + 10, { width: contentW, align: 'center', lineBreak: false });
    }
  }
}

// ─── Utility: date formatter ───────────────────────────────────────────────────

/** Formatea la fecha actual en zona horaria Ecuador (America/Guayaquil). */
export function formatNowEC(): string {
  return new Date().toLocaleString('es-EC', {
    timeZone:    'America/Guayaquil',
    day:         '2-digit',
    month:       '2-digit',
    year:        'numeric',
    hour:        '2-digit',
    minute:      '2-digit',
  });
}

/** Formatea un número como moneda USD/Ecuador. */
export function fmtCurrency(n: number | string | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  return isNaN(num) ? '0.00' : NUM_FMT.format(num);
}
