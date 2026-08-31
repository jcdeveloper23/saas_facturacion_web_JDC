import {
  Component,
  OnInit,
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  CardModule,
  ButtonModule,
  GridModule,
  BadgeModule,
  SpinnerModule,
  TableModule,
  FormModule,
  ModalModule,
  TooltipModule,
  AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { combineLatest, take } from 'rxjs';
import { PermissionsService } from '../../core/services/permissions.service';
import { RolesService } from '../../core/services/roles.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ModulesService } from '../../core/services/modules.service';
import { ActionsService } from '../../core/services/actions.service';
import {
  Role,
  Permission,
  PermissionString,
  Module
} from '../../core/interfaces/permission.interface';
function getModuleCode(p: Permission): string {
  if (p.module && typeof p.module === 'object') return p.module.code;
  return p.code.split('.')[0];
}

@Component({
  selector: 'app-profiles',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    GridModule,
    BadgeModule,
    SpinnerModule,
    TableModule,
    FormModule,
    ModalModule,
    TooltipModule,
    AlertModule,
    IconModule
  ],
  templateUrl: './profiles.component.html',
  styleUrl: './profiles.component.scss'
})
export class ProfilesComponent implements OnInit {
  private permissionsService = inject(PermissionsService);
  private rolesSvc           = inject(RolesService);
  private authService        = inject(AuthService);
  private notification       = inject(NotificationService);
  private router             = inject(Router);
  private modulesSvc         = inject(ModulesService);
  private actionsSvc         = inject(ActionsService);

  // State
  roles            = signal<Role[]>([]);
  allPermissions   = signal<Permission[]>([]);
  private _moduleMap = signal<Map<string, Module>>(new Map());
  isLoading        = signal(false);
  isSeeding        = signal(false);
  showViewModal    = signal(false);
  viewingRole      = signal<Role | null>(null);

  // Auth
  isSuperAdmin  = computed(() => this.authService.isSuperAdmin());
  canManageRoles = computed(() => this.authService.isAdmin() || this.authService.isSuperAdmin());

  ngOnInit(): void {
    this.loadRoles();
    this.loadPermissions();
  }

  seedDefaultRoles(): void {
    if (!this.isSuperAdmin()) return;
    this.isSeeding.set(true);
    this.rolesSvc.seedDefaultRoles()
      .then(({ created, skipped }) => {
        if (created > 0) {
          this.notification.success(`${created} rol(es) creado(s).${skipped > 0 ? ` ${skipped} ya existían.` : ''}`);
          this.loadRoles();
        } else {
          this.notification.info('Todos los roles del sistema ya estaban configurados.');
        }
      })
      .catch(err => {
        console.error(err);
        this.notification.error('Error al sembrar los roles.');
      })
      .finally(() => this.isSeeding.set(false));
  }

  seedCompanyRoles(): void {
    if (this.isSuperAdmin()) return;
    const companyId = this.authService.user()?.companyId;
    if (!companyId) return;
    this.isSeeding.set(true);
    this.rolesSvc.seedCompanyDefaultRoles(companyId)
      .then(({ created, skipped }) => {
        if (created > 0) {
          this.notification.success(`${created} rol(es) de empresa creado(s).${skipped > 0 ? ` ${skipped} ya existían.` : ''}`);
          this.loadRoles();
        } else {
          this.notification.info('Los roles de la empresa ya estaban configurados.');
        }
      })
      .catch(err => {
        console.error(err);
        this.notification.error('Error al inicializar los roles de la empresa.');
      })
      .finally(() => this.isSeeding.set(false));
  }

