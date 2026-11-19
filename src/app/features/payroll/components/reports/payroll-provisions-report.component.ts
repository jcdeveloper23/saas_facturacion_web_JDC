import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormModule } from '@coreui/angular';

import { Payslip, periodLabel } from '../../models/payroll.models';
import { ecuadorToday } from '../../models/payroll-payments.models';
import { ReportColumn, ReportRow, sumConcepts, totalsRow } from '../../models/payroll-reports.models';
import { PayrollReportsService } from '../../services/payroll-reports.service';
import { payrollErrorMessage } from '../../services/payroll.service';
import { ReportTableComponent } from './report-table.component';

const COLUMNS: ReportColumn[] = [
  { key: 'name', label: 'Empleado' }, { key: 'taxId', label: 'Cédula' },
  { key: 'employer', label: 'Aporte patronal', kind: 'money' }, { key: 'iece', label: 'IECE', kind: 'money' },
  { key: 'secap', label: 'SECAP', kind: 'money' }, { key: 'assumed', label: 'Aporte asumido', kind: 'money' },
  { key: 'thirteenth', label: 'Provisión 13.º', kind: 'money' }, { key: 'fourteenth', label: 'Provisión 14.º', kind: 'money' },
  { key: 'vacation', label: 'Provisión vacaciones', kind: 'money' }, { key: 'reserve', label: 'Fondos de reserva IESS', kind: 'money' },
];

/** Provisiones y aportes del mes, por empleado (roles aprobados). */
@Component({
  selector: 'app-payroll-provisions-report',
  standalone: true,
  imports: [FormsModule, FormModule, ReportTableComponent],
  template: `
<div class="d-flex gap-2 align-items-center mb-3">
  <label class="small text-secondary">Mes</label>
  <input cFormControl type="month" style="max-width: 180px" [(ngModel)]="period" (ngModelChange)="load()" />
</div>
<app-payroll-report-table [title]="'Provisiones y aportes de ' + label(period)" [columns]="columns" [rows]="rows()"
  [totals]="totals()" [loading]="loading()" [error]="error()" [fileName]="'provisiones-' + period"
  empty="No hay roles aprobados en este mes." />`,
})
export class PayrollProvisionsReportComponent implements OnInit {
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
  const c = p.employerCosts, v = p.provisions;
  return {
    name: p.employee.name, taxId: p.employee.taxId,
    employer: sumConcepts(c, ['iessEmployer']), iece: sumConcepts(c, ['iece']), secap: sumConcepts(c, ['secap']),
    assumed: sumConcepts(c, ['iessPersonalAssumed']),
    thirteenth: sumConcepts(v, ['thirteenthAccrued']), fourteenth: sumConcepts(v, ['fourteenthAccrued']),
    vacation: sumConcepts(v, ['vacationAccrued']), reserve: sumConcepts(v, ['reserveFundIess']),
  };
}
