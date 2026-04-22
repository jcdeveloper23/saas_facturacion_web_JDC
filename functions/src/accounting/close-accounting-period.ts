import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// ─── Callable: closeAccountingPeriod ─────────────────────────────────────────
//
// Called from Angular:
//   const fn = httpsCallable(functions, 'closeAccountingPeriod');
//   await fn({ companyId, periodId });
//
// Creates the closing journal entry (cierre de resultados) and
// sets the period status to 'closed'.

interface CloseAccountingPeriodInput {
  companyId: string;
  periodId:  string;
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

const CLOSING_ACCOUNTS = {
  incomeGroup:    { code: '4', name: 'INGRESOS' },
  costsGroup:     { code: '5', name: 'COSTOS Y GASTOS' },
  netProfit:      { code: '3.3.02.001', name: 'Utilidad del Ejercicio' },
  netLoss:        { code: '3.3.02.002', name: 'Pérdida del Ejercicio' },
};

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const closeAccountingPeriod = onCall<CloseAccountingPeriodInput>(async (request) => {
  const { companyId, periodId } = request.data;

  if (!companyId || !periodId) {
    throw new HttpsError('invalid-argument', 'companyId y periodId son requeridos');
  }

  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Verify the period exists and is open
  const periodRef  = db.doc(`companies/${companyId}/accounting_periods/${periodId}`);
  const periodSnap = await periodRef.get();

  if (!periodSnap.exists) {
    throw new HttpsError('not-found', `Período no encontrado: ${periodId}`);
  }

  const period = periodSnap.data() as Record<string, any>;
  if (period['status'] !== 'open') {
    throw new HttpsError('failed-precondition', `El período no está abierto. Estado actual: ${period['status']}`);
  }

  const periodYear: number = period['year'];

  console.log('[closeAccountingPeriod] Cerrando período:', periodId, 'año:', periodYear, 'empresa:', companyId);

  // Aggregate income and expense balances for the period
  const entriesSnap = await db
    .collection(`companies/${companyId}/journal_entries`)
    .where('periodId', '==', periodId)
    .where('status',   '==', 'posted')
    .get();

  // Sum movements per account group
  const accountBalances = new Map<string, { code: string; name: string; debit: number; credit: number }>();

  for (const entryDoc of entriesSnap.docs) {
    const entry = entryDoc.data() as Record<string, any>;
    for (const line of (entry['lines'] ?? [])) {
      const code = line['accountCode'] as string;
      const existing = accountBalances.get(code) ?? { code, name: line['accountName'], debit: 0, credit: 0 };
      existing.debit  = round2(existing.debit  + (line['debit']  ?? 0));
      existing.credit = round2(existing.credit + (line['credit'] ?? 0));
      accountBalances.set(code, existing);
    }
  }

  // Separate income (code starts with '4') and expenses (code starts with '5')
  let totalIncome  = 0;
  let totalExpense = 0;

  const closingLines: JournalEntryLine[] = [];

  for (const [code, bal] of accountBalances) {
    if (code.startsWith('4')) {
      // Income accounts have credit balance — debit them to close
      const balance = round2(bal.credit - bal.debit);
      if (balance > 0) {
        closingLines.push({
          id:            crypto.randomUUID(),
          accountCode:   code,
          accountName:   bal.name,
          debit:         balance,
          credit:        0,
          costCenterId:  null,
          costCenterName:null,
          description:   `Cierre cuenta de ingreso ${periodYear}`
        });
        totalIncome = round2(totalIncome + balance);
      }
    } else if (code.startsWith('5')) {
      // Expense accounts have debit balance — credit them to close
      const balance = round2(bal.debit - bal.credit);
      if (balance > 0) {
        closingLines.push({
          id:            crypto.randomUUID(),
          accountCode:   code,
          accountName:   bal.name,
          debit:         0,
          credit:        balance,
          costCenterId:  null,
          costCenterName:null,
          description:   `Cierre cuenta de gasto ${periodYear}`
        });
        totalExpense = round2(totalExpense + balance);
      }
    }
  }

  // Add the net result line
  const netResult = round2(totalIncome - totalExpense);

  if (Math.abs(netResult) > 0.01) {
    if (netResult > 0) {
      // Profit: credit Utilidad del Ejercicio
      closingLines.push({
        id:            crypto.randomUUID(),
        accountCode:   CLOSING_ACCOUNTS.netProfit.code,
        accountName:   CLOSING_ACCOUNTS.netProfit.name,
        debit:         0,
        credit:        netResult,
        costCenterId:  null,
        costCenterName:null,
        description:   `Utilidad neta ejercicio ${periodYear}`
      });
    } else {
      // Loss: debit Pérdida del Ejercicio
      closingLines.push({
        id:            crypto.randomUUID(),
        accountCode:   CLOSING_ACCOUNTS.netLoss.code,
        accountName:   CLOSING_ACCOUNTS.netLoss.name,
        debit:         Math.abs(netResult),
        credit:        0,
        costCenterId:  null,
        costCenterName:null,
        description:   `Pérdida neta ejercicio ${periodYear}`
      });
    }
  }

  if (closingLines.length === 0) {
    console.log('[closeAccountingPeriod] Sin movimientos en el período — cerrando sin asiento de cierre.');
    await periodRef.update({
      status:   'closed',
      closedAt: now,
      closedBy: 'system',
      updatedAt: now
    });
    return { success: true, entryId: null, message: 'Período cerrado sin asiento de cierre (sin movimientos)' };
  }

  const totalDebit  = round2(closingLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(closingLines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  if (!isBalanced) {
    console.error('[closeAccountingPeriod] Asiento de cierre descuadrado:', { totalDebit, totalCredit });
    throw new HttpsError('internal', `Asiento de cierre descuadrado. Diferencia: ${round2(totalDebit - totalCredit)}`);
  }

  // Get next journal entry number
  const key        = `journal_${periodYear}`;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  let entryNumber  = 1;

  await db.runTransaction(async tx => {
    const counterSnap = await tx.get(counterRef);
    const current     = (counterSnap.data()?.[key] as number) ?? 0;
    entryNumber       = current + 1;
    tx.set(counterRef, { [key]: entryNumber }, { merge: true });
  });

  // Create closing journal entry
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  await entryRef.set({
    number:      entryNumber,
    date:        period['endDate'] ?? now,
    description: `Asiento de Cierre — Ejercicio ${periodYear}`,
    periodId,
    periodYear,
    type:        'closing',
    status:      'posted',
    reference:   `Cierre ${periodYear}`,
    referenceId: periodId,
    lines:       closingLines,
    totalDebit,
    totalCredit,
    isBalanced,
    createdBy:   'system',
    createdAt:   now,
    updatedAt:   now
  });

  // Update period: closed and link the closing entry
  await periodRef.update({
    status:         'closed',
    closedAt:        now,
    closedBy:        'system',
    closingEntryId:  entryRef.id,
    updatedAt:       now
  });

  console.log('[closeAccountingPeriod] Período cerrado. Asiento de cierre:', entryRef.id,
    'Ingresos:', totalIncome, 'Gastos:', totalExpense, 'Resultado:', netResult);

  return {
    success:      true,
    entryId:      entryRef.id,
    totalIncome,
    totalExpense,
    netResult,
    message:      `Período cerrado. Resultado neto: ${netResult >= 0 ? 'Utilidad' : 'Pérdida'} de ${Math.abs(netResult).toFixed(2)} USD`
  };
});
