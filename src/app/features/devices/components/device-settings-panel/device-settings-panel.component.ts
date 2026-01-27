import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    CardModule,
    GridModule,
    FormModule,
    ButtonModule,
    SpinnerModule,
    AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { DeviceSettings, DEFAULT_DEVICE_SETTINGS } from '../../../../core/interfaces/device-settings.interface';
import { DeviceSettingsService } from '../../../../core/services/device-settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';
import { finalize } from 'rxjs/operators';

@Component({
    selector: 'app-device-settings-panel',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CardModule,
        GridModule,
        FormModule,
        ButtonModule,
        SpinnerModule,
        AlertModule,
        IconModule
    ],
    template: `
        <!-- Loading -->
        @if (loading()) {
            <div class="text-center py-5">
                <c-spinner color="primary"></c-spinner>
                <p class="mt-2 text-muted">Cargando configuracion...</p>
            </div>
        }

        <!-- Error -->
        @if (error() && !loading()) {
            <c-alert color="warning" [dismissible]="false">
                <svg cIcon name="cilInfo" class="me-2"></svg>
                {{ error() }}
            </c-alert>
        }

        <!-- Form -->
        @if (!loading()) {
            <form [formGroup]="form" (ngSubmit)="onSubmit()">
                <c-row>
                    <!-- Reporting Configuration -->
                    <c-col lg="6" class="mb-4">
                        <c-card class="h-100">
                            <c-card-header>
                                <svg cIcon name="cilClock" class="me-2"></svg>
                                <strong>Reportes</strong>
                            </c-card-header>
                            <c-card-body>
                                <div class="mb-3">
                                    <label cLabel>Intervalo de reporte (segundos)</label>
                                    <input cFormControl type="number" formControlName="reportInterval" min="10" />
                                    <div class="form-text">Frecuencia de envio de datos (min: 10s)</div>
                                </div>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <label cLabel class="mb-0">Solo reportar en movimiento</label>
                                        <div class="form-text">Ahorra datos cuando el vehiculo esta detenido</div>
                                    </div>
                                    <c-form-check [switch]="true">
                                        <input cFormCheckInput type="checkbox" formControlName="reportOnlyWhenMoving" />
                                    </c-form-check>
                                </div>
                            </c-card-body>
                        </c-card>
                    </c-col>

                    <!-- Speed & Driving -->
                    <c-col lg="6" class="mb-4">
                        <c-card class="h-100">
                            <c-card-header>
                                <svg cIcon name="cilSpeedometer" class="me-2"></svg>
                                <strong>Velocidad y Conduccion</strong>
                            </c-card-header>
                            <c-card-body>
                                <div class="mb-3">
                                    <label cLabel>Limite de velocidad (km/h)</label>
                                    <input cFormControl type="number" formControlName="speedLimit" min="0" max="300" />
                                </div>
                                <div class="mb-3">
                                    <label cLabel>Tiempo inactivo para alerta (minutos)</label>
                                    <input cFormControl type="number" formControlName="idleTimeThreshold" min="1" />
                                </div>
                                <c-row>
                                    <c-col xs="6">
                                        <label cLabel>Aceleracion brusca</label>
                                        <div class="input-group">
                                            <input cFormControl type="number" formControlName="harshAccelerationThreshold" />
                                            <span class="input-group-text">km/h/s</span>
                                        </div>
                                    </c-col>
                                    <c-col xs="6">
                                        <label cLabel>Frenado brusco</label>
                                        <div class="input-group">
                                            <input cFormControl type="number" formControlName="harshBrakingThreshold" />
                                            <span class="input-group-text">km/h/s</span>
                                        </div>
                                    </c-col>
                                </c-row>
                            </c-card-body>
                        </c-card>
                    </c-col>

                    <!-- Alerts -->
                    <c-col lg="6" class="mb-4">
                        <c-card class="h-100">
                            <c-card-header>
                                <svg cIcon name="cilBell" class="me-2"></svg>
                                <strong>Alertas</strong>
                            </c-card-header>
                            <c-card-body>
                                <div class="mb-3">
                                    <label cLabel>Umbral bateria baja (%)</label>
                                    <input cFormControl type="number" formControlName="lowBatteryThreshold" min="0" max="100" />
                                </div>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <label cLabel class="mb-0">Verificar geocercas</label>
                                        <div class="form-text">Alertar al entrar/salir de geocercas</div>
                                    </div>
                                    <c-form-check [switch]="true">
                                        <input cFormCheckInput type="checkbox" formControlName="geofenceCheckEnabled" />
                                    </c-form-check>
                                </div>
                                @if (form.get('geofenceCheckEnabled')?.value) {
                                    <div class="mt-3">
                                        <label cLabel>Buffer de geocerca (metros)</label>
                                        <input cFormControl type="number" formControlName="geofenceBufferMeters" min="0" />
                                    </div>
                                }
                            </c-card-body>
                        </c-card>
                    </c-col>

                    <!-- Routes -->
                    <c-col lg="6" class="mb-4">
                        <c-card class="h-100">
                            <c-card-header>
                                <svg cIcon name="cilMap" class="me-2"></svg>
                                <strong>Rutas</strong>
                            </c-card-header>
                            <c-card-body>
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <div>
                                        <label cLabel class="mb-0">Crear rutas automaticamente</label>
                                        <div class="form-text">Detecta viajes automaticamente</div>
                                    </div>
                                    <c-form-check [switch]="true">
                                        <input cFormCheckInput type="checkbox" formControlName="autoRouteCreation" />
                                    </c-form-check>
                                </div>
                                @if (form.get('autoRouteCreation')?.value) {
                                    <c-row>
                                        <c-col xs="6">
                                            <label cLabel>Distancia minima (km)</label>
                                            <input cFormControl type="number" formControlName="minRouteDistance" min="0" step="0.1" />
                                        </c-col>
                                        <c-col xs="6">
                                            <label cLabel>Duracion minima (min)</label>
                                            <input cFormControl type="number" formControlName="minRouteDuration" min="1" />
                                        </c-col>
                                    </c-row>
                                }
                            </c-card-body>
                        </c-card>
                    </c-col>

                    <!-- Remote Control -->
                    <c-col lg="6" class="mb-4">
                        <c-card class="h-100">
                            <c-card-header>
                                <svg cIcon name="cilTerminal" class="me-2"></svg>
                                <strong>Control Remoto</strong>
                            </c-card-header>
                            <c-card-body>
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <div>
                                        <label cLabel class="mb-0">Permitir comandos remotos</label>
                                        <div class="form-text">Habilita el envio de comandos al dispositivo</div>
                                    </div>
                                    <c-form-check [switch]="true">
                                        <input cFormCheckInput type="checkbox" formControlName="allowRemoteCommands" />
                                    </c-form-check>
                                </div>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <label cLabel class="mb-0">Permitir control de motor</label>
                                        <div class="form-text text-danger">Permite apagar el motor remotamente</div>
                                    </div>
                                    <c-form-check [switch]="true">
                                        <input cFormCheckInput type="checkbox" formControlName="allowEngineControl" />
                                    </c-form-check>
                                </div>
                            </c-card-body>
                        </c-card>
                    </c-col>

                    <!-- Notes -->
                    <c-col lg="6" class="mb-4">
                        <c-card class="h-100">
                            <c-card-header>
                                <svg cIcon name="cilNotes" class="me-2"></svg>
                                <strong>Notas</strong>
                            </c-card-header>
                            <c-card-body>
                                <textarea cFormControl formControlName="deviceNotes" rows="4"
                                    placeholder="Notas adicionales sobre este dispositivo..."></textarea>
                            </c-card-body>
                        </c-card>
                    </c-col>
                </c-row>

                <!-- Actions -->
                <div class="d-flex justify-content-end gap-2">
                    <button cButton color="secondary" type="button" (click)="resetForm()" [disabled]="saving()">
                        Restablecer
                    </button>
                    <button cButton color="primary" type="submit" [disabled]="saving() || form.invalid">
                        @if (saving()) {
                            <c-spinner size="sm" class="me-2"></c-spinner>
                        }
                        Guardar Configuracion
                    </button>
                </div>
            </form>
        }
    `
})
export class DeviceSettingsPanelComponent implements OnInit {
    @Input({ required: true }) device!: Device;

