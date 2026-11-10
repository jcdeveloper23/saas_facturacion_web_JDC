/**
 * payroll-compute.ts — Junta lo que el cálculo necesita desde Firestore y
 * calcula la nómina de un mes (PLAN_NOMINA.md §4.3, §4.4, §5.1). Lo usan
 * createPayrollRun, recalculatePayrollRun y approvePayrollRun: los tres
 * calculan igual, con payroll-calc.ts.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { calculatePayslip, PayrollEmployeeDataError, PayrollParametersError } from './payroll-calc';
import { pickParameters } from './payroll-dates';
import { AccountsFor, DEFAULT_PAYROLL_ACCOUNTS, PayrollAccountKey } from './payroll-entry';
import { toEmployeeInput } from './payroll-run-logic';
import { PayrollLoanInput, PayrollNoveltyInput, PayrollParameters, PayslipResult } from './payroll-types';

type Db = admin.firestore.Firestore;

export interface ComputedPayslip {
  result: PayslipResult & { expenseGroup: 'admin' | 'sales'; groupId: string };
  employee: Record<string, any>;
  position: string;
}

export interface ComputedRun {
  params: PayrollParameters;
  parametersId: string;
  payslips: ComputedPayslip[];
  warnings: string[];
  blockingErrors: string[];
  /** `companies/{cid}.payrollInputsSeq` al empezar: si cambia, el cálculo quedó viejo. */
  inputsSeq: number;
}

/**
 * Cada cambio de novedades o empleados sube `payrollInputsSeq` en la empresa.
 * Crear, recalcular y aprobar leen el número antes de calcular y lo comparan
 * dentro de su transacción: un cambio hecho entretanto no se pierde.
 */
export const inputsSeqOf = (company: Record<string, any> | undefined) => Number(company?.payrollInputsSeq ?? 0);
export const INPUTS_SEQ_INCREMENT = () => admin.firestore.FieldValue.increment(1);

/** Tope de seguridad de lecturas por consulta; si se alcanza, se avisa en vez de cortar en silencio. */
const MAX_EMPLOYEES = 1000;

export async function loadAllParameters(db: Db): Promise<{ id: string; p: PayrollParameters }[]> {
  const snap = await db.collection('payrollParameters').get();
  return snap.docs.map((d) => ({ id: d.id, p: d.data() as PayrollParameters }));
}

