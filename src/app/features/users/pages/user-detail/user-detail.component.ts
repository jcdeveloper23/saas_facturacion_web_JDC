import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
    CardModule,
    GridModule,
    ButtonModule,
    BadgeModule,
    UtilitiesModule,
    SpinnerModule,
    AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { UsersService } from '../../../../core/services/users.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { User } from '../../../../core/interfaces/user.interface';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';

@Component({
    selector: 'app-user-detail',
    standalone: true,
    imports: [
        CommonModule,
        CardModule,
        GridModule,
        ButtonModule,
        BadgeModule,
        UtilitiesModule,
        SpinnerModule,
        AlertModule,
        IconModule,
        HasPermissionDirective
    ],
    templateUrl: './user-detail.component.html'
})
export class UserDetailComponent implements OnInit {
    readonly route = inject(ActivatedRoute);
    private router = inject(Router);
    private usersService = inject(UsersService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);

    // State
    user = signal<User | null>(null);
    loading = signal(true);
    error = signal<string | null>(null);

    isSuperAdmin = signal(false);

    ngOnInit(): void {
        this.isSuperAdmin.set(this.authService.isSuperAdmin());
        this.route.params.subscribe(params => {
            if (params['id']) {
                this.loadUser(params['id']);
            }
        });
    }

    loadUser(id: string): void {
        this.loading.set(true);
        this.error.set(null);

        this.usersService.get(id).subscribe({
            next: (user) => {
                this.user.set(user);
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading user:', err);
                this.error.set('No se pudo cargar el usuario.');
                this.loading.set(false);
                this.notification.error('Error al cargar el usuario');
            }
        });
    }

    getUserInitials(): string {
        const u = this.user();
        if (!u) return '';
        const first = u.userFullName?.charAt(0) || '';
        const last = u.userLastName?.charAt(0) || '';
        return (first + last).toUpperCase() || u.userEmail.charAt(0).toUpperCase();
    }

    getRoleColor(): string {
        const role = this.user()?.role;
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

    getRoleName(): string {
        return this.user()?.role?.name || 'Sin rol';
    }

    toggleState(): void {
        const u = this.user();
        if (!u?.id) return;
        const newState = !u.state;

        this.usersService.updateState(u.id, newState).subscribe({
            next: () => {
                this.notification.success(`Usuario ${newState ? 'activado' : 'desactivado'} correctamente`);
                this.loadUser(u.id!.toString());
            },
            error: () => {
                this.notification.error('Error al cambiar el estado del usuario');
            }
        });
    }

    formatDate(date: string | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('es-CO');
    }

    editUser(): void {
        const id = this.user()?.id;
        if (id) {
            this.router.navigate(['/users', id, 'edit']);
        }
    }

    refreshUser(): void {
        const id = this.user()?.id;
        if (id) {
            this.loadUser(id.toString());
            this.notification.info('Actualizando...');
        }
    }

    goBack(): void {
        this.router.navigate(['/users']);
    }
}
