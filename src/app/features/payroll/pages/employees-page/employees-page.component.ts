import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, GridModule, ModalModule, SpinnerModule,
} from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import {
  CONTRACT_LABELS, EXPENSE_LABELS, MODE_LABELS, PayrollEmployee, REGION_LABELS, RESERVE_LABELS, WORKDAY_LABELS,
  money, parseMoneyCents,
} from '../../models/payroll.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

/** Nómina › Empleados (§7.2): lista con contadores y ficha en modal. Guarda con upsertPayrollEmployee. */
@Component({
  selector: 'app-payroll-employees-page',
  standalone: true,
  templateUrl: './employees-page.component.html',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AlertModule, BadgeModule, ButtonModule, CardModule,
    FormModule, GridModule, ModalModule, SpinnerModule, PayrollTabsComponent],
})
export class EmployeesPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private sub = new Subscription();

  readonly employees = signal<PayrollEmployee[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly filter = signal<'active' | 'inactive' | ''>('active');
  readonly showModal = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<PayrollEmployee | null>(null);
  readonly personas = signal<{ id: string; name: string; taxId: string; email: string }[]>([]);

  readonly labels = { CONTRACT_LABELS, WORKDAY_LABELS, REGION_LABELS, EXPENSE_LABELS, MODE_LABELS, RESERVE_LABELS };
  readonly entries = (m: Record<string, string>) => Object.entries(m);
  readonly money = money;

  readonly active = computed(() => this.employees().filter((e) => e.isActive));
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.employees()
      .filter((e) => this.filter() === '' || (this.filter() === 'active') === e.isActive)
      .filter((e) => !q || [e.name, e.taxId, e.iessNumber].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  form = this.fb.nonNullable.group({
    personaId: ['', Validators.required],
    salary: ['', Validators.required],
    hireDate: ['', Validators.required],
    endDate: [''],
    contractType: ['indefinite'],
    workdayType: ['full'],
    region: ['sierra'],
    expenseGroup: ['admin'],
    iessNumber: [''],
    // El mismo patrón que el servidor (validateEmployee): exige dominio con punto.
    email: ['', Validators.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)],
    bankAccount: [''],
    thirteenthMode: ['monthly'],
    fourteenthMode: ['monthly'],
    reserveFundMode: ['monthly'],
    isActive: [true],
  });

  ngOnInit(): void {
    this.sub.add(this.svc.employees().subscribe({
      next: (e) => { this.employees.set(e); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  async openNew(): Promise<void> {
    this.editing.set(null);
    this.form.reset();
    this.form.controls.personaId.enable();
    this.showModal.set(true);
    try {
      const taken = new Set(this.employees().map((e) => e.id));
      this.personas.set((await this.svc.employeePersonas()).filter((p) => !taken.has(p.id)));
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    }
  }

  openEdit(e: PayrollEmployee): void {
    this.editing.set(e);
    this.personas.set([{ id: e.id, name: e.name, taxId: e.taxId, email: e.email }]);
    this.form.reset({
      personaId: e.id, salary: (e.salaryCents / 100).toFixed(2), hireDate: e.hireDate, endDate: e.endDate ?? '',
      contractType: e.contractType, workdayType: e.workdayType, region: e.region, expenseGroup: e.expenseGroup,
      iessNumber: e.iessNumber, email: e.email, bankAccount: e.bankAccount, thirteenthMode: e.thirteenthMode,
      fourteenthMode: e.fourteenthMode, reserveFundMode: e.reserveFundMode, isActive: e.isActive,
    });
    this.form.controls.personaId.disable();
    this.showModal.set(true);
  }

  onPersona(id: string): void {
    const p = this.personas().find((x) => x.id === id);
    if (p && !this.form.controls.email.value) this.form.controls.email.setValue(p.email);
  }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    const salaryCents = parseMoneyCents(v.salary);
    if (!salaryCents) { this.notifications.warning('Escribe el sueldo con decimales, sin separador de miles: p. ej. 1234,56.'); return; }
    if (v.endDate && v.endDate < v.hireDate) { this.notifications.warning('La salida no puede ser antes del ingreso.'); return; }
    const p = this.personas().find((x) => x.id === v.personaId);
    this.saving.set(true);
    try {
      await this.svc.upsertEmployee(v.personaId, {
        name: p?.name ?? '', taxId: p?.taxId ?? '', email: v.email.trim(), iessNumber: v.iessNumber.trim(),
        hireDate: v.hireDate, endDate: v.endDate || null, contractType: v.contractType, salaryCents,
        workdayType: v.workdayType as 'full' | 'efficient', region: v.region as 'sierra' | 'costa',
        expenseGroup: v.expenseGroup as 'admin' | 'sales', thirteenthMode: v.thirteenthMode as any,
        fourteenthMode: v.fourteenthMode as any, reserveFundMode: v.reserveFundMode as any,
        bankAccount: v.bankAccount.trim(), isActive: v.isActive,
      });
      this.notifications.success(this.editing() ? 'Empleado actualizado' : 'Empleado agregado a la nómina');
      this.showModal.set(false);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
