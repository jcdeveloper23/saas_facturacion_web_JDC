// ─── Líneas del asiento de cierre (lógica pura) ───────────────────────────────
//
// Lleva los saldos de ingresos (4) y de costos y gastos (5) a cero contra
// Utilidad o Pérdida del Ejercicio (3.3.02). Los saldos llegan ya sumados con
// sumAccountBalances, que aplica countsForBalances (ver entry-counts.ts).

import { AccountBalance } from './entry-counts';

export interface ClosingEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  costCenterName: string | null;
  description: string;
}

export const CLOSING_ACCOUNTS = {
  incomeGroup:    { code: '4', name: 'INGRESOS' },
  costsGroup:     { code: '5', name: 'COSTOS Y GASTOS' },
  netProfit:      { code: '3.3.02.001', name: 'Utilidad del Ejercicio' },
  netLoss:        { code: '3.3.02.002', name: 'Pérdida del Ejercicio' },
};

export interface ClosingEntryResult {
  lines:        ClosingEntryLine[];
  totalIncome:  number;
  totalExpense: number;
  netResult:    number;
  totalDebit:   number;
  totalCredit:  number;
  isBalanced:   boolean;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function buildClosingLines(
  accountBalances: Map<string, AccountBalance>,
  periodYear: number,
): ClosingEntryResult {
  let totalIncome  = 0;
  let totalExpense = 0;

  const lines: ClosingEntryLine[] = [];

  for (const [code, bal] of accountBalances) {
    if (code.startsWith('4')) {
      // Las cuentas de ingreso tienen saldo acreedor: se debitan para cerrarlas
      const balance = round2(bal.credit - bal.debit);
      if (balance > 0) {
        lines.push({
          id:            crypto.randomUUID(),
          accountCode:   code,
          accountName:   bal.name,
          debit:         balance,
          credit:        0,
          costCenterId:  null,
          costCenterName:null,
          description:   `Cierre cuenta de ingreso ${periodYear}`
        });
        totalIncome = round2(totalIncome + balance);
      }
    } else if (code.startsWith('5')) {
      // Las cuentas de gasto tienen saldo deudor: se acreditan para cerrarlas
      const balance = round2(bal.debit - bal.credit);
      if (balance > 0) {
        lines.push({
          id:            crypto.randomUUID(),
          accountCode:   code,
          accountName:   bal.name,
          debit:         0,
          credit:        balance,
          costCenterId:  null,
          costCenterName:null,
          description:   `Cierre cuenta de gasto ${periodYear}`
        });
        totalExpense = round2(totalExpense + balance);
      }
    }
  }

  // Línea del resultado neto
  const netResult = round2(totalIncome - totalExpense);

  if (Math.abs(netResult) > 0.01) {
    if (netResult > 0) {
      // Utilidad: se acredita Utilidad del Ejercicio
      lines.push({
        id:            crypto.randomUUID(),
        accountCode:   CLOSING_ACCOUNTS.netProfit.code,
        accountName:   CLOSING_ACCOUNTS.netProfit.name,
        debit:         0,
        credit:        netResult,
        costCenterId:  null,
        costCenterName:null,
        description:   `Utilidad neta ejercicio ${periodYear}`
      });
    } else {
      // Pérdida: se debita Pérdida del Ejercicio
      lines.push({
        id:            crypto.randomUUID(),
        accountCode:   CLOSING_ACCOUNTS.netLoss.code,
        accountName:   CLOSING_ACCOUNTS.netLoss.name,
        debit:         Math.abs(netResult),
        credit:        0,
        costCenterId:  null,
        costCenterName:null,
        description:   `Pérdida neta ejercicio ${periodYear}`
      });
    }
  }

  const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  return { lines, totalIncome, totalExpense, netResult, totalDebit, totalCredit, isBalanced };
}
