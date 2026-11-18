import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { Account } from '../../accounting/models/account.interface';
import { PAYROLL_ACCOUNT_LABELS, PayrollAccountKey, PayrollAccountsView } from '../models/payroll-payments.models';
import { PayrollAccountMap, PayrollGroup, companyAccountFor } from '../models/payroll-loans.models';
import { PayrollLoansService } from '../services/payroll-loans.service';
import { payrollErrorMessage } from '../services/payroll.service';
import { AccountBaseline, PayrollAccountTableComponent } from './payroll-account-table.component';

/**
 * Alta o edición de un grupo de colaboradores (upsertPayrollGroup). Las
 * cuentas del grupo van encima de las de la empresa: vacía = la de la empresa.
 * `accounts` reemplaza las del grupo, así que se mandan todas las que quedan.
 */
@Component({
  selector: 'app-payroll-group-modal',
  standalone: true,
  imports: [FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule,
    PayrollAccountTableComponent],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static" size="xl" scrollable>
  <c-modal-header>
    <h5 cModalTitle>{{ group ? 'Editar grupo' : 'Nuevo grupo de colaboradores' }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    <c-row class="g-2 mb-3 align-items-end">
      <c-col md="4"><label cLabel>Nombre *</label><input cFormControl [(ngModel)]="name" maxlength="80" /></c-col>
      <c-col md="6"><label cLabel>Descripción</label><input cFormControl [(ngModel)]="description" maxlength="200" /></c-col>
      <c-col md="2">
        <div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" id="group-active" [(ngModel)]="isActive" />
          <label class="form-check-label" for="group-active">Activo</label>
        </div>
      </c-col>
    </c-row>
    <h6 class="mb-1">Cuentas propias del grupo</h6>
    <small class="text-secondary d-block mb-2">
      Llena solo las que cambian para este grupo; las vacías usan la cuenta de la empresa (Nómina › Cuentas).
      Rigen para las nóminas que se aprueben desde ahora.
    </small>
    @if (companyError) { <c-alert color="warning" class="py-2 small">{{ companyError }}</c-alert> }
    <app-payroll-account-table [edits]="edits" [baseline]="baseline" [saved]="group?.accounts ?? {}" [accounts]="accounts"
      baselineTitle="Cuenta de la empresa" editTitle="Cuenta del grupo" emptyPlaceholder="Vacío = la de la empresa"
      listId="payroll-group-accounts" />
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="primary" (click)="save()" [disabled]="saving()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Guardar
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class GroupModalComponent implements OnInit {
  /** null = grupo nuevo. */
  @Input() group: PayrollGroup | null = null;
  /** Las cuentas de la empresa (getPayrollAccounts), para mostrar qué aplica si se deja vacía. */
  @Input() companyAccounts: PayrollAccountsView | null = null;
  @Input() companyError = '';
  @Input() accounts: Account[] = [];
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollLoansService);
  private notifications = inject(NotificationService);

  readonly saving = signal(false);
  name = '';
  description = '';
  isActive = true;
  edits: PayrollAccountMap = {};

  readonly baseline: AccountBaseline = (k) => companyAccountFor(this.companyAccounts, k);

  ngOnInit(): void {
    const g = this.group;
    this.name = g?.name ?? '';
    this.description = g?.description ?? '';
    this.isActive = g?.isActive ?? true;
    this.edits = Object.fromEntries(Object.keys(PAYROLL_ACCOUNT_LABELS).map((k) => [k, g?.accounts[k as PayrollAccountKey] ?? '']));
  }

  async save(): Promise<void> {
    if (!this.name.trim()) { this.notifications.warning('Escribe el nombre del grupo.'); return; }
    const accounts = Object.fromEntries(Object.entries(this.edits)
      .map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)) as PayrollAccountMap;
    this.saving.set(true);
    try {
      const r = await this.svc.upsertGroup({
        ...(this.group ? { groupId: this.group.id } : {}),
        name: this.name.trim(), description: this.description.trim(), accounts, isActive: this.isActive,
      });
      this.notifications.success(r.created ? 'Grupo creado' : 'Grupo actualizado');
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
