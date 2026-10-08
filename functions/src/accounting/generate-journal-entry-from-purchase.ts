import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { getAccountMapping } from './utils/get-account-mapping';
import { EntryResult, ecuadorYear, purchaseNeedsEntry } from './utils/payment-entry';
import {
  ProductKind, buildPurchaseEntryLines, chosenExpenseCodes, purchaseAccountingDate, purchaseVatTreatment,
} from './utils/purchase-entry';

// ─── Asiento automático al recibir una compra ──────────────────────────────────
//
// Trigger: onDocumentWritten en purchases cuando stockProcessed cambia a true
// (disparado por onPurchaseReceive luego de actualizar el stock).
//
// Asiento generado (detalle y por qué en utils/purchase-entry.ts):
//   DÉBITO  Inventario (mapeo)        = líneas de artículos con stock
//   DÉBITO  Gasto de cada línea       = las demás (cuenta elegida o mapeo purchaseExpense)
//   DÉBITO  1.1.05.001  IVA en Compras = totalTax (sustento con crédito: 01, 03, 06)
//   DÉBITO  la cuenta de la base       = totalTax (sustento sin crédito: 02, 04, 05, 07…)
//   CRÉDITO 2.1.01.001  CxP Proveedores = subtotal + IVA (las retenciones las asienta la retención)

interface PurchaseLine {
  productId?: string;
  description?: string;
  productName?: string;
  qty: number;
  unitCost: number;
  subtotal?: number;
  vatPct?: number;
  vatAmount?: number;
  trackStock?: boolean;
  type?: string;
}

interface PurchaseDoc {
  status: string;
  isVoid?: boolean;
  stockProcessed?: boolean;
  accountingEntryId?: string;
  supplierId?: string;
  supplierName?: string;
  supplierCode?: string;
  fullNumber?: string;
  date?: admin.firestore.Timestamp;
  fiscalYear?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  lines?: PurchaseLine[];
  costCenterId?: string;
  costCenterName?: string;
}

interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  costCenterName: string | null;
  description: string;
}

