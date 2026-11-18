/**
 * payroll-posting.ts — Piezas con Firestore que comparten el pago de roles y
 * los anticipos a empleados: de qué cuenta sale el dinero, el asiento con la
 * forma de los de nómina (source 'payroll') y su reversa.
 *
 * La reversa va en dos tiempos porque una transacción lee todo antes de
 * escribir: `prepareReversal` lee y valida, y devuelve la función que escribe.
 */

import * as admin from 'firebase-admin';
import { closedPeriodReversalError } from '../accounting/utils/closed-period';
import { invertLines, sumSide } from '../accounting/advances/advance-logic';
import { fail } from './payroll-auth';
import { readChart } from './payroll-compute';
import { MoneySource, CentsLine } from './payroll-payment-logic';
import { reversalDate } from './payroll-run-logic';

type Db = admin.firestore.Firestore;
type Tx = admin.firestore.Transaction;

export interface ResolvedSource {
  accountCode: string;
  accountName: string;
  /** Para mostrar: «Banco Pichincha ****1234» o «1.1.01.001 Caja». */
  label: string;
  bankAccountId: string | null;
  paymentMethodCode: string | null;
  chequeNumber: string | null;
}

/** La cuenta del Haber: la contable del banco o la elegida del plan. */
export async function resolveSource(db: Db, companyId: string, s: MoneySource): Promise<ResolvedSource> {
  if (s.mode === 'bank') {
    const snap = await db.doc(`companies/${companyId}/bank_accounts/${s.bankAccountId}`).get();
    if (!snap.exists) fail('La cuenta bancaria no existe.');
    if (snap.get('isActive') === false) fail('La cuenta bancaria está inactiva.');
    const code = String(snap.get('linkedGlCode') ?? '');
    if (!code) fail('La cuenta bancaria no tiene cuenta contable: configúrala en Cuentas bancarias.');
    const acct = String(snap.get('accountNumber') ?? '');
    return {
      accountCode: code,
      accountName: String(snap.get('linkedGlName') ?? code),
      label: `${snap.get('bankName') ?? ''}${acct ? ` ****${acct.slice(-4)}` : ''}`.trim().slice(0, 120),
      bankAccountId: s.bankAccountId,
      paymentMethodCode: s.paymentMethodCode,
      chequeNumber: s.chequeNumber || null,
    };
  }
  const c = (await readChart(db, companyId, [s.creditAccountCode])).get(s.creditAccountCode);
  if (!c) fail(`La cuenta ${s.creditAccountCode} no existe en el plan de cuentas.`);
  if (!c.isActive) fail(`La cuenta ${s.creditAccountCode} está inactiva.`);
  if (!c.allowsMovement) fail(`La cuenta ${s.creditAccountCode} es agrupadora: elige una de movimiento.`);
  return {
    accountCode: c.code, accountName: c.name, label: `${c.code} ${c.name}`.slice(0, 120),
    bankAccountId: null, paymentMethodCode: null, chequeNumber: null,
  };
}

/** Exige que cada cuenta exista, esté activa y admita movimientos. Devuelve los nombres. */
export async function requireMovementAccounts(db: Db, companyId: string, codes: string[], what: string) {
  const chart = await readChart(db, companyId, codes);
  for (const code of new Set(codes)) {
    const c = chart.get(code);
    const why = !c ? 'no existe en el plan de cuentas' : !c.isActive ? 'está inactiva'
      : !c.allowsMovement ? 'es agrupadora: no admite movimientos' : null;
    if (why) fail(`La cuenta ${code} ${what} ${why}.`);
  }
  return new Map([...chart].map(([k, v]) => [k, v.name]));
}

