// ─── Libros y balances: cálculo puro ─────────────────────────────────────────
//
// Libro diario, libro mayor, balance de comprobación, estado de resultados y
// balance general calculados a partir de los asientos de un ejercicio
// (companies/{cid}/journal_entries). Es la misma lógica que usa Conecta
// (App_Web_Conectate, lib/features/accounting/ledger/ledger.dart), verificada
// al centavo con datos reales; las dos webs deben dar lo mismo.
//
// Todo en CENTAVOS enteros: con dobles, 0,10 + 0,20 no da 0,30 y un balance
// que cuadra se vería descuadrado por un céntimo fantasma.
//
// Qué asiento cuenta (countsForReports), igual que countsForBalances de
// functions/src/accounting/utils/entry-counts.ts (no se importa: el front no
// depende de functions):
//   - 'posted'                         → cuenta.
//   - 'cancelled' CON reversalEntryId  → cuenta: es la anulación automática; su
//                                        reversa ('posted', reversalOf) lo
//                                        neutraliza. Los dos salen en el diario.
//   - 'cancelled' sin reversalEntryId  → no cuenta (anulación manual, sin reversa).
//   - 'draft' o cualquier otro estado  → nunca.
//
// El asiento de apertura (type 'opening') va al saldo inicial. El estado de
// resultados excluye el asiento de cierre (type 'closing'). El signo de un saldo
// en los estados financieros sale del GRUPO de la cuenta (activo, costo y gasto
// deudores; pasivo, patrimonio e ingreso acreedores), así las contra-cuentas
// restan. En el libro mayor, el saldo se lleva con la NATURALEZA de la cuenta.
//
// Las fechas se comparan como días 'AAAA-MM-DD' (hora local).
//
// Sin dependencias de Angular ni de Firestore: se prueba aislado
// (ledger-reports.spec.ts).

import type { JournalEntry } from '../models/journal-entry.interface';

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Un importe en dólares a centavos. */
export function toCents(v: number | null | undefined): number {
  return Math.round((Number(v) || 0) * 100);
}

/** Centavos a dólares, para mostrar o exportar. */
export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** ¿[code] es [prefix] o una de sus subcuentas? Por segmentos: `1.10` no está bajo `1.1`. */
export function codeUnder(code: string, prefix: string): boolean {
  return code === prefix || code.startsWith(prefix + '.');
}

/** El código recortado a [level] segmentos (`1.1.01.003`, 2 → `1.1`). */
export function truncateCode(code: string, level: number): string {
  const s = code.split('.');
  return s.length <= level ? code : s.slice(0, level).join('.');
}

/** El código del padre (`1.1.01` → `1.1`; `1` → ''). */
export function parentCodeOf(code: string): string {
  const i = code.lastIndexOf('.');
  return i < 0 ? '' : code.slice(0, i);
}

/** Orden de códigos por segmentos numéricos (`1.2` antes que `1.10`). */
export function compareAccountCodes(a: string, b: string): number {
  const sa = a.split('.');
  const sb = b.split('.');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (i >= sa.length) return -1;
    if (i >= sb.length) return 1;
    const na = Number(sa[i]);
    const nb = Number(sb[i]);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    if (sa[i] !== sb[i]) return sa[i] < sb[i] ? -1 : 1;
  }
  return 0;
}

