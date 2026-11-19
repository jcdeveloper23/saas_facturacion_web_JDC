import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormModule } from '@coreui/angular';

import { Payslip, periodLabel, sumLines } from '../../models/payroll.models';
import { PAYMENT_STATUS, ecuadorToday } from '../../models/payroll-payments.models';
import {
  COMMISSION_BONUS_CONCEPTS, MONTHLY_BONUS_CONCEPTS, OVERTIME_CONCEPTS, ReportColumn, ReportRow, sumConcepts, totalsRow,
} from '../../models/payroll-reports.models';
import { PayrollReportsService } from '../../services/payroll-reports.service';
import { payrollErrorMessage } from '../../services/payroll.service';
import { ReportTableComponent } from './report-table.component';

const COLUMNS: ReportColumn[] = [
  { key: 'name', label: 'Empleado' }, { key: 'taxId', label: 'Cédula' }, { key: 'days', label: 'Días', kind: 'number' },
  { key: 'salary', label: 'Sueldo', kind: 'money' }, { key: 'overtime', label: 'Horas extra', kind: 'money' },
  { key: 'bonus', label: 'Comisiones y bonos', kind: 'money' }, { key: 'monthlyBonus', label: 'Décimos mensualizados', kind: 'money' },
  { key: 'reserve', label: 'Fondos de reserva mensual', kind: 'money' }, { key: 'gross', label: 'Total ingresos', kind: 'money' },
  { key: 'iess', label: 'Aporte personal', kind: 'money' }, { key: 'advances', label: 'Anticipos', kind: 'money' },
  { key: 'loans', label: 'Préstamos', kind: 'money' }, { key: 'other', label: 'Otros descuentos', kind: 'money' },
  { key: 'deductions', label: 'Total descuentos', kind: 'money' }, { key: 'net', label: 'Neto', kind: 'money' },
  { key: 'payment', label: 'Estado de pago' },
];

/** Rol general del mes: una fila por rol aprobado (los reversados quedan fuera). */
@Component({
  selector: 'app-payroll-roll-report',
  standalone: true,
  imports: [FormsModule, FormModule, ReportTableComponent],
  template: `
<div class="d-flex gap-2 align-items-center mb-3">
  <label class="small text-secondary">Mes</label>
  <input cFormControl type="month" style="max-width: 180px" [(ngModel)]="period" (ngModelChange)="load()" />
</div>
<app-payroll-report-table [title]="'Rol general de ' + label(period)" [columns]="columns" [rows]="rows()" [totals]="totals()"
  [loading]="loading()" [error]="error()" [fileName]="'rol-general-' + period" empty="No hay roles aprobados en este mes." />`,
})
export class PayrollRollReportComponent implements OnInit {
  private svc = inject(PayrollReportsService);
  readonly columns = COLUMNS;
  readonly label = periodLabel;
  readonly rows = signal<ReportRow[]>([]);
  readonly totals = signal<ReportRow | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  period = ecuadorToday().slice(0, 7);

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(this.period)) return;
    const period = this.period;
    this.loading.set(true);
    try {
      const slips = await this.svc.approvedPayslips(period);
      if (period !== this.period) return;
      const rows = slips.sort((a, b) => a.employee.name.localeCompare(b.employee.name)).map(toRow);
      this.rows.set(rows);
      this.totals.set(totalsRow(COLUMNS, rows));
      this.error.set('');
    } catch (err) {
      this.error.set(payrollErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

function toRow(p: Payslip): ReportRow {
  const e = p.earnings, d = p.deductions;
  return {
    name: p.employee.name, taxId: p.employee.taxId, days: p.workedDays,
    salary: sumConcepts(e, ['salary']), overtime: sumConcepts(e, OVERTIME_CONCEPTS),
    bonus: sumConcepts(e, COMMISSION_BONUS_CONCEPTS), monthlyBonus: sumConcepts(e, MONTHLY_BONUS_CONCEPTS),
    reserve: sumConcepts(e, ['reserveFundMonthly']), gross: sumLines(e),
    iess: sumConcepts(d, ['iessPersonal']), advances: sumConcepts(d, ['advance']), loans: sumConcepts(d, ['loan']),
    other: sumConcepts(d, ['otherDeduction']), deductions: sumLines(d), net: p.netCents,
    payment: PAYMENT_STATUS[p.paymentStatus]?.label ?? '',
  };
}
