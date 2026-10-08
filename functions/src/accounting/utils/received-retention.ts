// ─── Retenciones recibidas de clientes (2026-10-08) ───────────────────────────
//
// Cuando un cliente es agente de retención, al pagar la factura le retiene a la
// empresa parte del IVA y del impuesto a la renta y le entrega su comprobante
// de retención. Para la empresa eso no es un gasto: es un crédito tributario
// (IVA retenido, que resta del IVA a pagar del 104) y un anticipo del impuesto
// a la renta. El cliente paga menos, y la diferencia queda saldada contra la
// cuenta por cobrar.
//
//   Debe  1.1.05.006 Retenciones IVA                (lo que le retuvieron de IVA)
//   Debe  1.1.05.005 Retenciones en la Fuente IR    (lo que le retuvieron de renta)
//   Haber Cuentas por cobrar del cliente            (la misma cuenta de la venta)
//
// Viven en companies/{cid}/receivedRetentions/{id}, una por comprobante de
// retención del cliente, ligadas a su factura (`invoiceId`). La factura lleva
// el acumulado en `receivedRetentions` ({ivaCents, rentaCents, rentaBaseCents,
// count, lastId}), que las reglas cuadran con cada alta y cada anulación.
//
// Todo lo de este archivo es puro (sin Firestore), para probarlo con Jest.

export interface ReceivedRetentionLine {
  /** 'iva' | 'renta' */
  tax: string;
  /** IVA: 1, 2, 3, 9, 10, 11 (tabla del SRI); renta: 3xx. */
  code: string;
  base: number;
  rate: number;
  amount: number;
}

export interface ReceivedRetentionDoc {
  status?: string;
  isVoid?: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  number?: string;
  customerName?: string;
  date?: { toDate(): Date } | Date;
  fiscalYear?: string;
  lines?: ReceivedRetentionLine[];
  ivaCents?: number;
  rentaCents?: number;
  accountingEntryId?: string;
}

export interface AccountRef { code: string; name: string }

/** Cuentas del plan estándar (chart-seed.ts) y su respaldo si la empresa no las tiene. */
export const RECEIVED_RETENTION_ACCOUNTS = {
  iva:   { code: '1.1.05.006', name: 'Retenciones IVA' },
  renta: { code: '1.1.05.005', name: 'Retenciones en la Fuente IR' },
} as const;

export const RECEIVED_RETENTION_FALLBACKS = {
  iva:   { code: '1.1.05.002', name: 'Crédito Tributario IVA' },
  renta: { code: '1.1.05.003', name: 'Crédito Tributario Impuesto a la Renta' },
} as const;

/**
 * La cuenta que se usa: la estándar si la empresa la tiene (o si no tiene plan
 * de cuentas cargado: entonces nada se puede comprobar); si no, el respaldo si
 * existe; y si tampoco, la estándar igual (al volver a sembrar el plan
 * aparece). `fallbackUsed` / `missing` son para el log.
 */
export function resolveReceivedRetentionAccount(
  kind: 'iva' | 'renta',
  existing: Map<string, string>,
): { account: AccountRef; fallbackUsed: boolean; missing: boolean } {
  const pref = RECEIVED_RETENTION_ACCOUNTS[kind];
  const alt = RECEIVED_RETENTION_FALLBACKS[kind];
  if (existing.size === 0 || existing.has(pref.code)) {
    return { account: { code: pref.code, name: existing.get(pref.code) || pref.name }, fallbackUsed: false, missing: false };
  }
  if (existing.has(alt.code)) {
    return { account: { code: alt.code, name: existing.get(alt.code) || alt.name }, fallbackUsed: true, missing: false };
  }
  return { account: { ...pref }, fallbackUsed: false, missing: true };
}

/** Registrada, viva y sin asiento. */
export function receivedRetentionNeedsEntry(d: Record<string, any>): boolean {
  return d.status === 'registered' && d.isVoid !== true && !d.accountingEntryId
    && (Number(d.ivaCents ?? 0) + Number(d.rentaCents ?? 0)) > 0;
}

/** Centavos de IVA y de renta: los enteros que guardó el cliente, o la suma de las líneas. */
export function receivedRetentionCents(d: ReceivedRetentionDoc): { iva: number; renta: number } {
  if (Number.isInteger(d.ivaCents) && Number.isInteger(d.rentaCents)) {
    return { iva: d.ivaCents as number, renta: d.rentaCents as number };
  }
  let iva = 0;
  let renta = 0;
  for (const l of d.lines ?? []) {
    const c = Math.round(Number(l.amount ?? 0) * 100);
    if (l.tax === 'iva') iva += c; else renta += c;
  }
  return { iva, renta };
}

export interface EntryLineDraft {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

/** Las líneas del asiento: Debe IVA retenido / Debe renta retenida / Haber CxC. */
export function buildReceivedRetentionLines(
  d: ReceivedRetentionDoc,
  accounts: { iva: AccountRef; renta: AccountRef; receivable: AccountRef },
): EntryLineDraft[] {
  const { iva, renta } = receivedRetentionCents(d);
  const quien = d.customerName ? ` — ${d.customerName}` : '';
  const ret = d.number ? `Ret. ${d.number}` : 'Retención recibida';
  const fac = d.invoiceNumber ? ` (Fact. ${d.invoiceNumber})` : '';
  const lines: EntryLineDraft[] = [];
  if (iva > 0) {
    lines.push({ accountCode: accounts.iva.code, accountName: accounts.iva.name,
      debit: iva / 100, credit: 0, description: `IVA retenido por el cliente — ${ret}${fac}` });
  }
  if (renta > 0) {
    lines.push({ accountCode: accounts.renta.code, accountName: accounts.renta.name,
      debit: renta / 100, credit: 0, description: `Renta retenida por el cliente — ${ret}${fac}` });
  }
  if (iva + renta > 0) {
    lines.push({ accountCode: accounts.receivable.code, accountName: accounts.receivable.name,
      debit: 0, credit: (iva + renta) / 100, description: `${ret}${fac}${quien}` });
  }
  return lines;
}

/**
 * La cuenta por cobrar del asiento de la venta: la primera línea al Debe bajo
 * 1.1.02 (activos financieros). Así el Haber de la retención va a la misma
 * cuenta aunque el mapeo haya cambiado después. Null si no la encuentra.
 */
export function receivableFromSaleEntry(lines: Array<Record<string, any>> | undefined): AccountRef | null {
  for (const l of lines ?? []) {
    const code = String(l?.accountCode ?? '');
    if (Number(l?.debit ?? 0) > 0 && (code === '1.1.02' || code.startsWith('1.1.02.'))) {
      return { code, name: String(l?.accountName ?? code) };
    }
  }
  return null;
}

/** Lo retenido a una factura según su acumulado, en dólares (0 si no tiene). */
export function retainedOnInvoice(inv: Record<string, any>): number {
  const r = inv?.receivedRetentions;
  if (!r || typeof r !== 'object') return 0;
  const c = Number(r.ivaCents ?? 0) + Number(r.rentaCents ?? 0);
  return Number.isFinite(c) && c > 0 ? c / 100 : 0;
}
