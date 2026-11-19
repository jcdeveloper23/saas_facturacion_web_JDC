import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormModule, GridModule } from '@coreui/angular';

import {
  ASSUMED_IESS_HINT, BANK_ACCOUNT_TYPE_LABELS, EDUCATION_LABELS,
} from '../../models/payroll-employee-profile.models';

/**
 * Formulario del colaborador, tercer bloque: banco, qué acumula, aporte
 * asumido, cargas, observación, descripción, instrucción, título y código IESS.
 */
@Component({
  selector: 'app-payroll-employee-extra-fields',
  standalone: true,
  imports: [ReactiveFormsModule, FormModule, GridModule],
  template: `
<c-row class="g-3" [formGroup]="group">
  <c-col md="4">
    <label cLabel>Tipo de cuenta</label>
    <select cSelect formControlName="bankAccountType">
      <option value="">—</option>
      @for (o of entries(accountTypes); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4"><label cLabel>Banco</label><input cFormControl formControlName="bankName" maxlength="80" placeholder="Ej.: Banco Pichincha" /></c-col>
  <c-col md="4"><label cLabel>Número cuenta bancaria</label><input cFormControl formControlName="bankAccount" maxlength="120" /></c-col>
  <c-col md="12" class="d-flex flex-wrap gap-4">
    <c-form-check>
      <input cFormCheckInput type="checkbox" id="emp-acc-reserve" formControlName="accReserve" />
      <label cFormCheckLabel for="emp-acc-reserve">Acumula fondos de reserva</label>
    </c-form-check>
    <c-form-check>
      <input cFormCheckInput type="checkbox" id="emp-acc-13" formControlName="accThirteenth" />
      <label cFormCheckLabel for="emp-acc-13">Acumula XIII</label>
    </c-form-check>
    <c-form-check>
      <input cFormCheckInput type="checkbox" id="emp-acc-14" formControlName="accFourteenth" />
      <label cFormCheckLabel for="emp-acc-14">Acumula XIV</label>
    </c-form-check>
  </c-col>
  <c-col md="12">
    <small class="text-secondary">Por ley se pagan cada mes en el rol; se acumulan solo si el trabajador lo pidió por escrito.
      Los fondos de reserva acumulados se depositan en el IESS.</small>
  </c-col>
  <c-col md="8">
    <c-form-check>
      <input cFormCheckInput type="checkbox" id="emp-assumes-iess" formControlName="assumesIessPersonal" />
      <label cFormCheckLabel for="emp-assumes-iess">Asumir aporte IESS</label>
    </c-form-check>
    <small class="text-secondary">{{ assumedHint }}</small>
  </c-col>
  <c-col md="4">
    <label cLabel>Cargas familiares</label>
    <input cFormControl type="number" min="0" max="30" step="1" formControlName="familyDependents" />
  </c-col>
  <c-col md="12">
    <small class="text-secondary">La discapacidad y las cargas familiares se usarán para el impuesto a la renta (próximamente).</small>
  </c-col>
  <c-col md="6"><label cLabel>Observación</label><textarea cFormControl rows="2" formControlName="notes" maxlength="500"></textarea></c-col>
  <c-col md="6"><label cLabel>Descripción</label><textarea cFormControl rows="2" formControlName="description" maxlength="500"></textarea></c-col>
  <c-col md="4">
    <label cLabel>Instrucción</label>
    <select cSelect formControlName="education">
      <option value="">—</option>
      @for (o of entries(education); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4"><label cLabel>Título</label><input cFormControl formControlName="title" maxlength="120" /></c-col>
  <c-col md="4"><label cLabel>Código IESS</label><input cFormControl formControlName="iessNumber" maxlength="30" /></c-col>
</c-row>`,
})
export class EmployeeExtraFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
  readonly accountTypes = BANK_ACCOUNT_TYPE_LABELS;
  readonly education = EDUCATION_LABELS;
  readonly assumedHint = ASSUMED_IESS_HINT;
  readonly entries = (m: Record<string, string>) => Object.entries(m);
}
