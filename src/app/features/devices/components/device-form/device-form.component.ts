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

    // Verificar si es super admin para mostrar organización
    isSuperAdmin = signal(false);

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
        // Super admin tiene role 0 o es 'super_admin'
        this.isSuperAdmin.set(user?.userCurrentRole === 0 || user?.roleId === 1);
    }

    private loadSelectOptions(): void {
        const currentUser = this.authService.user();
        const orgId = currentUser?.organizationId;

        // Cargar usuarios de la organización actual
        const usersRequest$ = orgId
            ? this.usersService.getUsers({ organizationId: orgId, state: true })
            : this.usersService.getUsers({ state: true });

        usersRequest$.subscribe({
            next: (users) => this.users.set(users),
            error: (err) => console.error('Error loading users:', err)
        });

        // Solo super admin puede ver organizaciones
        if (this.isSuperAdmin()) {
            this.organizationsService.getOrganizations({ is_active: true }).subscribe({
                next: (response) => this.organizations.set(response.data || []),
                error: (err) => console.error('Error loading organizations:', err)
            });
        }
    }

    loadDevice(imei: string): void {
        this.loadingData.set(true);
        this.deviceService.getByImei(imei).subscribe({
            next: (device) => {
                // Formatear fechas para inputs de tipo date
                const formData = {
                    ...device,
                    installationDate: this.formatDateForInput(device.installationDate),
                    expirationDate: this.formatDateForInput(device.expirationDate),
                    organizationId: device.organizationId || device.organization_id
                };
                this.deviceForm.patchValue(formData);
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
        if (orgId) {
            // Recargar usuarios de la organización seleccionada
            this.usersService.getUsers({ organizationId: orgId, state: true }).subscribe({
                next: (users) => {
                    this.users.set(users);
                    // Reset user si no pertenece a la nueva organización
                    const currentUserId = this.deviceForm.get('userId')?.value;
                    if (currentUserId && !users.find(u => u.id === currentUserId)) {
                        this.deviceForm.patchValue({ userId: null });
                    }
                }
            });
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
