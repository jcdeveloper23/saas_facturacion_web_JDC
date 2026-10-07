import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../utils/callable-auth';
import { BalanceEntry, sumAccountBalances } from './utils/entry-counts';
import { buildClosingLines } from './utils/closing-entry';

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

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const closeAccountingPeriod = onCall<CloseAccountingPeriodInput>(async (request) => {
  const { companyId, periodId } = request.data;

  if (!companyId || !periodId) {
    throw new HttpsError('invalid-argument', 'companyId y periodId son requeridos');
  }

  // Cerrar un período es una acción admin-only (mismo criterio que
  // firestore.rules para accounting_periods) — este callable usa Admin SDK
  // y por tanto no pasa por esas reglas, hay que replicarlas aquí.
  requireCompanyRole(request, companyId, ['admin']);

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

  // Saldos de ingresos y gastos del período.
  // Se traen TODOS los asientos del período (una sola igualdad: no pide índice
  // compuesto) y se filtran en memoria con countsForBalances: cuentan los
  // 'posted' y los 'cancelled' con reversalEntryId, porque su reversa (posted,
  // mismo periodId) los neutraliza. Antes se filtraba status == 'posted' y la
  // reversa de una anulación entraba sin su original.
  const entriesSnap = await db
    .collection(`companies/${companyId}/journal_entries`)
    .where('periodId', '==', periodId)
    .get();

  const accountBalances = sumAccountBalances(
    entriesSnap.docs.map(d => d.data() as BalanceEntry),
  );

  const {
    lines: closingLines, totalIncome, totalExpense, netResult,
    totalDebit, totalCredit, isBalanced,
  } = buildClosingLines(accountBalances, periodYear);

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
