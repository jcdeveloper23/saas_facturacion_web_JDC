import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormModule, GridModule } from '@coreui/angular';

import { ASSUMED_IESS_HINT, BANK_ACCOUNT_TYPE_LABELS } from '../models/payroll-employee-profile.models';

/**
 * Ficha del colaborador › Banco, o › IESS e impuesto a la renta (`section`),
 * sobre el formulario del empleado.
 */
@Component({
  selector: 'app-payroll-employee-bank-iess-fields',
  standalone: true,
  imports: [ReactiveFormsModule, FormModule, GridModule],
  template: `
<c-row class="g-3" [formGroup]="group">
  @if (section === 'bank') {
    <c-col md="6"><label cLabel>Banco</label><input cFormControl formControlName="bankName" maxlength="80" placeholder="Ej.: Banco Pichincha" /></c-col>
    <c-col md="6">
      <label cLabel>Tipo de cuenta</label>
      <select cSelect formControlName="bankAccountType">
        <option value="">—</option>
        @for (o of entries(accountTypes); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
      </select>
    </c-col>
    <c-col md="12"><label cLabel>Número de cuenta</label><input cFormControl formControlName="bankAccount" maxlength="120" /></c-col>
  } @else {
    <c-col md="6"><label cLabel>Afiliación IESS</label><input cFormControl formControlName="iessNumber" /></c-col>
    <c-col md="12">
      <c-form-check>
        <input cFormCheckInput type="checkbox" id="emp-assumes-iess" formControlName="assumesIessPersonal" />
        <label cFormCheckLabel for="emp-assumes-iess">Asumir aporte IESS</label>
      </c-form-check>
      <small class="text-secondary">{{ assumedHint }}</small>
    </c-col>
    <c-col md="6">
      <label cLabel>Discapacidad (%)</label>
      <input cFormControl type="number" min="0" max="100" step="1" formControlName="disabilityPct" />
    </c-col>
    <c-col md="6">
      <label cLabel>Cargas familiares</label>
      <input cFormControl type="number" min="0" max="30" step="1" formControlName="familyDependents" />
    </c-col>
    <c-col md="12">
      <small class="text-secondary">
        La discapacidad y las cargas familiares se usarán para el impuesto a la renta (próximamente).
      </small>
    </c-col>
  }
</c-row>`,
})
export class EmployeeBankIessFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() section: 'bank' | 'iess' = 'bank';
  readonly accountTypes = BANK_ACCOUNT_TYPE_LABELS;
  readonly assumedHint = ASSUMED_IESS_HINT;
  readonly entries = (m: Record<string, string>) => Object.entries(m);
}
