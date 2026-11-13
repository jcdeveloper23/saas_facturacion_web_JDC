import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../../utils/callable-auth';
import { getAccountMapping } from '../utils/get-account-mapping';
import { ACCOUNTS_PAYABLE, payableFromPurchaseEntry, purchasePendingCents } from '../cash-vouchers/cash-voucher-logic';
import { AccountRef, advanceAvailableCents, advanceStatusFor, ecuadorYearOf, parseEcuadorDate, positiveCents } from './advance-logic';
import {
  MAX_APPLICATIONS, ROLES, advanceRecord, entryDoc, fail, openPeriodId, readCompanyId, readId, text, toFirestore,
} from './advance-callables';
import {
  ADVANCES_TO_SUPPLIERS, buildSupplierApplicationLines, buildSupplierRegisterLines, purchasePatchFor,
  supplierAdvanceCounterKey, supplierAdvanceNumber, supplierApplicationProblem, validateSupplierRegister,
} from './supplier-advance-logic';

// ─── Anticipos a proveedores: callables (2026-11-13) ──────────────────────────
//
// El espejo de los anticipos de clientes (advance-callables.ts): cada
// operación escribe el anticipo, los acumulados (anticipo y compra) y su
// asiento en UNA transacción. Deshacer un cruce y anular un anticipo usan las
// mismas callables que los de clientes (unapplyAdvance, voidAdvance), que
// distinguen la compra por `targetType`.

type DocRef = admin.firestore.DocumentReference;

// ─── registerSupplierAdvance ──────────────────────────────────────────────────

/**
 * Registra un anticipo a un proveedor: el dinero que salió del banco antes de
 * su factura. Entrada: {companyId, partyId?, partyName, partyTaxId,
 * amountCents, date: 'AAAA-MM-DD', bankAccountId, paymentMethodCode?,
 * chequeNumber?, reference?, notes?}. Si `partyId` es una persona de la
 * empresa, el nombre y la identificación salen de ella.
 */
export const registerSupplierAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  let partyName = data.partyName;
  let partyTaxId = data.partyTaxId;
  const partyId = typeof data.partyId === 'string' && data.partyId.trim() && !data.partyId.includes('/')
    ? data.partyId.trim() : '';
  if (partyId) {
    const p = await db.doc(`companies/${companyId}/personas/${partyId}`).get();
    if (!p.exists) throw new HttpsError('invalid-argument', 'El proveedor elegido ya no existe.');
    partyName = p.get('legalName') || p.get('name') || partyName;
    partyTaxId = p.get('taxId') || partyTaxId;
  }
  const v = validateSupplierRegister({ partyName, partyTaxId, amountCents: data.amountCents, date: data.date });
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { amountCents, date } = v.value;
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
  const advancesAcc: AccountRef = mapping.advancesToSuppliers ?? ADVANCES_TO_SUPPLIERS;

  const advanceRef = db.collection(`companies/${companyId}/advances`).doc();
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);
  const advanceCounter = db.doc(`companies/${companyId}/counters/advances`);

  return db.runTransaction(async (tx) => {
    const periodId = await openPeriodId(tx, db, companyId, year);
    const [jc, ac] = await Promise.all([tx.get(journalCounter), tx.get(advanceCounter)]);
    const jKey = `journal_${year}`;
    const aKey = supplierAdvanceCounterKey(year);
    const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const seq = ((ac.data()?.[aKey] as number) ?? 0) + 1;
    const number = supplierAdvanceNumber(year, seq);
    const label = `Anticipo a proveedor ${number} — ${v.value.partyName}`;
    const now = admin.firestore.Timestamp.now();

    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
    tx.set(advanceCounter, { [aKey]: seq }, { merge: true });
    tx.set(entryRef, entryDoc({
      number: entryNumber, date, description: label, periodId, periodYear: year,
      reference: number, referenceId: advanceRef.id,
      lines: buildSupplierRegisterLines(amountCents, bank, advancesAcc, label),
    }));
    tx.set(advanceRef, advanceRecord({
      number, partyId: partyId || null, partyName: v.value.partyName, partyTaxId: v.value.partyTaxId,
      date, year, bankAccountId, bankAccountName: bankName,
      paymentMethodCode: text(data.paymentMethodCode, 2) || null,
      reference: text(data.reference, 120), notes: text(data.notes, 500),
      amountCents, advancesAccount: advancesAcc, entryId: entryRef.id, uid, now,
      extra: { partyType: 'supplier', chequeNumber: text(data.chequeNumber, 30) || null },
    }));
    return { advanceId: advanceRef.id, number, entryId: entryRef.id };
  });
});

// ─── applySupplierAdvance ─────────────────────────────────────────────────────

/**
 * Cruza un anticipo a proveedor con una o varias compras recibidas del mismo
 * proveedor. Entrada: {companyId, advanceId, date: 'AAAA-MM-DD',
 * applications: [{purchaseId, amountCents}]}. Un cruce y un asiento por
 * compra; la que queda sin saldo pasa a pagada (`paidBy: 'advances'`).
 */
