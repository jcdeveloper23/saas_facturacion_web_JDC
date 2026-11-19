import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormModule, GridModule } from '@coreui/angular';

import { CONTRACT_LABELS, EXPENSE_LABELS, REGION_LABELS, WORKDAY_LABELS } from '../../models/payroll.models';

/** Formulario del colaborador, segundo bloque: ingreso, cargo, salida, sueldo y el contrato. */
@Component({
  selector: 'app-payroll-employee-job-fields',
  standalone: true,
  imports: [ReactiveFormsModule, FormModule, GridModule],
  template: `
<c-row class="g-3" [formGroup]="group">
  <c-col md="4"><label cLabel>Ingreso empresa *</label><input cFormControl type="date" formControlName="hireDate" /></c-col>
  <c-col md="4"><label cLabel>Cargo</label><input cFormControl formControlName="position" maxlength="80" /></c-col>
  <c-col md="4"><label cLabel>Fecha salida</label><input cFormControl type="date" formControlName="endDate" /></c-col>
  <c-col md="4"><label cLabel>Sueldo mensual (USD) *</label><input cFormControl formControlName="salary" placeholder="482,00" /></c-col>
  <c-col md="4">
    <label cLabel>Contrato</label>
    <select cSelect formControlName="contractType">
      @for (o of entries(contract); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Jornada</label>
    <select cSelect formControlName="workdayType">
      @for (o of entries(workday); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Región (14.º)</label>
    <select cSelect formControlName="region">
      @for (o of entries(region); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4">
    <label cLabel>Gasto de</label>
    <select cSelect formControlName="expenseGroup">
      @for (o of entries(expense); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
    </select>
  </c-col>
  <c-col md="4" class="d-flex align-items-end">
    <c-form-check>
      <input cFormCheckInput type="checkbox" id="emp-active" formControlName="isActive" />
      <label cFormCheckLabel for="emp-active">Entra en la nómina</label>
    </c-form-check>
  </c-col>
</c-row>`,
})
export class EmployeeJobFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
  readonly contract = CONTRACT_LABELS;
  readonly workday = WORKDAY_LABELS;
  readonly region = REGION_LABELS;
  readonly expense = EXPENSE_LABELS;
  readonly entries = (m: Record<string, string>) => Object.entries(m);
}
