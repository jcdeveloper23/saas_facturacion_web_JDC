/**
 * Empleados y novedades de la nómina (PLAN_NOMINA.md §5.1, §5.4, E3).
 * Solo admin y contador de la empresa (requirePayrollRole) y con el módulo.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { employeeLimitDecision } from './payroll-limits';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { parsePeriod, validateEmployee, validateNovelty } from './payroll-run-logic';
import { INPUTS_SEQ_INCREMENT, stripUndefined } from './payroll-compute';

// ─── upsertPayrollEmployee ───────────────────────────────────────────────────

/**
 * Alta o edición de un empleado. Entrada: {companyId, personaId, employee:
 * {…}} (payroll_service.dart). El id es el de la persona, que tiene que estar
 * marcada como empleado en «Clientes y proveedores». Aplica el cupo
 * employeesTotal del plan (D-N9) y lleva el contador
 * `companies/{cid}.totalPayrollEmployeesActive`. Devuelve {employeeId, created}.
 */
export const upsertPayrollEmployee = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  const company = await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const personaId = readId(data, 'personaId', 'la persona');

  const v = validateEmployee(data.employee);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const e = v.value;

  const personaSnap = await db.doc(`companies/${companyId}/personas/${personaId}`).get();
  if (!personaSnap.exists) throw new HttpsError('not-found', 'La persona no existe en Clientes y proveedores.');
  const roles: unknown[] = personaSnap.get('roles') ?? [];
  if (!roles.includes('employee')) fail('Marca primero a la persona como Empleado en Clientes y proveedores.');
  if (e.groupId) {
    const g = await db.doc(`companies/${companyId}/payrollGroups/${e.groupId}`).get();
    if (!g.exists) throw new HttpsError('invalid-argument', 'El grupo de colaboradores no existe.');
  }

  const empRef = db.doc(`companies/${companyId}/payrollEmployees/${personaId}`);
  const companyRef = db.doc(`companies/${companyId}`);
  const activos = db.collection(`companies/${companyId}/payrollEmployees`).where('isActive', '==', true);

  return db.runTransaction(async (tx) => {
    // Leer la empresa en la transacción hace chocar dos altas simultáneas: la
    // segunda se reintenta y ya ve el conteo nuevo (el cupo no se pasa).
    const [snap, count] = await Promise.all([tx.get(empRef), tx.get(activos.count()), tx.get(companyRef)]);
    const before = snap.exists ? snap.data() as Record<string, any> : null;
    const wasActive = before ? before.isActive !== false : false;
    const current = count.data().count;
    // El cupo solo se mira al sumar un activo (alta o reactivación).
    if (e.isActive && !wasActive) {
      const d = employeeLimitDecision(company.planLimits, current);
      if (!d.allowed) fail(d.reason ?? 'El plan no permite más empleados en nómina.');
    }
    const now = admin.firestore.Timestamp.now();
    const history: any[] = Array.isArray(before?.salaryHistory) ? before!.salaryHistory : [];
    const salaryChanged = !before || Number(before.salaryCents) !== e.salaryCents;
    const todayIso = now.toDate().toISOString().slice(0, 10);
    tx.set(empRef, stripUndefined({
      personaId,
      ...e,
      // El nombre y la cédula salen de la persona, no de lo que llegue.
      name: String(personaSnap.get('legalName') || personaSnap.get('name') || e.name),
      taxId: String(personaSnap.get('taxId') ?? e.taxId),
      salaryHistory: salaryChanged
        ? [...history, { salaryCents: e.salaryCents, validFrom: before ? todayIso : e.hireDate, changedBy: uid }]
        : history,
      ...(before ? {} : { createdAt: now, createdBy: uid }),
      updatedAt: now,
      updatedBy: uid,
    }), { merge: true });
    const delta = (e.isActive ? 1 : 0) - (wasActive ? 1 : 0);
    tx.update(companyRef, { totalPayrollEmployeesActive: current + delta, payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { employeeId: personaId, created: !before };
  });
});

// ─── savePayrollNovelties ────────────────────────────────────────────────────

/**
 * Agrega o borra novedades de un mes. Entrada: {companyId, period: 'AAAA-MM',
 * add?: [{employeeId, type, qty | amountCents, accountCode?, note?}],
 * delete?: [noveltyId]}. Solo mientras el mes no tenga una nómina aprobada:
 * después hay que reversarla (§5.3). Devuelve {added, deleted}.
 */
export const savePayrollNovelties = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const p = parsePeriod(data.period);
  if (!p) throw new HttpsError('invalid-argument', 'El mes tiene que ser AAAA-MM.');

  const add: unknown[] = Array.isArray(data.add) ? data.add : [];
  const del: unknown[] = Array.isArray(data.delete) ? data.delete : [];
  if (!add.length && !del.length) throw new HttpsError('invalid-argument', 'No hay novedades que guardar.');
  if (add.length + del.length > 200) throw new HttpsError('invalid-argument', 'Como mucho 200 cambios a la vez.');
  const nuevas = add.map((n) => {
    const r = validateNovelty(n);
    if (!r.ok) throw new HttpsError('invalid-argument', r.error);
    return r.value;
  });
  const borrar = del.map((id) => {
    if (typeof id !== 'string' || !id || id.includes('/')) throw new HttpsError('invalid-argument', 'Novedad inválida.');
    return id;
  });

  const base = `companies/${companyId}`;
  const periodRef = db.doc(`${base}/payrollPeriods/${p.period}`);
  return db.runTransaction(async (tx) => {
    const periodSnap = await tx.get(periodRef);
    if (periodSnap.get('status') === 'approved') {
      fail('La nómina de este mes ya está aprobada: para cambiar novedades, revérsala primero.');
    }
    const empRefs = [...new Set(nuevas.map((n) => n.employeeId))].map((id) => db.doc(`${base}/payrollEmployees/${id}`));
    const emps = empRefs.length ? await tx.getAll(...empRefs) : [];
    for (const s of emps) if (!s.exists) fail('Una novedad es de un empleado que no está en la nómina.');
    const delRefs = borrar.map((id) => db.doc(`${base}/payrollNovelties/${id}`));
    const delSnaps = delRefs.length ? await tx.getAll(...delRefs) : [];
    for (const s of delSnaps) {
      if (s.exists && s.get('period') !== p.period) fail('Esa novedad es de otro mes.');
    }

    const now = admin.firestore.Timestamp.now();
    for (const n of nuevas) {
      const ref = db.collection(`${base}/payrollNovelties`).doc();
      tx.set(ref, {
        period: p.period, employeeId: n.employeeId, type: n.type,
        ...(n.qty !== null ? { qty: n.qty } : {}), ...(n.amountCents !== null ? { amountCents: n.amountCents } : {}),
        accountCode: n.accountCode, note: n.note, createdAt: now, createdBy: uid,
      });
    }
    delSnaps.forEach((s, i) => { if (s.exists) tx.delete(delRefs[i]); });
    // Un cálculo en curso queda viejo: crear, recalcular y aprobar lo detectan.
    // El borrador ya guardado se actualiza con «Recalcular».
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { added: nuevas.length, deleted: delSnaps.filter((s) => s.exists).length };
  });
});
