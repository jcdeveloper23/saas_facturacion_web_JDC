import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, FormModule, GridModule } from '@coreui/angular';

import { BankAccountsService } from '../../accounting/services/bank-accounts.service';
import { ChartOfAccountsService } from '../../accounting/services/chart-of-accounts.service';
import { BankAccount } from '../../accounting/models/bank-account.interface';
import { Account } from '../../accounting/models/account.interface';
import { SRI_PAYMENT_METHODS } from '../../invoices/models/invoice.interface';
import { CHEQUE_METHOD_CODE, MoneySourceForm } from '../models/payroll-payments.models';

/**
 * «De dónde sale el dinero», igual que los comprobantes de egreso
 * (NOMINA_PAGOS.md §3): una cuenta de banco o caja con su forma de pago de la
 * Tabla 24 del SRI, o «Cargo cuenta contable» (una cuenta de movimiento del
 * plan). Edita el objeto `source` que le pasan.
 */
@Component({
  selector: 'app-payroll-money-source-fields',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertModule, FormModule, GridModule],
  template: `
<c-row class="g-2">
  <c-col md="12">
    <label cLabel>De dónde sale el dinero *</label>
    <div>
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" [name]="name" id="{{ name }}-bank" value="bank" [(ngModel)]="source.mode" />
        <label class="form-check-label" for="{{ name }}-bank">Cuenta de banco o caja</label>
      </div>
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" [name]="name" id="{{ name }}-account" value="account" [(ngModel)]="source.mode" />
        <label class="form-check-label" for="{{ name }}-account">Cargo a cuenta contable</label>
      </div>
    </div>
  </c-col>
  @if (source.mode === 'bank') {
    <c-col md="5">
      <label cLabel>Cuenta de banco o caja *</label>
      <select cSelect [(ngModel)]="source.bankAccountId">
        <option value="">Elegir</option>
        @for (b of banks(); track b.id) {
          <option [value]="b.id">{{ b.bankName }} {{ b.accountNumber }} · {{ b.linkedGlCode }}</option>
        }
      </select>
    </c-col>
    <c-col md="4">
      <label cLabel>Forma de pago (SRI) *</label>
      <select cSelect [(ngModel)]="source.paymentMethodCode">
        @for (m of methods; track m.code) { <option [value]="m.code">{{ m.code }} · {{ m.name }}</option> }
      </select>
    </c-col>
    @if (source.paymentMethodCode === chequeCode) {
      <c-col md="3">
        <label cLabel>N.º de cheque</label>
        <input cFormControl [(ngModel)]="source.chequeNumber" placeholder="Si pagas con cheque" />
      </c-col>
    }
    @if (loaded() && banks().length === 0) {
      <c-col md="12">
        <c-alert color="warning" class="py-2 small mb-0">
          No hay cuentas de banco o caja activas con cuenta contable. Créalas en Contabilidad › Bancos, o usa «Cargo a cuenta contable».
        </c-alert>
      </c-col>
    }
  } @else {
    <c-col md="12">
      <label cLabel>Cuenta contable (Haber) *</label>
      <input cFormControl [(ngModel)]="source.creditAccountCode" [attr.list]="name + '-accounts'" placeholder="Ej.: 1.1.01.001 (Caja)" />
      <datalist [id]="name + '-accounts'">
        @for (a of accounts(); track a.id) { <option [value]="a.code">{{ a.name }}</option> }
      </datalist>
      @if (accountName()) { <small class="text-secondary">{{ accountName() }}</small> }
    </c-col>
  }
  @if (loadError()) {
    <c-col md="12"><c-alert color="warning" class="py-2 small mb-0">{{ loadError() }}</c-alert></c-col>
  }
</c-row>`,
})
export class MoneySourceFieldsComponent implements OnInit, OnDestroy {
  @Input({ required: true }) source!: MoneySourceForm;
  /** Prefijo de los ids (hay dos formularios en la app que pueden convivir). */
  @Input() name = 'money-source';

  private bankSvc = inject(BankAccountsService);
  private chartSvc = inject(ChartOfAccountsService);
  private sub = new Subscription();

  readonly banks = signal<BankAccount[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal('');
  readonly methods = SRI_PAYMENT_METHODS;
  readonly chequeCode = CHEQUE_METHOD_CODE;
  private readonly byCode = computed(() => new Map(this.accounts().map((a) => [a.code, a.name])));

  accountName(): string { return this.byCode().get(this.source.creditAccountCode.trim()) ?? ''; }

  ngOnInit(): void {
    const fail = () => this.loadError.set('No se pudieron leer las cuentas de banco o el plan de cuentas.');
    // Como el servidor: activa y con cuenta contable ligada (payroll-posting.ts).
    this.sub.add(this.bankSvc.getBankAccounts().subscribe({
      next: (b) => { this.banks.set(b.filter((x) => x.isActive && !!x.linkedGlCode)); this.loaded.set(true); },
      error: fail,
    }));
    this.sub.add(this.chartSvc.getActiveMovementAccounts().subscribe({ next: (a) => this.accounts.set(a), error: fail }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }
}