export const applySupplierAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  const advanceId = readId(data, 'advanceId', 'el anticipo');
  const date = parseEcuadorDate(data.date);
  if (!date) throw new HttpsError('invalid-argument', 'La fecha va como AAAA-MM-DD.');
  const year = ecuadorYearOf(date);
  const raw = Array.isArray(data.applications) ? data.applications : [];
  if (raw.length === 0) throw new HttpsError('invalid-argument', 'Elige al menos una compra.');
  if (raw.length > MAX_APPLICATIONS) throw new HttpsError('invalid-argument', `Hasta ${MAX_APPLICATIONS} compras a la vez.`);
  const items: Array<{ purchaseId: string; amountCents: number | null }> = raw.map((x: any) => ({
    purchaseId: readId(x, 'purchaseId', 'la compra'),
    amountCents: positiveCents(x?.amountCents),
  }));
  if (items.some((i) => i.amountCents === null)) {
    throw new HttpsError('invalid-argument', 'Cada valor a cruzar tiene que ser mayor que cero.');
  }
  if (new Set(items.map((i) => i.purchaseId)).size !== items.length) {
    throw new HttpsError('invalid-argument', 'Una compra aparece dos veces.');
  }

  const advanceRef = db.doc(`companies/${companyId}/advances/${advanceId}`);
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);

  return db.runTransaction(async (tx) => {
    // Lecturas (todas antes de escribir).
    const advSnap = await tx.get(advanceRef);
    if (!advSnap.exists) throw new HttpsError('not-found', 'El anticipo no existe.');
    const adv = advSnap.data() as Record<string, any>;
    const pRefs = items.map((i) => db.doc(`companies/${companyId}/purchases/${i.purchaseId}`));
    const pSnaps = await Promise.all(pRefs.map((r: DocRef) => tx.get(r)));
    const docs = pSnaps.map((s) => (s.exists ? s.data() as Record<string, any> : undefined));
    const entrySnaps = await Promise.all(docs.map((d) => {
      const id = d?.accountingEntryId;
      return typeof id === 'string' && id ? tx.get(db.doc(`companies/${companyId}/journal_entries/${id}`)) : Promise.resolve(null);
    }));
    const retSnaps = await Promise.all(docs.map((d) => {
      const id = d?.retentionId;
      return typeof id === 'string' && id && !id.includes('/')
        ? tx.get(db.doc(`companies/${companyId}/retentions/${id}`)) : Promise.resolve(null);
    }));
    const periodId = await openPeriodId(tx, db, companyId, year);
    const jc = await tx.get(journalCounter);

    // Validaciones.
    const advancesAcc: AccountRef = adv.advancesAccount?.code ? adv.advancesAccount : ADVANCES_TO_SUPPLIERS;
    let used = 0;
    const plans = items.map((it, k) => {
      const p = docs[k];
      if (!p) fail('Una de las compras ya no existe.');
      const pending = purchasePendingCents(p, retSnaps[k]?.exists ? retSnaps[k]!.data() : null);
      const amountCents = it.amountCents as number;
      const problem = supplierApplicationProblem(adv, p, amountCents, date, pending, used);
      if (problem) fail(problem);
      used += amountCents;
      const payable = payableFromPurchaseEntry(entrySnaps[k]?.exists ? entrySnaps[k]!.get('lines') : undefined)
        ?? ACCOUNTS_PAYABLE;
      return { purchaseId: it.purchaseId, amountCents, p, ref: pRefs[k], pending, payable };
    });

    // Escrituras.
    const jKey = `journal_${year}`;
    let entryNumber = (jc.data()?.[jKey] as number) ?? 0;
    const now = admin.firestore.Timestamp.now();
    const out: Array<{ applicationId: string; purchaseId: string; entryId: string; paid: boolean }> = [];
    for (const pl of plans) {
      const appRef = db.collection(`companies/${companyId}/advanceApplications`).doc();
      const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
      entryNumber += 1;
      const pNumber = pl.p.fullNumber ?? pl.purchaseId;
      const label = `Cruce anticipo ${adv.number} con compra ${pNumber} — ${adv.partyName ?? ''}`.trim();
      tx.set(entryRef, entryDoc({
        number: entryNumber, date, description: label, periodId, periodYear: year,
        reference: `${adv.number} → ${pNumber}`, referenceId: appRef.id,
        lines: buildSupplierApplicationLines(pl.amountCents, advancesAcc, pl.payable, label),
      }));
      tx.set(appRef, {
        kind: 'application',
        advanceId,
        advanceNumber: adv.number ?? '',
        partyType: 'supplier',
        partyName: adv.partyName ?? '',
        partyTaxId: adv.partyTaxId ?? '',
        targetType: 'purchase',
        targetId: pl.purchaseId,
        targetNumber: pl.p.fullNumber ?? '',
        amountCents: pl.amountCents,
        date: admin.firestore.Timestamp.fromDate(date),
        fiscalYear: String(year),
        status: 'applied',
        isVoid: false,
        accountingEntryId: entryRef.id,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
      });
      const patch = purchasePatchFor(pl.p, appRef.id, pl.amountCents, pl.pending - pl.amountCents, date);
      tx.update(pl.ref, { ...toFirestore(patch), updatedAt: now, updatedBy: uid });
      out.push({ applicationId: appRef.id, purchaseId: pl.purchaseId, entryId: entryRef.id, paid: patch.isPaid === true });
    }
    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });

    const applied = Number(adv.appliedCents ?? 0) + used;
    const available = advanceAvailableCents({ ...adv, appliedCents: applied });
    tx.update(advanceRef, {
      appliedCents: applied,
      availableCents: available,
      applicationsCount: Number(adv.applicationsCount ?? 0) + plans.length,
      status: advanceStatusFor(available),
      updatedAt: now,
      updatedBy: uid,
    });
    return { applications: out, availableCents: available };
  });
});
