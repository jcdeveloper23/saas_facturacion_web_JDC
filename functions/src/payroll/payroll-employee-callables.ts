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
import {
  PersonInput, existingPersonPatch, newPersonDoc, nextEmployeeCode, personName, sameIdCandidates, validatePersonInput,
} from './payroll-person-logic';

// ─── upsertPayrollEmployee ───────────────────────────────────────────────────

/**
 * Alta o edición de un colaborador. Entrada: {companyId, personaId?, person?,
 * employee: {…}}.
 *   · Alta como en el sistema actual (NOMINA_COLABORADOR.md §5): sin
 *     `personaId` y con `person` {taxIdType, taxId, firstNames, lastNames,
 *     email?, phone?, mobile?, position?}. Se busca la persona por
 *     identificación (también cédula + 001); si no existe se crea en
 *     Clientes y proveedores con el rol `employee`; si existe, gana el rol.
 *   · Alta con una persona ya creada, o edición: con `personaId`. En la
 *     edición, `person` actualiza nombres, contacto y cargo (la
 *     identificación no se cambia aquí).
 * El id del colaborador es el de la persona. Aplica el cupo employeesTotal
 * (D-N9) y lleva `companies/{cid}.totalPayrollEmployeesActive`.
 * Devuelve {employeeId, created, personaCreated}.
 */
export const upsertPayrollEmployee = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  const company = await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const givenId = typeof data.personaId === 'string' && data.personaId.trim() ? readId(data, 'personaId', 'la persona') : '';

  const v = validateEmployee(data.employee);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const e = v.value;
  const { profile: _profile, ...fields } = e;
  let person: PersonInput | null = null;
  if (data.person !== undefined && data.person !== null) {
    const pv = validatePersonInput(data.person);
    if (!pv.ok) throw new HttpsError('invalid-argument', pv.error);
    person = pv.value;
  }
  if (!givenId && !person) throw new HttpsError('invalid-argument', 'Faltan la identificación y los nombres del colaborador.');
  if (e.groupId) {
    const g = await db.doc(`companies/${companyId}/payrollGroups/${e.groupId}`).get();
    if (!g.exists) throw new HttpsError('invalid-argument', 'El grupo de colaboradores no existe.');
  }

  const base = `companies/${companyId}`;
  const personas = db.collection(`${base}/personas`);
  const companyRef = db.doc(base);
  const activos = db.collection(`${base}/payrollEmployees`).where('isActive', '==', true);
  const employeeCodes = personas.where('roles', 'array-contains', 'employee').limit(2000);

  return db.runTransaction(async (tx) => {
    // 1) La persona: la dada, la que ya tiene esa identificación o una nueva.
    let personaRef = givenId ? personas.doc(givenId) : null;
    let personaSnap = personaRef ? await tx.get(personaRef) : null;
    if (personaRef && !personaSnap!.exists) throw new HttpsError('not-found', 'La persona no existe en Clientes y proveedores.');
    if (!personaRef && person) {
      const found = await tx.get(personas.where('taxId', 'in', sameIdCandidates(person.taxId)).limit(1));
      if (!found.empty) { personaRef = found.docs[0].ref; personaSnap = found.docs[0]; }
    }
    const creatingPersona = !personaRef;
    if (!personaRef) personaRef = personas.doc();
    if (givenId && person && personaSnap!.exists) {
      const stored = String(personaSnap!.get('taxId') ?? '');
      if (stored && !sameIdCandidates(person.taxId).includes(stored)) {
        fail('La identificación no se cambia desde la nómina: corrígela en Clientes y proveedores.');
      }
    }
    if (givenId && !person) {
      const roles: unknown[] = personaSnap!.get('roles') ?? [];
      if (!roles.includes('employee')) fail('Marca primero a la persona como Empleado en Clientes y proveedores.');
    }
    const empRef = db.doc(`${base}/payrollEmployees/${personaRef.id}`);
    const needCode = creatingPersona || !personaSnap?.get('employeeData.code');
    const [snap, count, , codes] = await Promise.all([
      tx.get(empRef), tx.get(activos.count()), tx.get(companyRef), needCode ? tx.get(employeeCodes) : Promise.resolve(null),
    ]);
    const before = snap.exists ? snap.data() as Record<string, any> : null;
    // Alta sin personaId de alguien que ya está en la nómina: no se pisa su ficha.
    if (!givenId && before) {
      fail(`${String(before.name ?? 'Esa persona')} ya está en la nómina: búscalo en Colaboradores y edítalo.`);
    }
    const wasActive = before ? before.isActive !== false : false;
    const current = count.data().count;
    // El cupo solo se mira al sumar un activo (alta o reactivación).
    if (e.isActive && !wasActive) {
      const d = employeeLimitDecision(company.planLimits, current);
      if (!d.allowed) fail(d.reason ?? 'El plan no permite más empleados en nómina.');
    }
    const now = admin.firestore.Timestamp.now();
    const code = needCode ? nextEmployeeCode((codes?.docs ?? []).map((d) => d.get('employeeData.code'))) : '';
    if (creatingPersona) {
      tx.set(personaRef, newPersonDoc(person!, code, now));
    } else if (person) {
      const existing = personaSnap!.data() as Record<string, any>;
      const name = personName(person);
      tx.set(personaRef, stripUndefined({
        ...existingPersonPatch(existing, person, code, now),
        // En la edición desde la nómina, los nombres y el contacto también se actualizan.
        ...(givenId ? { name, legalName: name, firstNames: person.firstNames, lastNames: person.lastNames,
          ...(person.email ? { email: person.email } : {}), ...(person.phone ? { phone1: person.phone } : {}),
          ...(person.mobile ? { phone2: person.mobile } : {}) } : {}),
      }), { merge: true });
    }
    const pName = creatingPersona || (person && givenId) ? personName(person!)
      : String(personaSnap!.get('legalName') || personaSnap!.get('name') || e.name);
    const pTaxId = creatingPersona ? person!.taxId : String(personaSnap!.get('taxId') ?? e.taxId);

    const history: any[] = Array.isArray(before?.salaryHistory) ? before!.salaryHistory : [];
    const salaryChanged = !before || Number(before.salaryCents) !== e.salaryCents;
    const todayIso = now.toDate().toISOString().slice(0, 10);
    tx.set(empRef, stripUndefined({
      personaId: personaRef.id,
      ...fields,
      // La ficha (punto 4): solo los campos que vinieron; el resto se conserva (merge).
      ...e.profile,
      // El nombre y la cédula salen de la persona, no de lo que llegue.
      name: pName,
      taxId: pTaxId,
      ...(person ? { taxIdType: person.taxIdType, firstNames: person.firstNames, lastNames: person.lastNames } : {}),
      ...(person?.email && !e.email ? { email: person.email } : {}),
      salaryHistory: salaryChanged
        ? [...history, { salaryCents: e.salaryCents, validFrom: before ? todayIso : e.hireDate, changedBy: uid }]
        : history,
      ...(before ? {} : { createdAt: now, createdBy: uid }),
      updatedAt: now,
      updatedBy: uid,
    }), { merge: true });
    const delta = (e.isActive ? 1 : 0) - (wasActive ? 1 : 0);
    tx.update(companyRef, { totalPayrollEmployeesActive: current + delta, payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { employeeId: personaRef.id, created: !before, personaCreated: creatingPersona };
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
      // La de un anticipo registrado tiene asiento propio: se anula desde Anticipos.
      if (s.exists && s.get('advanceId')) fail('Ese anticipo tiene asiento: anúlalo desde Anticipos.');
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
