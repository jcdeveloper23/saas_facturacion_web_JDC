import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormModule } from '@coreui/angular';

import { Payslip, sumLines } from '../../models/payroll.models';
import { ecuadorToday } from '../../models/payroll-payments.models';
import { ReportColumn, ReportRow, sumConcepts, totalsRow } from '../../models/payroll-reports.models';
import { PayrollReportsService } from '../../services/payroll-reports.service';
import { payrollErrorMessage } from '../../services/payroll.service';
import { ReportTableComponent } from './report-table.component';

const COLUMNS: ReportColumn[] = [
  { key: 'name', label: 'Empleado' }, { key: 'taxId', label: 'Cédula' },
  { key: 'months', label: 'Meses con rol', kind: 'number' }, { key: 'gross', label: 'Total ingresos', kind: 'money' },
  { key: 'iess', label: 'Aporte personal', kind: 'money' }, { key: 'net', label: 'Neto', kind: 'money' },
  { key: 'thirteenth', label: 'Provisión 13.º acumulada', kind: 'money' },
  { key: 'fourteenth', label: 'Provisión 14.º acumulada', kind: 'money' },
];

/** Acumulado del año por empleado (roles aprobados de enero a diciembre). */
@Component({
  selector: 'app-payroll-yearly-report',
  standalone: true,
  imports: [FormsModule, FormModule, ReportTableComponent],
  template: `
<div class="d-flex gap-2 align-items-center mb-3">
  <label class="small text-secondary">Año</label>
  <select cSelect style="max-width: 120px" [(ngModel)]="year" (ngModelChange)="load()">
    @for (y of years; track y) { <option [ngValue]="y">{{ y }}</option> }
  </select>
</div>
<app-payroll-report-table [title]="'Acumulado ' + year" [columns]="columns" [rows]="rows()" [totals]="totals()"
  [loading]="loading()" [error]="error()" [fileName]="'acumulado-' + year" empty="No hay roles aprobados en este año." />`,
})
export class PayrollYearlyReportComponent implements OnInit {
  private svc = inject(PayrollReportsService);
  readonly columns = COLUMNS;
  readonly years = Array.from({ length: 5 }, (_, i) => Number(ecuadorToday().slice(0, 4)) - i);
  readonly rows = signal<ReportRow[]>([]);
  readonly totals = signal<ReportRow | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  year = this.years[0];

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    const year = Number(this.year);
    this.loading.set(true);
    try {
      const slips = await this.svc.approvedPayslipsBetween(`${year}-01`, `${year}-12`);
      if (year !== Number(this.year)) return;
      const rows = aggregate(slips).sort((a, b) => String(a['name']).localeCompare(String(b['name'])));
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

function aggregate(slips: Payslip[]): ReportRow[] {
  const by = new Map<string, ReportRow & { _periods: Set<string> }>();
  for (const p of slips) {
    let r = by.get(p.employeeId);
    if (!r) {
      r = { name: p.employee.name, taxId: p.employee.taxId, months: 0, gross: 0, iess: 0, net: 0, thirteenth: 0, fourteenth: 0,
        _periods: new Set<string>() } as any;
      by.set(p.employeeId, r!);
    }
    const row = r!;
    row._periods.add(p.period);
    row['gross'] = Number(row['gross']) + sumLines(p.earnings);
    row['iess'] = Number(row['iess']) + sumConcepts(p.deductions, ['iessPersonal']);
    row['net'] = Number(row['net']) + p.netCents;
    row['thirteenth'] = Number(row['thirteenth']) + sumConcepts(p.provisions, ['thirteenthAccrued']);
    row['fourteenth'] = Number(row['fourteenth']) + sumConcepts(p.provisions, ['fourteenthAccrued']);
  }
  return [...by.values()].map(({ _periods, ...r }) => ({ ...r, months: _periods.size }));
}