/** Un Date (o Timestamp) a 'AAAA-MM-DD' en hora local. */
export function dayString(value: any): string {
  if (!value) return '';
  const d: Date = value?.toDate ? value.toDate() : new Date(value);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─── Asientos ────────────────────────────────────────────────────────────────

export interface LedgerLine {
  accountCode:   string;
  accountName:   string;
  description?:  string;
  costCenterId?: string | null;
  /** Centavos. */
  debit:  number;
  /** Centavos. */
  credit: number;
}

export interface LedgerEntry {
  id:     string;
  number: number;
  /** 'AAAA-MM-DD'. */
  day:    string;
  description:      string;
  reference:        string;
  type:             string;
  status:           string;
  periodId?:        string;
  periodYear?:      number;
  reversalEntryId?: string | null;
  reversalOf?:      string | null;
  lines: LedgerLine[];
  /** El asiento original, para que las páginas sigan mostrando sus campos. */
  source?: JournalEntry;
}

/** La regla de qué asiento entra en los libros y balances (ver arriba). */
export function countsForReports(e: { status?: string; reversalEntryId?: string | null } | null | undefined): boolean {
  if (!e) return false;
  if (e.status === 'posted') return true;
  return e.status === 'cancelled' && !!e.reversalEntryId;
}

/** Desde el asiento de Firestore. Sin fecha, el 1 de enero de su ejercicio. */
export function toLedgerEntry(e: JournalEntry): LedgerEntry {
  const anyE = e as any;
  return {
    id:          e.id,
    number:      Number(e.number) || 0,
    day:         dayString(e.date) || `${e.periodYear}-01-01`,
    description: e.description ?? '',
    reference:   e.reference ?? '',
    type:        e.type ?? 'manual',
    status:      e.status ?? '',
    periodId:    e.periodId,
    periodYear:  e.periodYear,
    reversalEntryId: anyE.reversalEntryId ?? null,
    reversalOf:      anyE.reversalOf ?? null,
    lines: (e.lines ?? []).map(l => ({
      accountCode:  (l.accountCode ?? '').trim(),
      accountName:  l.accountName ?? '',
      description:  l.description,
      costCenterId: l.costCenterId ?? null,
      debit:        toCents(l.debit),
      credit:       toCents(l.credit),
    })),
    source: e,
  };
}

export function entryTotalDebit(e: LedgerEntry): number  { return e.lines.reduce((s, l) => s + l.debit,  0); }
export function entryTotalCredit(e: LedgerEntry): number { return e.lines.reduce((s, l) => s + l.credit, 0); }

/** Orden del diario: fecha, la apertura primero y el cierre al final del día, luego el número. */
export function compareLedgerEntries(a: LedgerEntry, b: LedgerEntry): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  const peso = (e: LedgerEntry) => e.type === 'opening' ? 0 : (e.type === 'closing' ? 2 : 1);
  const p = peso(a) - peso(b);
  if (p !== 0) return p;
  if (a.number !== b.number) return a.number - b.number;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Los asientos que cuentan, en orden de diario. */
export function countedEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(countsForReports).sort(compareLedgerEntries);
}

// ─── Plan de cuentas ─────────────────────────────────────────────────────────

export type AccountGroup = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto';

export interface LedgerAccount {
  code: string;
  name: string;
  type?: string;
  nature?: string;
  allowsMovement?: boolean;
  isActive?: boolean;
}

export function isDebitNormalGroup(g: AccountGroup): boolean {
  return g === 'activo' || g === 'costo' || g === 'gasto';
}

function groupFromType(type: string | undefined): AccountGroup | null {
  switch ((type ?? '').trim().toLowerCase()) {
    case 'activo':     return 'activo';
    case 'pasivo':     return 'pasivo';
    case 'patrimonio':
    case 'resultado':  return 'patrimonio';
    case 'ingreso':    return 'ingreso';
    case 'costo':      return 'costo';
    case 'gasto':      return 'gasto';
  }
  return null;
}

/** Respaldo para una cuenta fuera del plan: por el primer dígito; 5 en adelante, gasto. */
export function groupByFirstDigit(code: string): AccountGroup {
  switch (code.trim().split('.')[0]) {
    case '1': return 'activo';
    case '2': return 'pasivo';
    case '3': return 'patrimonio';
    case '4': return 'ingreso';
  }
  return 'gasto';
}

/** El plan de cuentas indexado por código, con lo que necesitan los reportes. */
export class AccountIndex {
  readonly byCode = new Map<string, LedgerAccount>();

  constructor(accounts: LedgerAccount[] = []) {
    for (const a of accounts) this.byCode.set(a.code, a);
  }

  get(code: string): LedgerAccount | undefined { return this.byCode.get(code); }

  /** La cuenta y sus padres, de la más honda a la raíz. */
  private *chain(code: string): Generator<string> {
    let c = code;
    while (c) { yield c; c = parentCodeOf(c); }
  }

  /** El tipo de la cuenta, o el del padre más cercano en el plan, o el del primer dígito. */
  groupOf(code: string): AccountGroup {
    for (const c of this.chain(code)) {
      const g = groupFromType(this.byCode.get(c)?.type);
      if (g) return g;
    }
    return groupByFirstDigit(code);
  }

  /** ¿El saldo se lleva por el Debe? Naturaleza de la cuenta (o del padre); si no, la de su grupo. */
  isDebitNature(code: string): boolean {
    for (const c of this.chain(code)) {
      const n = (this.byCode.get(c)?.nature ?? '').trim().toLowerCase();
      if (n === 'deudora')   return true;
      if (n === 'acreedora') return false;
    }
    return isDebitNormalGroup(this.groupOf(code));
  }

  /** El nombre del plan, o [fallback] (el de la línea del asiento). */
  nameOf(code: string, fallback = ''): string {
    const n = this.byCode.get(code)?.name ?? '';
    if (n) return n;
    return fallback || `Cuenta ${code} (fuera del plan)`;
  }

