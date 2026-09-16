import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgScrollbar } from 'ngx-scrollbar';
import { IconDirective } from '@coreui/icons-angular';
import {
  ContainerComponent,
  ShadowOnScrollDirective,
  SidebarBrandComponent,
  SidebarComponent,
  SidebarFooterComponent,
  SidebarHeaderComponent,
  SidebarNavComponent,
  SidebarToggleDirective,
  SidebarTogglerDirective
} from '@coreui/angular';

import { DefaultFooterComponent, DefaultHeaderComponent } from '../../../layout/default-layout';
import { ToastContainerComponent } from '../../../shared/components';
import { AuthService } from '../../../core/services/auth.service';
import { superAdminNavItems } from './_nav';

/**
 * Lo que ve un channel_admin: su cartera. Las pantallas de plataforma quedan
 * fuera, igual que en super-admin.routes.ts.
 */
const CHANNEL_ADMIN_URLS = new Set([
  '/super-admin/companies',
  '/super-admin/plans',
  '/super-admin/plans/guide',
]);
const CHANNEL_ADMIN_NAV = superAdminNavItems.filter(
  item => (item.title && item.name === 'Gestión') || CHANNEL_ADMIN_URLS.has(String(item.url ?? ''))
);

@Component({
  selector: 'app-super-admin-layout',
  templateUrl: './super-admin-layout.component.html',
  styleUrl: './super-admin-layout.component.scss',
  standalone: true,
  imports: [
    SidebarComponent,
    SidebarHeaderComponent,
    SidebarBrandComponent,
    SidebarNavComponent,
    SidebarFooterComponent,
    SidebarToggleDirective,
    SidebarTogglerDirective,
    ContainerComponent,
    DefaultFooterComponent,
    DefaultHeaderComponent,
    IconDirective,
    NgScrollbar,
    RouterOutlet,
    RouterLink,
    ShadowOnScrollDirective,
    ToastContainerComponent
  ]
})
export class SuperAdminLayoutComponent {
  private auth = inject(AuthService);

  // computed y no signal fijo: el rol llega cuando AuthService termina de leer el token.
  readonly navItems = computed(() =>
    this.auth.user()?.role === 'channel_admin' ? CHANNEL_ADMIN_NAV : superAdminNavItems
  );
}
