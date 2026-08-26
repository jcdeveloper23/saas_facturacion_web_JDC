import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
    CardModule, GridModule, ButtonModule, BadgeModule,
    UtilitiesModule, SpinnerModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

import { CompanyUsersService } from '../../../../core/services/company-users.service';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { CompanyUser } from '../../../../core/interfaces/company-user.interface';
import { PersonasService } from '../../../personas/services/personas.service';
import { Person } from '../../../personas/models/person.interface';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';

@Component({
    selector: 'app-user-detail',
    standalone: true,
    imports: [
        CommonModule,
        CardModule, GridModule, ButtonModule, BadgeModule,
        UtilitiesModule, SpinnerModule, AlertModule, IconModule,
        HasPermissionDirective
    ],
    templateUrl: './user-detail.component.html'
})
export class UserDetailComponent implements OnInit, OnDestroy {
    readonly route        = inject(ActivatedRoute);
    private router        = inject(Router);
    private companyUsersSvc = inject(CompanyUsersService);
    private userMgmtSvc   = inject(UserManagementService);
    private authService   = inject(AuthService);
    private notification  = inject(NotificationService);
    private personasSvc   = inject(PersonasService);

    user          = signal<CompanyUser | null>(null);
    employee      = signal<Person | null>(null);
    loading       = signal(true);
    toggling      = signal(false);
    deleting      = signal(false);
    error         = signal<string | null>(null);
    resolvedNames = signal<Map<string, string>>(new Map());

    private userSub?: Subscription;

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            if (params['id']) {
                this.loadUser(params['id']);
            }
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
            }
        });
    }

    getUserInitials(): string {
        const name = this.user()?.displayName ?? '';
        const parts = name.trim().split(' ').filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0]?.[0]?.toUpperCase() ?? '?';
    }

    getRoleColor(): string {
        switch (this.user()?.platformRole) {
            case 'super_admin': return 'danger';
            case 'admin':       return 'primary';
            case 'accountant':  return 'warning';
            case 'seller':      return 'success';
            case 'cashier':     return 'info';
            case 'read_only':   return 'secondary';
            default:            return 'dark';
        }
    }

    getRoleName(): string {
        switch (this.user()?.platformRole) {
            case 'super_admin': return 'Super Administrador';
            case 'admin':       return 'Administrador';
            case 'accountant':  return 'Contador';
            case 'seller':      return 'Vendedor';
            case 'cashier':     return 'Cajero';
            case 'read_only':   return 'Solo Lectura';
            default:            return 'Sin rol';
        }
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
                isActive: !u.isActive
            });
            this.notification.success(`Usuario ${!u.isActive ? 'activado' : 'desactivado'} correctamente`);
        } catch {
            this.notification.error('Error al cambiar el estado del usuario');
        } finally {
            this.toggling.set(false);
        }
    }

    /**
     * Carga los displayNames de createdBy / updatedBy si son distintos al UID del usuario.
     * Evita lecturas duplicadas usando un Set de UIDs únicos.
     */
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
                        .then(cu => {
                            if (cu?.displayName) map.set(id, cu.displayName);
                        })
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
          title: `¿Eliminar permanentemente a ${u.displayName}?`,
          text: 'Esta acción no se puede deshacer.',
          confirmText: 'Sí, eliminar',
          cancelText: 'Cancelar',
          icon: 'warning',
          danger: true
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
