import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../utils/callable-auth';
import { BalanceEntry, sumAccountBalances } from './utils/entry-counts';

// ─── Callable: generateOpeningEntry ──────────────────────────────────────────
//
// Genera el asiento de apertura de un ejercicio contable a partir de los
// saldos finales de las cuentas de Balance General (grupos 1, 2 y 3) del
// período inmediatamente anterior (closed o locked).
//
// Called from Angular:
//   const fn = httpsCallable(functions, 'generateOpeningEntry');
//   await fn({ companyId, newPeriodId });

interface GenerateOpeningEntryInput {
  companyId:   string;
  newPeriodId: string;
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

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const generateOpeningEntry = onCall<GenerateOpeningEntryInput>(async (request) => {
  const { companyId, newPeriodId } = request.data;

  if (!companyId || !newPeriodId) {
    throw new HttpsError('invalid-argument', 'companyId y newPeriodId son requeridos');
  }

  // Abrir/generar la apertura de un ejercicio es admin-only (mismo criterio
  // que firestore.rules para accounting_periods) — este callable usa Admin
  // SDK y no pasa por esas reglas, hay que replicarlas aquí.
  requireCompanyRole(request, companyId, ['admin']);

  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Verify new period exists and is open without an opening entry already
  const newPeriodRef  = db.doc(`companies/${companyId}/accounting_periods/${newPeriodId}`);
  const newPeriodSnap = await newPeriodRef.get();

  if (!newPeriodSnap.exists) {
    throw new HttpsError('not-found', `Período no encontrado: ${newPeriodId}`);
  }

  const newPeriod = newPeriodSnap.data() as Record<string, any>;

  if (newPeriod['status'] !== 'open') {
    throw new HttpsError('failed-precondition', `El período destino no está abierto. Estado: ${newPeriod['status']}`);
  }

  if (newPeriod['openingEntryId']) {
    throw new HttpsError('already-exists', 'El período ya tiene un asiento de apertura generado');
  }

  // ── Reclamo atómico ──────────────────────────────────────────────────────
  // El chequeo de arriba es un get() simple; entre esa lectura y la escritura
  // final de `openingEntryId` (al final de esta función) hay una ventana
  // larga (agrega TODOS los asientos del período anterior). Un doble clic o
  // un reintento del SDK dispara dos ejecuciones que pasan ambos chequeos
  // antes de que ninguna termine — generando dos asientos de apertura
  // completos. Se reclama el período con un placeholder dentro de una
  // transacción para que solo una ejecución pueda avanzar.
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(newPeriodRef);
    const data = snap.data() as Record<string, any> | undefined;
    if (!data || data['status'] !== 'open' || data['openingEntryId']) return false;
    tx.update(newPeriodRef, { openingEntryId: '__generating__', updatedAt: now });
    return true;
  });

  if (!claimed) {
    throw new HttpsError('already-exists', 'El período ya tiene un asiento de apertura generado o en proceso.');
  }

  const newPeriodYear: number = newPeriod['year'];

