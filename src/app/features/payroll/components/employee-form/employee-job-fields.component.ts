import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormModule, GridModule } from '@coreui/angular';


/** Formulario del colaborador, segundo bloque: ingreso, cargo, salida, sueldo y si entra en la nómina. */
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
}
