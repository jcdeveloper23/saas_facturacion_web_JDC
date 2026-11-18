/**
 * Grupos de colaboradores (D-N10) y préstamos con cuotas (D-N12)
 * (NOMINA_GRUPOS_PRESTAMOS.md, 2026-11-18). Solo admin y contador, con el módulo.
 *
 * Un grupo agrupa empleados y puede tener cuentas propias: al aprobar, cada
 * rol usa las de su grupo encima de las de la empresa (loadAccountsFor).
 * Un préstamo se descuenta solo en cada rol desde `startPeriod` hasta quedar
 * en cero; el saldo lo mueven approvePayrollRun y reversePayrollRun.
 * Toda alta o cambio sube `payrollInputsSeq`: un cálculo en curso lo detecta.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ecuadorYearOf } from '../accounting/advances/advance-logic';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { INPUTS_SEQ_INCREMENT, loadAccountsFor } from './payroll-compute';
import {
  cancelLoanPlan, duplicateGroupName, isIessLoan, loanNumber, validateGroupInput, validateLoanInput, validateLoanUpdate,
} from './payroll-loan-logic';
import { futureDateProblem } from './payroll-payment-logic';
import { openPeriodIn, payrollEntryDoc, prepareReversal, requireMovementAccounts, resolveSource } from './payroll-posting';

type Tx = admin.firestore.Transaction;

async function guard(request: any) {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  return { data, companyId, db, uid: request.auth?.uid ?? 'system', base: `companies/${companyId}` };
}

// ─── Grupos ──────────────────────────────────────────────────────────────────

/**
 * Alta o edición. Entrada: {companyId, groupId?, name, description?,
 * accounts?: {clave: código}, isActive?}. `accounts` reemplaza las cuentas
 * propias del grupo (vacías = usa las de la empresa). Devuelve {groupId, created}.
 */