    private fb = inject(FormBuilder);
    private settingsService = inject(DeviceSettingsService);
    private notification = inject(NotificationService);
    private authService = inject(AuthService);

    form!: FormGroup;
    loading = signal(true);
    saving = signal(false);
    error = signal<string | null>(null);
    private currentSettings: DeviceSettings | null = null;

    ngOnInit(): void {
        this.initForm();
        this.loadSettings();
    }

    private initForm(): void {
        this.form = this.fb.group({
            reportInterval: [DEFAULT_DEVICE_SETTINGS.reportInterval, [Validators.required, Validators.min(10)]],
            reportOnlyWhenMoving: [DEFAULT_DEVICE_SETTINGS.reportOnlyWhenMoving],
            speedLimit: [DEFAULT_DEVICE_SETTINGS.speedLimit, [Validators.required, Validators.min(0)]],
            idleTimeThreshold: [DEFAULT_DEVICE_SETTINGS.idleTimeThreshold, [Validators.min(1)]],
            harshAccelerationThreshold: [DEFAULT_DEVICE_SETTINGS.harshAccelerationThreshold],
            harshBrakingThreshold: [DEFAULT_DEVICE_SETTINGS.harshBrakingThreshold],
            lowBatteryThreshold: [DEFAULT_DEVICE_SETTINGS.lowBatteryThreshold, [Validators.min(0), Validators.max(100)]],
            geofenceCheckEnabled: [DEFAULT_DEVICE_SETTINGS.geofenceCheckEnabled],
            geofenceBufferMeters: [DEFAULT_DEVICE_SETTINGS.geofenceBufferMeters, [Validators.min(0)]],
            autoRouteCreation: [DEFAULT_DEVICE_SETTINGS.autoRouteCreation],
            minRouteDistance: [DEFAULT_DEVICE_SETTINGS.minRouteDistance, [Validators.min(0)]],
            minRouteDuration: [DEFAULT_DEVICE_SETTINGS.minRouteDuration, [Validators.min(1)]],
            allowRemoteCommands: [DEFAULT_DEVICE_SETTINGS.allowRemoteCommands],
            allowEngineControl: [DEFAULT_DEVICE_SETTINGS.allowEngineControl],
            deviceNotes: ['']
        });
    }