  /** Activo y pasivo corrientes: bajo 1.1 y 2.1. */
  isCurrent(code: string): boolean { return codeUnder(code, '1.1') || codeUnder(code, '2.1'); }
}

// ─── Opciones comunes ────────────────────────────────────────────────────────

export interface ReportOptions {
  /** Solo las líneas de este centro de costo. */
  costCenterId?: string | null;
  /** Agrupar al nivel N (1–5). Sin él, cada cuenta de movimiento. */
  level?: number;
}

function lineMatches(l: LedgerLine, opts?: ReportOptions): boolean {
  return !opts?.costCenterId || l.costCenterId === opts.costCenterId;
}

// ─── Libro diario ────────────────────────────────────────────────────────────

export interface JournalBook {
  entries:     LedgerEntry[];
  totalDebit:  number;
  totalCredit: number;
}

/** Los asientos que cuentan entre [from] y [to] (inclusive, 'AAAA-MM-DD'), con sus totales en centavos. */
export function libroDiario(entries: LedgerEntry[], from: string, to: string): JournalBook {
  const list = countedEntries(entries).filter(e => e.day >= from && e.day <= to);
  let d = 0, c = 0;
  for (const e of list) { d += entryTotalDebit(e); c += entryTotalCredit(e); }
  return { entries: list, totalDebit: d, totalCredit: c };
}

// ─── Libro mayor ─────────────────────────────────────────────────────────────

export interface LedgerMovement {
  entry:   LedgerEntry;
  line:    LedgerLine;
  /** Saldo después de este movimiento (centavos, con la naturaleza de la cuenta). */
  balance: number;
}

export interface AccountLedger {
  code:           string;
  name:           string;
  debitNature:    boolean;
  openingBalance: number;
  movements:      LedgerMovement[];
  totalDebit:     number;
  totalCredit:    number;
  closingBalance: number;
}

/**
 * Mayor de una cuenta (y sus subcuentas) entre [from] y [to]. Saldo inicial = la
 * apertura más lo movido desde el inicio del ejercicio hasta el día antes de
 * [from]. El saldo se lleva con la naturaleza de la cuenta.
 */
export function libroMayor(
  entries: LedgerEntry[], accounts: AccountIndex, code: string,
  from: string, to: string, opts?: ReportOptions,
): AccountLedger {
  const debitNature = accounts.isDebitNature(code);
  const signo = (l: LedgerLine) => debitNature ? l.debit - l.credit : l.credit - l.debit;
  let inicial = 0;
  const enRango: { e: LedgerEntry; l: LedgerLine }[] = [];
  for (const e of countedEntries(entries)) {
    for (const l of e.lines) {
      if (!codeUnder(l.accountCode, code) || !lineMatches(l, opts)) continue;
      if (e.type === 'opening' || e.day < from) inicial += signo(l);
      else if (e.day <= to) enRango.push({ e, l });
    }
  }
  let saldo = inicial, d = 0, c = 0;
  const movements: LedgerMovement[] = [];
  for (const m of enRango) {
    saldo += signo(m.l);
    d += m.l.debit;
    c += m.l.credit;
    movements.push({ entry: m.e, line: m.l, balance: saldo });
  }
  return {
    code,
    name: accounts.nameOf(code, enRango[0]?.l.accountName ?? ''),
    debitNature,
    openingBalance: inicial,
    movements,
    totalDebit: d,
    totalCredit: c,
    closingBalance: saldo,
  };
}

// ─── Sumas por cuenta ────────────────────────────────────────────────────────

/** Por cuenta de movimiento: [0] apertura y anterior a [from] (D−H), [1] Debe y [2] Haber del rango. */
function sumsByAccount(
  entries: LedgerEntry[], from: string, to: string,
  opts: ReportOptions | undefined, excludeClosing: boolean, lineNames: Map<string, string>,
): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  for (const e of countedEntries(entries)) {
    if (excludeClosing && e.type === 'closing') continue;
    if (e.day > to) continue;
    const antes = e.type === 'opening' || e.day < from;
    for (const l of e.lines) {
      if (!l.accountCode || !lineMatches(l, opts)) continue;
      if (!lineNames.has(l.accountCode)) lineNames.set(l.accountCode, l.accountName);
      let s = out.get(l.accountCode);
      if (!s) { s = [0, 0, 0]; out.set(l.accountCode, s); }
      if (antes) s[0] += l.debit - l.credit;
      else { s[1] += l.debit; s[2] += l.credit; }
    }
  }
  return out;
}

const keyFor = (code: string, opts?: ReportOptions) => opts?.level ? truncateCode(code, opts.level) : code;

