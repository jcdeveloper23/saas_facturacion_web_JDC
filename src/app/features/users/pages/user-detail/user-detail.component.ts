import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
    CardModule, GridModule, ButtonModule,
    SpinnerModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

import { CompanyUsersService } from '../../../../core/services/company-users.service';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { PermissionsService } from '../../../../core/services/permissions.service';
import { CompanyUser } from '../../../../core/interfaces/company-user.interface';
import { MODULE_METADATA } from '../../../../core/interfaces/permission.interface';
import { PersonasService } from '../../../personas/services/personas.service';
import { Person } from '../../../personas/models/person.interface';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';

interface PermAction { code: string; label: string; granted: boolean; }
interface PermGroup {
    module: string; moduleName: string; moduleIcon: string;
    order: number; actions: PermAction[];
}

const ACTION_LABELS: Record<string, string> = {
    view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar'
};

const ROLE_COLORS: Record<string, string> = {
    super_admin: 'danger',
    admin:       'primary',
    accountant:  'warning',
    seller:      'success',
    cashier:     'info',
    read_only:   'secondary',
};

const ROLE_NAMES: Record<string, string> = {
    super_admin: 'Super Administrador',
    admin:       'Administrador',
    accountant:  'Contador',
    seller:      'Vendedor',
    cashier:     'Cajero',
    read_only:   'Solo Lectura',
};

@Component({
    selector: 'app-user-detail',
    standalone: true,
    imports: [
        CommonModule,
        CardModule, GridModule, ButtonModule,
        SpinnerModule, AlertModule, IconModule,
        HasPermissionDirective,
    ],
    templateUrl: './user-detail.component.html',
    styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent implements OnInit, OnDestroy {
    readonly route          = inject(ActivatedRoute);
    private router          = inject(Router);
    private companyUsersSvc = inject(CompanyUsersService);
    private userMgmtSvc     = inject(UserManagementService);
    private authService     = inject(AuthService);
    private notification    = inject(NotificationService);
    private permissionsSvc  = inject(PermissionsService);
    private personasSvc     = inject(PersonasService);

    user          = signal<CompanyUser | null>(null);
    employee      = signal<Person | null>(null);
    loading       = signal(true);
    toggling      = signal(false);
    deleting      = signal(false);
    error         = signal<string | null>(null);
    resolvedNames = signal<Map<string, string>>(new Map());

    /** Permission groups computed from the viewed user's platformRole. */
    userPermissionGroups = computed<PermGroup[]>(() => {
        const u = this.user();
        if (!u?.platformRole) return [];

        const perms = new Set(this.permissionsSvc.getPermissionsForRole(u.platformRole));
        const allActions: (keyof typeof ACTION_LABELS)[] = ['view', 'create', 'edit', 'delete'];

        return Object.entries(MODULE_METADATA)
            .filter(([mod]) => allActions.some(a => perms.has(`${mod}.${a}`)))
            .map(([mod, meta]) => ({
                module:     mod,
                moduleName: meta.name,
                moduleIcon: meta.icon,
                order:      meta.order,
                actions:    allActions.map(a => ({
                    code:    a,
                    label:   ACTION_LABELS[a],
                    granted: perms.has(`${mod}.${a}`),
                })),
            }))
            .sort((a, b) => a.order - b.order);
    });

    private userSub?: Subscription;

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            if (params['id']) this.loadUser(params['id']);
        });
    }

    ngOnDestroy(): void {
        this.userSub?.unsubscribe();
    }

    loadUser(uid: string): void {
        this.loading.set(true);
        this.error.set(null);
        this.userSub?.unsubscribe();

        this.userSub = this.companyUsersSvc.getCompanyUser(uid).subscribe({
            next: u => {
                if (!u) {
                    this.error.set('Usuario no encontrado.');
                    this.loading.set(false);
                    return;
                }
                this.user.set(u);
                this.loading.set(false);

                if (u.personaId) {
                    this.personasSvc.getPerson(u.personaId).then(p => this.employee.set(p));
                } else {
                    this.employee.set(null);
                }

                this.resolveAuditNames(u);
            },
            error: err => {
                console.error('Error loading user:', err);
                this.error.set('No se pudo cargar el usuario.');
                this.loading.set(false);
                this.notification.error('Error al cargar el usuario');
            },
        });
    }

    getUserInitials(): string {
        const name  = this.user()?.displayName ?? '';
        const parts = name.trim().split(' ').filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0]?.[0]?.toUpperCase() ?? '?';
    }

    getRoleColor(): string {
        return ROLE_COLORS[this.user()?.platformRole ?? ''] ?? 'dark';
    }

    getRoleName(): string {
        return ROLE_NAMES[this.user()?.platformRole ?? ''] ?? this.user()?.platformRole ?? 'Sin rol';
    }

    getRoleBadgeClass(): string {
        const c = this.getRoleColor();
        return `badge bg-${c}-subtle text-${c} border border-${c}-subtle`;
    }

    async toggleState(): Promise<void> {
        const u = this.user();
        if (!u) return;

        const companyId = this.authService.user()?.companyId;
        if (!companyId) return;

        this.toggling.set(true);
        try {
            await this.userMgmtSvc.updateCompanyUser({
                uid: u.uid,
                companyId,
                isActive: !u.isActive,
            });
            this.notification.success(`Usuario ${!u.isActive ? 'activado' : 'desactivado'} correctamente`);
        } catch {
            this.notification.error('Error al cambiar el estado del usuario');
        } finally {
            this.toggling.set(false);
        }
    }

    private async resolveAuditNames(u: CompanyUser): Promise<void> {
        const uids = new Set<string>();
        if (u.createdBy) uids.add(u.createdBy);
        if (u.updatedBy) uids.add(u.updatedBy);
        if (uids.size === 0) return;

        const map = new Map<string, string>(this.resolvedNames());
        await Promise.all(
            [...uids]
                .filter(id => !map.has(id))
                .map(id =>
                    this.companyUsersSvc.getCompanyUser(id)
                        .pipe(take(1))
                        .toPromise()
                        .then(cu => { if (cu?.displayName) map.set(id, cu.displayName); })
                        .catch(() => {})
                )
        );
        this.resolvedNames.set(map);
    }

    resolveUid(uid?: string): string {
        if (!uid) return 'N/A';
        return this.resolvedNames().get(uid) ?? uid;
    }

    formatDate(ts: any): string {
        if (!ts) return 'N/A';
        const date = ts?.toDate ? ts.toDate() : new Date(ts);
        return date.toLocaleString('es-EC');
    }

    editUser(): void {
        const uid = this.user()?.uid;
        if (uid) this.router.navigate(['/users', uid, 'edit']);
    }

    async deleteUser(): Promise<void> {
        const u = this.user();
        if (!u) return;
        const companyId = this.authService.user()?.companyId;
        if (!companyId) return;

        const ok = await this.notification.confirm({
            title:       `¿Eliminar permanentemente a ${u.displayName}?`,
            text:        'Esta acción no se puede deshacer.',
            confirmText: 'Sí, eliminar',
            cancelText:  'Cancelar',
            icon:        'warning',
            danger:      true,
        });
        if (!ok) return;

        this.deleting.set(true);
        try {
            await this.userMgmtSvc.deleteCompanyUser({ uid: u.uid, companyId });
            this.notification.success('Usuario eliminado correctamente');
            this.router.navigate(['/users']);
        } catch (err: any) {
            this.notification.error('Error al eliminar el usuario: ' + (err?.message ?? err));
        } finally {
            this.deleting.set(false);
        }
    }

    goBack(): void {
        this.router.navigate(['/users']);
    }
}
