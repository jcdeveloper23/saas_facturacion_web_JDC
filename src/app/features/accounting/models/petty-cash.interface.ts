import { Timestamp } from '@angular/fire/firestore';

// ─── Caja Chica (fondo fijo / imprest system) ──────────────────────────────────
// Los gastos individuales NO generan asiento propio — se acumulan como
// comprobantes pendientes (reimbursed:false). Solo la reposición contabiliza:
// agrupa los gastos pendientes por cuenta contable y postea un único asiento
// que devuelve el fondo a su monto fijo. Es el sistema estándar de "caja
// chica"/petty cash, y el mismo criterio que documenta Contifico.

// Stored at: companies/{companyId}/petty_cash_funds/{fundId}
export interface PettyCashFund {
  id: string;
  name:          string;   // "Caja Chica Oficina Central"
  custodianName: string;   // responsable del fondo
  fixedAmount:   number;   // monto fijo del fondo (imprest)
  linkedGlCode:  string;   // cuenta contable de Caja Chica
  linkedGlName:  string;
  isActive:      boolean;
  openingEntryId?: string; // asiento de alta del fondo, si fixedAmount > 0
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// Stored at: companies/{companyId}/petty_cash_movements/{movementId}
export interface PettyCashMovement {
  id: string;
  fundId:   string;
  fundName: string;
  date:     Timestamp;
  description: string;
  amount:      number;
  expenseAccountCode: string;
  expenseAccountName: string;
  receiptRef?: string;    // N° de comprobante / factura del gasto, si tiene
  reimbursed:  boolean;
  reimbursementEntryId?: string;
  createdBy: string;
  createdAt: Timestamp;
}
