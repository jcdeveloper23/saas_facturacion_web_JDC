import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    CardModule,
    GridModule,
    ButtonModule,
    FormModule,
    UtilitiesModule,
    SpinnerModule,
    AlertModule,
    BadgeModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { UsersService } from '../../../../core/services/users.service';
import { PermissionsService } from '../../../../core/services/permissions.service';
import { OrganizationsService } from '../../../../core/services/organizations.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { User } from '../../../../core/interfaces/user.interface';
import { Role } from '../../../../core/interfaces/permission.interface';
import { Organization } from '../../../../core/interfaces/organization.interface';

@Component({
    selector: 'app-user-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CardModule,
        GridModule,
        ButtonModule,
        FormModule,
        UtilitiesModule,
        IconModule,
        SpinnerModule,
        AlertModule,
        BadgeModule
    ],
    templateUrl: './user-form.component.html'
})
export class UserFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private usersService = inject(UsersService);
    private permissionsService = inject(PermissionsService);
    private organizationsService = inject(OrganizationsService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    userForm!: FormGroup;
    isEditMode = false;
    loading = signal(false);
    loadingData = signal(true);
    userId: string | null = null;
    errorMessage = signal('');

    // Options for selects
    allRoles = signal<Role[]>([]);
    assignableRoles = signal<Role[]>([]);
    organizations = signal<Organization[]>([]);

    isSuperAdmin = signal(false);

    ngOnInit(): void {
        this.initForm();
        this.checkPermissions();
        this.loadSelectOptions();

        this.route.params.subscribe(params => {
            if (params['id']) {
                this.isEditMode = true;
                this.userId = params['id'];
                this.loadUser(this.userId!);
            } else {
                this.loadingData.set(false);
            }
        });
    }

    private initForm(): void {
        const currentUser = this.authService.user();

        this.userForm = this.fb.group({
            // Personal info
            userFullName: ['', [Validators.required, Validators.maxLength(100)]],
            userLastName: ['', [Validators.required, Validators.maxLength(100)]],
            userEmail: ['', [Validators.required, Validators.email]],
            userPhone: ['', [Validators.maxLength(20)]],

            // Security
            userPassword: ['', [Validators.required, Validators.minLength(6)]],
            passwordConfirm: ['', [Validators.required]],

            // Emergency contact
            userPhoneEmergency: ['', [Validators.maxLength(20)]],
            userEmailEmergency: ['', [Validators.email]],

            // Notifications
            userReceiveNotifications: [true],
            userMuteNotifications: [false],

            // Role & assignment
            organizationId: [currentUser?.organizationId || null],
            roleId: [null, Validators.required],

            // State
            state: [true]
        });
    }

    private checkPermissions(): void {
        this.isSuperAdmin.set(this.authService.isSuperAdmin());
    }

    private loadSelectOptions(): void {
        // Load roles
        this.permissionsService.getRoles().subscribe({
            next: (roles) => {
                this.allRoles.set(roles);
                this.assignableRoles.set(this.permissionsService.getAssignableRoles(roles));
                console.log('Roles loaded:', roles.length);
            },
            error: (err) => console.error('Error loading roles:', err)
        });

        // Only super admin can see organizations
        if (this.isSuperAdmin()) {
            console.log('Loading organizations for super admin...');
            this.organizationsService.getOrganizations({ is_active: true }).subscribe({
                next: (response) => {
                    console.log('Organizations response:', response);
                    console.log('Organizations data:', response.data);
                    this.organizations.set(response.data || []);
                },
                error: (err) => console.error('Error loading organizations:', err)
            });
        } else {
            console.log('Not super admin, skipping organizations load');
        }
    }

    loadUser(id: string): void {
        this.loadingData.set(true);
        this.usersService.get(id).subscribe({
            next: (user) => {
                // In edit mode: password not required, email disabled
                this.userForm.get('userPassword')?.clearValidators();
                this.userForm.get('userPassword')?.updateValueAndValidity();
                this.userForm.get('passwordConfirm')?.clearValidators();
                this.userForm.get('passwordConfirm')?.updateValueAndValidity();
                this.userForm.get('userEmail')?.disable();

                this.userForm.patchValue({
                    userFullName: user.userFullName || '',
                    userLastName: user.userLastName || '',
                    userEmail: user.userEmail,
                    userPhone: user.userPhone || '',
                    userPhoneEmergency: user.userPhoneEmergency || '',
                    userEmailEmergency: user.userEmailEmergency || '',
                    userReceiveNotifications: user.userReceiveNotifications ?? true,
                    userMuteNotifications: user.userMuteNotifications ?? false,
                    organizationId: user.organization_id || user.organizationId || null,
                    roleId: user.roleId || user.role?.id || null,
                    state: user.state === 1 || user.state === true
                });
                this.loadingData.set(false);
            },
            error: (err) => {
                this.errorMessage.set('Error al cargar el usuario');
                this.loadingData.set(false);
                this.notification.error('Error al cargar el usuario');
                console.error(err);
            }
        });
    }

    onSubmit(): void {
        if (this.userForm.invalid) {
            this.userForm.markAllAsTouched();
            this.notification.warning('Por favor complete todos los campos requeridos');
            return;
        }

        // Validate password confirmation
        const formValue = this.userForm.getRawValue();
        if (formValue.userPassword && formValue.userPassword !== formValue.passwordConfirm) {
            this.errorMessage.set('Las contrasenas no coinciden');
            this.notification.warning('Las contrasenas no coinciden');
            return;
        }

        this.loading.set(true);
        this.errorMessage.set('');

        // Build payload
        const userData: Partial<User> = {
            userFullName: formValue.userFullName,
            userLastName: formValue.userLastName,
            userEmail: formValue.userEmail,
            userPhone: formValue.userPhone || undefined,
            userPhoneEmergency: formValue.userPhoneEmergency || undefined,
            userEmailEmergency: formValue.userEmailEmergency || undefined,
            userReceiveNotifications: formValue.userReceiveNotifications,
            userMuteNotifications: formValue.userMuteNotifications,
            organization_id: formValue.organizationId, // Backend uses snake_case
            userCurrentRole: formValue.roleId,
            state: formValue.state
        };

        // Only include password if provided
        if (formValue.userPassword) {
            userData.userPassword = formValue.userPassword;
        }

        const request$ = this.isEditMode
            ? this.usersService.patch(this.userId!, userData)
            : this.usersService.create(userData);

        request$.subscribe({
            next: (savedUser) => {
                this.loading.set(false);
                this.notification.success(
                    this.isEditMode ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente'
                );
                this.router.navigate(['/users', savedUser.id]);
            },
            error: (err) => {
                this.loading.set(false);
                let message = err.error?.message || err.message || 'Error al guardar el usuario';
                if (err.status === 409) {
                    message = 'Ya existe un usuario con ese correo electronico';
                }
                this.errorMessage.set(message);
                this.notification.error(message);
                console.error(err);
            }
        });
    }

    onOrganizationChange(): void {
        // When org changes, we could reload roles filtered by org
        // For now, roles are global
    }

    // Helpers
    isFieldInvalid(fieldName: string): boolean {
        const field = this.userForm.get(fieldName);
        return !!(field && field.invalid && field.touched);
    }

    getFieldError(fieldName: string): string {
        const field = this.userForm.get(fieldName);
        if (!field || !field.errors) return '';

        if (field.errors['required']) return 'Este campo es requerido';
        if (field.errors['minlength']) return `Minimo ${field.errors['minlength'].requiredLength} caracteres`;
        if (field.errors['maxlength']) return `Maximo ${field.errors['maxlength'].requiredLength} caracteres`;
        if (field.errors['email']) return 'Ingrese un correo electronico valido';
        if (field.errors['pattern']) return 'Formato invalido';

        return 'Campo invalido';
    }

    cancel(): void {
        if (this.isEditMode && this.userId) {
            this.router.navigate(['/users', this.userId]);
        } else {
            this.router.navigate(['/users']);
        }
    }
}
