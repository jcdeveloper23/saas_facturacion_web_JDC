import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormModule } from '@coreui/angular';

import { Account } from '../../accounting/models/account.interface';
import {
  PAYROLL_ACCOUNT_GROUPS, PAYROLL_ACCOUNT_LABELS, PayrollAccountKey,
} from '../models/payroll-payments.models';

/** Lo que aplica si la fila queda vacía (la sugerida, o la de la empresa en un grupo). */
export type AccountBaseline = (key: PayrollAccountKey) => { code: string; note: string };

/**
 * Las 25 claves de cuentas de nómina en grupos (Ingresos y gasto, Por pagar,
 * Provisiones, Descuentos y préstamos), con un código editable elegido de las
 * cuentas de movimiento del plan. La usan Cuentas de nómina y los grupos de
 * colaboradores. Edita el objeto `edits` que le pasan.
 */
@Component({
  selector: 'app-payroll-account-table',
  standalone: true,
  imports: [FormsModule, FormModule],
  template: `
<datalist [id]="listId">
  @for (a of accounts; track a.id) { <option [value]="a.code">{{ a.name }}</option> }
</datalist>
<div class="table-responsive">
  <table class="table table-sm mb-0 align-middle">
    <thead>
      <tr><th style="width: 32%">Concepto</th><th style="width: 30%">{{ baselineTitle }}</th><th>{{ editTitle }}</th></tr>
    </thead>
    <tbody>
      @for (g of groups; track g.title) {
        <tr class="table-light"><th colspan="3" class="small text-uppercase text-secondary">{{ g.title }}</th></tr>
        @for (k of g.keys; track k) {
          @let s = baseline(k);
          <tr [class.table-warning]="isChanged(k)">
            <td>{{ labels[k] }}</td>
            <td class="small">
              @if (s.code) { <span class="font-monospace">{{ s.code }}</span> <span class="text-secondary">{{ nameOf(s.code) }}</span> }
              @if (s.note) { <span class="text-secondary"> {{ s.note }}</span> }
            </td>
            <td>
              <input cFormControl sizing="sm" class="font-monospace" [attr.list]="listId"
                     [(ngModel)]="edits[k]" [placeholder]="s.code || emptyPlaceholder" />
              @if (unknown(k)) {
                <small class="text-danger">No es una cuenta de movimiento activa del plan.</small>
              } @else if (nameOf(edits[k])) {
                <small class="text-secondary">{{ nameOf(edits[k]) }}</small>
              }
            </td>
          </tr>
        }
      }
    </tbody>
  </table>
</div>`,
})
export class PayrollAccountTableComponent {
  @Input({ required: true }) edits!: Partial<Record<PayrollAccountKey, string>>;
  @Input({ required: true }) baseline!: AccountBaseline;
  /** Lo guardado: una fila distinta se resalta. */
  @Input() saved: Partial<Record<PayrollAccountKey, string>> = {};
  @Input() set accounts(v: Account[]) { this._accounts = v ?? []; this.byCode = new Map(this._accounts.map((a) => [a.code, a.name])); }
  get accounts(): Account[] { return this._accounts; }
  @Input() baselineTitle = 'Sugerida';
  @Input() editTitle = 'Cuenta de la empresa';
  @Input() emptyPlaceholder = 'Vacío = sugerida';
  @Input() listId = 'payroll-movement-accounts';

  private _accounts: Account[] = [];
  private byCode = new Map<string, string>();
  readonly groups = PAYROLL_ACCOUNT_GROUPS;
  readonly labels = PAYROLL_ACCOUNT_LABELS;

  nameOf(code: string | undefined): string { return code ? this.byCode.get(code.trim()) ?? '' : ''; }
  isChanged(k: PayrollAccountKey): boolean { return String(this.edits[k] ?? '').trim() !== (this.saved?.[k] ?? ''); }

  /** Un código que no está entre las cuentas de movimiento activas (aviso; el servidor rechaza). */
  unknown(k: PayrollAccountKey): boolean {
    const code = String(this.edits[k] ?? '').trim();
    return !!code && this._accounts.length > 0 && !this.byCode.has(code);
  }
}
