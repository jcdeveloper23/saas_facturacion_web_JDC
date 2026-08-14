import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ButtonDirective, CardBodyComponent, CardComponent,
  ColComponent, ContainerComponent, RowComponent, BadgeComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  templateUrl: './unauthorized.component.html',
  imports: [
    RouterLink,
    ContainerComponent,
    RowComponent,
    ColComponent,
    CardComponent,
    CardBodyComponent,
    ButtonDirective,
    BadgeComponent,
    IconDirective,
  ]
})
export class UnauthorizedComponent {
  private authService = inject(AuthService);

  readonly userRole = computed(() => this.authService.user()?.role ?? null);

  // Nombres de los roles del sistema. Roles dinámicos muestran su código como fallback.
  private readonly _systemRoleNames: { [code: string]: string } = {
    super_admin:   'Super Administrador',
    admin:         'Administrador',
    accountant:    'Contador',
    seller:        'Vendedor',
    cashier:       'Cajero',
    read_only:     'Solo Lectura',
    padre_familia: 'Representante',
  };

  private readonly _systemRoleColors: { [code: string]: string } = {
    super_admin: 'danger',
    admin:       'primary',
    accountant:  'warning',
    seller:      'success',
    cashier:     'info',
    read_only:   'secondary',
  };

  readonly roleName = computed(() => {
    const r = this.userRole();
    return r ? (this._systemRoleNames[r] ?? r) : '';
  });

  readonly roleColor = computed(() => {
    const r = this.userRole();
    return r ? (this._systemRoleColors[r] ?? 'dark') : 'dark';
  });

  goBack(): void {
    window.history.back();
  }

  logout(): void {
    this.authService.logout();
  }
}
