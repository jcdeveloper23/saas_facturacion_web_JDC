import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../../utils/callable-auth';
import { getAccountMapping } from '../utils/get-account-mapping';
import {
  AccountRef, ADVANCES_FROM_CUSTOMERS, advanceAvailableCents, advanceStatusFor, ecuadorYearOf, parseEcuadorDate, positiveCents,
} from './advance-logic';
import { ROLES, entryDoc, fail, openPeriodId, readCompanyId, readId, text } from './advance-callables';
import { ADVANCES_TO_SUPPLIERS } from './supplier-advance-logic';
import { REFUND_KIND, buildRefundLines, refundProblem } from './advance-refund-logic';

// ─── refundAdvance (2026-11-13) ───────────────────────────────────────────────

/**
 * Devuelve por el banco el saldo (o parte) de un anticipo, de cliente o de
 * proveedor. Entrada: {companyId, advanceId, amountCents, date: 'AAAA-MM-DD',
 * bankAccountId, chequeNumber?, reference?, notes?}. El movimiento, el saldo
 * del anticipo y el asiento van en UNA transacción. Se deshace con
 * unapplyAdvance (el id del movimiento).
 */
export const refundAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  const advanceId = readId(data, 'advanceId', 'el anticipo');
  const amountCents = positiveCents(data.amountCents);
  if (amountCents === null) throw new HttpsError('invalid-argument', 'El valor a devolver tiene que ser mayor que cero.');
  const date = parseEcuadorDate(data.date);
  if (!date) throw new HttpsError('invalid-argument', 'La fecha va como AAAA-MM-DD.');
  const year = ecuadorYearOf(date);

  const bankAccountId = readId(data, 'bankAccountId', 'la cuenta bancaria');
  const bankSnap = await db.doc(`companies/${companyId}/bank_accounts/${bankAccountId}`).get();
  if (!bankSnap.exists) throw new HttpsError('invalid-argument', 'La cuenta bancaria no existe.');
  const bankGl = String(bankSnap.get('linkedGlCode') ?? '');
  if (!bankGl) fail('La cuenta bancaria no tiene cuenta contable: configúrala en Cuentas bancarias.');
  const bank: AccountRef = { code: bankGl, name: String(bankSnap.get('linkedGlName') ?? bankGl) };
  const acct = String(bankSnap.get('accountNumber') ?? '');
  const bankName = text(`${bankSnap.get('bankName') ?? ''}${acct ? ` ****${acct.slice(-4)}` : ''}`, 120);

  const mapping = await getAccountMapping(companyId);
  const advanceRef = db.doc(`companies/${companyId}/advances/${advanceId}`);
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);
  const refundRef = db.collection(`companies/${companyId}/advanceApplications`).doc();
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();

  return db.runTransaction(async (tx) => {
    const advSnap = await tx.get(advanceRef);
    if (!advSnap.exists) throw new HttpsError('not-found', 'El anticipo no existe.');
    const adv = advSnap.data() as Record<string, any>;
    const periodId = await openPeriodId(tx, db, companyId, year);
    const jc = await tx.get(journalCounter);

    const problem = refundProblem(adv, amountCents, date);
    if (problem) fail(problem);
    const isSupplier = adv.partyType === 'supplier';
    const advancesAcc: AccountRef = adv.advancesAccount?.code ? adv.advancesAccount
      : isSupplier ? (mapping.advancesToSuppliers ?? ADVANCES_TO_SUPPLIERS)
        : (mapping.advancesFromCustomers ?? ADVANCES_FROM_CUSTOMERS);

    const jKey = `journal_${year}`;
    const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const label = `Devolución anticipo ${adv.number ?? advanceId} — ${adv.partyName ?? ''}`.trim();
    const now = admin.firestore.Timestamp.now();

    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
    tx.set(entryRef, entryDoc({
      number: entryNumber, date, description: label, periodId, periodYear: year,
      reference: `${adv.number ?? advanceId} → devolución`, referenceId: refundRef.id,
      lines: buildRefundLines(adv.partyType, amountCents, bank, advancesAcc, label),
    }));
    tx.set(refundRef, {
      kind: REFUND_KIND,
      advanceId,
      advanceNumber: adv.number ?? '',
      partyType: adv.partyType ?? 'customer',
      partyName: adv.partyName ?? '',
      partyTaxId: adv.partyTaxId ?? '',
      targetType: 'bank',
      targetId: bankAccountId,
      targetNumber: bankName,
      bankAccountId,
      bankAccountName: bankName,
      chequeNumber: text(data.chequeNumber, 30) || null,
      reference: text(data.reference, 120),
      notes: text(data.notes, 500),
      amountCents,
      date: admin.firestore.Timestamp.fromDate(date),
      fiscalYear: String(year),
      status: 'applied',
      isVoid: false,
      accountingEntryId: entryRef.id,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    const refunded = Number(adv.refundedCents ?? 0) + amountCents;
    const available = advanceAvailableCents({ ...adv, refundedCents: refunded });
    tx.update(advanceRef, {
      refundedCents: refunded,
      availableCents: available,
      status: advanceStatusFor(available),
      updatedAt: now,
      updatedBy: uid,
    });
    return { refundId: refundRef.id, entryId: entryRef.id, availableCents: available };
  });
});
