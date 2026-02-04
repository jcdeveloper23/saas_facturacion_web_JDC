import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { UsersService } from '../../core/services/users.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { OrganizationsService } from '../../core/services/organizations.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { User, UserStats, UserFilters } from '../../core/interfaces/user.interface';
import { Role } from '../../core/interfaces/permission.interface';
import { Organization } from '../../core/interfaces/organization.interface';

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
export class UsersComponent implements OnInit {
    private usersService = inject(UsersService);
    private permissionsService = inject(PermissionsService);
    private organizationsService = inject(OrganizationsService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);

    // State signals
    users = signal<User[]>([]);
    loading = signal(false);
    error = signal<string | null>(null);

    // Select options
    roles = signal<Role[]>([]);
    organizations = signal<Organization[]>([]);

    // Filters
    searchControl = new FormControl('');
    roleFilter = signal<number | undefined>(undefined);
    stateFilter = signal<boolean | 'all'>('all');
    organizationFilter = signal<number | undefined>(undefined);

    // Super admin check
    isSuperAdmin = signal(false);

    // Computed stats
    stats = computed<UserStats>(() => {
        const list = this.users();
        return {
            total: list.length,
            admins: list.filter(u => {
                const roleLevel = u.role?.level;
                return roleLevel !== undefined && roleLevel <= 1;
            }).length,
            active: list.filter(u => u.state === true || u.state === 1).length,
            inactive: list.filter(u => u.state === false || u.state === 0).length
        };
    });

    // Computed filtered users
    filteredUsers = computed(() => {
        let list = this.users();
        const roleId = this.roleFilter();
        const orgId = this.organizationFilter();

        if (roleId !== undefined) {
            list = list.filter(u => u.roleId === roleId || u.role?.id === roleId);
        }

        if (orgId !== undefined) {
            list = list.filter(u => u.organization_id === orgId || u.organizationId === orgId);
        }

        return list;
    });

    ngOnInit(): void {
        this.checkPermissions();
        this.setupFilters();
        this.loadRoles();
        this.loadUsers();
    }

    private checkPermissions(): void {
        this.isSuperAdmin.set(this.authService.isSuperAdmin());
        if (this.isSuperAdmin()) {
            this.loadOrganizations();
        }
    }

    private loadRoles(): void {
        this.permissionsService.getRoles().subscribe({
            next: (roles) => this.roles.set(roles),
            error: (err) => console.error('Error loading roles:', err)
        });
    }

    private loadOrganizations(): void {
        this.organizationsService.getOrganizations({ is_active: true }).subscribe({
            next: (response) => this.organizations.set(response.data || []),
            error: (err) => console.error('Error loading organizations:', err)
        });
    }

    setupFilters(): void {
        this.searchControl.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged()
        ).subscribe(() => {
            this.loadUsers();
        });
    }

    loadUsers(): void {
        this.loading.set(true);
        this.error.set(null);

        const filters: UserFilters = {};

        const stateVal = this.stateFilter();
        if (stateVal !== 'all') {
            filters.state = stateVal;
        }

        const search = this.searchControl.value;
        if (search) filters.search = search;

        this.usersService.getUsers(filters).subscribe({
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
        this.roleFilter.set(value ? Number(value) : undefined);
    }

    onStateFilterChange(value: string): void {
        if (value === 'all') {
            this.stateFilter.set('all');
        } else {
            this.stateFilter.set(value === 'true');
        }
        this.loadUsers();
    }

    onOrganizationFilterChange(value: string): void {
        this.organizationFilter.set(value ? Number(value) : undefined);
    }

    refresh(): void {
        this.loadUsers();
        this.notification.info('Actualizando lista de usuarios...');
    }

    toggleUserState(user: User): void {
        if (!user.id) return;
        const newState = !user.state;
        const action = newState ? 'activar' : 'desactivar';

        this.usersService.updateState(user.id, newState).subscribe({
            next: () => {
                this.notification.success(`Usuario ${newState ? 'activado' : 'desactivado'} correctamente`);
                this.loadUsers();
            },
            error: () => {
                this.notification.error(`Error al ${action} el usuario`);
            }
        });
    }

    getRoleColor(role?: Role): string {
        if (!role) return 'secondary';
        switch (role.code) {
            case 'super_admin': return 'danger';
            case 'org_admin': return 'primary';
            case 'org_manager': return 'info';
            case 'operator': return 'success';
            case 'viewer': return 'secondary';
            case 'driver': return 'warning';
            default: return 'dark';
        }
    }

    getRoleName(user: User): string {
        if (user.role?.name) return user.role.name;
        return 'Sin rol';
    }

    getStateColor(state: boolean | number): string {
        return !!state ? 'success' : 'warning';
    }

    getStateLabel(state: boolean | number): string {
        return !!state ? 'Activo' : 'Inactivo';
    }

    getUserInitials(user: User): string {
        const first = user.userFullName?.charAt(0) || '';
        const last = user.userLastName?.charAt(0) || '';
        return (first + last).toUpperCase() || user.userEmail.charAt(0).toUpperCase();
    }

    formatDate(date: string | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('es-CO');
    }
}
