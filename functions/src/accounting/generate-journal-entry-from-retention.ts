import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetentionTax {
  id: string;
  taxCode: string;        // '1'=IR, '2'=IVA
  taxCodeName: string;
  pctCode: string;
  pctName: string;
  rate: number;
  taxableBase: number;
  retainedAmount: number;
}

interface RetentionDoc {
  status: string;
  sriStatus?: string;
  fullNumber: string;
  date: admin.firestore.Timestamp;
  supplierId?: string;
  supplierName: string;
  supplierTaxId: string;
  taxes: RetentionTax[];
  totalRetained: number;
  fiscalYear: string;
  supportDocNumber: string;
  accountingEntryId?: string;
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

// ─── Default account mapping for retention journal entries ────────────────────

const DEFAULT_ACCOUNTS = {
  accountsPayable:  { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' },
  retIrPayable:     { code: '2.1.04.003', name: 'Retenciones IR por Pagar' },
  retIvaPayable:    { code: '2.1.04.002', name: 'Retenciones IVA por Pagar' },
  ivaDebit:         { code: '1.1.05.001', name: 'IVA en Compras' },
  expenses:         { code: '5.2.01.014', name: 'Honorarios Profesionales' },
};

function round2(n: number): number { return Math.round(n * 100) / 100; }

function buildRetentionLines(retention: RetentionDoc, accounts: typeof DEFAULT_ACCOUNTS): JournalEntryLine[] {
  const lines: JournalEntryLine[] = [];

  for (const tax of (retention.taxes ?? [])) {
    // Debit: Accounts Payable (reduce the amount owed by the retention)
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.accountsPayable.code,
      accountName:   accounts.accountsPayable.name,
      debit:         round2(tax.retainedAmount),
      credit:        0,
      costCenterId:  null,
      costCenterName:null,
      description:   `Retención ${tax.taxCodeName} ${tax.pctCode} — ${retention.supplierName}`
    });

    // Credit: Retention payable account
    const retAccount = tax.taxCode === '2' ? accounts.retIvaPayable : accounts.retIrPayable;
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   retAccount.code,
      accountName:   retAccount.name,
      debit:         0,
      credit:        round2(tax.retainedAmount),
      costCenterId:  null,
      costCenterName:null,
      description:   `${tax.taxCodeName} ${tax.rate}% — Ret. ${retention.fullNumber}`
    });
  }

  return lines;
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const generateJournalEntryFromRetention = onDocumentUpdated(
  'companies/{companyId}/retentions/{retentionId}',
  async (event) => {
    const before = event.data?.before.data() as RetentionDoc | undefined;
    const after  = event.data?.after.data()  as RetentionDoc | undefined;
    if (!before || !after) return;

    // Trigger when retention is issued (status: issued) and not already processed
    const statusChangedToIssued = before.status !== 'issued' && after.status === 'issued';
    const entryAlreadyCreated   = !!after.accountingEntryId;

    if (!statusChangedToIssued || entryAlreadyCreated) return;

    const { companyId, retentionId } = event.params;
    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    console.log('[generateJournalEntryFromRetention] Creando asiento para retención:', retentionId, 'empresa:', companyId);

    try {
      // Resolve active accounting period for the retention year
      const retYear = parseInt(after.fiscalYear ?? new Date().getFullYear().toString());
      const periodsSnap = await db
        .collection(`companies/${companyId}/accounting_periods`)
        .where('year', '==', retYear)
        .where('status', '==', 'open')
        .limit(1)
        .get();

      if (periodsSnap.empty) {
        console.warn('[generateJournalEntryFromRetention] No hay período contable abierto para el año', retYear);
        return;
      }

      const periodId   = periodsSnap.docs[0].id;
      const periodYear = retYear;

      // Get next journal entry number (atomic)
      const key        = `journal_${periodYear}`;
      const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
      let entryNumber  = 1;

      await db.runTransaction(async tx => {
        const counterSnap = await tx.get(counterRef);
        const current     = (counterSnap.data()?.[key] as number) ?? 0;
        entryNumber       = current + 1;
        tx.set(counterRef, { [key]: entryNumber }, { merge: true });
      });

      const accounts = DEFAULT_ACCOUNTS;
      const lines    = buildRetentionLines(after, accounts);

      if (lines.length === 0) {
        console.warn('[generateJournalEntryFromRetention] Retención sin impuestos — no se crea asiento.');
        return;
      }

      const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0));
      const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
      const isBalanced  = totalDebit === totalCredit;

      if (!isBalanced) {
        console.error('[generateJournalEntryFromRetention] Asiento descuadrado:', { totalDebit, totalCredit });
      }

      // Create journal entry
      const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
      const entry = {
        number:      entryNumber,
        date:        after.date ?? now,
        description: `Retención ${after.fullNumber} — ${after.supplierName} (Doc: ${after.supportDocNumber})`,
        periodId,
        periodYear,
        type:        'automatic',
        status:      'posted',
        reference:   after.fullNumber,
        referenceId: retentionId,
        lines,
        totalDebit,
        totalCredit,
        isBalanced,
        createdBy:   'system',
        createdAt:   now,
        updatedAt:   now
      };

      await entryRef.set(entry);

      // Back-reference on the retention
      await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
        accountingEntryId: entryRef.id,
        updatedAt:         now
      });

      console.log('[generateJournalEntryFromRetention] Asiento creado:', entryRef.id, 'balanceado:', isBalanced);

    } catch (err) {
      console.error('[generateJournalEntryFromRetention] Error:', err);
    }
  }
);
