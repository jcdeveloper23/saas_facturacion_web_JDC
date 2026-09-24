import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  sku?: string;
  productSku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountPct?: number;
  taxRate?: number;
  vatPct?: number;
  sriTaxCode?: string;
  lineTotal?: number;
  subtotal?: number;
  taxAmount?: number;
  vatAmount?: number;
}

interface PaymentMethod {
  code: string;
  name?: string;
  amount?: number;
  deadline?: number | null;
  timeUnit?: string;
}

interface VatSummaryEntry {
  vatPct: number;
  taxableBase: number;
  vatAmount: number;
}

interface Invoice {
  number: number | string;
  fullNumber?: string;
  date: admin.firestore.Timestamp;
  dueDate?: admin.firestore.Timestamp;
  status: string;
  sriStatus?: string;
  accessKey?: string;
  authorizationNumber?: string;
  authorizedAt?: admin.firestore.Timestamp;
  customerName: string;
  customerTaxId: string;
  customerTaxIdType?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerPhone?: string;
  currency?: string;
  paymentTermCode?: string;
  agentCode?: string;
  subtotal?: number;
  discount?: number;
  grossAmount?: number;
  discountAmount?: number;
  netAmount?: number;
  vatAmount?: number;
  total: number;
  lines: InvoiceLine[];
  paymentMethod?: string;
  paymentMethods?: PaymentMethod[];
  paymentDays?: number;
  notes?: string;
  vatSummary?: VatSummaryEntry[];
}

interface SriCompanyConfig {
  razonSocial: string;
  nombreComercial?: string;
  direccionMatriz: string;
  direccionEstablecimiento: string;
  telefono?: string;
  correo?: string;
  obligadoContabilidad: 'SI' | 'NO';
  agenteRetencionResolucion?: string;
  additionalInfoFields?: Array<{ nombre: string; valor: string }>;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt2(n: number): string {
  return n.toFixed(2);
}

function formatDate(ts: admin.firestore.Timestamp): string {
  const d = ts.toDate();
  return d.toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
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

function paymentConditionLabel(code?: string, days?: number): string {
  if (!code) return days ? `Crédito ${days} días` : 'Contado';
  const lower = code.toLowerCase();
  if (lower.includes('contado') || lower === '0' || lower === 'cash') return 'Contado';
  if (days) return `Crédito ${days} días`;
  return 'Crédito';
}

// ─── Número a letras ──────────────────────────────────────────────────────────

function numeroALetras(n: number): string {
  const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
    'DIECIOCHO', 'DIECINUEVE'];
  const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
    'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function menorMil(num: number): string {
    if (num === 0) return '';
    if (num === 100) return 'CIEN';
    const c = Math.floor(num / 100);
    const resto = num % 100;
    const centStr = c > 0 ? CENTENAS[c] : '';
    let restoStr = '';
    if (resto > 0) {
      if (resto < 20) {
        restoStr = UNIDADES[resto];
      } else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        restoStr = DECENAS[d] + (u > 0 ? ' Y ' + UNIDADES[u] : '');
      }
    }
    if (centStr && restoStr) return centStr + ' ' + restoStr;
    return centStr || restoStr;
  }

  if (n < 0) return 'MENOS ' + numeroALetras(-n);

  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);

  if (entero === 0) return `CERO CON ${centavos.toString().padStart(2, '0')}/100`;

  let resultado = '';

  const millones = Math.floor(entero / 1_000_000);
  const miles    = Math.floor((entero % 1_000_000) / 1_000);
  const resto    = entero % 1_000;

  if (millones > 0) {
    resultado += (millones === 1 ? 'UN MILLÓN' : menorMil(millones) + ' MILLONES') + ' ';
  }
  if (miles > 0) {
    resultado += (miles === 1 ? 'MIL' : menorMil(miles) + ' MIL') + ' ';
  }
  if (resto > 0) {
    resultado += menorMil(resto);
  }

  return resultado.trim() + ` CON ${centavos.toString().padStart(2, '0')}/100`;
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

interface BuildPdfOptions {
  invoice: Invoice;
  companyId: string;
  companyRuc: string;
  sriEnvironment: 'testing' | 'production';
  sriConfig: SriCompanyConfig;
  barcodeBuffer: Buffer | null;
  logoBuffer: Buffer | null;
}