// ─── Balance de comprobación ─────────────────────────────────────────────────

export interface TrialRow {
  code: string;
  name: string;
  group: AccountGroup;
  /** Saldo inicial neto (centavos): positivo deudor, negativo acreedor. */
  opening: number;
  debit:   number;
  credit:  number;
  closing: number;
  openingDebit:  number;
  openingCredit: number;
  closingDebit:  number;
  closingCredit: number;
}

export interface TrialBalance {
  rows: TrialRow[];
  openingDebit:  number;
  openingCredit: number;
  totalDebit:    number;
  totalCredit:   number;
  closingDebit:  number;
  closingCredit: number;
  /** Debe = Haber y saldos deudores = acreedores, al inicio y al final. */
  isBalanced: boolean;
}

/** Balance de comprobación entre [from] y [to], solo cuentas con saldo o movimiento. */
export function trialBalance(
  entries: LedgerEntry[], accounts: AccountIndex, from: string, to: string, opts?: ReportOptions,
): TrialBalance {
  const nombres = new Map<string, string>();
  const sumas = sumsByAccount(entries, from, to, opts, false, nombres);
  const acc = new Map<string, [number, number, number]>();
  for (const [code, v] of sumas) {
    const k = keyFor(code, opts);
    const s = acc.get(k) ?? [0, 0, 0];
    s[0] += v[0]; s[1] += v[1]; s[2] += v[2];
    acc.set(k, s);
  }
  const rows: TrialRow[] = [];
  for (const [code, [opening, debit, credit]] of acc) {
    if (opening === 0 && debit === 0 && credit === 0) continue;
    const closing = opening + debit - credit;
    rows.push({
      code, name: accounts.nameOf(code, nombres.get(code) ?? ''), group: accounts.groupOf(code),
      opening, debit, credit, closing,
      openingDebit:  opening > 0 ? opening : 0,
      openingCredit: opening < 0 ? -opening : 0,
      closingDebit:  closing > 0 ? closing : 0,
      closingCredit: closing < 0 ? -closing : 0,
    });
  }
  rows.sort((a, b) => compareAccountCodes(a.code, b.code));
  const sum = (f: (r: TrialRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const t = {
    openingDebit:  sum(r => r.openingDebit),
    openingCredit: sum(r => r.openingCredit),
    totalDebit:    sum(r => r.debit),
    totalCredit:   sum(r => r.credit),
    closingDebit:  sum(r => r.closingDebit),
    closingCredit: sum(r => r.closingCredit),
  };
  return {
    rows, ...t,
    isBalanced: t.totalDebit === t.totalCredit && t.openingDebit === t.openingCredit && t.closingDebit === t.closingCredit,
  };
}

// ─── Estados financieros ─────────────────────────────────────────────────────

export interface StatementRow {
  code:   string;
  name:   string;
  /** Centavos, con el signo de su grupo (una contra-cuenta sale negativa). */
  amount: number;
}

export interface StatementSection {
  rows:  StatementRow[];
  total: number;
}

function groupSigned(g: AccountGroup, debitMinusCredit: number): number {
  return isDebitNormalGroup(g) ? debitMinusCredit : -debitMinusCredit;
}

function buildSections<K extends string>(
  accounts: AccountIndex, net: Map<string, number>, lineNames: Map<string, string>,
  keys: readonly K[], section: (code: string, g: AccountGroup) => K | null, opts?: ReportOptions,
): Record<K, StatementSection> {
  const sumas = {} as Record<K, Map<string, number>>;
  for (const k of keys) sumas[k] = new Map();
  for (const [code, v] of net) {
    const g = accounts.groupOf(code);
    const s = section(code, g);
    if (!s) continue;
    const k = keyFor(code, opts);
    sumas[s].set(k, (sumas[s].get(k) ?? 0) + groupSigned(g, v));
  }
  const out = {} as Record<K, StatementSection>;
  for (const k of keys) {
    const rows = [...sumas[k].entries()]
      .filter(([, v]) => v !== 0)
      .sort((a, b) => compareAccountCodes(a[0], b[0]))
      .map(([code, amount]) => ({ code, name: accounts.nameOf(code, lineNames.get(code) ?? ''), amount }));
    out[k] = { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  }
  return out;
}

export interface IncomeStatement {
  income:   StatementSection;
  costs:    StatementSection;
  expenses: StatementSection;
  totalIncome:   number;
  totalCosts:    number;
  totalExpenses: number;
  grossProfit:   number;
  netResult:     number;
}

/**
 * Estado de resultados entre [from] y [to]: ingresos − costos = utilidad bruta;
 * − gastos = resultado. Sin el asiento de cierre, que deja en cero ingresos y gastos.
 */
export function incomeStatement(
  entries: LedgerEntry[], accounts: AccountIndex, from: string, to: string, opts?: ReportOptions,
): IncomeStatement {
  const nombres = new Map<string, string>();
  const sumas = sumsByAccount(entries, from, to, opts, true, nombres);
  const net = new Map<string, number>();
  for (const [code, v] of sumas) net.set(code, v[1] - v[2]);
  const s = buildSections(accounts, net, nombres, ['income', 'costs', 'expenses'] as const, (_c, g) =>
    g === 'ingreso' ? 'income' : g === 'costo' ? 'costs' : g === 'gasto' ? 'expenses' : null, opts);
  const totalIncome = s.income.total, totalCosts = s.costs.total, totalExpenses = s.expenses.total;
  return {
    income: s.income, costs: s.costs, expenses: s.expenses,
    totalIncome, totalCosts, totalExpenses,
    grossProfit: totalIncome - totalCosts,
    netResult:   totalIncome - totalCosts - totalExpenses,
  };
}

export interface BalanceSheet {
  currentAssets:         StatementSection;
  nonCurrentAssets:      StatementSection;
  currentLiabilities:    StatementSection;
  nonCurrentLiabilities: StatementSection;
  equity:                StatementSection;
  /** Ingresos − costos − gastos a la fecha, cierre incluido: con el año cerrado da 0. */
  periodResult:     number;
  totalAssets:      number;
  totalLiabilities: number;
  /** Patrimonio + resultado del ejercicio. */
  totalEquity:      number;
  /** Activo − (pasivo + patrimonio + resultado). Cero si cuadra. */
  difference:       number;
  isBalanced:       boolean;
}

/**
 * Balance general al [cutoff], con todo lo que cuenta del ejercicio hasta ese día
 * (apertura y cierre incluidos). [entries] deben ser solo los del ejercicio.
 */
export function balanceSheet(
  entries: LedgerEntry[], accounts: AccountIndex, cutoff: string, opts?: ReportOptions,
): BalanceSheet {
  const nombres = new Map<string, string>();
  const sumas = sumsByAccount(entries, '0000-01-01', cutoff, opts, false, nombres);
  const net = new Map<string, number>();
  for (const [code, v] of sumas) net.set(code, v[0] + v[1] - v[2]);
  let resultado = 0;
  for (const [code, v] of net) {
    const g = accounts.groupOf(code);
    if (g === 'ingreso') resultado -= v;
    if (g === 'costo' || g === 'gasto') resultado -= v;
  }
  const s = buildSections(accounts, net, nombres, ['ca', 'nca', 'cl', 'ncl', 'eq'] as const, (code, g) => {
    const corriente = accounts.isCurrent(code);
    if (g === 'activo') return corriente ? 'ca' : 'nca';
    if (g === 'pasivo') return corriente ? 'cl' : 'ncl';
    if (g === 'patrimonio') return 'eq';
    return null;
  }, opts);
  const totalAssets      = s.ca.total + s.nca.total;
  const totalLiabilities = s.cl.total + s.ncl.total;
  const totalEquity      = s.eq.total + resultado;
  const difference       = totalAssets - totalLiabilities - totalEquity;
  return {
    currentAssets: s.ca, nonCurrentAssets: s.nca,
    currentLiabilities: s.cl, nonCurrentLiabilities: s.ncl,
    equity: s.eq,
    periodResult: resultado,
    totalAssets, totalLiabilities, totalEquity, difference,
    isBalanced: difference === 0,
  };
}

// ─── Lectura por páginas ─────────────────────────────────────────────────────

export interface PagedResult<T> { items: T[]; truncated: boolean; }

/**
 * Lee por páginas hasta que no haya más o se llegue a [cap]. [fetch] recibe el
 * último elemento leído (null la primera vez) y cuántos pedir. Pide uno de más
 * para saber si hay más allá del tope; ese no se devuelve.
 */
export async function collectPages<T>(
  fetch: (last: T | null, limit: number) => Promise<T[]>,
  pageSize = 500,
  cap = 5000,
): Promise<PagedResult<T>> {
  const items: T[] = [];
  for (;;) {
    const restante = cap + 1 - items.length;
    const limit = Math.min(restante, pageSize);
    const page = await fetch(items.length ? items[items.length - 1] : null, limit);
    items.push(...page);
    if (items.length > cap) return { items: items.slice(0, cap), truncated: true };
    if (page.length < limit) return { items, truncated: false };
  }
}
