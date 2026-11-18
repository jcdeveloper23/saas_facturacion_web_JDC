import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormModule, GridModule } from '@coreui/angular';

import { EDUCATION_LABELS, MARITAL_LABELS, SEX_LABELS } from '../models/payroll-employee-profile.models';

/** Ficha del colaborador › Datos personales (sobre el formulario del empleado). */
@Component({
  selector: 'app-payroll-employee-personal-fields',
  standalone: true,
  imports: [ReactiveFormsModule, FormModule, GridModule],
  template: `
<c-row class="g-3" [formGroup]="group">
  <c-col md="4"><label cLabel>Fecha de nacimiento</label><input cFormControl type="date" formControlName="birthDate" /></c-col>
  <c-col md="4">
    <label cLabel>Sexo</label>
    <select cSelect formControlName="sex">
      <option value="">—</option>
      @for (o of entries(sex); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Estado civil</label>
    <select cSelect formControlName="maritalStatus">
      <option value="">—</option>
      @for (o of entries(marital); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4"><label cLabel>Tipo de sangre</label><input cFormControl formControlName="bloodType" maxlength="5" placeholder="Ej.: O+" /></c-col>
  <c-col md="4"><label cLabel>Teléfono</label><input cFormControl formControlName="phone" maxlength="30" /></c-col>
  <c-col md="4"><label cLabel>Celular</label><input cFormControl formControlName="mobile" maxlength="30" /></c-col>
  <c-col md="12"><label cLabel>Dirección</label><input cFormControl formControlName="address" maxlength="200" /></c-col>
  <c-col md="4">
    <label cLabel>Nivel de instrucción</label>
    <select cSelect formControlName="education">
      <option value="">—</option>
      @for (o of entries(education); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="8"><label cLabel>Título</label><input cFormControl formControlName="title" maxlength="120" /></c-col>
  <c-col md="12">
    <label cLabel>Observación</label>
    <textarea cFormControl rows="2" formControlName="notes" maxlength="500"></textarea>
    <small class="text-secondary">El nombre, la identificación, el correo y el cargo salen de la persona (Clientes y proveedores).</small>
  </c-col>
</c-row>`,
})
export class EmployeePersonalFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
  readonly sex = SEX_LABELS;
  readonly marital = MARITAL_LABELS;
  readonly education = EDUCATION_LABELS;
  readonly entries = (m: Record<string, string>) => Object.entries(m);
}
