import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormModule } from '@coreui/angular';

import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { PayrollRollReportComponent } from '../../components/reports/payroll-roll-report.component';
import { PayrollProvisionsReportComponent } from '../../components/reports/payroll-provisions-report.component';
import { PayrollYearlyReportComponent } from '../../components/reports/payroll-yearly-report.component';
import { PayrollAdvancesReportComponent } from '../../components/reports/payroll-advances-report.component';
import { PayrollLoansReportComponent } from '../../components/reports/payroll-loans-report.component';
import { PayrollEmployeesReportComponent } from '../../components/reports/payroll-employees-report.component';

type ReportId = 'roll' | 'provisions' | 'yearly' | 'advances' | 'loans' | 'employees';

/** Nómina › Reportes: solo lectura, sobre las colecciones que ya existen. Cada reporte es su propio componente. */
@Component({
  selector: 'app-payroll-reports-page',
  standalone: true,
  imports: [FormsModule, FormModule, PayrollTabsComponent, PayrollRollReportComponent, PayrollProvisionsReportComponent,
    PayrollYearlyReportComponent, PayrollAdvancesReportComponent, PayrollLoansReportComponent, PayrollEmployeesReportComponent],
  template: `
<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
  <div>
    <h4 class="mb-0">Reportes de nómina</h4>
    <small class="text-secondary">Solo lectura · los roles cuentan solo si están aprobados</small>
  </div>
  <select cSelect style="max-width: 320px" [ngModel]="report()" (ngModelChange)="report.set($event)">
    @for (r of reports; track r.id) { <option [value]="r.id">{{ r.label }}</option> }
  </select>
</div>

<app-payroll-tabs />

@switch (report()) {
  @case ('roll') { <app-payroll-roll-report /> }
  @case ('provisions') { <app-payroll-provisions-report /> }
  @case ('yearly') { <app-payroll-yearly-report /> }
  @case ('advances') { <app-payroll-advances-report /> }
  @case ('loans') { <app-payroll-loans-report /> }
  @case ('employees') { <app-payroll-employees-report /> }
}`,
})
export class ReportsPageComponent {
  readonly reports: { id: ReportId; label: string }[] = [
    { id: 'roll', label: 'Rol general del mes' },
    { id: 'provisions', label: 'Provisiones y aportes del mes' },
    { id: 'yearly', label: 'Acumulado del año por empleado' },
    { id: 'advances', label: 'Anticipos' },
    { id: 'loans', label: 'Préstamos vigentes' },
    { id: 'employees', label: 'Colaboradores' },
  ];
  readonly report = signal<ReportId>('roll');
}
