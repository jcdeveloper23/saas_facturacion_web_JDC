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

import { PermissionsService } from '../../core/services/permissions.service';
import { RolesService } from '../../core/services/roles.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Role,
  Permission,
  PermissionString,
  MODULE_METADATA
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

  // State
  roles            = signal<Role[]>([]);
  allPermissions   = signal<Permission[]>([]);
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
    this.permissionsService.getPermissionsCatalog().subscribe({
      next: perms => this.allPermissions.set(perms),
      error: err  => console.error('Error loading permissions catalog', err)
    });
  }

  loadRoles(): void {
    this.isLoading.set(true);
    const companyId = this.authService.user()?.companyId;
    const roles$ = this.isSuperAdmin()
      ? this.permissionsService.getRoles()
      : companyId ? this.rolesSvc.getCompanyRoles(companyId) : null;

    if (!roles$) { this.isLoading.set(false); return; }

    roles$.subscribe({
      next: (allRoles) => {
        const processed = allRoles.map(role => ({
          ...role,
          permissions: role.permissions.map((p: any) => typeof p === 'string' ? p : p.code)
        }));
        this.roles.set(processed.sort((a, b) => a.level - b.level));
        this.isLoading.set(false);
      },
      error: (err) => { console.error(err); this.isLoading.set(false); }
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
    const grouped   = new Map<string, Permission[]>();
    const catalog   = this.allPermissions().length > 0 ? this.allPermissions() : this.permissionsService.getAllPermissions();

    catalog.forEach(p => {
      if (rolePerms.has(p.code)) {
        const mc  = getModuleCode(p);
        const cur = grouped.get(mc) || [];
        cur.push(p);
        grouped.set(mc, cur);
      }
    });

    return Array.from(grouped.entries()).map(([mc, perms]) => ({
      module:     mc,
      moduleName: MODULE_METADATA[mc]?.name || mc,
      moduleIcon: MODULE_METADATA[mc]?.icon || 'cilFolder',
      permissions: perms
    }));
  }
}
