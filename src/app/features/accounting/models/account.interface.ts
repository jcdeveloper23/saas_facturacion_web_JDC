import { Timestamp } from '@angular/fire/firestore';

// ─── Account Types (Ecuador SRI) ─────────────────────────────────────────────

export type AccountType =
  | 'activo'
  | 'pasivo'
  | 'patrimonio'
  | 'ingreso'
  | 'costo'
  | 'gasto'
  | 'resultado';

export type AccountNature = 'deudora' | 'acreedora';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  patrimonio: 'Patrimonio',
  ingreso: 'Ingreso',
  costo: 'Costo',
  gasto: 'Gasto',
  resultado: 'Resultado'
};

export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  activo: 'primary',
  pasivo: 'warning',
  patrimonio: 'success',
  ingreso: 'info',
  costo: 'danger',
  gasto: 'secondary',
  resultado: 'dark'
};

export const ACCOUNT_NATURE_LABELS: Record<AccountNature, string> = {
  deudora: 'Deudora',
  acreedora: 'Acreedora'
};

// ─── Chart of Account document ────────────────────────────────────────────────
// Stored at: /companies/{companyId}/chart_of_accounts/{accountId}

export interface Account {
  id: string;
  code: string;              // e.g. "1", "1.1", "1.1.01", "1.1.01.001"
  name: string;
  type: AccountType;
  level: number;             // 1=grupo, 2=subgrupo, 3=mayor, 4=subcuenta, 5=auxiliar
  parentCode: string | null; // null for root accounts (level 1)
  isActive: boolean;
  isAuxiliary: boolean;      // true = cuenta de movimiento (hoja del árbol)
  allowsMovement: boolean;   // true = puede recibir débitos/créditos en asientos
  nature: AccountNature;     // deudora o acreedora (controla saldo normal)
  description?: string;
  tags?: string[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Tree node (UI only — not stored in Firestore) ────────────────────────────

export interface AccountTreeNode extends Account {
  children: AccountTreeNode[];
  expanded: boolean;
  depth: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determines the nature of an account based on its type.
 * Assets and expenses are normally debit (deudora).
 * Liabilities, equity and income are normally credit (acreedora).
 */
export function defaultNatureForType(type: AccountType): AccountNature {
  return (type === 'activo' || type === 'costo' || type === 'gasto') ? 'deudora' : 'acreedora';
}

/**
 * Determines account level from the code format.
 * "1" → 1, "1.1" → 2, "1.1.01" → 3, "1.1.01.001" → 4
 */
export function levelFromCode(code: string): number {
  if (!code) return 1;
  return code.split('.').length;
}

/**
 * Derives the parent code from an account code.
 * "1.1.01.001" → "1.1.01", "1.1" → "1", "1" → null
 */
export function parentCodeFromCode(code: string): string | null {
  const parts = code.split('.');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('.');
}

/**
 * Builds a flat list into a hierarchical tree sorted by code.
 */
export function buildAccountTree(accounts: Account[]): AccountTreeNode[] {
  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const map = new Map<string, AccountTreeNode>();

  for (const acc of sorted) {
    map.set(acc.code, { ...acc, children: [], expanded: false, depth: acc.level - 1 });
  }

  const roots: AccountTreeNode[] = [];
  for (const node of map.values()) {
    if (!node.parentCode) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentCode);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node); // orphan — show at root level
      }
    }
  }

  return roots;
}

/**
 * Flatten the tree back to a list preserving visual order.
 */
export function flattenTree(nodes: AccountTreeNode[], result: AccountTreeNode[] = []): AccountTreeNode[] {
  for (const node of nodes) {
    result.push(node);
    if (node.expanded && node.children.length) {
      flattenTree(node.children, result);
    }
  }
  return result;
}

// ─── Ecuador Plan de Cuentas seed data ───────────────────────────────────────

export interface AccountSeedEntry {
  code: string;
  name: string;
  type: AccountType;
  nature: AccountNature;
  allowsMovement: boolean;
}

