import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import {
  AvatarComponent,
  BadgeComponent,
  BreadcrumbRouterComponent,
  ColorModeService,
  ContainerComponent,
  DropdownComponent,
  DropdownDividerDirective,
  DropdownItemDirective,
  DropdownMenuDirective,
  DropdownToggleDirective,
  HeaderComponent,
  HeaderNavComponent,
  HeaderTogglerDirective,
  NavItemComponent,
  NavLinkDirective,
  SidebarToggleDirective,
  SpinnerComponent
} from '@coreui/angular';

import { IconDirective } from '@coreui/icons-angular';
import { AuthService } from '../../../core/services/auth.service';
import { TenantService } from '../../../core/services/tenant.service';

@Component({
  selector: 'app-default-header',
  templateUrl: './default-header.component.html',
  imports: [NgTemplateOutlet, SpinnerComponent, ContainerComponent, HeaderTogglerDirective, SidebarToggleDirective, IconDirective, HeaderNavComponent, NavItemComponent, NavLinkDirective, RouterLink, RouterLinkActive, BreadcrumbRouterComponent, DropdownComponent, DropdownToggleDirective, AvatarComponent, DropdownMenuDirective, DropdownItemDirective, BadgeComponent, DropdownDividerDirective]
})
export class DefaultHeaderComponent extends HeaderComponent {

  readonly #colorModeService = inject(ColorModeService);
  readonly #authService      = inject(AuthService);
  readonly #tenantService    = inject(TenantService);
  readonly #router           = inject(Router);

  readonly colorMode = this.#colorModeService.colorMode;

  // Datos del usuario actual
  readonly currentUser = this.#authService.user;

  // Multi-empresa
  readonly managedCompanies   = computed(() => this.#tenantService.managedCompanies());
  readonly multiCompanyEnabled = computed(() => this.#tenantService.multiCompanyEnabled());
  readonly switchingCompany    = computed(() => this.#tenantService.switchingCompany());
  readonly activeCompanyId     = computed(() => this.currentUser()?.companyId ?? '');

  readonly showCompanySwitcher = computed(() =>
    this.multiCompanyEnabled() && this.managedCompanies().length > 1
  );

  readonly activeCompanyName = computed(() =>
    this.managedCompanies().find(c => c.companyId === this.activeCompanyId())?.companyName ?? this.#tenantService.company?.name ?? 'Empresa'
  );

  readonly logoUrl     = computed(() => this.#tenantService.logoUrl());
  readonly companyName = computed(() => this.#tenantService.company?.name ?? '');

  readonly colorModes = [
    { name: 'light', text: 'Light', icon: 'cilSun' },
    { name: 'dark', text: 'Dark', icon: 'cilMoon' },
    { name: 'auto', text: 'Auto', icon: 'cilContrast' }
  ];

  readonly icons = computed(() => {
    const currentMode = this.colorMode();
    return this.colorModes.find(mode => mode.name === currentMode)?.icon ?? 'cilSun';
  });

  constructor() {
    super();
  }

  sidebarId = input('sidebar1');

  async switchCompany(companyId: string): Promise<void> {
    if (companyId === this.activeCompanyId() || this.switchingCompany()) return;
    try {
      await this.#authService.switchCompany(companyId);
      this.#router.navigate(['/dashboard']);
    } catch (err) {
      console.error('[Header] switchCompany error:', err);
    }
  }

  /**
   * Cierra la sesión del usuario y redirige al login
   */
  logout(): void {
    this.#authService.logout();
    this.#router.navigate(['/login']);
  }

  /**
   * Obtiene las iniciales del usuario para el avatar
   */
  getUserInitials(): string {
    const user = this.currentUser();
    if (!user) return '?';

    const parts = (user.displayName || '').trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (user.email?.charAt(0) || '?').toUpperCase();
  }
}
