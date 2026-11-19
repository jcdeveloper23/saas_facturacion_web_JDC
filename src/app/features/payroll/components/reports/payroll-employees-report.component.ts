import { Component, OnInit, computed, inject, signal } from '@angular/core';

import {
  MODE_LABELS, PayrollEmployee, RESERVE_LABELS,
} from '../../models/payroll.models';
import { BANK_ACCOUNT_TYPE_LABELS } from '../../models/payroll-employee-profile.models';
import { ReportColumn, ReportRow } from '../../models/payroll-reports.models';
import { PayrollReportsService } from '../../services/payroll-reports.service';
import { payrollErrorMessage } from '../../services/payroll.service';
import { ReportTableComponent } from './report-table.component';

const COLUMNS: ReportColumn[] = [
  { key: 'name', label: 'Nombre' }, { key: 'taxId', label: 'Cédula' }, { key: 'hireDate', label: 'Ingreso' },
  { key: 'salary', label: 'Sueldo', kind: 'money' },
  { key: 'group', label: 'Grupo' }, { key: 'thirteenth', label: '13.º' }, { key: 'fourteenth', label: '14.º' },
  { key: 'reserve', label: 'Fondos de reserva' }, { key: 'assumed', label: 'Aporte asumido' },
  { key: 'disability', label: 'Discapacidad %', kind: 'number' }, { key: 'dependents', label: 'Cargas', kind: 'number' },
  { key: 'bank', label: 'Banco' }, { key: 'accountType', label: 'Tipo de cuenta' }, { key: 'account', label: 'N.º de cuenta' },
  { key: 'email', label: 'Correo' }, { key: 'status', label: 'Estado' },
];

/** Colaboradores con su ficha (filtro activos / inactivos / todos). */
@Component({
  selector: 'app-payroll-employees-report',
  standalone: true,
  imports: [ReportTableComponent],
  template: `
<div class="d-flex gap-2 mb-3">
  @for (o of filters; track o.id) {
    <button type="button" class="btn btn-sm" [class.btn-info]="filter() === o.id" [class.btn-light]="filter() !== o.id"
            (click)="filter.set(o.id)">{{ o.label }}</button>
  }
</div>
<app-payroll-report-table title="Colaboradores" [columns]="columns" [rows]="rows()" [loading]="loading()" [error]="error()"
  fileName="colaboradores" empty="No hay empleados con este filtro." />`,
})
export class PayrollEmployeesReportComponent implements OnInit {
  private svc = inject(PayrollReportsService);
  readonly columns = COLUMNS;
  readonly filters = [{ id: 'active', label: 'Activos' }, { id: 'inactive', label: 'Inactivos' }, { id: '', label: 'Todos' }] as const;
  readonly filter = signal<'active' | 'inactive' | ''>('active');
  private readonly employees = signal<PayrollEmployee[]>([]);
  private readonly groupNames = signal<Map<string, string>>(new Map());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = computed(() => this.employees()
    .filter((e) => this.filter() === '' || (this.filter() === 'active') === e.isActive)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => this.toRow(e)));

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const [emps, groups] = await Promise.all([this.svc.employees(), this.svc.groups()]);
      this.groupNames.set(new Map(groups.map((g) => [g.id, g.name])));
      this.employees.set(emps);
    } catch (err) {
      this.error.set(payrollErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  private toRow(e: PayrollEmployee): ReportRow {
    return {
      name: e.name, taxId: e.taxId, hireDate: e.hireDate.split('-').reverse().join('/'), salary: e.salaryCents,
      group: e.groupId ? this.groupNames().get(e.groupId) ?? '' : '', thirteenth: MODE_LABELS[e.thirteenthMode] ?? '',
      fourteenth: MODE_LABELS[e.fourteenthMode] ?? '', reserve: RESERVE_LABELS[e.reserveFundMode] ?? '',
      assumed: e.assumesIessPersonal ? 'Sí' : 'No', disability: e.disabilityPct, dependents: e.familyDependents,
      bank: e.bankName, accountType: BANK_ACCOUNT_TYPE_LABELS[e.bankAccountType] ?? '', account: e.bankAccount,
      email: e.email, status: e.isActive ? 'Activo' : 'Inactivo',
    };
  }
}