/** El ejercicio abierto del año, leído dentro de la transacción. */
export async function openPeriodIn(tx: Tx, db: Db, companyId: string, year: number): Promise<string> {
  const q = await tx.get(db.collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', year).where('status', '==', 'open').limit(1));
  if (q.empty) fail(`No hay un ejercicio contable abierto para ${year}.`);
  return q.docs[0].id;
}

/** El asiento con la forma de los de nómina (mismos campos que approvePayrollRun). */
export function payrollEntryDoc(p: {
  number: number; date: Date; description: string; periodId: string; periodYear: number;
  reference: string; referenceId: string; lines: CentsLine[]; names: Map<string, string>; label: string;
}) {
  const now = admin.firestore.Timestamp.now();
  const lines = p.lines.map((l) => ({
    id: crypto.randomUUID(), costCenterId: null, costCenterName: null,
    accountCode: l.accountCode, accountName: p.names.get(l.accountCode) ?? l.accountCode,
    debit: l.debitCents / 100, credit: l.creditCents / 100, description: p.label,
  }));
  const { debit, credit } = sumSide(lines);
  if (Math.abs(debit - credit) >= 0.005) fail('El asiento no cuadra: no se registró.');
  return {
    number: p.number, date: admin.firestore.Timestamp.fromDate(p.date), description: p.description.slice(0, 600),
    periodId: p.periodId, periodYear: p.periodYear, type: 'automatic', source: 'payroll', status: 'posted',
    reference: p.reference, referenceId: p.referenceId,
    lines, accountCodes: [...new Set(lines.map((l) => l.accountCode))],
    totalDebit: debit, totalCredit: credit, isBalanced: true,
    createdBy: 'system', createdAt: now, updatedAt: now,
  };
}

/**
 * Lee y valida la reversa de un asiento (existe, contabilizado, sin conciliar
 * y con el ejercicio abierto). Devuelve la función que la escribe.
 */
export async function prepareReversal(tx: Tx, db: Db, companyId: string, entryId: string, what: string) {
  const base = `companies/${companyId}`;
  if (!entryId || entryId.includes('/')) fail(`${what} no tiene asiento.`);
  const entryRef = db.doc(`${base}/journal_entries/${entryId}`);
  const journalCounter = db.doc(`${base}/counters/journal_entries`);
  const [entrySnap, reconciled, jc] = await Promise.all([
    tx.get(entryRef), tx.get(db.doc(`${base}/bank_reconciled_entries/${entryId}`)), tx.get(journalCounter),
  ]);
  if (reconciled.exists) fail(`El asiento de ${what.toLowerCase()} está conciliado con el banco: primero deshaz la conciliación.`);
  const entry = entrySnap.exists ? entrySnap.data() as Record<string, any> : null;
  if (!entry) fail(`El asiento de ${what.toLowerCase()} ya no existe.`);
  if (entry.status !== 'posted') fail(`El asiento de ${what.toLowerCase()} ya no está contabilizado.`);
  const periodSnap = entry.periodId ? await tx.get(db.doc(`${base}/accounting_periods/${entry.periodId}`)) : null;
  const closed = closedPeriodReversalError(periodSnap?.exists ? periodSnap.data() as any : null, entry.periodYear);
  if (closed) fail(closed);

  return (reason: string, uid: string, referenceId: string): string => {
    const now = admin.firestore.Timestamp.now();
    const periodYear = Number(entry.periodYear);
    const jKey = `journal_${periodYear}`;
    const n = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const revRef = db.collection(`${base}/journal_entries`).doc();
    const revLines = invertLines(entry.lines ?? []).map((l: any) => ({ ...l, id: crypto.randomUUID() }));
    const { debit, credit } = sumSide(revLines);
    const original = entry.date?.toDate ? entry.date.toDate() as Date : null;
    tx.set(journalCounter, { [jKey]: n }, { merge: true });
    tx.set(revRef, {
      number: n, date: admin.firestore.Timestamp.fromDate(reversalDate(periodYear, new Date(), original)),
      description: `[REVERSA] ${entry.description ?? ''} — ${reason}`.slice(0, 600),
      periodId: entry.periodId, periodYear, type: 'automatic', source: 'payroll', status: 'posted',
      reference: entry.reference ?? referenceId, referenceId, reversalOf: entryId,
      lines: revLines, accountCodes: [...new Set(revLines.map((l: any) => l.accountCode))],
      totalDebit: debit, totalCredit: credit, isBalanced: Math.abs(debit - credit) < 0.005,
      createdBy: 'system', createdAt: now, updatedAt: now,
    });
    tx.update(entryRef, {
      status: 'cancelled', reversalEntryId: revRef.id, cancelledAt: now, cancelledBy: uid,
      cancelReason: `${what} anulado: ${reason}`.slice(0, 600), updatedAt: now,
    });
    return revRef.id;
  };
}