    private loadSettings(): void {
        this.loading.set(true);
        this.error.set(null);

        this.settingsService.getByDevice(this.device.deviceImei).subscribe({
            next: (settings) => {
                if (settings) {
                    this.currentSettings = settings;
                    this.form.patchValue(settings);
                } else {
                    this.error.set('No hay configuracion guardada. Se usaran valores por defecto.');
                }
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading settings:', err);
                this.error.set('No se pudo cargar la configuracion. Se usaran valores por defecto.');
                this.loading.set(false);
            }
        });
    }

    onSubmit(): void {
        if (this.form.invalid) return;

        // Get userId from device owner or current user
        const userId = this.device.userId || this.authService.user()?.id;

        if (!userId) {
            this.notification.error('No se pudo determinar el usuario');
            return;
        }

        this.saving.set(true);
        this.settingsService.saveSettings(this.device.deviceImei, this.form.value, userId)
            .pipe(finalize(() => this.saving.set(false)))
            .subscribe({
                next: (saved) => {
                    this.currentSettings = saved;
                    this.error.set(null);
                    this.notification.success('Configuracion guardada correctamente');
                },
                error: (err) => {
                    console.error('Error saving settings:', err);
                    this.notification.error('Error al guardar la configuracion');
                }
            });
    }

    resetForm(): void {
        if (this.currentSettings) {
            this.form.patchValue(this.currentSettings);
        } else {
            this.form.patchValue(DEFAULT_DEVICE_SETTINGS);
        }
    }
}
