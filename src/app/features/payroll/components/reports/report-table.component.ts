import { Component, Input } from '@angular/core';
import { AlertModule, ButtonModule, CardModule, SpinnerModule } from '@coreui/angular';

import { money } from '../../models/payroll.models';
import { ReportCell, ReportColumn, ReportRow, downloadCsv } from '../../models/payroll-reports.models';

/** La tabla de un reporte: filas, totales y «Exportar CSV» (los totales van al final del archivo). */
@Component({
  selector: 'app-payroll-report-table',
  standalone: true,
  imports: [AlertModule, ButtonModule, CardModule, SpinnerModule],
  template: `
<c-card>
  <c-card-header class="d-flex justify-content-between align-items-center">
    <span>{{ title }} @if (!loading && !error) { <small class="text-secondary">· {{ rows.length }} fila(s)</small> }</span>
    <button cButton color="secondary" variant="outline" size="sm" (click)="export()" [disabled]="loading || rows.length === 0">Exportar CSV</button>
  </c-card-header>
  @if (loading) {
    <c-card-body class="text-center py-5"><c-spinner color="primary"></c-spinner></c-card-body>
  } @else if (error) {
    <c-card-body><c-alert color="warning" class="mb-0">{{ error }}</c-alert></c-card-body>
  } @else if (rows.length === 0) {
    <c-card-body class="text-center text-secondary py-5">{{ empty }}</c-card-body>
  } @else {
    <div class="table-responsive">
      <table class="table table-sm table-hover mb-0 align-middle small">
        <thead>
          <tr>@for (c of columns; track c.key) { <th [class.text-end]="c.kind === 'money' || c.kind === 'number'" class="text-nowrap">{{ c.label }}</th> }</tr>
        </thead>
        <tbody>
          @for (r of rows; track $index) {
            <tr [class.table-light]="r['_subtotal']" [class.fw-semibold]="r['_subtotal']">
              @for (c of columns; track c.key) { <td [class]="cellClass(c)">{{ show(r[c.key], c) }}</td> }
            </tr>
          }
        </tbody>
        @if (totals) {
          <tfoot>
            <tr class="fw-semibold">@for (c of columns; track c.key) { <td [class]="cellClass(c)">{{ show(totals[c.key], c) }}</td> }</tr>
          </tfoot>
        }
      </table>
    </div>
  }
</c-card>`,
})
export class ReportTableComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) columns: ReportColumn[] = [];
  @Input() rows: ReportRow[] = [];
  @Input() totals: ReportRow | null = null;
  @Input() fileName = 'reporte-nomina';
  @Input() loading = false;
  @Input() error = '';
  @Input() empty = 'Sin datos para este filtro.';

  show(v: ReportCell | undefined, c: ReportColumn): string {
    if (c.kind === 'money') return money(Number(v || 0));
    return v === undefined || v === null ? '' : String(v);
  }

  cellClass(c: ReportColumn): string {
    return c.kind === 'money' ? 'text-end font-monospace text-nowrap' : c.kind === 'number' ? 'text-end' : '';
  }

  export(): void { downloadCsv(this.fileName, this.columns, this.totals ? [...this.rows, this.totals] : this.rows); }
}
