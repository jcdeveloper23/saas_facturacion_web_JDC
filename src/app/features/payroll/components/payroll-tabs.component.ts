import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AlertModule } from '@coreui/angular';

import { INCOME_TAX_NOTICE } from '../models/payroll.models';

/** Pestañas de Nómina (Nóminas, Empleados, Parámetros) y el aviso fijo del IR (§4.4, regla 9). */
@Component({
  selector: 'app-payroll-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AlertModule],
  template: `
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><a class="nav-link" routerLink="/payroll/runs" routerLinkActive="active">Nóminas</a></li>
      <li class="nav-item"><a class="nav-link" routerLink="/payroll/employees" routerLinkActive="active">Empleados</a></li>
      <li class="nav-item"><a class="nav-link" routerLink="/payroll/parameters" routerLinkActive="active">Parámetros</a></li>
    </ul>
    @if (showTaxNotice) {
      <c-alert color="warning" class="py-2 small mb-3">{{ notice }}</c-alert>
    }
  `,
  inputs: ['showTaxNotice'],
})
export class PayrollTabsComponent {
  showTaxNotice = false;
  readonly notice = INCOME_TAX_NOTICE;
}