async function buildPdfBuffer(opts: BuildPdfOptions): Promise<Buffer> {
  const { invoice, companyRuc, sriEnvironment, sriConfig, barcodeBuffer, logoBuffer } = opts;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: 'A4',
      margin: 35,
      info: {
        Title: `Factura ${invoice.fullNumber ?? invoice.number}`,
        Author: sriConfig.razonSocial,
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Constants ────────────────────────────────────────────────────────────
    const MARGIN   = 35;
    const PAGE_W   = doc.page.width - MARGIN * 2;   // 525 pts usable
    const DARK     = '#111111';
    const GRAY     = '#555555';
    const BORDER   = '#AAAAAA';
    const HDR_FILL = '#EEEEEE';

    // Column split for header: left 37%, right 63%
    const LEFT_W   = Math.floor(PAGE_W * 0.37);  // ~194
    const RIGHT_W  = PAGE_W - LEFT_W - 1;         // ~330
    const DIVIDER_X = MARGIN + LEFT_W;
    const RIGHT_X   = DIVIDER_X + 1;

    // ── Helper: draw outer rect border ───────────────────────────────────────
    function drawBorder(x: number, y: number, w: number, h: number) {
      doc.rect(x, y, w, h).strokeColor(BORDER).lineWidth(0.5).stroke();
    }

    // ── Helper: horizontal rule inside a section ──────────────────────────────
    function hLine(y: number, x1 = MARGIN, x2 = MARGIN + PAGE_W) {
      doc.moveTo(x1, y).lineTo(x2, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    }

    // ── Helper: vertical line ─────────────────────────────────────────────────
    function vLine(x: number, y1: number, y2: number) {
      doc.moveTo(x, y1).lineTo(x, y2).strokeColor(BORDER).lineWidth(0.5).stroke();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: HEADER
    // ─────────────────────────────────────────────────────────────────────────
    const HDR_TOP = MARGIN;
    const HDR_PAD = 5;
    let leftY  = HDR_TOP + HDR_PAD;
    let rightY = HDR_TOP + HDR_PAD;

    // --- LEFT column: Logo + company data ---
    const LEFT_X = MARGIN + HDR_PAD;
    const LEFT_TEXT_W = LEFT_W - HDR_PAD * 2;

    // Logo — centrado horizontalmente en la columna izquierda
    if (logoBuffer) {
      try {
        const logoMaxW = LEFT_TEXT_W;
        const logoMaxH = 75;
        doc.image(logoBuffer, LEFT_X, leftY, { fit: [logoMaxW, logoMaxH], align: 'center' });
        leftY += logoMaxH + 6;
      } catch {
        // logo render failed, skip
      }
    }

    doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK)
      .text(sriConfig.razonSocial.toUpperCase(), LEFT_X, leftY, { width: LEFT_TEXT_W });
    leftY = doc.y + 2;

    if (sriConfig.nombreComercial) {
      doc.font('Helvetica').fontSize(7).fillColor(GRAY)
        .text(sriConfig.nombreComercial, LEFT_X, leftY, { width: LEFT_TEXT_W });
      leftY = doc.y + 1;
    }

    doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
      .text(`Matriz: ${sriConfig.direccionMatriz}`, LEFT_X, leftY, { width: LEFT_TEXT_W });
    leftY = doc.y + 1;

    if (sriConfig.direccionEstablecimiento && sriConfig.direccionEstablecimiento !== sriConfig.direccionMatriz) {
      doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
        .text(`Establecimiento: ${sriConfig.direccionEstablecimiento}`, LEFT_X, leftY, { width: LEFT_TEXT_W });
      leftY = doc.y + 1;
    }

    if (sriConfig.telefono) {
      doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
        .text(`Teléfono: ${sriConfig.telefono}`, LEFT_X, leftY, { width: LEFT_TEXT_W });
      leftY = doc.y + 1;
    }

    if (sriConfig.correo) {
      doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
        .text(`Correos: ${sriConfig.correo}`, LEFT_X, leftY, { width: LEFT_TEXT_W });
      leftY = doc.y + 1;
    }

    doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
      .text(`Obligado Contabilidad: ${sriConfig.obligadoContabilidad}`, LEFT_X, leftY, { width: LEFT_TEXT_W });
    leftY = doc.y + 1;

    if (sriConfig.agenteRetencionResolucion) {
      doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
        .text(`Agente Retención: ${sriConfig.agenteRetencionResolucion}`, LEFT_X, leftY, { width: LEFT_TEXT_W });
      leftY = doc.y + 1;
    }

    // --- RIGHT column: RUC, FACTURA, clave, QR ---
    const RIGHT_TEXT_X = RIGHT_X + HDR_PAD;
    const RIGHT_TEXT_W = RIGHT_W - HDR_PAD * 2;

    // RUC
    doc.font('Helvetica').fontSize(7).fillColor(DARK)
      .text(`R.U.C.: ${companyRuc}`, RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W });
    rightY = doc.y + 3;

    // FACTURA title
    doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK)
      .text('FACTURA', RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, align: 'center' });
    rightY = doc.y + 3;

    // Number
    const fullNumber = invoice.fullNumber ?? String(invoice.number);
    doc.font('Helvetica').fontSize(8).fillColor(DARK)
      .text(`No. ${fullNumber}`, RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, align: 'center' });
    rightY = doc.y + 5;

    // Authorization number
    if (invoice.authorizationNumber) {
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
        .text('NÚMERO DE AUTORIZACIÓN', RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W });
      rightY = doc.y + 1;
      doc.font('Helvetica').fontSize(6).fillColor(DARK)
        .text(invoice.authorizationNumber, RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, lineBreak: true });
      rightY = doc.y + 3;
    }

    // Ambiente + Emisión
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
      .text('AMBIENTE: ', RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, continued: true });
    doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
      .text(sriEnvironment === 'production' ? 'PRODUCCIÓN' : 'PRUEBAS', { continued: false });
    rightY = doc.y + 1;

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
      .text('EMISIÓN: ', RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, continued: true });
    doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
      .text('NORMAL', { continued: false });
    rightY = doc.y + 3;

    // Clave de acceso + código de barras (ancho completo de columna derecha)
    if (invoice.accessKey) {
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
        .text('CLAVE DE ACCESO', RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W });
      rightY = doc.y + 2;

      if (barcodeBuffer) {
        try {
          // Barcode ocupa todo el ancho de la columna derecha
          doc.image(barcodeBuffer, RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, height: 30 });
          rightY += 32;
        } catch { /* barcode render failed */ }
      }

      // Número de clave de acceso debajo del código de barras
      doc.font('Courier').fontSize(5).fillColor(DARK)
        .text(invoice.accessKey, RIGHT_TEXT_X, rightY, { width: RIGHT_TEXT_W, align: 'center', lineBreak: false });
      rightY = doc.y + 3;
    }

    // Calculate header height from max of both columns
    const HDR_BOTTOM = Math.max(leftY, rightY) + HDR_PAD;

    // Draw header border and divider
    drawBorder(MARGIN, HDR_TOP, PAGE_W, HDR_BOTTOM - HDR_TOP);
    vLine(DIVIDER_X, HDR_TOP, HDR_BOTTOM);

    let curY = HDR_BOTTOM;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: INFORMACIÓN CLIENTE
    // ─────────────────────────────────────────────────────────────────────────
    const CLIENT_TOP = curY + 4;
    const CLIENT_TITLE_H = 14;

    // Title bar
    doc.rect(MARGIN, CLIENT_TOP, PAGE_W, CLIENT_TITLE_H).fill(HDR_FILL);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(DARK)
      .text('Información Cliente', MARGIN, CLIENT_TOP + 3, { width: PAGE_W, align: 'center' });

    const CLIENT_DATA_TOP = CLIENT_TOP + CLIENT_TITLE_H;
    const CLIENT_PAD = 5;
    const CLIENT_HALF_W = Math.floor(PAGE_W / 2);
    const CLIENT_LEFT_X  = MARGIN + CLIENT_PAD;
    const CLIENT_RIGHT_X = MARGIN + CLIENT_HALF_W + CLIENT_PAD;
    const CLIENT_COL_W   = CLIENT_HALF_W - CLIENT_PAD * 2;

    let clLeftY  = CLIENT_DATA_TOP + CLIENT_PAD;
    let clRightY = CLIENT_DATA_TOP + CLIENT_PAD;

    const idLabel = invoice.customerTaxIdType || 'Cédula/Ruc';

    function clientRow(label: string, value: string, x: number, y: number, colW: number): number {
      // Sin valor no se dibuja la fila: con `continued: true` y un texto vacío,
      // PDFKit no avanza `doc.y` y la fila siguiente se imprime encima
      // (se veía «Vendedor» montado sobre «Moneda: USD»).
      const texto = `${value ?? ''}`.trim();
      if (!texto) return y;
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
        .text(`${label}: `, x, y, { width: colW, continued: true });
      doc.font('Helvetica').fontSize(6.5).fillColor(DARK)
        .text(texto, { continued: false });
      return doc.y + 2;
    }

    clLeftY  = clientRow(`${idLabel}`, invoice.customerTaxId,  CLIENT_LEFT_X,  clLeftY,  CLIENT_COL_W);
    clLeftY  = clientRow('Nombre',     invoice.customerName,   CLIENT_LEFT_X,  clLeftY,  CLIENT_COL_W);
    if (invoice.customerPhone) {
      clLeftY = clientRow('Teléfonos', invoice.customerPhone,  CLIENT_LEFT_X,  clLeftY,  CLIENT_COL_W);
    }
    if (invoice.customerAddress) {
      clLeftY = clientRow('Dirección', invoice.customerAddress, CLIENT_LEFT_X, clLeftY,  CLIENT_COL_W);
    }
    if (invoice.customerEmail) {
      clLeftY = clientRow('Correo',    invoice.customerEmail,  CLIENT_LEFT_X,  clLeftY,  CLIENT_COL_W);
    }

    clRightY = clientRow('Fecha Emisión',     formatDate(invoice.date),
      CLIENT_RIGHT_X, clRightY, CLIENT_COL_W);
    clRightY = clientRow('Fecha Vencimiento',
      invoice.dueDate ? formatDate(invoice.dueDate) : formatDate(invoice.date),
      CLIENT_RIGHT_X, clRightY, CLIENT_COL_W);
    clRightY = clientRow('Vendedor',    invoice.agentCode ?? '', CLIENT_RIGHT_X, clRightY, CLIENT_COL_W);
    clRightY = clientRow('Moneda',      invoice.currency ?? 'USD', CLIENT_RIGHT_X, clRightY, CLIENT_COL_W);
    clRightY = clientRow('Condición',   paymentConditionLabel(invoice.paymentTermCode, invoice.paymentDays),
      CLIENT_RIGHT_X, clRightY, CLIENT_COL_W);

    const CLIENT_BOTTOM = Math.max(clLeftY, clRightY) + CLIENT_PAD;
    drawBorder(MARGIN, CLIENT_TOP, PAGE_W, CLIENT_BOTTOM - CLIENT_TOP);
    vLine(MARGIN + CLIENT_HALF_W, CLIENT_DATA_TOP, CLIENT_BOTTOM);
    hLine(CLIENT_DATA_TOP, MARGIN, MARGIN + PAGE_W);

    curY = CLIENT_BOTTOM;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: TABLA DE PRODUCTOS
    // ─────────────────────────────────────────────────────────────────────────
    const TABLE_TOP = curY + 4;
    const TABLE_PAD = 3;

    // Column widths (total = PAGE_W = 525)
    const COL_N     = 20;
    const COL_SKU   = 60;
    const COL_DESC  = 195;
    const COL_QTY   = 45;
    const COL_PRICE = 65;
    const COL_DISC  = 55;
    const COL_TOTAL = PAGE_W - COL_N - COL_SKU - COL_DESC - COL_QTY - COL_PRICE - COL_DISC;

    const COL_STARTS = {
      n:     MARGIN,
      sku:   MARGIN + COL_N,
      desc:  MARGIN + COL_N + COL_SKU,
      qty:   MARGIN + COL_N + COL_SKU + COL_DESC,
      price: MARGIN + COL_N + COL_SKU + COL_DESC + COL_QTY,
      disc:  MARGIN + COL_N + COL_SKU + COL_DESC + COL_QTY + COL_PRICE,
      total: MARGIN + COL_N + COL_SKU + COL_DESC + COL_QTY + COL_PRICE + COL_DISC,
    };

    const TABLE_HDR_H = 14;

    // Table header background
    doc.rect(MARGIN, TABLE_TOP, PAGE_W, TABLE_HDR_H).fill(HDR_FILL);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK);

    const hdrY = TABLE_TOP + TABLE_PAD;
    doc.text('N',        COL_STARTS.n     + 2, hdrY, { width: COL_N     - 4, align: 'center',  lineBreak: false });
    doc.text('Código',   COL_STARTS.sku   + 2, hdrY, { width: COL_SKU   - 4, align: 'left',    lineBreak: false });
    doc.text('Nombre',   COL_STARTS.desc  + 2, hdrY, { width: COL_DESC  - 4, align: 'left',    lineBreak: false });
    doc.text('Cant.',    COL_STARTS.qty   + 2, hdrY, { width: COL_QTY   - 4, align: 'right',   lineBreak: false });
    doc.text('Precio U.',COL_STARTS.price + 2, hdrY, { width: COL_PRICE - 4, align: 'right',   lineBreak: false });
    doc.text('Desc.',    COL_STARTS.disc  + 2, hdrY, { width: COL_DISC  - 4, align: 'right',   lineBreak: false });
    doc.text('Precio T.',COL_STARTS.total + 2, hdrY, { width: COL_TOTAL - 4, align: 'right',   lineBreak: false });

    let tableY = TABLE_TOP + TABLE_HDR_H;
    let rowIndex = 0;

    for (const line of invoice.lines) {
      rowIndex++;
      const descText = line.description ?? '';
      const skuText  = line.productSku ?? line.sku ?? '';

      // Dynamic row height based on description text
      const descH = doc.heightOfString(descText, { width: COL_DESC - 4 });
      const skuH  = doc.heightOfString(skuText,  { width: COL_SKU  - 4 });
      const rowH  = Math.max(16, Math.max(descH, skuH) + 6);

      // Alternating row background
      if (rowIndex % 2 === 0) {
        doc.rect(MARGIN, tableY, PAGE_W, rowH).fill('#F7F7F7');
      }

      const discountPct = line.discountPct ?? line.discount ?? 0;
      const discountAmt = line.unitPrice * line.quantity * (discountPct / 100);
      const lineSubtotal = line.subtotal ?? line.lineTotal ?? 0;

      const rowTextY = tableY + TABLE_PAD;

      doc.font('Helvetica').fontSize(6.5).fillColor(DARK);
      doc.text(String(rowIndex),     COL_STARTS.n     + 2, rowTextY, { width: COL_N     - 4, align: 'center',  lineBreak: false });
      doc.text(skuText,              COL_STARTS.sku   + 2, rowTextY, { width: COL_SKU   - 4, align: 'left',    lineBreak: false });
      doc.text(descText,             COL_STARTS.desc  + 2, rowTextY, { width: COL_DESC  - 4, lineBreak: true  });
      doc.text(fmt2(line.quantity),  COL_STARTS.qty   + 2, rowTextY, { width: COL_QTY   - 4, align: 'right',  lineBreak: false });
      doc.text(fmt2(line.unitPrice), COL_STARTS.price + 2, rowTextY, { width: COL_PRICE - 4, align: 'right',  lineBreak: false });
      doc.text(fmt2(discountAmt),    COL_STARTS.disc  + 2, rowTextY, { width: COL_DISC  - 4, align: 'right',  lineBreak: false });
      doc.text(fmt2(lineSubtotal),   COL_STARTS.total + 2, rowTextY, { width: COL_TOTAL - 4, align: 'right',  lineBreak: false });

      // Vertical column dividers for each row
      vLine(COL_STARTS.sku,   tableY, tableY + rowH);
      vLine(COL_STARTS.desc,  tableY, tableY + rowH);
      vLine(COL_STARTS.qty,   tableY, tableY + rowH);
      vLine(COL_STARTS.price, tableY, tableY + rowH);
      vLine(COL_STARTS.disc,  tableY, tableY + rowH);
      vLine(COL_STARTS.total, tableY, tableY + rowH);

      tableY += rowH;
    }

    // Table outer border
    drawBorder(MARGIN, TABLE_TOP, PAGE_W, tableY - TABLE_TOP);

    // Header bottom separator
    hLine(TABLE_TOP + TABLE_HDR_H, MARGIN, MARGIN + PAGE_W);

    curY = tableY;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: BOTTOM — Info Adicional + Forma Pago + Totales
    // ─────────────────────────────────────────────────────────────────────────
    const BOTTOM_TOP = curY + 4;
    const LEFT_BOTTOM_W  = Math.floor(PAGE_W * 0.58);  // ~304
    const RIGHT_BOTTOM_W = PAGE_W - LEFT_BOTTOM_W;      // ~221
    const BOTTOM_DIVIDER = MARGIN + LEFT_BOTTOM_W;
    const RIGHT_BOTTOM_X = BOTTOM_DIVIDER + 1;

    const BL_PAD  = 5;
    const BL_X    = MARGIN + BL_PAD;
    const BL_W    = LEFT_BOTTOM_W - BL_PAD * 2;
    const BR_X    = RIGHT_BOTTOM_X + BL_PAD;
    const BR_W    = RIGHT_BOTTOM_W - BL_PAD * 2;

    let blY = BOTTOM_TOP + BL_PAD;
    let brY = BOTTOM_TOP + BL_PAD;

    // ── LEFT: Información Adicional ───────────────────────────────────────────
    if (sriConfig.additionalInfoFields && sriConfig.additionalInfoFields.length > 0) {
      // Sub-section title
      doc.rect(MARGIN, blY - 2, LEFT_BOTTOM_W, 12).fill(HDR_FILL);
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
        .text('Información Adicional', BL_X, blY, { width: BL_W });
      blY = doc.y + 3;

      const AI_KEY_W   = Math.floor(BL_W * 0.42);
      const AI_VAL_W   = BL_W - AI_KEY_W - 4;
      const AI_VAL_X   = BL_X + AI_KEY_W + 4;

      // Info adicional header row
      doc.rect(MARGIN, blY, LEFT_BOTTOM_W, 10).fill('#F0F0F0');
      doc.font('Helvetica-Bold').fontSize(5.5).fillColor(DARK)
        .text('Campo', BL_X, blY + 2, { width: AI_KEY_W, lineBreak: false })
        .text('Valor', AI_VAL_X, blY + 2, { width: AI_VAL_W, lineBreak: false });
      blY += 10;

      for (const field of sriConfig.additionalInfoFields) {
        const keyH   = doc.heightOfString(field.nombre, { width: AI_KEY_W - 2 });
        const valH   = doc.heightOfString(field.valor,  { width: AI_VAL_W - 2 });
        const rowH   = Math.max(12, Math.max(keyH, valH) + 4);

        doc.font('Helvetica-Bold').fontSize(6).fillColor(DARK)
          .text(field.nombre, BL_X, blY + 2, { width: AI_KEY_W - 2, lineBreak: true });
        doc.font('Helvetica').fontSize(6).fillColor(DARK)
          .text(field.valor, AI_VAL_X, blY + 2, { width: AI_VAL_W - 2, lineBreak: true });

        blY += rowH;
        hLine(blY, MARGIN, BOTTOM_DIVIDER);
      }
      blY += 4;
    }

    // ── LEFT: Forma de Pago ───────────────────────────────────────────────────
    const paymentList = invoice.paymentMethods?.length
      ? invoice.paymentMethods
      : [{ code: invoice.paymentMethod ?? '01', amount: invoice.total } as PaymentMethod];

    // Sub-section title
    doc.rect(MARGIN, blY - 2, LEFT_BOTTOM_W, 12).fill(HDR_FILL);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(DARK)
      .text('Forma de Pago', BL_X, blY, { width: BL_W });
    blY = doc.y + 3;

    // Payment table headers
    const PM_NAME_W  = Math.floor(BL_W * 0.55);
    const PM_AMT_W   = Math.floor(BL_W * 0.20);
    const PM_PLAZO_W = BL_W - PM_NAME_W - PM_AMT_W;
    const PM_AMT_X   = BL_X + PM_NAME_W;
    const PM_PLAZO_X = PM_AMT_X + PM_AMT_W;

    doc.rect(MARGIN, blY, LEFT_BOTTOM_W, 10).fill('#F0F0F0');
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor(DARK)
      .text('Forma de Pago', BL_X,      blY + 2, { width: PM_NAME_W,  lineBreak: false })
      .text('Valor',          PM_AMT_X,  blY + 2, { width: PM_AMT_W,  align: 'right', lineBreak: false })
      .text('Plazo',          PM_PLAZO_X, blY + 2, { width: PM_PLAZO_W, lineBreak: false });
    blY += 10;
    hLine(blY, MARGIN, BOTTOM_DIVIDER);

    for (const pm of paymentList) {
      const pmName = pm.name ?? paymentMethodName(pm.code ?? '01');
      const pmAmt  = pm.amount != null ? `$${fmt2(pm.amount)}` : '';
      const pmDead = pm.deadline ? `${pm.deadline}` : '';
      const pmUnit = pm.timeUnit ?? (pm.deadline ? 'días' : '');

      const nameH  = doc.heightOfString(pmName, { width: PM_NAME_W - 2 });
      const rowH   = Math.max(12, nameH + 4);

      doc.font('Helvetica').fontSize(6).fillColor(DARK)
        .text(pmName, BL_X, blY + 2,      { width: PM_NAME_W  - 2, lineBreak: true  })
        .text(pmAmt,  PM_AMT_X,  blY + 2,  { width: PM_AMT_W   - 2, align: 'right', lineBreak: false })
        .text(`${pmDead} ${pmUnit}`.trim(), PM_PLAZO_X, blY + 2, { width: PM_PLAZO_W - 2, lineBreak: false });

      blY += rowH;
      hLine(blY, MARGIN, BOTTOM_DIVIDER);
    }
    blY += 4;

    // SON: número en letras
    const totalLetras = numeroALetras(invoice.total);
    doc.font('Helvetica').fontSize(6).fillColor(DARK)
      .text(`SON: ${totalLetras} DÓLARES AMERICANOS`, BL_X, blY, { width: BL_W });
    blY = doc.y + 4;

    // ── RIGHT: Totales ────────────────────────────────────────────────────────
    const netAmount     = invoice.netAmount     ?? invoice.subtotal ?? 0;
    const discountAmt   = invoice.discountAmount ?? invoice.discount ?? 0;
    const total         = invoice.total;

    // Build vatSummary from vatSummary field or derive from lines
    let vatSummary: VatSummaryEntry[] = [];
    if (invoice.vatSummary && invoice.vatSummary.length > 0) {
      vatSummary = invoice.vatSummary;
    } else {
      const vatMap = new Map<number, VatSummaryEntry>();
      for (const line of invoice.lines) {
        const pct  = line.vatPct ?? line.taxRate ?? 0;
        const base = line.subtotal ?? line.lineTotal ?? 0;
        const vat  = line.vatAmount ?? line.taxAmount ?? 0;
        const ex   = vatMap.get(pct) ?? { vatPct: pct, taxableBase: 0, vatAmount: 0 };
        vatMap.set(pct, { vatPct: pct, taxableBase: ex.taxableBase + base, vatAmount: ex.vatAmount + vat });
      }
      vatSummary = Array.from(vatMap.values());
    }

    const subtotalIva0   = vatSummary.filter(v => v.vatPct === 0).reduce((s, v) => s + v.taxableBase, 0);

    function totalRow(label: string, value: string, bold = false, highlight = false) {
      const rowH = 13;
      if (highlight) {
        doc.rect(RIGHT_BOTTOM_X, brY, RIGHT_BOTTOM_W, rowH).fill(HDR_FILL);
      }
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      const LABEL_W = Math.floor(BR_W * 0.62);
      const VAL_W   = BR_W - LABEL_W;
      const VAL_X   = BR_X + LABEL_W;

      doc.font(font).fontSize(6.5).fillColor(DARK)
        .text(label, BR_X, brY + 3, { width: LABEL_W, lineBreak: false })
        .text(value,  VAL_X, brY + 3, { width: VAL_W,   lineBreak: false, align: 'right' });

      hLine(brY + rowH, BOTTOM_DIVIDER, MARGIN + PAGE_W);
      brY += rowH;
    }

    // Subtotales por tasa de IVA (dinámico)
    const nonZeroRates = vatSummary.filter(v => v.vatPct > 0).sort((a, b) => a.vatPct - b.vatPct);
    for (const v of nonZeroRates) {
      totalRow(`Subtotal IVA ${v.vatPct}%`, `$ ${fmt2(v.taxableBase)}`);
    }
    totalRow('Subtotal IVA 0%',           `$ ${fmt2(subtotalIva0)}`);
    totalRow('Subtotal No Objeto',        `$ ${fmt2(0)}`);
    totalRow('Subtotal Exento',           `$ ${fmt2(0)}`);
    totalRow('Subtotal Sin Impuestos',    `$ ${fmt2(netAmount)}`);
    totalRow('Subtotal',                  `$ ${fmt2(netAmount)}`);
    totalRow('Descuento',                 `$ ${fmt2(discountAmt)}`);
    for (const v of nonZeroRates) {
      totalRow(`IVA ${v.vatPct}%`, `$ ${fmt2(v.vatAmount)}`);
    }
    if (nonZeroRates.length === 0) {
      totalRow('IVA',                     `$ ${fmt2(0)}`);
    }
    totalRow('ICE',                       `$ ${fmt2(0)}`);
    totalRow('Servicio',                  `$ ${fmt2(0)}`);
    totalRow('Total',                     `$ ${fmt2(total)}`, true, true);

    // Final bottom section border
    const BOTTOM_BOTTOM = Math.max(blY, brY) + BL_PAD;
    drawBorder(MARGIN, BOTTOM_TOP, PAGE_W, BOTTOM_BOTTOM - BOTTOM_TOP);
    vLine(BOTTOM_DIVIDER, BOTTOM_TOP, BOTTOM_BOTTOM);

    doc.end();
  });
}

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

