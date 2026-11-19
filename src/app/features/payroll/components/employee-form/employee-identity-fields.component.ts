import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormModule, GridModule } from '@coreui/angular';

import { PayrollGroup } from '../../models/payroll-loans.models';
import {
  COLLABORATOR_TYPE_LABELS, MARITAL_LABELS, PERSON_ID_TYPE_LABELS, SEX_LABELS,
} from '../../models/payroll-employee-profile.models';

/**
 * Formulario del colaborador, primer bloque (orden del sistema actual): tipo,
 * identificación, grupo, nombres y datos personales.
 */
@Component({
  selector: 'app-payroll-employee-identity-fields',
  standalone: true,
  imports: [ReactiveFormsModule, FormModule, GridModule],
  template: `
<c-row class="g-3" [formGroup]="group">
  <c-col md="4">
    <label cLabel>Tipo colaborador</label>
    <select cSelect formControlName="collaboratorType">
      <option value="">—</option>
      @for (o of entries(collaborator); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Tipo identificación *</label>
    <select cSelect formControlName="taxIdType">
      @for (o of entries(idTypes); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Grupo colaborador</label>
    <select cSelect formControlName="groupId">
      <option value="">Sin grupo</option>
      @for (g of groups; track g.id) { <option [value]="g.id">{{ g.name }}{{ g.isActive ? '' : ' (inactivo)' }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Número identidad *</label>
    <input cFormControl formControlName="taxId" maxlength="20" [readOnly]="editing" />
    @if (taxIdError) { <small class="text-danger">{{ taxIdError }}</small> }
    @else if (editing) { <small class="text-secondary">La identificación no se cambia desde la nómina.</small> }
  </c-col>
  <c-col md="4"><label cLabel>Nombres *</label><input cFormControl formControlName="firstNames" maxlength="80" /></c-col>
  <c-col md="4">
    <label cLabel>Apellidos *</label><input cFormControl formControlName="lastNames" maxlength="80" />
    @if (namesHint) { <small class="text-warning">{{ namesHint }}</small> }
  </c-col>
  <c-col md="4"><label cLabel>Fecha nacimiento</label><input cFormControl type="date" formControlName="birthDate" /></c-col>
  <c-col md="8"><label cLabel>Dirección</label><input cFormControl formControlName="address" maxlength="200" /></c-col>
  <c-col md="4"><label cLabel>Teléfono</label><input cFormControl formControlName="phone" maxlength="30" /></c-col>
  <c-col md="4"><label cLabel>Celular</label><input cFormControl formControlName="mobile" maxlength="30" /></c-col>
  <c-col md="4"><label cLabel>E-mail</label><input cFormControl type="email" formControlName="email" maxlength="120" /></c-col>
  <c-col md="3">
    <label cLabel>Sexo</label>
    <select cSelect formControlName="sex">
      <option value="">—</option>
      @for (o of entries(sex); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="3">
    <label cLabel>Estado civil</label>
    <select cSelect formControlName="maritalStatus">
      <option value="">—</option>
      @for (o of entries(marital); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="3"><label cLabel>Tipo sangre</label><input cFormControl formControlName="bloodType" maxlength="5" placeholder="Ej.: O+" /></c-col>
  <c-col md="3">
    <label cLabel>Porcentaje discapacidad</label>
    <input cFormControl type="number" min="0" max="100" step="1" formControlName="disabilityPct" />
  </c-col>
</c-row>`,
})
export class EmployeeIdentityFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() groups: PayrollGroup[] = [];
  @Input() editing = false;
  @Input() taxIdError = '';
  @Input() namesHint = '';
  readonly collaborator = COLLABORATOR_TYPE_LABELS;
  readonly idTypes = PERSON_ID_TYPE_LABELS;
  readonly sex = SEX_LABELS;
  readonly marital = MARITAL_LABELS;
  readonly entries = (m: Record<string, string>) => Object.entries(m);
}
