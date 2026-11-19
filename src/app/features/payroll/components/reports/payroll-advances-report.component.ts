import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormModule } from '@coreui/angular';

import { periodLabel } from '../../models/payroll.models';
import { PayrollAdvance, dayLabel, ecuadorToday } from '../../models/payroll-payments.models';
import { ReportColumn, ReportRow, totalsRow } from '../../models/payroll-reports.models';
import { PayrollReportsService } from '../../services/payroll-reports.service';
import { payrollErrorMessage } from '../../services/payroll.service';
import { ReportTableComponent } from './report-table.component';

const COLUMNS: ReportColumn[] = [
  { key: 'number', label: 'Número' }, { key: 'employee', label: 'Empleado' }, { key: 'date', label: 'Fecha' },
  { key: 'period', label: 'Mes de descuento' }, { key: 'amount', label: 'Valor', kind: 'money' }, { key: 'source', label: 'Origen' },
];

/** Anticipos registrados (no anulados) que se descuentan entre dos meses, con subtotal por empleado. */
@Component({
  selector: 'app-payroll-advances-report',
  standalone: true,
  imports: [FormsModule, FormModule, ReportTableComponent],
  template: `
<div class="d-flex flex-wrap gap-2 align-items-center mb-3">
  <label class="small text-secondary">Desde</label>
  <input cFormControl type="month" style="max-width: 180px" [(ngModel)]="from" (ngModelChange)="load()" />
  <label class="small text-secondary">Hasta</label>
  <input cFormControl type="month" style="max-width: 180px" [(ngModel)]="to" (ngModelChange)="load()" />
</div>
<app-payroll-report-table [title]="'Anticipos de ' + label(from) + ' a ' + label(to)" [columns]="columns" [rows]="rows()"
  [totals]="totals()" [loading]="loading()" [error]="error()" [fileName]="'anticipos-' + from + '-' + to"
  empty="No hay anticipos que se descuenten en esos meses." />`,
})
export class PayrollAdvancesReportComponent implements OnInit {
  private svc = inject(PayrollReportsService);
  readonly columns = COLUMNS;
  readonly label = periodLabel;
  readonly rows = signal<ReportRow[]>([]);
  readonly totals = signal<ReportRow | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  from = `${ecuadorToday().slice(0, 4)}-01`;
  to = ecuadorToday().slice(0, 7);

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(this.from) || !/^\d{4}-\d{2}$/.test(this.to)) return;
    if (this.to < this.from) { this.error.set('El mes «hasta» no puede ser antes de «desde».'); this.rows.set([]); return; }
    const key = this.from + this.to;
    this.loading.set(true);
    try {
      const list = await this.svc.advancesBetween(this.from, this.to);
      if (key !== this.from + this.to) return;
      const rows = withSubtotals(list);
      this.rows.set(rows);
      this.totals.set(totalsRow(COLUMNS, rows.filter((r) => !r['_subtotal'])));
      this.error.set('');
    } catch (err) {
      this.error.set(payrollErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

/** Filas por empleado y, tras cada uno, su subtotal (marcado `_subtotal`, no suma al total). */
function withSubtotals(list: PayrollAdvance[]): ReportRow[] {
  const sorted = [...list].sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date));
  const out: ReportRow[] = [];
  let current = '';
  let sum = 0;
  const flush = () => { if (current) out.push({ number: '', employee: `Subtotal ${current}`, date: '', period: '', amount: sum, source: '', _subtotal: 1 }); };
  for (const a of sorted) {
    if (a.employeeName !== current) { flush(); current = a.employeeName; sum = 0; }
    sum += a.amountCents;
    out.push({ number: a.number, employee: a.employeeName, date: dayLabel(a.date), period: periodLabel(a.period),
      amount: a.amountCents, source: a.sourceLabel });
  }
  flush();
  return out;
}
