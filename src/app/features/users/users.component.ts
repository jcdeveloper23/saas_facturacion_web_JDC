import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
    CardModule,
    GridModule,
    ButtonModule,
    TableModule,
    BadgeModule,
    FormModule,
    UtilitiesModule,
    ButtonGroupModule,
    SpinnerModule,
    AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { CompanyUsersService } from '../../core/services/company-users.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { AuthService, UserRole } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { CompanyUser } from '../../core/interfaces/company-user.interface';
import { Role } from '../../core/interfaces/permission.interface';
import { UserStats } from '../../core/interfaces/user.interface';

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        ReactiveFormsModule,
        CardModule,
        GridModule,
        ButtonModule,
        ButtonGroupModule,
        TableModule,
        BadgeModule,
        FormModule,
        UtilitiesModule,
        SpinnerModule,
        AlertModule,
        IconModule,
        HasPermissionDirective
    ],
    templateUrl: './users.component.html',
    styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit, OnDestroy {
    private companyUsersSvc = inject(CompanyUsersService);
    private permissionsService = inject(PermissionsService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);

    // State signals
    users = signal<CompanyUser[]>([]);
    loading = signal(false);
    error = signal<string | null>(null);

    // Select options
    roles = signal<Role[]>([]);

    // Filters
    searchControl = new FormControl('');
    searchTerm = signal('');
    roleFilter = signal<UserRole | undefined>(undefined);
    stateFilter = signal<boolean | 'all'>('all');

    // Super admin check
    isSuperAdmin = signal(false);

    // Subscription reference for cleanup
    private usersSubscription?: Subscription;

    // Computed stats
    stats = computed<UserStats>(() => {
        const list = this.users();
        return {
            total: list.length,
            admins: list.filter(u => u.platformRole === 'admin' || u.platformRole === 'super_admin').length,
            active: list.filter(u => u.isActive).length,
            inactive: list.filter(u => !u.isActive).length
        };
    });

    // Computed filtered users (client-side — Firestore stream already loaded)
    filteredUsers = computed(() => {
        let list = this.users();
        const roleFilter = this.roleFilter();
        const stateFilter = this.stateFilter();
        const search = this.searchTerm().toLowerCase();

        if (roleFilter !== undefined) {
            list = list.filter(u => u.platformRole === roleFilter);
        }

        if (stateFilter !== 'all') {
            list = list.filter(u => u.isActive === stateFilter);
        }

        if (search) {
            list = list.filter(u =>
                u.displayName.toLowerCase().includes(search) ||
                u.email.toLowerCase().includes(search)
            );
        }

        return list;
    });

    ngOnInit(): void {
        this.isSuperAdmin.set(this.authService.isSuperAdmin());
        this.setupFilters();
        this.loadRoles();
        this.loadUsers();
    }

    ngOnDestroy(): void {
        this.usersSubscription?.unsubscribe();
    }

    private loadRoles(): void {
        this.permissionsService.getRoles().subscribe({
            next: (roles) => this.roles.set(roles),
            error: (err) => console.error('Error loading roles:', err)
        });
    }

    setupFilters(): void {
        this.searchControl.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged()
        ).subscribe(val => this.searchTerm.set(val ?? ''));
    }

    loadUsers(): void {
        this.loading.set(true);
        this.error.set(null);

        this.usersSubscription?.unsubscribe();
        this.usersSubscription = this.companyUsersSvc.getCompanyUsers().subscribe({
            next: (data) => {
                this.users.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading users', err);
                this.error.set('No se pudieron cargar los usuarios');
                this.loading.set(false);
                this.notification.error('Error al cargar usuarios');
            }
        });
    }

    onRoleFilterChange(value: string): void {
        this.roleFilter.set(value ? value as UserRole : undefined);
    }

    onStateFilterChange(value: string): void {
        if (value === 'all') {
            this.stateFilter.set('all');
        } else {
            this.stateFilter.set(value === 'true');
        }
    }

    refresh(): void {
        this.loadUsers();
        this.notification.info('Actualizando lista de usuarios...');
    }

    toggleUserState(user: CompanyUser): void {
        const newState = !user.isActive;
        const action = newState ? 'activar' : 'desactivar';

        const promise = newState
            ? this.companyUsersSvc.activateCompanyUser(user.uid)
            : this.companyUsersSvc.deactivateCompanyUser(user.uid);

        promise
            .then(() => this.notification.success(`Usuario ${newState ? 'activado' : 'desactivado'} correctamente`))
            .catch(() => this.notification.error(`Error al ${action} el usuario`));
    }

    getRoleColor(platformRole?: UserRole): string {
        switch (platformRole) {
            case 'super_admin': return 'danger';
            case 'admin':       return 'primary';
            case 'accountant':  return 'warning';
            case 'seller':      return 'info';
            case 'cashier':     return 'success';
            case 'read_only':   return 'secondary';
            default:            return 'dark';
        }
    }

    getRoleName(user: CompanyUser): string {
        const names: Record<UserRole, string> = {
            super_admin: 'Super Admin',
            admin:       'Administrador',
            accountant:  'Contador',
            seller:      'Vendedor',
            cashier:     'Cajero',
            read_only:   'Solo lectura'
        };
        return names[user.platformRole] ?? 'Sin rol';
    }

    getStateColor(isActive: boolean): string {
        return isActive ? 'success' : 'warning';
    }

    getStateLabel(isActive: boolean): string {
        return isActive ? 'Activo' : 'Inactivo';
    }

    getUserInitials(user: CompanyUser): string {
        const parts = user.displayName.trim().split(' ');
        const first = parts[0]?.charAt(0) ?? '';
        const last = parts[1]?.charAt(0) ?? '';
        return (first + last).toUpperCase() || user.email.charAt(0).toUpperCase();
    }

    formatDate(date: any): string {
        if (!date) return 'N/A';
        // Firestore Timestamp tiene .toDate(); string/Date se convierten directamente
        const d = date?.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('es-EC');
    }
}
