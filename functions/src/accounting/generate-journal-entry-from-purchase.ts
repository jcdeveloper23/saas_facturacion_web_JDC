import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { getAccountMapping } from './utils/get-account-mapping';
import {
  ProductKind, buildPurchaseEntryLines, chosenExpenseCodes, purchaseAccountingDate,
} from './utils/purchase-entry';

// ─── Asiento automático al recibir una compra ──────────────────────────────────
//
// Trigger: onDocumentWritten en purchases cuando stockProcessed cambia a true
// (disparado por onPurchaseReceive luego de actualizar el stock).
//
// Asiento generado (detalle y por qué en utils/purchase-entry.ts):
//   DÉBITO  Inventario (mapeo)        = líneas de artículos con stock
//   DÉBITO  Gasto de cada línea       = las demás (cuenta elegida o mapeo purchaseExpense)
//   DÉBITO  1.1.05.001  IVA en Compras = totalTax
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

export const generateJournalEntryFromPurchase = onDocumentWritten(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists
      ? event.data.before.data() as PurchaseDoc
      : undefined;
    const after = event.data.after.data() as PurchaseDoc;

    const { companyId, purchaseId } = event.params;

    // Trigger: stockProcessed just became true (after onPurchaseReceive) and no entry yet
    const stockJustProcessed = !before?.stockProcessed && after.stockProcessed === true;
    if (!stockJustProcessed || after.accountingEntryId) return;

    logger.info('[generateJournalEntryFromPurchase] Creando asiento para compra:', purchaseId, 'empresa:', companyId);

    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
      // Año y fecha contables: los de la factura del proveedor (hora de Ecuador),
      // no los de hoy. Antes tomaba el año en curso.
      const fecha      = purchaseAccountingDate(after) ?? now.toDate();
      const periodYear = new Date(fecha.getTime() - 5 * 3600 * 1000).getUTCFullYear();

      const periodsSnap = await db
        .collection(`companies/${companyId}/accounting_periods`)
        .where('year',   '==', periodYear)
        .where('status', '==', 'open')
        .limit(1)
        .get();

      if (periodsSnap.empty) {
        logger.warn('[generateJournalEntryFromPurchase] No hay período contable abierto para el año', periodYear);
        await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
          accountingError: `No hay ejercicio ${periodYear} abierto: la compra no se contabilizó.`,
          updatedAt: now,
        });
        return;
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
        const snap = await db.collection(`companies/${companyId}/chart_of_accounts`)
          .where('code', 'in', elegidas.slice(i, i + 30)).get();
        for (const d of snap.docs) {
          const c = d.data();
          if (c.allowsMovement === true && c.isActive !== false) expenseNames.set(String(c.code), String(c.name ?? c.code));
        }
      }
      const malas = elegidas.filter((c) => !expenseNames.has(c));
      if (malas.length) {
        await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
          accountingError: `Cuenta de gasto inexistente, inactiva o agrupadora: ${malas.join(', ')}`,
          updatedAt: now,
        });
        return;
      }

      const ref      = after.fullNumber ?? purchaseId;
      const supplier = after.supplierName ?? 'Proveedor';

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
        // No se guarda un asiento descuadrado. No hay callable de
        // regeneración manual para compras (a diferencia de invoice/credit
        // note/debit note/retention) — se deja accountingError visible en
        // el documento para que soporte lo detecte, en vez de contabilizar
        // en silencio con débito ≠ crédito.
        logger.error('[generateJournalEntryFromPurchase] Asiento descuadrado — NO se crea:', { totalDebit, totalCredit, purchaseId });
        await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
          accountingError: `Asiento descuadrado: débito ${totalDebit} vs crédito ${totalCredit}`,
          updatedAt: now,
        });
        return;
      }

      // Get next entry number (atomic)
      const key        = `journal_${periodYear}`;
      const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
      let entryNumber  = 1;

      await db.runTransaction(async tx => {
        const snap    = await tx.get(counterRef);
        const current = (snap.data()?.[key] as number) ?? 0;
        entryNumber   = current + 1;
        tx.set(counterRef, { [key]: entryNumber }, { merge: true });
      });

      const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
      await entryRef.set({
        number:      entryNumber,
        date:        admin.firestore.Timestamp.fromDate(fecha),
        description: `Compra ${ref} — ${supplier}`,
        periodId,
        periodYear,
        type:        'automatic',
        status:      'posted',
        reference:   ref,
        referenceId: purchaseId,
        lines:       entryLines,
        totalDebit,
        totalCredit,
        isBalanced,
        createdBy:   'system',
        createdAt:   now,
        updatedAt:   now
      });

      // Back-reference on the purchase
      await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
        accountingEntryId: entryRef.id,
        accountingError:   admin.firestore.FieldValue.delete(),
        updatedAt:         now
      });

      logger.info('[generateJournalEntryFromPurchase] Asiento creado:', entryRef.id, 'balanceado:', isBalanced);

    } catch (err) {
      logger.error('[generateJournalEntryFromPurchase] Error:', err);
    }
  }
);