export const ECUADOR_CHART_OF_ACCOUNTS_SEED: AccountSeedEntry[] = [
  // ── ACTIVOS ────────────────────────────────────────────────────────────────
  { code: '1', name: 'ACTIVO', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1', name: 'ACTIVO CORRIENTE', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1.01', name: 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1.01.001', name: 'Caja General', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.01.002', name: 'Caja Chica', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.01.003', name: 'Bancos - Cuenta Corriente', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.01.004', name: 'Bancos - Cuenta de Ahorros', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.02', name: 'ACTIVOS FINANCIEROS', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1.02.001', name: 'Cuentas por Cobrar Clientes', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.02.002', name: 'Cuentas por Cobrar Empleados', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.02.003', name: 'Otras Cuentas por Cobrar', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.02.004', name: 'Provisión Cuentas Incobrables', type: 'activo', nature: 'acreedora', allowsMovement: true },
  { code: '1.1.02.005', name: 'Documentos por Cobrar', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.03', name: 'INVENTARIOS', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1.03.001', name: 'Inventario de Mercaderías', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.03.002', name: 'Inventario de Materia Prima', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.03.003', name: 'Inventario de Productos en Proceso', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.03.004', name: 'Inventario de Productos Terminados', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.04', name: 'SERVICIOS Y OTROS PAGOS ANTICIPADOS', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1.04.001', name: 'Seguros Pagados por Anticipado', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.04.002', name: 'Arriendos Pagados por Anticipado', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.04.003', name: 'Anticipos a Proveedores', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.05', name: 'ACTIVOS POR IMPUESTOS CORRIENTES', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.1.05.001', name: 'IVA en Compras', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.05.002', name: 'Crédito Tributario IVA', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.05.003', name: 'Crédito Tributario Impuesto a la Renta', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.05.004', name: 'Anticipo Impuesto a la Renta', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.05.005', name: 'Retenciones en la Fuente IR', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.1.05.006', name: 'Retenciones IVA', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2', name: 'ACTIVO NO CORRIENTE', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.2.01', name: 'PROPIEDADES, PLANTA Y EQUIPO', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.2.01.001', name: 'Terrenos', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.01.002', name: 'Edificios y Construcciones', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.01.003', name: 'Muebles y Enseres', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.01.004', name: 'Maquinaria y Equipo', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.01.005', name: 'Equipo de Computación', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.01.006', name: 'Vehículos', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.01.007', name: 'Dep. Acumulada Edificios', type: 'activo', nature: 'acreedora', allowsMovement: true },
  { code: '1.2.01.008', name: 'Dep. Acumulada Muebles y Enseres', type: 'activo', nature: 'acreedora', allowsMovement: true },
  { code: '1.2.01.009', name: 'Dep. Acumulada Maquinaria y Equipo', type: 'activo', nature: 'acreedora', allowsMovement: true },
  { code: '1.2.01.010', name: 'Dep. Acumulada Equipo de Computación', type: 'activo', nature: 'acreedora', allowsMovement: true },
  { code: '1.2.01.011', name: 'Dep. Acumulada Vehículos', type: 'activo', nature: 'acreedora', allowsMovement: true },
  { code: '1.2.02', name: 'ACTIVOS INTANGIBLES', type: 'activo', nature: 'deudora', allowsMovement: false },
  { code: '1.2.02.001', name: 'Marcas, Patentes y Derechos', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.02.002', name: 'Software y Licencias', type: 'activo', nature: 'deudora', allowsMovement: true },
  { code: '1.2.02.003', name: 'Amortización Acumulada Intangibles', type: 'activo', nature: 'acreedora', allowsMovement: true },

  // ── PASIVOS ────────────────────────────────────────────────────────────────
  { code: '2', name: 'PASIVO', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.1', name: 'PASIVO CORRIENTE', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.1.01', name: 'CUENTAS Y DOCUMENTOS POR PAGAR', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.01.002', name: 'Documentos por Pagar', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.01.003', name: 'Cuentas por Pagar Empleados', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.02', name: 'OBLIGACIONES CON INSTITUCIONES FINANCIERAS', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.1.02.001', name: 'Préstamos Bancarios Corrientes', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.03', name: 'PROVISIONES', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.1.03.001', name: 'Provisión Décimo Tercer Sueldo', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.03.002', name: 'Provisión Décimo Cuarto Sueldo', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.03.003', name: 'Provisión Vacaciones', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.03.004', name: 'Provisión Fondos de Reserva', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.03.005', name: 'Provisión Desahucio y Jubilación', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04', name: 'OTRAS OBLIGACIONES CORRIENTES', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.1.04.001', name: 'IVA en Ventas', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.002', name: 'Retenciones IVA por Pagar', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.003', name: 'Retenciones IR por Pagar', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.004', name: 'IVA por Pagar (IVA Ventas - IVA Compras)', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.005', name: 'Impuesto a la Renta por Pagar', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.006', name: 'Aporte Individual IESS por Pagar', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.007', name: 'Aporte Patronal IESS por Pagar', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.1.04.008', name: 'Anticipo Clientes', type: 'pasivo', nature: 'acreedora', allowsMovement: true },
  { code: '2.2', name: 'PASIVO NO CORRIENTE', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.2.01', name: 'OBLIGACIONES CON INSTITUCIONES FINANCIERAS A LARGO PLAZO', type: 'pasivo', nature: 'acreedora', allowsMovement: false },
  { code: '2.2.01.001', name: 'Préstamos Bancarios Largo Plazo', type: 'pasivo', nature: 'acreedora', allowsMovement: true },

  // ── PATRIMONIO ─────────────────────────────────────────────────────────────
  { code: '3', name: 'PATRIMONIO', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.1', name: 'CAPITAL', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.1.01', name: 'Capital Suscrito', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.1.01.001', name: 'Capital Suscrito y Pagado', type: 'patrimonio', nature: 'acreedora', allowsMovement: true },
  { code: '3.2', name: 'RESERVAS', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.2.01', name: 'Reserva Legal', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.2.01.001', name: 'Reserva Legal', type: 'patrimonio', nature: 'acreedora', allowsMovement: true },
  { code: '3.2.02', name: 'Reserva Estatutaria', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.2.02.001', name: 'Reserva Estatutaria', type: 'patrimonio', nature: 'acreedora', allowsMovement: true },
  { code: '3.3', name: 'RESULTADOS', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.3.01', name: 'Utilidades / Pérdidas Acumuladas', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.3.01.001', name: 'Utilidades Acumuladas Ejercicios Anteriores', type: 'patrimonio', nature: 'acreedora', allowsMovement: true },
  { code: '3.3.01.002', name: 'Pérdidas Acumuladas Ejercicios Anteriores', type: 'patrimonio', nature: 'deudora', allowsMovement: true },
  { code: '3.3.02', name: 'Utilidad / Pérdida del Ejercicio', type: 'patrimonio', nature: 'acreedora', allowsMovement: false },
  { code: '3.3.02.001', name: 'Utilidad del Ejercicio', type: 'patrimonio', nature: 'acreedora', allowsMovement: true },
  { code: '3.3.02.002', name: 'Pérdida del Ejercicio', type: 'patrimonio', nature: 'deudora', allowsMovement: true },

  // ── INGRESOS ────────────────────────────────────────────────────────────────
  { code: '4', name: 'INGRESOS', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.1', name: 'INGRESOS OPERACIONALES', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.1.01', name: 'VENTAS', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.1.01.001', name: 'Ventas 15% IVA', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.1.01.002', name: 'Ventas 0% IVA', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.1.01.003', name: 'Ventas Exentas de IVA', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.1.01.004', name: 'Devoluciones en Ventas', type: 'ingreso', nature: 'deudora', allowsMovement: true },
  { code: '4.1.01.005', name: 'Descuentos en Ventas', type: 'ingreso', nature: 'deudora', allowsMovement: true },
  { code: '4.1.02', name: 'PRESTACIÓN DE SERVICIOS', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.1.02.001', name: 'Ingresos por Servicios 15% IVA', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.1.02.002', name: 'Ingresos por Servicios 0% IVA', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.2', name: 'INGRESOS NO OPERACIONALES', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.2.01', name: 'Intereses Ganados', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.2.01.001', name: 'Intereses Bancarios', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.2.02', name: 'Utilidad en Venta de Activos', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.2.02.001', name: 'Utilidad en Venta de Activos Fijos', type: 'ingreso', nature: 'acreedora', allowsMovement: true },
  { code: '4.2.03', name: 'Otros Ingresos', type: 'ingreso', nature: 'acreedora', allowsMovement: false },
  { code: '4.2.03.001', name: 'Otros Ingresos No Operacionales', type: 'ingreso', nature: 'acreedora', allowsMovement: true },

  // ── COSTOS ─────────────────────────────────────────────────────────────────
  { code: '5', name: 'COSTOS Y GASTOS', type: 'costo', nature: 'deudora', allowsMovement: false },
  { code: '5.1', name: 'COSTOS DE VENTAS', type: 'costo', nature: 'deudora', allowsMovement: false },
  { code: '5.1.01', name: 'Costo de Mercadería Vendida', type: 'costo', nature: 'deudora', allowsMovement: false },
  { code: '5.1.01.001', name: 'Costo de Ventas', type: 'costo', nature: 'deudora', allowsMovement: true },
  { code: '5.1.01.002', name: 'Devoluciones en Compras', type: 'costo', nature: 'acreedora', allowsMovement: true },
  { code: '5.1.02', name: 'COMPRAS', type: 'costo', nature: 'deudora', allowsMovement: false },
  { code: '5.1.02.001', name: 'Compras 15% IVA', type: 'costo', nature: 'deudora', allowsMovement: true },
  { code: '5.1.02.002', name: 'Compras 0% IVA', type: 'costo', nature: 'deudora', allowsMovement: true },

  // ── GASTOS ─────────────────────────────────────────────────────────────────
  { code: '5.2', name: 'GASTOS OPERACIONALES', type: 'gasto', nature: 'deudora', allowsMovement: false },
  { code: '5.2.01', name: 'GASTOS DE ADMINISTRACIÓN', type: 'gasto', nature: 'deudora', allowsMovement: false },
  { code: '5.2.01.001', name: 'Sueldos y Salarios', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.002', name: 'Horas Extras', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.003', name: 'Décimo Tercer Sueldo', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.004', name: 'Décimo Cuarto Sueldo', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.005', name: 'Fondos de Reserva', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.006', name: 'Vacaciones', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.007', name: 'Aporte Patronal IESS', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.008', name: 'Desahucio y Jubilación Patronal', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.009', name: 'Arriendo Local', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.010', name: 'Servicios Básicos', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.011', name: 'Suministros y Materiales de Oficina', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.012', name: 'Depreciación Activos Fijos', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.013', name: 'Amortización Intangibles', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.014', name: 'Honorarios Profesionales', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.015', name: 'Publicidad y Propaganda', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.016', name: 'Transporte y Movilización', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.017', name: 'Mantenimiento y Reparaciones', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.018', name: 'Seguros y Reaseguros', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.019', name: 'Gastos Legales y Notariales', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.01.020', name: 'Comisiones Pagadas', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.02', name: 'GASTOS DE VENTAS', type: 'gasto', nature: 'deudora', allowsMovement: false },
  { code: '5.2.02.001', name: 'Sueldos Personal de Ventas', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.02.002', name: 'Comisiones Fuerza de Ventas', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.2.02.003', name: 'Publicidad y Marketing', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.3', name: 'GASTOS NO OPERACIONALES', type: 'gasto', nature: 'deudora', allowsMovement: false },
  { code: '5.3.01', name: 'GASTOS FINANCIEROS', type: 'gasto', nature: 'deudora', allowsMovement: false },
  { code: '5.3.01.001', name: 'Intereses Bancarios Pagados', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.3.01.002', name: 'Comisiones Bancarias', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.3.01.003', name: 'Intereses de Mora', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.3.02', name: 'OTROS GASTOS', type: 'gasto', nature: 'deudora', allowsMovement: false },
  { code: '5.3.02.001', name: 'Pérdida en Venta de Activos', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.3.02.002', name: 'Multas e Intereses Tributarios', type: 'gasto', nature: 'deudora', allowsMovement: true },
  { code: '5.3.02.003', name: 'Gastos No Deducibles', type: 'gasto', nature: 'deudora', allowsMovement: true },
];
