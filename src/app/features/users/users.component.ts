import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
    CardModule,
    ButtonModule,
    TableModule,
    ButtonGroupModule,
    SpinnerModule,
    AlertModule,
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { CompanyUsersService } from '../../core/services/company-users.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { NotificationService } from '../../core/services/notification.service';
import { CompanyUser } from '../../core/interfaces/company-user.interface';
import { Role } from '../../core/interfaces/permission.interface';
import { UserStats } from '../../core/interfaces/user.interface';

type StateFilter = 'all' | 'active' | 'inactive';

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        CardModule,
        ButtonModule,
        ButtonGroupModule,
        TableModule,
        SpinnerModule,
        AlertModule,
        IconModule,
        HasPermissionDirective,
    ],
    templateUrl: './users.component.html',
    styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit, OnDestroy {
    private companyUsersSvc = inject(CompanyUsersService);
    private permissionsService = inject(PermissionsService);
    private notification = inject(NotificationService);

    private destroy$ = new Subject<void>();
    private usersSubscription?: Subscription;

    // State signals
    users    = signal<CompanyUser[]>([]);
    loading  = signal(true);
    error    = signal<string | null>(null);
    roles    = signal<Role[]>([]);

    // Filters
    searchTerm  = signal('');
    roleFilter  = signal('');
    stateFilter = signal<StateFilter>('all');

    readonly stateOptions: { value: StateFilter; label: string }[] = [
        { value: 'all',      label: 'Todos' },
        { value: 'active',   label: 'Activos' },
        { value: 'inactive', label: 'Inactivos' },
    ];

    // Computed stats
    stats = computed<UserStats>(() => {
        const list = this.users();
        return {
            total:    list.length,
            admins:   list.filter(u => u.platformRole === 'admin' || u.platformRole === 'super_admin').length,
            active:   list.filter(u => u.isActive).length,
            inactive: list.filter(u => !u.isActive).length,
        };
    });

    // Computed filtered users (client-side — Firestore stream already loaded)
    filteredUsers = computed(() => {
        let list = this.users();
        const state  = this.stateFilter();
        const role   = this.roleFilter();
        const search = this.searchTerm().toLowerCase().trim();

        if (state === 'active')        list = list.filter(u => u.isActive);
        else if (state === 'inactive') list = list.filter(u => !u.isActive);

        if (role) list = list.filter(u => u.platformRole === role);

        if (search) {
            list = list.filter(u =>
                u.displayName.toLowerCase().includes(search) ||
                u.email.toLowerCase().includes(search)
            );
        }
        return list;
    });

    totalActiveFilters = computed(() =>
        (this.searchTerm() ? 1 : 0) +
        (this.roleFilter() ? 1 : 0) +
        (this.stateFilter() !== 'all' ? 1 : 0)
    );

    ngOnInit(): void {
        this.loadRoles();
        this.loadUsers();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private loadRoles(): void {
        this.permissionsService.getRoles()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (roles) => this.roles.set(roles),
                error: (err) => console.error('Error loading roles:', err),
            });
    }

    loadUsers(): void {
        this.loading.set(true);
        this.error.set(null);

        this.usersSubscription?.unsubscribe();
        this.usersSubscription = this.companyUsersSvc.getCompanyUsers()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => {
                    this.users.set(data);
                    this.loading.set(false);
                },
                error: (err) => {
                    console.error('Error loading users', err);
                    this.error.set('No se pudieron cargar los usuarios');
                    this.loading.set(false);
                    this.notification.error('Error al cargar usuarios');
                },
            });
    }

    clearAll(): void {
        this.searchTerm.set('');
        this.roleFilter.set('');
        this.stateFilter.set('all');
    }

    refresh(): void {
        this.loadUsers();
        this.notification.info('Actualizando lista de usuarios...');
    }

    toggleUserState(user: CompanyUser): void {
        const newState = !user.isActive;
        const action   = newState ? 'activar' : 'desactivar';

        const promise = newState
            ? this.companyUsersSvc.activateCompanyUser(user.uid)
            : this.companyUsersSvc.deactivateCompanyUser(user.uid);

        promise
            .then(() => this.notification.success(`Usuario ${newState ? 'activado' : 'desactivado'} correctamente`))
            .catch(() => this.notification.error(`Error al ${action} el usuario`));
    }

    getRoleColor(platformRole?: string): string {
        const dynamic = this.roles().find(r => r.code === platformRole);
        if (dynamic?.color) return dynamic.color;

        const systemColors: { [code: string]: string } = {
            super_admin: 'danger',
            admin:       'primary',
            accountant:  'warning',
            seller:      'info',
            cashier:     'success',
            read_only:   'secondary',
        };
        return systemColors[platformRole ?? ''] ?? 'dark';
    }

    getRoleName(user: CompanyUser): string {
        const dynamic = this.roles().find(r => r.code === user.platformRole);
        if (dynamic?.name) return dynamic.name;

        const systemNames: { [code: string]: string } = {
            super_admin: 'Super Admin',
            admin:       'Administrador',
            accountant:  'Contador',
            seller:      'Vendedor',
            cashier:     'Cajero',
            read_only:   'Solo lectura',
        };
        return systemNames[user.platformRole] ?? user.platformRole ?? 'Sin rol';
    }

    getRoleBadgeClass(platformRole?: string): string {
        const color = this.getRoleColor(platformRole);
        return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
    }

    getStateLabel(isActive: boolean): string {
        return isActive ? 'Activo' : 'Inactivo';
    }

    getUserInitials(user: CompanyUser): string {
        const parts = user.displayName.trim().split(' ');
        const first  = parts[0]?.charAt(0) ?? '';
        const last   = parts[1]?.charAt(0) ?? '';
        return (first + last).toUpperCase() || user.email.charAt(0).toUpperCase();
    }

    formatDate(date: any): string {
        if (!date) return 'N/A';
        const d = date?.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('es-EC');
    }
}
