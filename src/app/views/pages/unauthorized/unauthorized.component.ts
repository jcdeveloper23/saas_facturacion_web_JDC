import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ButtonDirective, CardBodyComponent, CardComponent,
  ColComponent, ContainerComponent, RowComponent, BadgeComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { AuthService, UserRole } from '../../../core/services/auth.service';

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

  readonly roleName = computed(() => {
    const names: Record<UserRole, string> = {
      super_admin: 'Super Administrador',
      admin:       'Administrador',
      accountant:  'Contador',
      seller:      'Vendedor',
      cashier:     'Cajero',
      read_only:   'Solo Lectura',
    };
    const r = this.userRole();
    return r ? (names[r] ?? r) : '';
  });

  readonly roleColor = computed(() => {
    switch (this.userRole()) {
      case 'super_admin': return 'danger';
      case 'admin':       return 'primary';
      case 'accountant':  return 'warning';
      case 'seller':      return 'success';
      case 'cashier':     return 'info';
      case 'read_only':   return 'secondary';
      default:            return 'dark';
    }
  });

  goBack(): void {
    window.history.back();
  }

  logout(): void {
    this.authService.logout();
  }
}
