// ─── El documento de sustento de una retención (2026-10-06) ───────────────────
//
// En el comprobante de retención v2.0.0 cada <docSustento> lleva, además de las
// retenciones, los impuestos de la factura del proveedor (<impuestosDocSustento>)
// y cómo se pagó (<pagos>): los dos son obligatorios en el XSD. El generador no
// los escribía y ponía el total con IVA también como «total sin impuestos», así
// que ninguna retención había llegado a autorizarse (en producción no había ni
// una al 2026-10-06).
//
// Datos que usa, del documento de la retención:
//   supportDocTotal     importe total de la factura del proveedor (con IVA)
//   supportDocSubtotal  su base sin impuestos                       (opcional)
//   supportDocTaxes     [{ rate, base, amount }] IVA por tarifa      (opcional)
//   supportDocPaymentCode  forma de pago, Tabla 24                  (opcional)
// Una retención sin esos tres (las de la web) sale con todo el total como base
// sin IVA y forma de pago 20 (sistema financiero): un sustento válido, aunque
// pobre.
//
// Solo lógica pura.

/** IVA: tarifa → código de porcentaje (Tabla 17 de la ficha técnica). */
export const IVA_PERCENTAGE_CODES: Record<number, string> = {
  0: '0',
  5: '5',
  12: '2',
  13: '10',
  14: '3',
  15: '4',
};

export function ivaPercentageCode(rate: number): string {
  const code = IVA_PERCENTAGE_CODES[Math.round(rate * 100) / 100];
  if (!code) throw new Error(`Tarifa de IVA sin código del SRI: ${rate} %`);
  return code;
}

export interface SustentoTax {
  codImpuesto: string;        // '2' = IVA
  codigoPorcentaje: string;
  baseImponible: number;
  tarifa: number;
  valorImpuesto: number;
}

export interface SustentoPago {
  formaPago: string;
  total: number;
}

export interface Sustento {
  totalSinImpuestos: number;
  importeTotal: number;
  impuestos: SustentoTax[];
  pagos: SustentoPago[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v ?? 0) || 0);

const SRI_PAYMENT_CODES = new Set(['01', '15', '16', '17', '18', '19', '20', '21']);

export function buildSustento(ret: Record<string, any>): Sustento {
  const importeTotal = r2(num(ret.supportDocTotal));
  const taxes = Array.isArray(ret.supportDocTaxes) ? ret.supportDocTaxes : [];

  // Agrupa por tarifa: dos líneas al 15 % son un solo impuesto en el XML.
  const porTarifa = new Map<number, { base: number; amount: number }>();
  for (const t of taxes) {
    const rate = r2(num(t?.rate));
    const acc = porTarifa.get(rate) ?? { base: 0, amount: 0 };
    acc.base += num(t?.base);
    acc.amount += num(t?.amount);
    porTarifa.set(rate, acc);
  }

  let impuestos: SustentoTax[] = [...porTarifa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({
      codImpuesto: '2',
      codigoPorcentaje: ivaPercentageCode(rate),
      baseImponible: r2(v.base),
      tarifa: rate,
      valorImpuesto: r2(v.amount),
    }));

  const subtotal = ret.supportDocSubtotal != null
    ? r2(num(ret.supportDocSubtotal))
    : impuestos.length
      ? r2(impuestos.reduce((s, i) => s + i.baseImponible, 0))
      : importeTotal;

  if (!impuestos.length) {
    impuestos = [{ codImpuesto: '2', codigoPorcentaje: '0', baseImponible: subtotal, tarifa: 0, valorImpuesto: 0 }];
  }

  const codigo = `${ret.supportDocPaymentCode ?? ''}`;
  const pagos = [{ formaPago: SRI_PAYMENT_CODES.has(codigo) ? codigo : '20', total: importeTotal }];

  return { totalSinImpuestos: subtotal, importeTotal, impuestos, pagos };
}

/** El número del comprobante de sustento como lo pide el XML: 15 dígitos. */
export function supportDocDigits(numero: string): string {
  const partes = `${numero ?? ''}`.split('-').map((x) => x.replace(/\D/g, ''));
  if (partes.length === 3) {
    return partes[0].padStart(3, '0') + partes[1].padStart(3, '0') + partes[2].padStart(9, '0');
  }
  return partes.join('').padStart(15, '0').slice(-15);
}