/** Calcula los roles del mes. No escribe nada. */
export async function computeRun(db: Db, companyId: string, year: number, month: number): Promise<ComputedRun> {
  const all = await loadAllParameters(db);
  const params = pickParameters(all.map((x) => x.p), year, month);
  if (!params) {
    throw new HttpsError('failed-precondition',
      `No hay parámetros de nómina publicados y vigentes para ${String(month).padStart(2, '0')}/${year}.`);
  }
  const parametersId = all.find((x) => x.p === params)!.id;
  const base = `companies/${companyId}`;
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const firstDay = `${period}-01`;
  const lastDay = `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  const inputsSeq = inputsSeqOf((await db.doc(base).get()).data());

  // Activos, y también quien salió desde el inicio del mes (su último rol).
  // Dos consultas de un solo campo: sin índices compuestos.
  const emps = db.collection(`${base}/payrollEmployees`);
  const [activeSnap, leftSnap, novSnap, loanSnap] = await Promise.all([
    emps.where('isActive', '==', true).limit(MAX_EMPLOYEES).get(),
    emps.where('endDate', '>=', firstDay).limit(MAX_EMPLOYEES).get(),
    db.collection(`${base}/payrollNovelties`).where('period', '==', period).get(),
    db.collection(`${base}/payrollLoans`).where('status', '==', 'active').get(),
  ]);
  if (activeSnap.size >= MAX_EMPLOYEES || leftSnap.size >= MAX_EMPLOYEES) {
    throw new HttpsError('failed-precondition', `La nómina admite hasta ${MAX_EMPLOYEES - 1} empleados por ahora.`);
  }
  const byId = new Map([...activeSnap.docs, ...leftSnap.docs].map((d) => [d.id, d]));
  const employees = [...byId.values()];
  const novelties = novSnap.docs.map((d) => d.data() as PayrollNoveltyInput);
  const loans = loanSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollLoanInput));

  // El cargo sigue en la persona (D-N8).
  const personaRefs = employees.map((d) => db.doc(`${base}/personas/${d.id}`));
  const personas = personaRefs.length ? await db.getAll(...personaRefs) : [];
  const positionOf = new Map(personas.map((p) => [p.id, String(p.get('employeeData.position') ?? '')]));

  const payslips: ComputedPayslip[] = [];
  const warnings: string[] = [];
  const blockingErrors: string[] = [];
  for (const d of employees) {
    const data = d.data();
    try {
      const r = calculatePayslip({ params, year, month, employee: toEmployeeInput(d.id, data, lastDay), novelties, loans });
      if (!r) continue; // no trabajó en el mes
      warnings.push(...r.warnings);
      blockingErrors.push(...r.errors);
      payslips.push({
        result: { ...r, expenseGroup: (data.expenseGroup ?? 'admin'), groupId: String(data.groupId ?? '') },
        employee: data,
        position: positionOf.get(d.id) ?? '',
      });
    } catch (e) {
      if (e instanceof PayrollParametersError) throw new HttpsError('failed-precondition', e.message);
      if (e instanceof PayrollEmployeeDataError) { blockingErrors.push(e.message); continue; }
      throw e;
    }
  }
  return { params, parametersId, payslips, warnings, blockingErrors, inputsSeq };
}

/**
 * Las cuentas de cada rol: las de su grupo de colaboradores encima de las de
 * la empresa (`settings/accounting.payrollAccounts`) y, al final, las
 * sugeridas (D-N10, §5.2).
 */
export async function loadAccountsFor(db: Db, companyId: string): Promise<AccountsFor> {
  const base = `companies/${companyId}`;
  const [settings, groups] = await Promise.all([
    db.doc(`${base}/settings/accounting`).get(),
    db.collection(`${base}/payrollGroups`).get(),
  ]);
  const clean = (m: unknown) => Object.fromEntries(Object.entries((m ?? {}) as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, String(v).trim()]));
  const company = { ...DEFAULT_PAYROLL_ACCOUNTS, ...clean(settings.get('payrollAccounts')) } as Record<PayrollAccountKey, string>;
  const byGroup = new Map(groups.docs.map((g) => [g.id, { ...company, ...clean(g.get('accounts')) } as Record<PayrollAccountKey, string>]));
  return (p) => byGroup.get((p as any).groupId ?? '') ?? company;
}

/** Nombres y estado de las cuentas usadas (de 30 en 30, el tope de `in`). */
export async function readChart(db: Db, companyId: string, codes: string[]) {
  const out = new Map<string, { code: string; name: string; isActive: boolean; allowsMovement: boolean }>();
  const unique = [...new Set(codes)];
  for (let i = 0; i < unique.length; i += 30) {
    const snap = await db.collection(`companies/${companyId}/chart_of_accounts`)
      .where('code', 'in', unique.slice(i, i + 30)).get();
    for (const d of snap.docs) {
      const c = d.data();
      out.set(String(c.code), { code: String(c.code), name: String(c.name ?? c.code),
        isActive: c.isActive !== false, allowsMovement: c.allowsMovement !== false });
    }
  }
  return out;
}

/** Firestore no acepta `undefined` (qty, accountCode y loanId son opcionales en las líneas). */
export function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => stripUndefined(x)) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof admin.firestore.Timestamp)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined).map(([k, x]) => [k, stripUndefined(x)])) as T;
  }
  return v;
}

/** El documento del rol (payslips/{runId_employeeId}). Lo lee Conecta (payroll_run.dart). */
export function payslipDoc(p: {
  runId: string; period: string; c: ComputedPayslip; status: string; params: PayrollParameters;
  parametersId: string; now: admin.firestore.Timestamp;
}): Record<string, unknown> {
  const { result: r, employee: e } = p.c;
  return stripUndefined({
    runId: p.runId,
    period: p.period,
    employeeId: r.employeeId,
    status: p.status,
    employee: {
      name: e.name ?? '', taxId: e.taxId ?? '', email: e.email ?? '', iessNumber: e.iessNumber ?? '',
      position: p.c.position, region: e.region ?? 'sierra', expenseGroup: r.expenseGroup,
      salaryCents: e.salaryCents ?? 0, hireDate: e.hireDate ?? '',
    },
    workedDays: r.workedDays,
    taxableCents: r.taxableCents,
    earnings: r.earnings,
    deductions: r.deductions,
    employerCosts: r.employerCosts,
    provisions: r.provisions,
    netCents: r.netCents,
    warnings: r.warnings,
    errors: r.errors,
    loanBalances: r.loanBalances,
    // Cada rol guarda copia íntegra de los parámetros con que se calculó (§4.3).
    parametersId: p.parametersId,
    parametersSnapshot: p.params,
    emailSent: false,
    createdAt: p.now,
    updatedAt: p.now,
  });
}
