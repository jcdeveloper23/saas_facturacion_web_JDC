import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { EmployeeFormModalComponent } from '../../components/employee-form/employee-form-modal.component';
import { PayrollEmployee, money } from '../../models/payroll.models';
import { PayrollGroup } from '../../models/payroll-loans.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';
import { PayrollLoansService } from '../../services/payroll-loans.service';

/**
 * Nómina › Empleados (§7.2): lista con contadores; el alta y la edición van en
 * el formulario del colaborador (NOMINA_COLABORADOR.md §5), sin elegir persona.
 */
@Component({
  selector: 'app-payroll-employees-page',
  standalone: true,
  templateUrl: './employees-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule,
    PayrollTabsComponent, EmployeeFormModalComponent],
})
export class EmployeesPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollService);
  private loansSvc = inject(PayrollLoansService);
  private sub = new Subscription();

  readonly employees = signal<PayrollEmployee[]>([]);
  readonly groups = signal<PayrollGroup[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly filter = signal<'active' | 'inactive' | ''>('active');
  readonly showModal = signal(false);
  readonly editing = signal<PayrollEmployee | null>(null);

  readonly money = money;

  readonly active = computed(() => this.employees().filter((e) => e.isActive));
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.employees()
      .filter((e) => this.filter() === '' || (this.filter() === 'active') === e.isActive)
      .filter((e) => !q || [e.name, e.taxId, e.iessNumber].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  groupName(id: string): string { return id ? this.groups().find((g) => g.id === id)?.name ?? '(grupo borrado)' : ''; }

  ngOnInit(): void {
    this.sub.add(this.svc.employees().subscribe({
      next: (e) => { this.employees.set(e); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    }));
    this.sub.add(this.loansSvc.groups().subscribe({ next: (g) => this.groups.set(g), error: () => {} }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  openNew(): void { this.editing.set(null); this.showModal.set(true); }
  openEdit(e: PayrollEmployee): void { this.editing.set(e); this.showModal.set(true); }
}