// Accounts payable and IVA credit are standard — not in company AccountMapping
const PURCHASE_FIXED_ACCOUNTS = {
  ivaCredit:       { code: '1.1.05.001', name: 'IVA en Compras (Crédito Tributario)' },
  accountsPayable: { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' },
};

function round2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * Genera el asiento de una compra recibida. La usan el trigger y
 * regenerateJournalEntries (2026-10-05): antes, una compra recibida sin
 * ejercicio abierto se quedaba sin asiento para siempre.
 *
 * Si no se puede, deja `accountingError` en la compra (lo ve quien la abre) y
 * devuelve el motivo. El asiento, el contador y el back-reference se escriben
 * en una transacción que antes vuelve a mirar accountingEntryId.
 */
export async function generateJournalEntryFromPurchaseInternal(
  companyId: string,
  purchaseId: string,
): Promise<EntryResult> {
  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const purchaseRef = db.doc(`companies/${companyId}/purchases/${purchaseId}`);

  const snap = await purchaseRef.get();
  if (!snap.exists) return { created: false, reason: 'not_found' };
  const after = snap.data() as PurchaseDoc;
  if (after.accountingEntryId) return { created: false, reason: 'already_exists', entryId: after.accountingEntryId };
  if (!purchaseNeedsEntry(after as Record<string, any>)) return { created: false, reason: 'not_ready' };

  // Año y fecha contables: los de la factura del proveedor (hora de Ecuador),
  // no los de hoy. Antes tomaba el año en curso.
  const fecha      = purchaseAccountingDate(after) ?? now.toDate();
  const periodYear = ecuadorYear(fecha);

  const periodsSnap = await db
    .collection(`companies/${companyId}/accounting_periods`)
    .where('year',   '==', periodYear)
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (periodsSnap.empty) {
    await purchaseRef.update({
      accountingError: `No hay ejercicio ${periodYear} abierto: la compra no se contabilizó.`,
      updatedAt: now,
    });
    return { created: false, reason: 'no_open_period' };
  }
  const periodId = periodsSnap.docs[0].id;

  // Qué líneas son inventario: el mismo criterio que onPurchaseReceive,
  // leído del artículo (la línea no dice si lleva stock).
  const lines = (after.lines ?? []) as Record<string, any>[];
  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean).map(String))];
  const products = new Map<string, ProductKind>();
  if (productIds.length) {
    const snaps = await db.getAll(...productIds.map((id) => db.doc(`companies/${companyId}/products/${id}`)));
    for (const p of snaps) if (p.exists) products.set(p.id, p.data() as ProductKind);
  }

  // Las cuentas de gasto que eligieron las líneas tienen que existir y
  // admitir movimiento; si no, no se contabiliza (mejor un error visible
  // que un asiento a una cuenta agrupadora o inexistente).
  const expenseNames = new Map<string, string>();
  const elegidas = chosenExpenseCodes(after, products);
  for (let i = 0; i < elegidas.length; i += 30) {
    const accSnap = await db.collection(`companies/${companyId}/chart_of_accounts`)
      .where('code', 'in', elegidas.slice(i, i + 30)).get();
    for (const d of accSnap.docs) {
      const c = d.data();
      if (c.allowsMovement === true && c.isActive !== false) expenseNames.set(String(c.code), String(c.name ?? c.code));
    }
  }
  const malas = elegidas.filter((c) => !expenseNames.has(c));
  if (malas.length) {
    await purchaseRef.update({
      accountingError: `Cuenta de la línea o del artículo inexistente, inactiva o agrupadora: ${malas.join(', ')}`,
      updatedAt: now,
    });
    return { created: false, reason: 'bad_accounts' };
  }

  const ref      = after.fullNumber ?? purchaseId;
  const supplier = after.supplierName ?? 'Proveedor';

  const trato = purchaseVatTreatment((after as Record<string, any>).sriSustentoCode);
  if (!trato.known && Number((after as Record<string, any>).totalTax ?? 0) > 0) {
    logger.warn('[generateJournalEntryFromPurchase] Sustento vacío o fuera de la tabla 5: el IVA va a crédito tributario',
      { companyId, purchaseId, sriSustentoCode: (after as Record<string, any>).sriSustentoCode ?? null });
  }

  const companyMapping = await getAccountMapping(companyId);
  const built = buildPurchaseEntryLines(after, products, {
    inventory:       companyMapping.inventory,
    purchaseExpense: companyMapping.purchaseExpense,
    ivaCredit:       PURCHASE_FIXED_ACCOUNTS.ivaCredit,
    accountsPayable: PURCHASE_FIXED_ACCOUNTS.accountsPayable,
  }, expenseNames);

  const entryLines: JournalEntryLine[] = built.map((l) => ({
    id:             crypto.randomUUID(),
    ...l,
    costCenterId:   after.costCenterId ?? null,
    costCenterName: after.costCenterName ?? null,
  }));

  const totalDebit  = round2(entryLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(entryLines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  if (!isBalanced) {
    // No se guarda un asiento descuadrado: se deja accountingError visible en
    // el documento, en vez de contabilizar en silencio con débito ≠ crédito.
    logger.error('[generateJournalEntryFromPurchase] Asiento descuadrado — NO se crea:', { totalDebit, totalCredit, purchaseId });
    await purchaseRef.update({
      accountingError: `Asiento descuadrado: débito ${totalDebit} vs crédito ${totalCredit}`,
      updatedAt: now,
    });
    return { created: false, reason: 'unbalanced' };
  }

  const key        = `journal_${periodYear}`;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  const entryRef   = db.collection(`companies/${companyId}/journal_entries`).doc();

  const created = await db.runTransaction(async (tx) => {
    const [fresh, counter] = await Promise.all([tx.get(purchaseRef), tx.get(counterRef)]);
    if (fresh.get('accountingEntryId')) return false;
    const number = ((counter.data()?.[key] as number) ?? 0) + 1;
    tx.set(counterRef, { [key]: number }, { merge: true });
    tx.set(entryRef, {
      number,
      date:        admin.firestore.Timestamp.fromDate(fecha),
      description: `Compra ${ref} — ${supplier}`,
      periodId,
      periodYear,
      type:        'automatic',
      status:      'posted',
      reference:   ref,
      referenceId: purchaseId,
      lines:       entryLines,
      accountCodes: [...new Set(entryLines.map((l) => l.accountCode))],
      totalDebit,
      totalCredit,
      isBalanced,
      createdBy:   'system',
      createdAt:   now,
      updatedAt:   now,
    });
    tx.update(purchaseRef, {
      accountingEntryId: entryRef.id,
      accountingError:   admin.firestore.FieldValue.delete(),
      updatedAt:         now,
    });
    return true;
  });

  return created ? { created: true, entryId: entryRef.id } : { created: false, reason: 'already_exists' };
}

export const generateJournalEntryFromPurchase = onDocumentWritten(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists
      ? event.data.before.data() as PurchaseDoc
      : undefined;
    const after = event.data.after.data() as PurchaseDoc;

    // Trigger: stockProcessed just became true (after onPurchaseReceive) and no entry yet
    const stockJustProcessed = !before?.stockProcessed && after.stockProcessed === true;
    if (!stockJustProcessed || after.accountingEntryId) return;

    const { companyId, purchaseId } = event.params;
    logger.info('[generateJournalEntryFromPurchase] Creando asiento para compra:', purchaseId, 'empresa:', companyId);
    try {
      const r = await generateJournalEntryFromPurchaseInternal(companyId, purchaseId);
      if (r.created) logger.info('[generateJournalEntryFromPurchase] Asiento creado:', r.entryId);
      else logger.warn('[generateJournalEntryFromPurchase] No se generó asiento:', r.reason, purchaseId);
    } catch (err) {
      logger.error('[generateJournalEntryFromPurchase] Error:', err);
    }
  }
);
