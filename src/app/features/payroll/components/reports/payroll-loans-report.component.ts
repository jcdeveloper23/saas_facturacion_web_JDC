import { Component, OnInit, inject, signal } from '@angular/core';

import { periodLabel } from '../../models/payroll.models';
import { LOAN_TYPE_LABELS } from '../../models/payroll-loans.models';
import { ReportColumn, ReportRow, totalsRow } from '../../models/payroll-reports.models';
import { PayrollReportsService } from '../../services/payroll-reports.service';
import { payrollErrorMessage } from '../../services/payroll.service';
import { ReportTableComponent } from './report-table.component';

const COLUMNS: ReportColumn[] = [
  { key: 'number', label: 'Número' }, { key: 'employee', label: 'Empleado' }, { key: 'type', label: 'Tipo' },
  { key: 'amount', label: 'Monto', kind: 'money' }, { key: 'balance', label: 'Saldo', kind: 'money' },
  { key: 'installment', label: 'Cuota', kind: 'money' }, { key: 'start', label: 'Desde' },
];

/** Préstamos vigentes (status activo). */
@Component({
  selector: 'app-payroll-loans-report',
  standalone: true,
  imports: [ReportTableComponent],
  template: `
<app-payroll-report-table title="Préstamos vigentes" [columns]="columns" [rows]="rows()" [totals]="totals()"
  [loading]="loading()" [error]="error()" fileName="prestamos-vigentes" empty="No hay préstamos activos." />`,
})
export class PayrollLoansReportComponent implements OnInit {
  private svc = inject(PayrollReportsService);
  readonly columns = COLUMNS;
  readonly rows = signal<ReportRow[]>([]);
  readonly totals = signal<ReportRow | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const loans = await this.svc.activeLoans();
      const rows = loans
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.number.localeCompare(b.number))
        .map((l) => ({
          number: l.number, employee: l.employeeName, type: LOAN_TYPE_LABELS[l.type] ?? l.type,
          amount: l.amountCents, balance: l.balanceCents, installment: l.installmentCents,
          start: l.startPeriod ? periodLabel(l.startPeriod) : '',
        }));
      this.rows.set(rows);
      this.totals.set(totalsRow(COLUMNS, rows));
    } catch (err) {
      this.error.set(payrollErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
