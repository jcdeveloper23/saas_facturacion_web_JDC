import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { getAccountMapping } from './utils/get-account-mapping';

// ─── Asiento automático al recibir una compra ──────────────────────────────────
//
// Trigger: onDocumentWritten en purchases cuando stockProcessed cambia a true
// (disparado por onPurchaseReceive luego de actualizar el stock).
//
// Asiento generado:
//   DÉBITO  1.1.03.001  Inventario de Mercaderías   = subtotal de líneas con stock
//   DÉBITO  1.1.05.001  IVA en Compras (crédito tributario) = IVA de la compra
//   CRÉDITO 2.1.01.001  Cuentas por Pagar Proveedores = total de la compra

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
      const fiscalYear = after.fiscalYear ?? new Date().getFullYear().toString();

      // Resolve open accounting period
      const periodsSnap = await db
        .collection(`companies/${companyId}/accounting_periods`)
        .where('year',   '==', parseInt(fiscalYear))
        .where('status', '==', 'open')
        .limit(1)
        .get();

      if (periodsSnap.empty) {
        logger.warn('[generateJournalEntryFromPurchase] No hay período contable abierto para el año', fiscalYear);
        return;
      }

      const periodDoc  = periodsSnap.docs[0];
      const periodId   = periodDoc.id;
      const periodYear = parseInt(fiscalYear);

      // Calculate inventory subtotal (only lines with stock tracking)
      const lines       = after.lines ?? [];
      const inventoryLines = lines.filter(l =>
        l.trackStock !== false && l.type !== 'service' && (l.qty ?? 0) > 0
      );

      const inventorySubtotal = round2(
        inventoryLines.reduce((s, l) => s + (l.subtotal ?? round2(l.qty * l.unitCost)), 0)
      );

      const ivaAmount = round2(after.vatAmount ?? 0);

      if (inventorySubtotal <= 0 && ivaAmount <= 0) {
        logger.info('[generateJournalEntryFromPurchase] Compra sin montos contabilizables — omitiendo.');
        return;
      }

      const ref      = after.fullNumber ?? purchaseId;
      const supplier = after.supplierName ?? 'Proveedor';

      // inventory account comes from company settings; payable/IVA are fixed standard codes
      const companyMapping = await getAccountMapping(companyId);
      const accounts = {
        inventory:       companyMapping.inventory,
        ivaCredit:       PURCHASE_FIXED_ACCOUNTS.ivaCredit,
        accountsPayable: PURCHASE_FIXED_ACCOUNTS.accountsPayable,
      };

      const entryLines: JournalEntryLine[] = [];

      // DÉBITO: Inventario
      if (inventorySubtotal > 0) {
        entryLines.push({
          id:            crypto.randomUUID(),
          accountCode:   accounts.inventory.code,
          accountName:   accounts.inventory.name,
          debit:         inventorySubtotal,
          credit:        0,
          costCenterId:  null,
          costCenterName:null,
          description:   `Compra ${ref} — ${supplier}`
        });
      }

      // DÉBITO: IVA en Compras (crédito tributario)
      if (ivaAmount > 0) {
        entryLines.push({
          id:            crypto.randomUUID(),
          accountCode:   accounts.ivaCredit.code,
          accountName:   accounts.ivaCredit.name,
          debit:         ivaAmount,
          credit:        0,
          costCenterId:  null,
          costCenterName:null,
          description:   `IVA compra ${ref}`
        });
      }

      // CRÉDITO: Cuentas por Pagar Proveedores
      const creditTotal = round2(inventorySubtotal + ivaAmount);
      entryLines.push({
        id:            crypto.randomUUID(),
        accountCode:   accounts.accountsPayable.code,
        accountName:   accounts.accountsPayable.name,
        debit:         0,
        credit:        creditTotal,
        costCenterId:  null,
        costCenterName:null,
        description:   `CxP: ${supplier} — ${ref}`
      });

      const totalDebit  = round2(entryLines.reduce((s, l) => s + l.debit,  0));
      const totalCredit = round2(entryLines.reduce((s, l) => s + l.credit, 0));
      const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

      if (!isBalanced) {
        logger.error('[generateJournalEntryFromPurchase] Asiento descuadrado:', { totalDebit, totalCredit });
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
        date:        after.date ?? now,
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
        updatedAt:         now
      });

      logger.info('[generateJournalEntryFromPurchase] Asiento creado:', entryRef.id, 'balanceado:', isBalanced);

    } catch (err) {
      logger.error('[generateJournalEntryFromPurchase] Error:', err);
    }
  }
);