export const upsertPayrollGroup = onCall(async (request) => {
  const { data, companyId, db, uid, base } = await guard(request);
  const v = validateGroupInput(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const g = v.value;
  const codes = Object.values(g.accounts).filter(Boolean) as string[];
  if (codes.length) await requireMovementAccounts(db, companyId, codes, 'del grupo');

  const col = db.collection(`${base}/payrollGroups`);
  const ref = g.groupId ? col.doc(g.groupId) : col.doc();
  return db.runTransaction(async (tx: Tx) => {
    const [self, all] = await Promise.all([tx.get(ref), tx.get(col.limit(500))]);
    if (g.groupId && !self.exists) fail('El grupo no existe.');
    if (duplicateGroupName(g.name, all.docs.map((d) => ({ id: d.id, name: String(d.get('name') ?? '') })), ref.id)) {
      fail(`Ya hay un grupo llamado «${g.name}».`);
    }
    const now = admin.firestore.Timestamp.now();
    tx.set(ref, {
      name: g.name, description: g.description, accounts: g.accounts, isActive: g.isActive,
      updatedAt: now, updatedBy: uid,
      // Sin merge, para que `accounts` se reemplace entero; la creación se conserva.
      createdAt: self.exists ? self.get('createdAt') ?? now : now,
      createdBy: self.exists ? self.get('createdBy') ?? uid : uid,
    });
    // Cambiar cuentas cambia el asiento de un borrador: que se recalcule.
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { groupId: ref.id, created: !self.exists };
  });
});

/** Borra un grupo sin empleados. Entrada: {companyId, groupId}. */
export const deletePayrollGroup = onCall(async (request) => {
  const { data, db, base } = await guard(request);
  const groupId = readId(data, 'groupId', 'el grupo');
  const used = await db.collection(`${base}/payrollEmployees`).where('groupId', '==', groupId).limit(1).get();
  if (!used.empty) fail('El grupo tiene empleados: cámbialos de grupo o desactívalo en vez de borrarlo.');
  const ref = db.doc(`${base}/payrollGroups/${groupId}`);
  if (!(await ref.get()).exists) fail('El grupo no existe.');
  await ref.delete();
  return { groupId };
});

// ─── Préstamos ───────────────────────────────────────────────────────────────

/**
 * Entrada: {companyId, employeeId, type, amountCents, balanceCents?,
 * installmentCents, startPeriod 'AAAA-MM', accountCode?, notes?,
 * disbursement?: {date, …origen del dinero, reference?}}. Con `disbursement`
 * (solo companyLoan y longTermAdvance) crea el asiento Debe préstamo / Haber
 * banco. Devuelve {loanId, number, entryId|null}.
 */
export const createPayrollLoan = onCall(async (request) => {
  const { data, companyId, db, uid, base } = await guard(request);
  const v = validateLoanInput(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const l = v.value;
  if (l.disbursement) {
    const future = futureDateProblem(l.disbursement.day, new Date());
    if (future) fail(future);
  }

  const empRef = db.doc(`${base}/payrollEmployees/${l.employeeId}`);
  const emp = await empRef.get();
  if (!emp.exists || emp.get('isActive') !== true) fail('El empleado no está activo en la nómina.');
  // La cuenta: la propia o la del concepto (grupo → empresa). Sin cuenta, el
  // rol no se podría aprobar: se exige ya.
  const accountsFor = await loadAccountsFor(db, companyId);
  const accts = accountsFor({ groupId: emp.get('groupId') ?? '', expenseGroup: emp.get('expenseGroup') } as any);
  // Misma caída que el asiento (payroll-entry.ts): anticipo a largo plazo → anticipos.
  const account = l.accountCode || accts[l.type] || (l.type === 'longTermAdvance' ? accts.advances : '');
  if (!account) {
    fail(isIessLoan(l.type)
      ? 'Elige la cuenta del préstamo (la deuda con el IESS) o configúrala en Cuentas de nómina.'
      : 'Elige la cuenta del préstamo o configúrala en Cuentas de nómina.');
  }
  const source = l.disbursement ? await resolveSource(db, companyId, l.disbursement.source) : null;
  if (source && source.accountCode === account) fail('La cuenta del préstamo no puede ser la misma de donde sale el dinero.');
  const names = await requireMovementAccounts(db, companyId, source ? [account, source.accountCode] : [account], 'del préstamo');

  const loanRef = db.collection(`${base}/payrollLoans`).doc();
  const entryRef = db.collection(`${base}/journal_entries`).doc();
  const journalCounter = db.doc(`${base}/counters/journal_entries`);
  const payrollCounter = db.doc(`${base}/counters/payroll`);
  const year = l.disbursement ? ecuadorYearOf(l.disbursement.date) : Number(l.startPeriod.slice(0, 4));

  return db.runTransaction(async (tx: Tx) => {
    const [jc, pc, empNow] = await Promise.all([tx.get(journalCounter), tx.get(payrollCounter), tx.get(empRef)]);
    if (!empNow.exists || empNow.get('isActive') !== true) fail('El empleado ya no está activo en la nómina.');
    const periodId = l.disbursement ? await openPeriodIn(tx, db, companyId, year) : '';
    const now = admin.firestore.Timestamp.now();
    const lKey = `loan_${year}`;
    const seq = ((pc.data()?.[lKey] as number) ?? 0) + 1;
    const number = loanNumber(year, seq);
    tx.set(payrollCounter, { [lKey]: seq }, { merge: true });

    let disbursement: Record<string, unknown> | null = null;
    if (l.disbursement && source) {
      const jKey = `journal_${year}`;
      const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
      const label = `Préstamo a empleado ${number}`; // sin nombre en el libro (§5.2)
      tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
      tx.set(entryRef, payrollEntryDoc({
        number: entryNumber, date: l.disbursement.date, description: label, periodId, periodYear: year,
        reference: number, referenceId: loanRef.id, names, label,
        lines: [
          { accountCode: account, debitCents: l.amountCents, creditCents: 0 },
          { accountCode: source.accountCode, debitCents: 0, creditCents: l.amountCents },
        ],
      }));
      disbursement = {
        date: l.disbursement.day, entryId: entryRef.id, paymentMode: l.disbursement.source.mode,
        bankAccountId: source.bankAccountId, sourceLabel: source.label, sourceAccountCode: source.accountCode,
        paymentMethodCode: source.paymentMethodCode, chequeNumber: source.chequeNumber, reference: l.disbursement.reference,
      };
    }
    tx.set(loanRef, {
      number, employeeId: l.employeeId, employeeName: String(empNow.get('name') ?? ''), type: l.type,
      amountCents: l.amountCents, balanceCents: l.balanceCents, installmentCents: l.installmentCents,
      startPeriod: l.startPeriod, accountCode: l.accountCode, status: 'active', notes: l.notes,
      disbursement, createdAt: now, createdBy: uid, updatedAt: now,
    });
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { loanId: loanRef.id, number, entryId: disbursement ? entryRef.id : null };
  });
});

/**
 * Cambia la cuota, el saldo (solo IESS) o las notas. Entrada: {companyId,
 * loanId, installmentCents?, balanceCents?, notes?}.
 */
export const updatePayrollLoan = onCall(async (request) => {
  const { data, db, uid, base } = await guard(request);
  const loanId = readId(data, 'loanId', 'el préstamo');
  const ref = db.doc(`${base}/payrollLoans/${loanId}`);
  return db.runTransaction(async (tx: Tx) => {
    const snap = await tx.get(ref);
    const v = validateLoanUpdate(snap.exists ? snap.data() : undefined, data);
    if (!v.ok) fail(v.error);
    const u = v.value;
    tx.update(ref, {
      ...(u.installmentCents !== null ? { installmentCents: u.installmentCents } : {}),
      ...(u.balanceCents !== null ? { balanceCents: u.balanceCents } : {}),
      ...(u.notes !== null ? { notes: u.notes } : {}),
      updatedAt: admin.firestore.Timestamp.now(), updatedBy: uid,
    });
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { loanId };
  });
});

/**
 * Deja de descontarse. Si tuvo entrega y no se descontó nada, reversa su
 * asiento. Entrada: {companyId, loanId, reason}. Devuelve {loanId, reversalEntryId|null}.
 */
export const cancelPayrollLoan = onCall(async (request) => {
  const { data, companyId, db, uid, base } = await guard(request);
  const loanId = readId(data, 'loanId', 'el préstamo');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  const ref = db.doc(`${base}/payrollLoans/${loanId}`);
  return db.runTransaction(async (tx: Tx) => {
    const snap = await tx.get(ref);
    const loan = snap.exists ? snap.data() as Record<string, any> : undefined;
    const plan = cancelLoanPlan(loan, reason);
    if (!plan.ok) fail(plan.error);
    const writeReversal = plan.value.reverseEntry
      ? await prepareReversal(tx, db, companyId, String(loan!.disbursement.entryId), 'El préstamo') : null;
    const now = admin.firestore.Timestamp.now();
    const reversalEntryId = writeReversal ? writeReversal(reason, uid, loanId) : null;
    tx.update(ref, {
      status: 'cancelled', cancelReason: reason, cancelledAt: now, cancelledBy: uid, updatedAt: now,
      ...(reversalEntryId ? { 'disbursement.reversalEntryId': reversalEntryId } : {}),
    });
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { loanId, reversalEntryId };
  });
});
