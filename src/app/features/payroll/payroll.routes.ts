import { Routes } from '@angular/router';
import { moduleGuard, roleGuard } from '../../core/guards';

// Nómina (PLAN_NOMINA.md §7.2, E5). Solo admin y contador (D-N2), como las
// reglas y requirePayrollRole: moduleGuard mira el plan de la empresa, no el
// rol; sin roleGuard un vendedor entraría tecleando la URL (y vería «denegado»).
const PAYROLL_ROLES = ['admin', 'accountant'];
const guards = { canActivate: [moduleGuard, roleGuard] };
const data = (title: string) => ({ module: 'payroll', roles: PAYROLL_ROLES, title });

export const PAYROLL_ROUTES: Routes = [
  { path: '', redirectTo: 'runs', pathMatch: 'full' },
  {
    path: 'employees', ...guards, data: data('Empleados'),
    loadComponent: () => import('./pages/employees-page/employees-page.component').then(m => m.EmployeesPageComponent),
  },
  {
    path: 'runs', ...guards, data: data('Nóminas'),
    loadComponent: () => import('./pages/runs-page/runs-page.component').then(m => m.RunsPageComponent),
  },
  {
    path: 'runs/:runId', ...guards, data: data('Nómina'),
    loadComponent: () => import('./pages/run-detail-page/run-detail-page.component').then(m => m.RunDetailPageComponent),
  },
  {
    path: 'payslips/:payslipId', ...guards, data: data('Rol de pago'),
    loadComponent: () => import('./pages/payslip-page/payslip-page.component').then(m => m.PayslipPageComponent),
  },
  {
    path: 'parameters', ...guards, data: data('Parámetros de nómina'),
    loadComponent: () => import('./pages/parameters-page/parameters-page.component').then(m => m.ParametersPageComponent),
  },
];
