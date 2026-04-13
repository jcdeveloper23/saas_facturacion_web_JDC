/**
 * sri-calculations.test.ts
 *
 * Tests unitarios para las funciones de cálculo críticas de facturación
 * electrónica SRI Ecuador. Sin conexiones externas (Firebase, Firestore, etc.).
 *
 * Cubre:
 *   TEST 1 — calcularDigitoVerificador  (módulo 11, clave de acceso 48 dígitos)
 *   TEST 2 — calcInvoiceTotals          (totales de factura con IVA y descuentos)
 *   TEST 3 — resolveTemplate            (sustitución de placeholders en infoAdicional)
 */

// ─── Imports desde generate-invoice-xml ──────────────────────────────────────
import {
  calcularDigitoVerificador,
  resolveTemplate,
} from '../invoices/generate-invoice-xml';

// ─── Inline copies de helpers del modelo (evitan importar Angular/Firebase) ──

interface VatSummaryLine {
  vatPct: number;
  taxableBase: number;
  vatAmount: number;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  subtotal: number;
  vatPct: number;
  vatAmount: number;
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Copia exacta de calcLine (invoice.interface.ts) — calcula subtotal, vatAmount
 * y total de una línea dado cantidad, precio, descuento% y vatPct.
 */
function calcLine(
  line: Partial<InvoiceLine>
): Pick<InvoiceLine, 'subtotal' | 'vatAmount' | 'total'> {
  const qty      = line.quantity    ?? 0;
  const price    = line.unitPrice   ?? 0;
  const disc     = line.discountPct ?? 0;
  const vatPct   = line.vatPct      ?? 0;
  const subtotal = round2(qty * price * (1 - disc / 100));
  const vatAmount = round2(subtotal * vatPct / 100);
  return { subtotal, vatAmount, total: round2(subtotal + vatAmount) };
}

/**
 * Copia exacta de calcInvoiceTotals (invoice.interface.ts).
 */
function calcInvoiceTotals(
  lines: InvoiceLine[],
  globalDiscountPct: number
): {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  vatSummary: VatSummaryLine[];
  vatAmount: number;
  total: number;
} {
  const gross = round2(lines.reduce((s, l) => s + l.subtotal, 0));
  const disc  = round2(gross * globalDiscountPct / 100);
  const net   = round2(gross - disc);
  const factor = gross > 0 ? net / gross : 1;

  const vatMap = new Map<number, VatSummaryLine>();
  for (const l of lines) {
    const base  = round2(l.subtotal * factor);
    const va    = round2(base * l.vatPct / 100);
    const entry = vatMap.get(l.vatPct) ?? { vatPct: l.vatPct, taxableBase: 0, vatAmount: 0 };
    entry.taxableBase = round2(entry.taxableBase + base);
    entry.vatAmount   = round2(entry.vatAmount   + va);
    vatMap.set(l.vatPct, entry);
  }

  const vatSummary = [...vatMap.values()].sort((a, b) => a.vatPct - b.vatPct);
  const vatAmount  = round2(vatSummary.reduce((s, v) => s + v.vatAmount, 0));
  return {
    grossAmount: gross,
    discountAmount: disc,
    netAmount: net,
    vatSummary,
    vatAmount,
    total: round2(net + vatAmount),
  };
}

/** Construye una InvoiceLine completa usando calcLine para los campos derivados. */
function makeLine(
  partial: Pick<InvoiceLine, 'id' | 'description' | 'quantity' | 'unitPrice' | 'discountPct' | 'vatPct'>
): InvoiceLine {
  const computed = calcLine(partial);
  return {
    ...partial,
    subtotal: computed.subtotal,
    vatAmount: computed.vatAmount,
    total: computed.total,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — calcularDigitoVerificador (módulo 11, clave de acceso SRI)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calcularDigitoVerificador — módulo 11 SRI', () => {
  /**
   * Verifica el algoritmo completo manualmente para una clave de 48 dígitos
   * y valida que la función retorna el mismo resultado.
   *
   * Estructura de la clave de acceso (48 dígitos antes del dígito verificador):
   *   fechaEmision(8) + tipoComprobante(2) + ruc(13) + ambiente(1) +
   *   serie(6) + secuencial(9) + codigoNumerico(8) + tipoEmision(1) = 48
   */

  function computeDigit(clave48: string): number {
    const factores = [2, 3, 4, 5, 6, 7];
    let suma = 0;
    for (let i = clave48.length - 1, f = 0; i >= 0; i--, f++) {
      suma += parseInt(clave48[i]) * factores[f % 6];
    }
    const residuo = suma % 11;
    if (residuo === 0) return 0;
    if (residuo === 1) return 1;
    return 11 - residuo;
  }

  test('clave válida — residuo genera dígito entre 0 y 9', () => {
    // fecha:10042026  tipo:01  ruc:1792146739001  ambiente:1
    // serie:001001  secuencial:000000001  codigo:12345678  emision:1
    // Usamos una clave bien estructurada de 48 dígitos
    const c = '100420260117921467390011001001000000001123456781';
    expect(c.length).toBe(48);
    const expected = computeDigit(c);
    expect(calcularDigitoVerificador(c)).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(0);
    expect(expected).toBeLessThanOrEqual(9);
  });

  test('clave con residuo 0 → dígito verificador = 0', () => {
    // Construimos una clave sintética que produzca residuo 0.
    // Con todos los dígitos = 0 la suma = 0, residuo 0 % 11 = 0 → dígito 0.
    const clave48 = '0'.repeat(48);
    expect(calcularDigitoVerificador(clave48)).toBe(0);
  });

  test('clave con residuo 1 → dígito verificador = 1 (regla SRI especial)', () => {
    // Necesitamos una suma donde suma % 11 === 1.
    // Un solo dígito en posición más a la derecha (factor 2): valor = 1 → suma = 2 → residuo = 2 → dígito = 9.
    // Buscamos dígito en una posición cuyo factor * valor produce suma ≡ 1 (mod 11).
    // 47 ceros + un dígito en la última posición con factor 2:
    //   valor=6 → 6*2=12 → 12%11=1 → dígito verificador=1
    const clave48 = '0'.repeat(47) + '6';
    expect(calcularDigitoVerificador(clave48)).toBe(1);
  });

  test('clave con residuo > 1 → dígito = 11 - residuo', () => {
    // Un '1' en la última posición: factor=2, suma=2, residuo=2, dígito=9
    const clave48a = '0'.repeat(47) + '1';
    expect(calcularDigitoVerificador(clave48a)).toBe(9);

    // Un '2' en la última posición: factor=2, suma=4, residuo=4, dígito=7
    const clave48b = '0'.repeat(47) + '2';
    expect(calcularDigitoVerificador(clave48b)).toBe(7);

    // Un '5' en la última posición: factor=2, suma=10, residuo=10, dígito=1
    // CORRECCIÓN: residuo=10 → dígito=11-10=1
    const clave48c = '0'.repeat(47) + '5';
    expect(calcularDigitoVerificador(clave48c)).toBe(1);
  });

  test('los pesos ciclan [2,3,4,5,6,7] de derecha a izquierda', () => {
    // Clave con un solo '1' en cada posición y el resto ceros — verificamos
    // que el peso asignado es el factor esperado en ese índice desde la derecha.
    const factores = [2, 3, 4, 5, 6, 7];
    for (let pos = 0; pos < 12; pos++) {
      // posición desde la derecha = pos → factor = factores[pos % 6]
      const arr = new Array(48).fill('0');
      arr[47 - pos] = '1'; // posición desde la izquierda
      const clave = arr.join('');
      const esperadoFactor = factores[pos % 6];
      const suma = esperadoFactor; // 1 * factor
      const residuo = suma % 11;
      const expectedDigit = residuo === 0 ? 0 : residuo === 1 ? 1 : 11 - residuo;
      expect(calcularDigitoVerificador(clave)).toBe(expectedDigit);
    }
  });

  test('clave de ejemplo completa — fecha 10/04/2026 ambiente producción', () => {
    // fecha:10042026  tipo:01  ruc:0992312678001  ambiente:2
    // serie:001001  secuencial:000000042  codigo:87654321  emision:1
    const clave48 = '100420260109923126780012001001000000042876543211'
      .slice(0, 48);
    expect(clave48.length).toBe(48);
    const digit = calcularDigitoVerificador(clave48);
    // Verificar consistencia: el dígito debe poder reproducirse
    expect(calcularDigitoVerificador(clave48)).toBe(digit);
    expect(digit).toBeGreaterThanOrEqual(0);
    expect(digit).toBeLessThanOrEqual(9);
  });

  test('la clave de acceso final (48 + dígito) tiene longitud 49', () => {
    const clave48 = '100420260117921467390011001001000000001123456781'
      .slice(0, 48);
    const digit = calcularDigitoVerificador(clave48);
    const claveAcceso = clave48 + String(digit);
    expect(claveAcceso.length).toBe(49);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — calcInvoiceTotals
// ═══════════════════════════════════════════════════════════════════════════════

describe('calcInvoiceTotals — regla SRI: IVA sobre base neta (después de descuentos)', () => {

  test('Caso 1: 1 línea, qty=2, unitPrice=50, vatPct=15, descuento=0, sin descuento global', () => {
    const line = makeLine({ id: 'L1', description: 'Prod A', quantity: 2, unitPrice: 50, discountPct: 0, vatPct: 15 });
    // subtotal = 2 * 50 * (1 - 0/100) = 100
    expect(line.subtotal).toBe(100);

    const result = calcInvoiceTotals([line], 0);

    expect(result.grossAmount).toBe(100);
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(100);
    expect(result.vatAmount).toBe(15);       // 100 * 15% = 15
    expect(result.total).toBe(115);          // 100 + 15
    expect(result.vatSummary).toHaveLength(1);
    expect(result.vatSummary[0].vatPct).toBe(15);
    expect(result.vatSummary[0].taxableBase).toBe(100);
    expect(result.vatSummary[0].vatAmount).toBe(15);
  });

  test('Caso 2: 2 líneas con IVA 15% y IVA 0% — vatSummary separado por tarifa', () => {
    const line1 = makeLine({ id: 'L1', description: 'Prod con IVA', quantity: 1, unitPrice: 200, discountPct: 0, vatPct: 15 });
    const line2 = makeLine({ id: 'L2', description: 'Prod IVA 0%',  quantity: 3, unitPrice: 50,  discountPct: 0, vatPct: 0  });
    // subtotal L1 = 200, subtotal L2 = 150
    expect(line1.subtotal).toBe(200);
    expect(line2.subtotal).toBe(150);

    const result = calcInvoiceTotals([line1, line2], 0);

    expect(result.grossAmount).toBe(350);    // 200 + 150
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(350);

    // vatSummary debe tener 2 entradas, ordenadas por vatPct asc
    const summary0  = result.vatSummary.find(v => v.vatPct === 0);
    const summary15 = result.vatSummary.find(v => v.vatPct === 15);

    expect(summary0).toBeDefined();
    expect(summary0!.taxableBase).toBe(150);
    expect(summary0!.vatAmount).toBe(0);

    expect(summary15).toBeDefined();
    expect(summary15!.taxableBase).toBe(200);
    expect(summary15!.vatAmount).toBe(30);   // 200 * 15% = 30

    expect(result.vatAmount).toBe(30);
    expect(result.total).toBe(380);          // 350 + 30
  });

  test('Caso 3: descuento global del 10% — IVA calculado sobre base neta (regla SRI crítica)', () => {
    const line = makeLine({ id: 'L1', description: 'Prod B', quantity: 1, unitPrice: 1000, discountPct: 0, vatPct: 15 });
    // subtotal = 1000
    const result = calcInvoiceTotals([line], 10);

    expect(result.grossAmount).toBe(1000);
    expect(result.discountAmount).toBe(100);   // 1000 * 10%
    expect(result.netAmount).toBe(900);        // 1000 - 100

    // IVA debe ser sobre la base NETA (900), no sobre bruto (1000)
    expect(result.vatSummary[0].taxableBase).toBe(900);
    expect(result.vatAmount).toBe(135);        // 900 * 15% = 135
    expect(result.total).toBe(1035);           // 900 + 135
  });

  test('Caso 4: línea con precio 0 — no produce NaN ni Infinity', () => {
    const line = makeLine({ id: 'L1', description: 'Prod gratis', quantity: 1, unitPrice: 0, discountPct: 0, vatPct: 15 });
    const result = calcInvoiceTotals([line], 0);

    expect(Number.isFinite(result.grossAmount)).toBe(true);
    expect(Number.isNaN(result.grossAmount)).toBe(false);
    expect(result.grossAmount).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  test('Caso 5: IVA 0% — vatAmount=0, total=netAmount', () => {
    const line = makeLine({ id: 'L1', description: 'Exento', quantity: 5, unitPrice: 20, discountPct: 0, vatPct: 0 });
    const result = calcInvoiceTotals([line], 0);

    expect(result.grossAmount).toBe(100);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(result.netAmount);
    expect(result.total).toBe(100);
  });

  test('Caso 6: lista vacía — todos los totales son 0', () => {
    const result = calcInvoiceTotals([], 0);

    expect(result.grossAmount).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.vatSummary).toHaveLength(0);
  });

  test('Caso 7: múltiples líneas con mismo vatPct se agrupan en una sola entrada vatSummary', () => {
    const line1 = makeLine({ id: 'L1', description: 'A', quantity: 2, unitPrice: 100, discountPct: 0, vatPct: 15 });
    const line2 = makeLine({ id: 'L2', description: 'B', quantity: 1, unitPrice: 50,  discountPct: 0, vatPct: 15 });
    // subtotal L1=200, subtotal L2=50, gross=250

    const result = calcInvoiceTotals([line1, line2], 0);

    expect(result.vatSummary).toHaveLength(1);
    expect(result.vatSummary[0].vatPct).toBe(15);
    expect(result.vatSummary[0].taxableBase).toBe(250);
    expect(result.vatSummary[0].vatAmount).toBe(37.5);  // 250 * 15%
    expect(result.vatAmount).toBe(37.5);
    expect(result.total).toBe(287.5);
  });

  test('Caso 8: descuento global 0% no altera subtotales', () => {
    const line = makeLine({ id: 'L1', description: 'X', quantity: 3, unitPrice: 10, discountPct: 0, vatPct: 15 });
    const result = calcInvoiceTotals([line], 0);

    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(result.grossAmount);
  });

  test('Caso 9: descuento de línea se aplica antes del IVA — calcLine', () => {
    // qty=1, price=100, disc=20% → subtotal=80, vat=80*15%=12, total=92
    const line = makeLine({ id: 'L1', description: 'Desc línea', quantity: 1, unitPrice: 100, discountPct: 20, vatPct: 15 });
    expect(line.subtotal).toBe(80);
    expect(line.vatAmount).toBe(12);
    expect(line.total).toBe(92);

    const result = calcInvoiceTotals([line], 0);
    expect(result.grossAmount).toBe(80);
    expect(result.vatAmount).toBe(12);
    expect(result.total).toBe(92);
  });

  test('Caso 10: IVA 5% — cálculo correcto para bienes de canasta básica', () => {
    const line = makeLine({ id: 'L1', description: 'Canasta', quantity: 10, unitPrice: 8, discountPct: 0, vatPct: 5 });
    // subtotal = 80, vat = 80*5% = 4, total = 84
    expect(line.subtotal).toBe(80);
    expect(line.vatAmount).toBe(4);

    const result = calcInvoiceTotals([line], 0);
    expect(result.vatAmount).toBe(4);
    expect(result.total).toBe(84);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — resolveTemplate (infoAdicional fields)
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveTemplate — sustitución de placeholders en infoAdicional', () => {

  const ctx = {
    invoice:  { customerReference: 'OC-2026-001', notes: 'Entrega urgente', total: 1150 },
    customer: { name: 'Empresa ABC', taxId: '0992312678001', email: 'abc@empresa.com' },
    company:  { name: 'Mi Empresa S.A.', ruc: '1792146739001' },
  };

  test('placeholder que existe → sustituye correctamente', () => {
    const result = resolveTemplate('Orden: ${invoice.customerReference}', ctx);
    expect(result).toBe('Orden: OC-2026-001');
  });

  test('placeholder de customer → sustituye correctamente', () => {
    const result = resolveTemplate('Cliente: ${customer.name}', ctx);
    expect(result).toBe('Cliente: Empresa ABC');
  });

  test('placeholder de company → sustituye correctamente', () => {
    const result = resolveTemplate('RUC: ${company.ruc}', ctx);
    expect(result).toBe('RUC: 1792146739001');
  });

  test('placeholder que no existe en el objeto → retorna cadena vacía', () => {
    // 'nonexistent' no es una propiedad del invoice context
    const result = resolveTemplate('Ref: ${invoice.nonexistent}', ctx);
    expect(result).toBe('Ref: ');
  });

  test('template sin placeholders → retorna el template tal cual', () => {
    const template = 'Documento emitido electrónicamente';
    const result = resolveTemplate(template, ctx);
    expect(result).toBe(template);
  });

  test('template con múltiples placeholders de distintos objetos', () => {
    const template = 'OC: ${invoice.customerReference} | Cliente: ${customer.name} | Empresa: ${company.name}';
    const result = resolveTemplate(template, ctx);
    expect(result).toBe('OC: OC-2026-001 | Cliente: Empresa ABC | Empresa: Mi Empresa S.A.');
  });

  test('template con placeholder repetido → todas las ocurrencias se sustituyen', () => {
    const template = '${customer.name} facturado a ${customer.name}';
    const result = resolveTemplate(template, ctx);
    expect(result).toBe('Empresa ABC facturado a Empresa ABC');
  });

  test('template con string vacío → retorna string vacío', () => {
    const result = resolveTemplate('', ctx);
    expect(result).toBe('');
  });

  test('valor numérico en contexto → se convierte a string', () => {
    const result = resolveTemplate('Total: ${invoice.total}', ctx);
    expect(result).toBe('Total: 1150');
  });

  test('prefijo de objeto desconocido → no sustituye (deja el placeholder)', () => {
    // 'producto' no es invoice|customer|company, el regex no hace match
    const result = resolveTemplate('Cod: ${producto.sku}', ctx);
    expect(result).toBe('Cod: ${producto.sku}');
  });
});
