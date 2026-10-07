/**
 * purchase-entry.ts
 *
 * Las líneas del asiento de una compra recibida, en una función pura para poder
 * probarla sin Firestore (2026-10-02).
 *
 *   DEBE   Inventario            las líneas de artículos con stock: la cuenta
 *                                del artículo (`purchaseAccountCode`) o la del
 *                                mapeo (inventory)
 *   DEBE   Gasto de cada línea   las demás (servicios, gastos): la cuenta que
 *                                eligió la línea, la del artículo o la del
 *                                mapeo (purchaseExpense)
 *   DEBE   IVA en compras        el IVA de la compra (`totalTax`)
 *   HABER  CxP proveedores       subtotal + IVA (lo que se le debe, BRUTO)
 *
 * Las retenciones NO van aquí: las asienta la retención cuando se emite
 * (Debe CxP / Haber Ret. por pagar) y el pago debita el neto (`total`), así que
 * con la retención emitida la CxP de la compra queda en cero.
 *
 * Antes (hasta el 2026-10-02) el asiento leía `vatAmount` —la compra guarda
 * `totalTax`—, así que el IVA nunca entraba y la CxP quedaba por el subtotal;
 * y filtraba por `trackStock`/`type` en la línea, campos que la línea no tiene,
 * con lo que los servicios iban a inventario.
 */

export interface AccountRef { code: string; name: string; }

export interface PurchaseEntryAccounts {
  inventory: AccountRef;
  purchaseExpense: AccountRef;
  ivaCredit: AccountRef;
  accountsPayable: AccountRef;
}

/**
 * Lo que importa del artículo: si la línea es inventario y, desde el
 * 2026-10-07, su cuenta contable de compras (`purchaseAccountCode`, el campo
 * «cuenta contable compras» de la web).
 */
export interface ProductKind { trackStock?: boolean; type?: string; noStock?: boolean; purchaseAccountCode?: string; }

export interface PurchaseEntryLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El mismo criterio que onPurchaseReceive: solo esas líneas suman stock. */
export function isInventoryLine(line: Record<string, any>, products: Map<string, ProductKind>): boolean {
  const p = line?.productId ? products.get(String(line.productId)) : undefined;
  return !!p && p.trackStock === true && p.type !== 'service' && p.noStock !== true && Number(line.qty ?? 0) > 0;
}

/**
 * La cuenta propia de la línea, o '' para la del mapeo. Inventario: la del
 * artículo. Gasto: la que eligió la línea y, si no eligió, la del artículo.
 */
export function lineAccountCode(line: Record<string, any>, products: Map<string, ProductKind>): string {
  const p = line?.productId ? products.get(String(line.productId)) : undefined;
  const delArticulo = typeof p?.purchaseAccountCode === 'string' ? p.purchaseAccountCode.trim() : '';
  if (isInventoryLine(line, products)) return delArticulo;
  const deLaLinea = typeof line?.expenseAccountCode === 'string' ? line.expenseAccountCode.trim() : '';
  return deLaLinea || delArticulo;
}

function lineSubtotal(l: Record<string, any>): number {
  if (typeof l.subtotal === 'number') return l.subtotal;
  const bruto = Number(l.qty ?? 0) * Number(l.unitCost ?? 0);
  return r2(bruto * (1 - Number(l.discount ?? 0) / 100));
}

/**
 * Las líneas del asiento. `expenseNames` da el nombre de las cuentas de gasto
 * elegidas en las líneas (las que no estén se resuelven fuera: si falta una,
 * el llamador no contabiliza). Lanza si no hay nada que contabilizar.
 */
export function buildPurchaseEntryLines(
  purchase: Record<string, any>,
  products: Map<string, ProductKind>,
  accounts: PurchaseEntryAccounts,
  expenseNames: Map<string, string>,
): PurchaseEntryLine[] {
  const ref = purchase.fullNumber ?? '';
  const supplier = purchase.supplierName ?? 'Proveedor';
  const lines: Record<string, any>[] = Array.isArray(purchase.lines) ? purchase.lines : [];

  // Debe por cuenta, en el orden en que aparecen.
  const buckets = new Map<string, { account: AccountRef; amount: number }>();
  const sumar = (account: AccountRef, amount: number) => {
    const b = buckets.get(account.code);
    if (b) b.amount += amount;
    else buckets.set(account.code, { account, amount });
  };

  for (const l of lines) {
    const monto = lineSubtotal(l);
    if (!(monto > 0)) continue;
    const code = lineAccountCode(l, products);
    const porDefecto = isInventoryLine(l, products) ? accounts.inventory : accounts.purchaseExpense;
    const nombre = expenseNames.get(code) ?? (code === l.expenseAccountCode ? l.expenseAccountName : undefined) ?? code;
    sumar(code ? { code, name: nombre } : porDefecto, monto);
  }

  // El subtotal guardado manda: si el redondeo por línea no coincide, la
  // diferencia (centavos) va al mayor de los débitos.
  const sumaLineas = r2([...buckets.values()].reduce((s, b) => s + b.amount, 0));
  const subtotal = typeof purchase.subtotal === 'number' ? r2(purchase.subtotal) : sumaLineas;
  for (const b of buckets.values()) b.amount = r2(b.amount);
  const diff = r2(subtotal - sumaLineas);
  if (diff !== 0 && buckets.size > 0) {
    const mayor = [...buckets.values()].sort((a, b) => b.amount - a.amount)[0];
    mayor.amount = r2(mayor.amount + diff);
  }

  const iva = r2(Number(purchase.totalTax ?? purchase.vatAmount ?? 0));
  if (subtotal <= 0 && iva <= 0) throw new Error('Compra sin montos contabilizables.');

  const out: PurchaseEntryLine[] = [];
  for (const { account, amount } of buckets.values()) {
    if (amount > 0) {
      out.push({ accountCode: account.code, accountName: account.name, debit: amount, credit: 0,
        description: `Compra ${ref} — ${supplier}` });
    }
  }
  if (iva > 0) {
    out.push({ accountCode: accounts.ivaCredit.code, accountName: accounts.ivaCredit.name, debit: iva, credit: 0,
      description: `IVA compra ${ref}` });
  }
  out.push({ accountCode: accounts.accountsPayable.code, accountName: accounts.accountsPayable.name,
    debit: 0, credit: r2(subtotal + iva), description: `CxP: ${supplier} — ${ref}` });
  return out;
}

/**
 * Los códigos de cuenta propios de las líneas (los que eligieron y los de sus
 * artículos), para validarlos contra el plan antes de contabilizar.
 */
export function chosenExpenseCodes(purchase: Record<string, any>, products: Map<string, ProductKind>): string[] {
  const lines: Record<string, any>[] = Array.isArray(purchase.lines) ? purchase.lines : [];
  const codes = lines.map((l) => lineAccountCode(l, products)).filter(Boolean);
  return [...new Set(codes)];
}

/** El año y la fecha contable: la de la factura del proveedor, si la tiene. */
export function purchaseAccountingDate(purchase: Record<string, any>): Date | null {
  for (const k of ['supplierInvoiceDate', 'date']) {
    const v = purchase[k];
    if (v && typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
  }
  return null;
}
