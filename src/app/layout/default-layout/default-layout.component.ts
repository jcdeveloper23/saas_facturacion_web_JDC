import { Component, inject, computed, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgScrollbar } from 'ngx-scrollbar';
import { take } from 'rxjs';

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
import { PermissionsService } from '../../core/services/permissions.service';
import { ModulesService } from '../../core/services/modules.service';
import { Module } from '../../core/interfaces/permission.interface';
import { ToastContainerComponent } from '../../shared/components';
import { navItems as _navItems, filterNav } from './_nav';

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
  private authService        = inject(AuthService);
  private tenantService      = inject(TenantService);
  private permissionsService = inject(PermissionsService);
  private modulesSvc         = inject(ModulesService);

  /** Módulos cargados desde Firestore /modules. null = aún cargando. */
  private _firestoreModules = signal<Module[] | null>(null);

  /** true cuando los módulos ya cargaron y el nav puede renderizarse por primera vez. */
  readonly navReady = computed(() => this._firestoreModules() !== null);

  constructor() {
    this.modulesSvc.getModules().pipe(take(1)).subscribe({
      next:  modules => this._firestoreModules.set(modules),
      error: err => {
        console.warn('[DefaultLayout] Error cargando módulos nav:', err);
        this._firestoreModules.set([]); // fallback al nav estático
      }
    });
  }

  public navItems = computed<INavData[]>(() => {
    const modules        = this._firestoreModules() ?? [];
    const permissions    = this.permissionsService.permissions();
    const activeModules  = this.tenantService.activeModules();
    const isSuperAdmin   = this.authService.user()?.role === 'super_admin';

    const items = modules.length > 0 ? this._buildNavFromModules(modules) : _navItems;

    console.group('%c[DefaultLayout] Construyendo menú', 'color:#f59e0b;font-weight:bold');
    console.log('fuente nav:', modules.length > 0 ? `Firestore (${modules.length} módulos)` : 'estático (_nav.ts)');
    console.log('isSuperAdmin:', isSuperAdmin);
    console.log('activeModules (' + activeModules.length + '):', JSON.stringify(activeModules, null, 3));
    console.log('permissions (' + permissions.length + '):', JSON.stringify(permissions, null, 3));
    console.log('items antes de filter (' + items.length + '):', JSON.stringify(items.map(i => ({ name: i.name ?? '(title)', module: (i.attributes as any)?.['module'], permission: (i.attributes as any)?.['permission'] })), null, 3));

    const filtered = filterNav(items, permissions, activeModules, isSuperAdmin);

    console.log('items después de filter (' + filtered.length + '):', JSON.stringify(filtered.map(i => i.name ?? '(title)'), null, 3));
    console.groupEnd();

    return filtered;
  });

  // ── Nav builder desde Firestore ──────────────────────────────────────────

  /**
   * Módulos que tienen su propio código de permiso.
   * Sub-módulos sin entrada propia (e.g. accounting_journal) NO están aquí
   * y heredarán el permiso del padre o de su primera dependencia.
   */
  private readonly PERM_MODULES = new Set([
    'companies', 'plans', 'users', 'settings', 'profiles',
    'team_management', 'personas', 'products',
    'invoices', 'quotes', 'orders', 'proformas', 'retentions', 'debit_notes', 'pos',
    'purchases', 'stock', 'marketplace',
    'accounting',
    'school_wallet', 'school_accessories', 'school_setup',
    'report_invoices', 'report_purchases', 'report_products',
    'benefits', 'dashboard'
  ]);

  private _moduleToNavItem(mod: Module, children?: INavData[], isChild = false): INavData {
    // Título de sección — sin atributos; removeOrphanTitles se encarga de ocultarlo si está vacío
    if (mod.isTitle) {
      return { title: true, name: mod.name };
    }

    // Badge opcional
    const badge = mod.badgeText
      ? { text: mod.badgeText, color: mod.badgeColor ?? 'secondary' }
      : undefined;

    // Ítem hijo — hereda el gate del padre; no necesita atributos propios
    if (isChild) {
      const child: INavData = { name: mod.name, url: mod.url, icon: 'nav-icon-bullet' };
      if (badge) child.badge = badge;
      return child;
    }

    // Derivar el código de permiso correcto
    const permCode = this.PERM_MODULES.has(mod.code)
      ? `${mod.code}.view`
      : (mod.dependencies?.length ?? 0) > 0
        ? `${mod.dependencies![0]}.view`
        : null;   // dashboard, ítems sin permiso propio → visible para todos

    // Derivar URL para grupos: usar el primer segmento del primer hijo.
    // Con url: undefined, samePath() de CoreUI siempre retorna true
    // ([].every(fn) === true por vacuous truth), abriendo TODOS los grupos.
    // Con url: '/segment', samePath() abre el grupo solo cuando la ruta
    // actual empieza con ese segmento (comportamiento correcto).
    const groupUrl = (() => {
      if (!children?.length) return mod.url ?? undefined;
      const firstUrl = children[0]?.url as string | undefined;
      if (!firstUrl) return mod.url ?? undefined;
      const seg = firstUrl.split('/').filter(s => s.length)[0];
      return seg ? `/${seg}` : (mod.url ?? undefined);
    })();

    const item: INavData = {
      name: mod.name,
      url:  groupUrl,
      attributes: {
        module: mod.code,
        ...(permCode ? { permission: permCode } : {})
      }
    };

    if (mod.icon)        item.iconComponent = { name: mod.icon };
    if (badge)           item.badge         = badge;
    if (children?.length) item.children     = children;

    return item;
  }

  private _buildNavFromModules(modules: Module[]): INavData[] {
    const visible = modules.filter(m => m.showInMenu !== false);

    // Mapa parent_id → hijos.
    // parent_id puede ser el doc ID de Firestore (módulos creados desde UI)
    // o el code del módulo padre (módulos sembrados desde MODULES_SEED).
    // Almacenamos en childrenMap con la clave tal como viene.
    const childrenMap = new Map<string, Module[]>();
    for (const m of visible) {
      if (m.parent_id) {
        const arr = childrenMap.get(m.parent_id) ?? [];
        arr.push(m);
        childrenMap.set(m.parent_id, arr);
      }
    }

    // Solo ítems raíz (sin parent_id), ordenados
    return visible
      .filter(m => !m.parent_id)
      .sort((a, b) => a.order - b.order)
      .map(mod => {
        // Buscar hijos tanto por doc ID como por code (compatibilidad seed vs. UI)
        const childMods = [
          ...(childrenMap.get(mod.id)   ?? []),
          ...(childrenMap.get(mod.code) ?? [])
        ]
          // deduplicar por id por si acaso ambas claves coinciden
          .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
          .sort((a, b) => a.order - b.order);

        const children = childMods.map(c => this._moduleToNavItem(c, undefined, true));
        return this._moduleToNavItem(mod, children.length > 0 ? children : undefined);
      });
  }

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
