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
import { DevicesService } from '../../../../core/services/devices.service';
import { UsersService } from '../../../../core/services/users.service';
import { OrganizationsService } from '../../../../core/services/organizations.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Device, DeviceModel } from '../../../../core/interfaces/device.interface';
import { User } from '../../../../core/interfaces/user.interface';
import { Organization } from '../../../../core/interfaces/organization.interface';

// Zonas horarias comunes
const TIMEZONES = [
    { value: 'America/Bogota', label: 'America/Bogota (UTC-5)' },
    { value: 'America/Caracas', label: 'America/Caracas (UTC-4)' },
    { value: 'America/Lima', label: 'America/Lima (UTC-5)' },
    { value: 'America/Mexico_City', label: 'America/Mexico_City (UTC-6)' },
    { value: 'America/Panama', label: 'America/Panama (UTC-5)' },
    { value: 'America/Santiago', label: 'America/Santiago (UTC-3)' },
    { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },
    { value: 'America/Buenos_Aires', label: 'America/Buenos_Aires (UTC-3)' },
    { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8)' },
    { value: 'Europe/Madrid', label: 'Europe/Madrid (UTC+1)' },
    { value: 'UTC', label: 'UTC (UTC+0)' }
];

@Component({
    selector: 'app-device-form',
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
    templateUrl: './device-form.component.html'
})
export class DeviceFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private deviceService = inject(DevicesService);
    private usersService = inject(UsersService);
    private organizationsService = inject(OrganizationsService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    deviceForm!: FormGroup;
    isEditMode = false;
    loading = signal(false);
    loadingData = signal(true);
    deviceId: string | null = null;
    errorMessage = signal('');

    // Opciones para selects
    deviceModels: DeviceModel[] = ['GT06', 'H02', 'TK103', 'TK102', 'Teltonika', 'Coban', 'Concox', 'Sinotrack', 'Other'];
    timezones = TIMEZONES;
    users = signal<User[]>([]);
    organizations = signal<Organization[]>([]);
    loadingUsers = signal(false);

    // Verificar si es super admin para mostrar organización
    isSuperAdmin = signal(false);

    // Nombre de la organización actual (para usuarios no super_admin)
    currentOrganizationName = signal<string>('');

    ngOnInit(): void {
        this.initForm();
        this.checkPermissions();
        this.loadSelectOptions();

        this.route.params.subscribe(params => {
            if (params['id']) {
                this.isEditMode = true;
                this.deviceId = params['id'];
                this.deviceForm.get('deviceImei')?.disable();
                this.loadDevice(this.deviceId!);
            } else {
                this.loadingData.set(false);
            }
        });
    }

    private initForm(): void {
        const currentUser = this.authService.user();

        this.deviceForm = this.fb.group({
            // Identificación
            deviceImei: ['', [Validators.required, Validators.minLength(15), Validators.maxLength(15), Validators.pattern(/^\d{15}$/)]],
            deviceName: ['', [Validators.required, Validators.maxLength(100)]],
            deviceModel: ['GT06', Validators.required],
            deviceProtocol: ['gt06', Validators.maxLength(50)],

            // Conectividad
            simNumber: ['', [Validators.maxLength(20)]],

            // Configuración operativa
            speedLimit: [120, [Validators.required, Validators.min(0), Validators.max(300)]],
            timezone: ['America/Bogota', Validators.required],

            // Fechas de servicio
            installationDate: [this.formatDateForInput(new Date())],
            expirationDate: [''],

            // Notas
            notes: ['', Validators.maxLength(500)],

            // Asignación
            userId: [currentUser?.id || null],
            organizationId: [currentUser?.organizationId || null],

            // Estado
            state: [true]
        });
    }

    private checkPermissions(): void {
        const user = this.authService.user();

        console.log('=== DEBUG checkPermissions ===');
        console.log('user:', user);
        console.log('user.role:', user?.role);
        console.log('user.role?.code:', user?.role?.code);
        console.log('user.userCurrentRole:', user?.userCurrentRole);
        console.log('user.roleId:', user?.roleId);

        // Super admin: verificar múltiples formas
        const isSuperAdmin =
            user?.role?.code === 'super_admin' ||           // Por código de rol
            user?.userCurrentRole === 0 ||                   // Legacy: rol numérico 0
            user?.roleId === 1 ||                            // Role ID 1 = super_admin
            String(user?.role?.code).toLowerCase() === 'super_admin'; // Por si viene con diferente case

        console.log('isSuperAdmin:', isSuperAdmin);
        console.log('=== END DEBUG ===');

        this.isSuperAdmin.set(isSuperAdmin);
    }

    private loadSelectOptions(): void {
        const currentUser = this.authService.user();
        const orgId = currentUser?.organizationId || currentUser?.organization_id;

        console.log('=== DEBUG loadSelectOptions ===');
        console.log('currentUser:', currentUser);
        console.log('orgId:', orgId);
        console.log('currentUser.organization:', currentUser?.organization);
        console.log('currentUser.organizationName:', currentUser?.organizationName);
        console.log('isSuperAdmin:', this.isSuperAdmin());
        console.log('isEditMode:', this.isEditMode);

        // Solo super admin puede ver y cambiar organizaciones
        if (this.isSuperAdmin()) {
            this.organizationsService.getOrganizations({ is_active: true }).subscribe({
                next: (response) => this.organizations.set(response.data || []),
                error: (err) => console.error('Error loading organizations:', err)
            });
        } else {
            // Para otros usuarios: cargar nombre de organización desde backend
            if (orgId) {
                // Cargar datos de la organización
                this.organizationsService.get(orgId).subscribe({
                    next: (org) => {
                        console.log('Organización cargada:', JSON.stringify(org, null, 2));
                        this.currentOrganizationName.set(org.name || 'Organización');
                    },
                    error: (err) => {
                        console.error('Error loading organization:', err);
                        this.currentOrganizationName.set('Organización');
                    }
                });

                // Cargar usuarios de la organización
                this.loadUsersByOrganization(orgId);
            } else {
                console.warn('No se encontró organization_id en el usuario');
                this.currentOrganizationName.set('Sin organización');
            }
        }
    }

    /**
     * Carga usuarios de una organización específica
     */
    private loadUsersByOrganization(orgId?: number | null): void {
        console.log('=== loadUsersByOrganization ===');
        console.log('orgId recibido:', orgId);

        this.loadingUsers.set(true);
        this.users.set([]);

        // Usar state: 1 para compatibilidad con backend (0/1 en lugar de true/false)
        const filters = orgId
            ? { organizationId: orgId, state: 1 as any }
            : { state: 1 as any };

        console.log('Filters para usuarios:', filters);

        this.usersService.getUsers(filters).subscribe({
            next: (users) => {
                console.log('Usuarios recibidos:', users);
                this.users.set(users);
                this.loadingUsers.set(false);
            },
            error: (err) => {
                console.error('Error loading users:', err);
                this.loadingUsers.set(false);
            }
        });
    }

    loadDevice(imei: string): void {
        this.loadingData.set(true);
        this.deviceService.getByImei(imei).subscribe({
            next: (device) => {
                // Formatear fechas para inputs de tipo date
                const deviceOrgId = device.organizationId || device.organization_id;
                const formData = {
                    ...device,
                    installationDate: this.formatDateForInput(device.installationDate),
                    expirationDate: this.formatDateForInput(device.expirationDate),
                    organizationId: deviceOrgId
                };
                this.deviceForm.patchValue(formData);

                // Establecer nombre de organización (para usuarios no super_admin)
                if (!this.isSuperAdmin()) {
                    const orgName = (device as any).organization?.name ||
                                    this.authService.user()?.organization?.name ||
                                    this.authService.user()?.organizationName ||
                                    'Organización';
                    this.currentOrganizationName.set(orgName);
                }

                // Cargar usuarios de la organización del dispositivo
                this.loadUsersByOrganization(deviceOrgId);

                this.loadingData.set(false);
            },
            error: (err) => {
                this.errorMessage.set('Error al cargar el dispositivo');
                this.loadingData.set(false);
                this.notification.error('Error al cargar el dispositivo');
                console.error(err);
            }
        });
    }

    onSubmit(): void {
        if (this.deviceForm.invalid) {
            this.deviceForm.markAllAsTouched();
            this.notification.warning('Por favor complete todos los campos requeridos');
            return;
        }

        this.loading.set(true);
        this.errorMessage.set('');

        const formValue = this.deviceForm.getRawValue();

        // Preparar datos para enviar
        const deviceData: Partial<Device> = {
            deviceImei: formValue.deviceImei,
            deviceName: formValue.deviceName,
            deviceModel: formValue.deviceModel,
            deviceProtocol: formValue.deviceProtocol || formValue.deviceModel.toLowerCase(),
            simNumber: formValue.simNumber || undefined,
            speedLimit: formValue.speedLimit,
            timezone: formValue.timezone,
            installationDate: formValue.installationDate || undefined,
            expirationDate: formValue.expirationDate || undefined,
            notes: formValue.notes || undefined,
            userId: formValue.userId,
            organizationId: formValue.organizationId,
            state: formValue.state
        };

        const request$ = this.isEditMode
            ? this.deviceService.patch(this.deviceId!, deviceData)
            : this.deviceService.create(deviceData);

        request$.subscribe({
            next: (savedDevice) => {
                this.loading.set(false);
                this.notification.success(
                    this.isEditMode ? 'Dispositivo actualizado correctamente' : 'Dispositivo creado correctamente'
                );
                this.router.navigate(['/devices', savedDevice.deviceImei]);
            },
            error: (err) => {
                this.loading.set(false);
                const message = err.error?.message || err.message || 'Error al guardar el dispositivo';
                this.errorMessage.set(message);
                this.notification.error(message);
                console.error(err);
            }
        });
    }

    // Helpers
    private formatDateForInput(date: string | Date | undefined): string {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.deviceForm.get(fieldName);
        return !!(field && field.invalid && field.touched);
    }

    getFieldError(fieldName: string): string {
        const field = this.deviceForm.get(fieldName);
        if (!field || !field.errors) return '';

        if (field.errors['required']) return 'Este campo es requerido';
        if (field.errors['minlength']) return `Minimo ${field.errors['minlength'].requiredLength} caracteres`;
        if (field.errors['maxlength']) return `Maximo ${field.errors['maxlength'].requiredLength} caracteres`;
        if (field.errors['min']) return `El valor minimo es ${field.errors['min'].min}`;
        if (field.errors['max']) return `El valor maximo es ${field.errors['max'].max}`;
        if (field.errors['pattern']) return 'Formato invalido';

        return 'Campo invalido';
    }

    onOrganizationChange(): void {
        const orgId = this.deviceForm.get('organizationId')?.value;

        // Reset usuario cuando cambia la organización
        this.deviceForm.patchValue({ userId: null });

        if (orgId) {
            // Recargar usuarios de la organización seleccionada
            this.loadingUsers.set(true);
            this.users.set([]);

            this.usersService.getUsers({ organizationId: Number(orgId), state: 1 }).subscribe({
                next: (users) => {
                    this.users.set(users);
                    this.loadingUsers.set(false);

                    if (users.length === 0) {
                        this.notification.warning('No hay usuarios activos en esta organización');
                    }
                },
                error: (err) => {
                    console.error('Error loading users:', err);
                    this.loadingUsers.set(false);
                    this.notification.error('Error al cargar usuarios de la organización');
                }
            });
        } else {
            // Si no hay organización seleccionada, limpiar usuarios
            this.users.set([]);
        }
    }

    cancel(): void {
        if (this.isEditMode && this.deviceId) {
            this.router.navigate(['/devices', this.deviceId]);
        } else {
            this.router.navigate(['/devices']);
        }
    }
}
