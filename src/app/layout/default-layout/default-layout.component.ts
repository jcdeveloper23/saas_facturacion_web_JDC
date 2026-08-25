import { Component, inject, computed } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgScrollbar } from 'ngx-scrollbar';

import { IconDirective } from '@coreui/icons-angular';
import {
  ContainerComponent,
  INavData,
  ShadowOnScrollDirective,
  SidebarBrandComponent,
  SidebarComponent,
  SidebarFooterComponent,
  SidebarHeaderComponent,
  SidebarNavComponent,
  SidebarToggleDirective,
  SidebarTogglerDirective
} from '@coreui/angular';

import { DefaultFooterComponent, DefaultHeaderComponent } from './';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { ToastContainerComponent } from '../../shared/components';
import { navItems, filterNav } from './_nav';

@Component({
  selector: 'app-dashboard',
  templateUrl: './default-layout.component.html',
  styleUrls: ['./default-layout.component.scss'],
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
export class DefaultLayoutComponent {
  private authService   = inject(AuthService);
  private tenantService = inject(TenantService);

  public navItems = computed<INavData[]>(() =>
    filterNav(
      navItems,
      this.authService.user()?.role ?? null,
      this.tenantService.activeModules()
    )
  );

  /** Activa el overlay bloqueante cuando la empresa está suspendida o cancelada. */
  readonly isCompanyBlocked      = computed(() => this.tenantService.isCompanyBlocked());
  readonly companyStatus         = computed(() => this.tenantService.companyStatus());
  readonly companyName           = computed(() => this.tenantService.company?.name ?? '');
  readonly isSubscriptionExpired = computed(() => this.tenantService.isSubscriptionExpired());
  readonly logoUrl               = computed(() => this.tenantService.logoUrl());
  readonly brandColor            = computed(() => this.tenantService.brandColor());

  logout(): void {
    this.authService.logout();
  }
}