  try {
  // Find the previous closed/locked period (year = newPeriodYear - 1)
  const prevPeriodsSnap = await db
    .collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', newPeriodYear - 1)
    .get();

  const prevPeriod = prevPeriodsSnap.docs.find(d => {
    const s = d.data()['status'];
    return s === 'closed' || s === 'locked';
  });

  if (!prevPeriod) {
    // No previous period — generate opening entry with zero balances (first year)
    // In this case just mark the period as having an "empty" opening entry
    console.log('[generateOpeningEntry] No hay período anterior cerrado para el año', newPeriodYear - 1,
      '— generando apertura vacía.');

    const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
    const key      = `journal_${newPeriodYear}`;
    const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
    let entryNumber = 1;

    await db.runTransaction(async tx => {
      const snap    = await tx.get(counterRef);
      const current = (snap.data()?.[key] as number) ?? 0;
      entryNumber   = current + 1;
      tx.set(counterRef, { [key]: entryNumber }, { merge: true });
    });

    await entryRef.set({
      number:      entryNumber,
      date:        newPeriod['startDate'] ?? now,
      description: `Asiento de Apertura — Ejercicio ${newPeriodYear}`,
      periodId:    newPeriodId,
      periodYear:  newPeriodYear,
      type:        'opening',
      status:      'posted',
      reference:   `Apertura ${newPeriodYear}`,
      referenceId: newPeriodId,
      lines:       [],
      totalDebit:  0,
      totalCredit: 0,
      isBalanced:  true,
      createdBy:   'system',
      createdAt:   now,
      updatedAt:   now
    });

    await newPeriodRef.update({ openingEntryId: entryRef.id, updatedAt: now });

    return { success: true, entryId: entryRef.id, message: 'Asiento de apertura vacío generado (primer ejercicio)' };
  }

  const prevPeriodId = prevPeriod.id;

  console.log('[generateOpeningEntry] Generando apertura para período:', newPeriodId,
    'basado en período anterior:', prevPeriodId);

  // Saldos de Balance General (grupos 1, 2 y 3) del período anterior.
  // Mismo criterio que el cierre (countsForBalances): cuentan los 'posted' y
  // los 'cancelled' con reversalEntryId. Se trae todo el período con una sola
  // igualdad (sin índice compuesto) y se filtra en memoria.
  const entriesSnap = await db
    .collection(`companies/${companyId}/journal_entries`)
    .where('periodId', '==', prevPeriodId)
    .get();

  const accountBalances = sumAccountBalances(
    entriesSnap.docs.map(d => d.data() as BalanceEntry),
    code => code.startsWith('1') || code.startsWith('2') || code.startsWith('3'),
  );

  // Build opening lines — invert: closing debits become opening debits, credits become credits
  // Net balances by nature:
  //   Group 1 (assets): debit nature → net = debit - credit > 0 → open with debit
  //   Groups 2/3 (liabilities/equity): credit nature → net = credit - debit > 0 → open with credit
  const openingLines: JournalEntryLine[] = [];

  for (const [code, bal] of accountBalances) {
    if (code.startsWith('1')) {
      const net = round2(bal.debit - bal.credit);
      if (Math.abs(net) < 0.01) continue;
      openingLines.push({
        id:            crypto.randomUUID(),
        accountCode:   code,
        accountName:   bal.name,
        debit:         net > 0 ? net : 0,
        credit:        net < 0 ? Math.abs(net) : 0,
        costCenterId:  null,
        costCenterName:null,
        description:   `Saldo inicial ${newPeriodYear}`
      });
    } else {
      // Groups 2 and 3
      const net = round2(bal.credit - bal.debit);
      if (Math.abs(net) < 0.01) continue;
      openingLines.push({
        id:            crypto.randomUUID(),
        accountCode:   code,
        accountName:   bal.name,
        debit:         net < 0 ? Math.abs(net) : 0,
        credit:        net > 0 ? net : 0,
        costCenterId:  null,
        costCenterName:null,
        description:   `Saldo inicial ${newPeriodYear}`
      });
    }
  }

  if (openingLines.length === 0) {
    throw new HttpsError('failed-precondition', 'No se encontraron saldos de Balance General en el período anterior');
  }

  const totalDebit  = round2(openingLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(openingLines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  if (!isBalanced) {
    console.error('[generateOpeningEntry] Asiento de apertura descuadrado:', { totalDebit, totalCredit });
    throw new HttpsError('internal', `Asiento de apertura descuadrado. Diferencia: ${round2(totalDebit - totalCredit)}`);
  }

  // Get next entry number for the new period year
  const key        = `journal_${newPeriodYear}`;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  let entryNumber  = 1;

  await db.runTransaction(async tx => {
    const snap    = await tx.get(counterRef);
    const current = (snap.data()?.[key] as number) ?? 0;
    entryNumber   = current + 1;
    tx.set(counterRef, { [key]: entryNumber }, { merge: true });
  });

  // Create opening journal entry
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  await entryRef.set({
    number:      entryNumber,
    date:        newPeriod['startDate'] ?? now,
    description: `Asiento de Apertura — Ejercicio ${newPeriodYear}`,
    periodId:    newPeriodId,
    periodYear:  newPeriodYear,
    type:        'opening',
    status:      'posted',
    reference:   `Apertura ${newPeriodYear}`,
    referenceId: newPeriodId,
    lines:       openingLines,
    totalDebit,
    totalCredit,
    isBalanced,
    createdBy:   'system',
    createdAt:   now,
    updatedAt:   now
  });

  // Link opening entry to the period
  await newPeriodRef.update({ openingEntryId: entryRef.id, updatedAt: now });

  console.log('[generateOpeningEntry] Asiento de apertura creado:', entryRef.id,
    'líneas:', openingLines.length, 'total débito:', totalDebit);

  return {
    success:    true,
    entryId:    entryRef.id,
    linesCount: openingLines.length,
    totalDebit,
    totalCredit,
    message:    `Asiento de apertura generado con ${openingLines.length} cuentas`
  };
  } catch (err) {
    // Liberar el reclamo: de lo contrario el período queda atascado en
    // openingEntryId='__generating__' para siempre y ni el usuario ni un
    // reintento pueden volver a generar la apertura.
    await newPeriodRef.update({
      openingEntryId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.Timestamp.now(),
    }).catch(() => {});
    throw err;
  }
});
