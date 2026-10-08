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
 *   DEBE   IVA en compras        el IVA de la compra (`totalTax`), si el
 *                                sustento da crédito tributario (01, 03, 06)
 *   DEBE   (la cuenta de la base) el IVA, si el sustento NO da crédito
 *                                (02, 04, 05, 07…): es mayor costo o gasto
 *                                (2026-10-08, ver `purchaseVatTreatment`)
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

import { givesVatCredit, isSriSustentoCode, normalizeSustentoCode } from '../../utils/sri-sustento-codes';

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

/**
 * Qué se hace con el IVA de la compra según su sustento tributario (tabla 5
 * del ATS, 2026-10-08):
 *  - `credit`: va a «IVA en compras» (crédito tributario). Sustentos 01, 03, 06.
 *  - `cost`: no es recuperable, así que es más costo de lo comprado y va a la
 *    misma cuenta que la base de cada línea (gasto, activo fijo o inventario:
 *    la de la línea → la del artículo → la del mapeo). 02, 04, 05, 07…
 *  - Sustento vacío o fuera de la tabla 5 vigente: `credit`, como hasta hoy,
 *    con `known: false` para que el llamador lo deje en el log.
 */
export function purchaseVatTreatment(code: unknown): { mode: 'credit' | 'cost'; code: string; known: boolean } {
  const c = normalizeSustentoCode(code);
  if (!c || !isSriSustentoCode(c)) return { mode: 'credit', code: c, known: false };
  return { mode: givesVatCredit(c) ? 'credit' : 'cost', code: c, known: true };
}

/** El IVA de la línea: el guardado, o subtotal × tarifa. */
function lineTax(l: Record<string, any>, base: number): number {
  if (typeof l.taxAmount === 'number') return l.taxAmount;
  if (typeof l.vatAmount === 'number') return l.vatAmount;
  const rate = Number(l.taxRate ?? l.vatPct ?? 0);
  return rate > 0 ? base * rate / 100 : 0;
}

/**
 * Reparte `total` (en dólares) entre los pesos, al centavo y sin perder ni
 * sumar un centavo (resto mayor). Si todos los pesos son cero, no reparte.
 */
function prorate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const cents = Math.round(total * 100);
  const raw = weights.map((w) => (cents * w) / sum);
  const out = raw.map(Math.floor);
  let resto = cents - out.reduce((s, n) => s + n, 0);
  const orden = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) out[orden[k][1]] += 1;
  return out.map((n) => n / 100);
}

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
  // `tax` es el IVA de las líneas de esa cuenta: solo pesa para repartir el
  // IVA no recuperable (sustento sin crédito).
  const buckets = new Map<string, { account: AccountRef; amount: number; tax: number }>();
  const sumar = (account: AccountRef, amount: number, tax: number) => {
    const b = buckets.get(account.code);
    if (b) { b.amount += amount; b.tax += tax; }
    else buckets.set(account.code, { account, amount, tax });
  };

  for (const l of lines) {
    const monto = lineSubtotal(l);
    if (!(monto > 0)) continue;
    const code = lineAccountCode(l, products);
    const porDefecto = isInventoryLine(l, products) ? accounts.inventory : accounts.purchaseExpense;
    const nombre = expenseNames.get(code) ?? (code === l.expenseAccountCode ? l.expenseAccountName : undefined) ?? code;
    sumar(code ? { code, name: nombre } : porDefecto, monto, Math.max(0, lineTax(l, monto)));
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
    const trato = purchaseVatTreatment(purchase.sriSustentoCode);
    const destinos = [...buckets.values()].filter((b) => b.amount > 0);
    if (trato.mode === 'cost' && destinos.length > 0) {
      // Sin crédito tributario: el IVA es más costo de lo comprado. Se reparte
      // entre las cuentas de la base según el IVA de sus líneas (o, si las
      // líneas no lo traen, según la base), al centavo y sumando `totalTax`.
      const pesoIva = destinos.map((b) => b.tax);
      const pesos = pesoIva.some((w) => w > 0) ? pesoIva : destinos.map((b) => b.amount);
      const partes = prorate(iva, pesos);
      destinos.forEach((b, i) => {
        if (partes[i] > 0) {
          out.push({ accountCode: b.account.code, accountName: b.account.name, debit: partes[i], credit: 0,
            description: `IVA sin crédito tributario (sustento ${trato.code}) compra ${ref}` });
        }
      });
    } else {
      out.push({ accountCode: accounts.ivaCredit.code, accountName: accounts.ivaCredit.name, debit: iva, credit: 0,
        description: `IVA compra ${ref}` });
    }
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