  loadPermissions(): void {
    combineLatest([
      this.modulesSvc.getModules(),
      this.actionsSvc.getActions()
    ]).pipe(take(1)).subscribe({
      next: ([modules, actions]) => {
        this._moduleMap.set(new Map(modules.map(m => [m.code, m])));
        const actionOrder = ['view', 'create', 'edit', 'delete', 'export', 'print', 'approve'];
        const sortedActions = [...actions].sort((a, b) => {
          const ia = actionOrder.indexOf(a.code);
          const ib = actionOrder.indexOf(b.code);
          if (ia === -1 && ib === -1) return a.code.localeCompare(b.code);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
        const perms: Permission[] = [];
        for (const mod of modules) {
          for (const act of sortedActions) {
            perms.push({
              id:        `${mod.code}.${act.code}`,
              module_id: mod.code,
              action_id: act.code,
              code:      `${mod.code}.${act.code}`,
              name:      `${act.name} ${mod.name}`,
              isSystem:  true,
              state:     true,
              module:    mod,
              action:    act,
            });
          }
        }
        this.allPermissions.set(perms);
      },
      error: err => console.error('[Profiles] Error loading modules/actions', err)
    });
  }

  loadRoles(): void {
    this.isLoading.set(true);
    const companyId = this.authService.user()?.companyId;
    const email     = this.authService.user()?.email ?? '—';

    const source  = this.isSuperAdmin() ? '/roles (plataforma)' : `companies/${companyId}/roles`;
    const roles$  = this.isSuperAdmin()
      ? this.permissionsService.getRoles()
      : companyId ? this.rolesSvc.getCompanyRoles(companyId) : null;

    console.group(`%c[Profiles] loadRoles — ${email}`, 'color:#6366f1;font-weight:bold');
    console.log('isSuperAdmin:', this.isSuperAdmin(), '| companyId:', companyId ?? '—');
    console.log('colección Firestore:', source);

    if (!roles$) {
      console.warn('→ Sin roles$ (sin companyId). Abortando.');
      console.groupEnd();
      this.isLoading.set(false);
      return;
    }

    roles$.subscribe({
      next: (allRoles) => {
        const processed = allRoles.map(role => ({
          ...role,
          permissions: role.permissions.map((p: any) => typeof p === 'string' ? p : p.code)
        }));
        const sorted = processed.sort((a, b) => a.level - b.level);
        console.log('roles cargados (' + sorted.length + '):', JSON.stringify(sorted.map(r => ({ code: r.code, nombre: r.name, permisos: r.permissions.length, lista: r.permissions })), null, 3));
        console.groupEnd();
        this.roles.set(sorted);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('[Profiles] Error cargando roles:', err);
        console.groupEnd();
        this.isLoading.set(false);
      }
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  openCreate(): void {
    const base = this.isSuperAdmin() ? '/super-admin/profiles' : '/profiles';
    this.router.navigate([base, 'new']);
  }

  openEdit(role: Role): void {
    const base = this.isSuperAdmin() ? '/super-admin/profiles' : '/profiles';
    this.router.navigate([base, role.id, 'edit']);
  }

  // ── View permissions modal ─────────────────────────────────────────────────

  viewPermissions(role: Role): void {
    this.viewingRole.set(role);
    this.showViewModal.set(true);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async confirmDelete(role: Role): Promise<void> {
    const ok = await this.notification.confirm({
      title: `¿Eliminar el rol "${role.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    const companyId = this.authService.user()?.companyId;

    if (this.isSuperAdmin()) {
      this.permissionsService.deleteRole(role.id!).subscribe({
        next: () => { this.notification.success(`Rol "${role.name}" eliminado.`); this.loadRoles(); },
        error: (err: any) => { console.error(err); this.notification.error('Error al eliminar el rol.'); }
      });
    } else if (companyId) {
      this.rolesSvc.deleteCompanyRole(companyId, role.id!).subscribe({
        next: () => { this.notification.success(`Rol "${role.name}" eliminado.`); this.loadRoles(); },
        error: (err: any) => { console.error(err); this.notification.error('Error al eliminar el rol.'); }
      });
    }
  }

  // ── View permissions grouped ───────────────────────────────────────────────

  getPermissionsGroupedForRole(role: Role): { module: string; moduleName: string; moduleIcon: string; permissions: Permission[] }[] {
    const rolePerms = new Set(role.permissions);
    const moduleMap = this._moduleMap();
    const catalog   = this.allPermissions();
    const grouped   = new Map<string, Permission[]>();

    catalog.forEach(p => {
      if (rolePerms.has(p.code)) {
        const mc  = p.code.split('.')[0];
        const cur = grouped.get(mc) || [];
        cur.push(p);
        grouped.set(mc, cur);
      }
    });

    return Array.from(grouped.entries()).map(([mc, perms]) => {
      const mod = moduleMap.get(mc);
      return {
        module:      mc,
        moduleName:  mod?.name || mc,
        moduleIcon:  mod?.icon || 'cilFolder',
        permissions: perms
      };
    });
  }
}