export async function generatePdfInternal(
  invoiceId: string,
  companyId: string
): Promise<{ pdfUrl: string }> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

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
  const companyData  = companySnap.data() as Record<string, any>;
  const companyRuc: string = companyData['sri']?.['ruc'] ?? '';
  const sriEnvironment: 'testing' | 'production' =
    companyData['sri']?.['environment'] === 'production' ? 'production' : 'testing';

  // Download company logo from configuration/general
  let logoBuffer: Buffer | null = null;
  try {
    const generalConfigSnap = await db.doc(`companies/${companyId}/configuration/general`).get();
    const logoUrl: string = generalConfigSnap.exists
      ? (generalConfigSnap.data()?.['logoUrl'] ?? '')
      : '';
    if (logoUrl) {
      const resp = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
      logoBuffer = Buffer.from(resp.data);
      console.log('[generate-pdf] Logo descargado, bytes:', logoBuffer.length);
    }
  } catch (err) {
    console.warn('[generate-pdf] Logo no disponible:', err);
  }

  // 3. Read SRI config
  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriConfigSnap.exists) {
    throw new Error(`Configuración SRI no encontrada para empresa: ${companyId}`);
  }
  const sriConfig = sriConfigSnap.data() as SriCompanyConfig;

  console.log('[generate-pdf] Datos leídos. Generando código de barras...');

  // 4. Generate Code128 barcode for access key
  let barcodeBuffer: Buffer | null = null;
  if (invoice.accessKey) {
    try {
      barcodeBuffer = await bwipjs.toBuffer({
        bcid:        'code128',
        text:        invoice.accessKey,
        scale:       2,
        height:      12,
        includetext: false,
        padding:     2,
      });
      console.log('[generate-pdf] Código de barras generado, bytes:', barcodeBuffer.length);
    } catch (err) {
      console.warn('[generate-pdf] No se pudo generar código de barras:', err);
    }
  }

  // 5. Build PDF
  console.log('[generate-pdf] Construyendo PDF...');
  const pdfBuffer = await buildPdfBuffer({
    invoice,
    companyId,
    companyRuc,
    sriEnvironment,
    sriConfig,
    barcodeBuffer,
    logoBuffer,
  });

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

  const callerRole      = request.auth.token['role']      as string | undefined;
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
