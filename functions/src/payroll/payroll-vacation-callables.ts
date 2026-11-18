/**
 * Vacaciones (registro de días, sin asiento; NOMINA_DECIMOS.md §vacaciones).
 *   getPayrollVacationBalance  saldo de días de un empleado
 *   registerPayrollVacation    registra un periodo gozado
 *   voidPayrollVacation        lo anula
 * `payrollVacations/{id}`: employeeId, employeeName, from, to, days, isAdvance,
 * status 'posted'|'voided', notes. Solo el servidor escribe.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { loadAllParameters } from './payroll-compute';
import { pickParameters } from './payroll-dates';
import { ecuadorToday } from './payroll-run-logic';
import { overlaps, vacationBalance, vacationProblem, validateVacationInput } from './payroll-vacation-logic';

type Db = admin.firestore.Firestore;

async function guard(request: any) {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  return { data, companyId, db, uid: request.auth?.uid ?? 'system', base: `companies/${companyId}` };
}

async function baseDaysAt(db: Db, iso: string): Promise<number> {
  const [y, m] = iso.split('-').map(Number);
  const p = pickParameters((await loadAllParameters(db)).map((x) => x.p), y, m);
  return Number(p?.vacation?.baseDays ?? 15);
}

async function balanceOf(db: Db, base: string, employeeId: string, asOf: string) {
  const emp = await db.doc(`${base}/payrollEmployees/${employeeId}`).get();
  if (!emp.exists) fail('El empleado no está en la nómina.');
  const taken = await db.collection(`${base}/payrollVacations`).where('employeeId', '==', employeeId).get();
  const live = taken.docs.filter((d) => d.get('status') === 'posted');
  const b = vacationBalance({
    hireDate: String(emp.get('hireDate') ?? asOf), priorServiceDays: Number(emp.get('priorServiceDays') ?? 0),
    asOf, baseDays: await baseDaysAt(db, asOf), takenDays: live.reduce((s, d) => s + Number(d.get('days') ?? 0), 0),
  });
  return { emp, live, b };
}

/** Entrada: {companyId, employeeId, asOf?}. Devuelve el saldo (VacationBalance). */
export const getPayrollVacationBalance = onCall(async (request) => {
  const { data, db, base } = await guard(request);
  const employeeId = readId(data, 'employeeId', 'el empleado');
  const asOf = typeof data.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.asOf) ? data.asOf : ecuadorToday(new Date());
  return (await balanceOf(db, base, employeeId, asOf)).b;
});

/**
 * Entrada: {companyId, employeeId, from, to, allowAdvance?, notes?}. El saldo
 * se mide a la fecha de salida. Devuelve {vacationId, days, balance}.
 */
export const registerPayrollVacation = onCall(async (request) => {
  const { data, db, uid, base } = await guard(request);
  const v = validateVacationInput(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const x = v.value;
  const baseDays = await baseDaysAt(db, x.from);
  const empRef = db.doc(`${base}/payrollEmployees/${x.employeeId}`);
  const mine = db.collection(`${base}/payrollVacations`).where('employeeId', '==', x.employeeId);
  const ref = db.collection(`${base}/payrollVacations`).doc();
  // En una transacción: dos registros simultáneos no se cruzan ni gastan el mismo saldo.
  return db.runTransaction(async (tx) => {
    const [emp, taken] = await Promise.all([tx.get(empRef), tx.get(mine)]);
    if (!emp.exists) fail('El empleado no está en la nómina.');
    if (emp.get('isActive') !== true) fail('El empleado está inactivo en la nómina.');
    const hireDate = String(emp.get('hireDate') ?? '');
    if (x.from < hireDate) fail('Las vacaciones no pueden ser antes del ingreso.');
    const live = taken.docs.filter((d) => d.get('status') === 'posted');
    const clash = live.find((d) => overlaps(x, { from: String(d.get('from')), to: String(d.get('to')) }));
    if (clash) fail(`Se cruza con otras vacaciones del ${clash.get('from')} al ${clash.get('to')}.`);
    const b = vacationBalance({
      hireDate, priorServiceDays: Number(emp.get('priorServiceDays') ?? 0), asOf: x.from, baseDays,
      takenDays: live.reduce((s, d) => s + Number(d.get('days') ?? 0), 0),
    });
    const problem = vacationProblem(b, x.days, x.allowAdvance);
    if (problem) fail(problem);
    const now = admin.firestore.Timestamp.now();
    tx.set(ref, {
      employeeId: x.employeeId, employeeName: String(emp.get('name') ?? ''), from: x.from, to: x.to, days: x.days,
      isAdvance: x.days > b.availableDays, status: 'posted', notes: x.notes, createdAt: now, createdBy: uid, updatedAt: now,
    });
    return { vacationId: ref.id, days: x.days, balance: { ...b, takenDays: b.takenDays + x.days, availableDays: b.availableDays - x.days } };
  });
});

/** Entrada: {companyId, vacationId, reason}. */
export const voidPayrollVacation = onCall(async (request) => {
  const { data, db, uid, base } = await guard(request);
  const id = readId(data, 'vacationId', 'las vacaciones');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  if (!reason) throw new HttpsError('invalid-argument', 'Escribe el motivo.');
  const ref = db.doc(`${base}/payrollVacations/${id}`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) fail('El registro no existe.');
    if (s.get('status') !== 'posted') fail('Ya está anulado.');
    const now = admin.firestore.Timestamp.now();
    tx.update(ref, { status: 'voided', voidReason: reason, voidedAt: now, voidedBy: uid, updatedAt: now });
    return { vacationId: id };
  });
});
