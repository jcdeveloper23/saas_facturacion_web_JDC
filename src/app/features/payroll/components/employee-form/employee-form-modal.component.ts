import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, ButtonModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollEmployee } from '../../models/payroll.models';
import { PayrollGroup } from '../../models/payroll-loans.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';
import { EmployeeIdentityFieldsComponent } from './employee-identity-fields.component';
import { EmployeeJobFieldsComponent } from './employee-job-fields.component';
import { EmployeeExtraFieldsComponent } from './employee-extra-fields.component';
import { emptyEmployeeForm, formFromEmployee, formProblem, taxIdProblem, toUpsertPayload } from './employee-form.logic';

/**
 * Alta y edición del colaborador, como el formulario del sistema actual: sin
 * elegir una persona. Alta: el servidor busca la persona por identificación
 * o la crea (NOMINA_COLABORADOR.md §5). Edición: la identificación no cambia.
 */
@Component({
  selector: 'app-payroll-employee-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, AlertModule, ButtonModule, ModalModule, SpinnerModule,
    EmployeeIdentityFieldsComponent, EmployeeJobFieldsComponent, EmployeeExtraFieldsComponent],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static" size="xl" scrollable>
  <c-modal-header>
    <h5 cModalTitle>{{ employee ? 'Editar colaborador' : 'Nuevo colaborador' }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    @if (!employee) {
      <c-alert color="info" class="py-2 small">Si la cédula ya existe en Clientes y proveedores, se usa esa persona.</c-alert>
    }
    <app-payroll-employee-identity-fields [group]="form" [groups]="groupOptions()" [editing]="!!employee"
      [taxIdError]="taxIdError()" [namesHint]="namesHint" />
    <hr />
    <app-payroll-employee-job-fields [group]="form" />
    <hr />
    <app-payroll-employee-extra-fields [group]="form" />
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="primary" (click)="save()" [disabled]="saving()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> }
      {{ employee ? 'Guardar' : 'Agregar a la nómina' }}
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class EmployeeFormModalComponent implements OnInit, OnDestroy {
  /** null = colaborador nuevo. */
  @Input() employee: PayrollEmployee | null = null;
  @Input() groups: PayrollGroup[] = [];
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private sub: Subscription | null = null;

  readonly form = this.fb.nonNullable.group(emptyEmployeeForm());
  readonly saving = signal(false);
  readonly taxIdError = signal('');
  readonly groupOptions = signal<PayrollGroup[]>([]);
  namesHint = '';

  async ngOnInit(): Promise<void> {
    const e = this.employee;
    // Activos, más el que ya tiene el colaborador aunque esté inactivo o borrado (no se pierde al guardar).
    const current = e?.groupId ?? '';
    const opts = this.groups.filter((g) => g.isActive || g.id === current).sort((a, b) => a.name.localeCompare(b.name));
    if (current && !opts.some((g) => g.id === current)) opts.unshift({ id: current, name: '(grupo borrado)', description: '', accounts: {}, isActive: false });
    this.groupOptions.set(opts);
    this.sub = this.form.valueChanges.subscribe(() =>
      this.taxIdError.set(taxIdProblem(this.form.controls.taxIdType.value, this.form.controls.taxId.value)));
    if (e) {
      if (!e.firstNames && !e.lastNames) this.namesHint = 'Separa el nombre completo: escribe aquí los apellidos y deja en Nombres solo los nombres.';
      this.form.reset(formFromEmployee(e, ''));
      if (e.taxIdType) this.form.controls.taxIdType.disable(); // los antiguos sin tipo lo eligen una vez
      const position = await this.svc.personaPosition(e.id);
      if (position && !this.form.controls.position.dirty) this.form.controls.position.setValue(position);
    }
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  async save(): Promise<void> {
    const v = this.form.getRawValue();
    const problem = formProblem(v);
    if (problem) { this.notifications.warning(problem); return; }
    const { person, employee } = toUpsertPayload(v);
    this.saving.set(true);
    try {
      const r = await this.svc.upsertEmployee({ ...(this.employee ? { personaId: this.employee.id } : {}), person, employee });
      this.notifications.success(this.employee ? 'Colaborador actualizado'
        : r.personaCreated ? 'Colaborador agregado a la nómina (y creado en Clientes y proveedores)'
          : 'Colaborador agregado a la nómina con la persona que ya existía');
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
