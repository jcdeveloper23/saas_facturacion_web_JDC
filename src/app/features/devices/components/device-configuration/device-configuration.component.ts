import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    ButtonModule,
    CardModule,
    FormModule,
    GridModule,
    SpinnerModule
} from '@coreui/angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { DeviceSettingsService } from '../../../../core/services/device-settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { finalize } from 'rxjs/operators';

@Component({
    selector: 'app-device-configuration',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ButtonModule,
        CardModule,
        FormModule,
        GridModule,
        SpinnerModule
    ],
    templateUrl: './device-configuration.component.html'
})
export class DeviceConfigurationComponent implements OnChanges {
    @Input() device: Device | null = null;

    private fb = inject(FormBuilder);
    private settingsService = inject(DeviceSettingsService);
    private notification = inject(NotificationService);

    configForm: FormGroup;
    loading = false;
    saving = false;

    constructor() {
        this.configForm = this.fb.group({
            reportInterval: [60, [Validators.required, Validators.min(10)]],
            minSatellites: [4, [Validators.required, Validators.min(3)]],
            engineCutEnabled: [false],
            alertsEnabled: [true],
            state: [true]
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['device'] && this.device) {
            this.loadSettings();
        }
    }

    loadSettings(): void {
        if (!this.device) return;

        this.loading = true;
        this.settingsService.getByDevice(this.device.deviceImei).subscribe({
            next: (settings) => {
                if (settings) {
                    this.configForm.patchValue(settings);
                } else {
                    // Defaults or handle not found (maybe first time config)
                }
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading settings', err);
                this.loading = false;
            }
        });
    }

    onSubmit(): void {
        if (this.configForm.invalid || !this.device) return;

        this.saving = true;
        this.settingsService.saveSettings(this.device.deviceImei, this.configForm.value)
            .pipe(finalize(() => this.saving = false))
            .subscribe({
                next: () => {
                    this.notification.success('Configuracion guardada correctamente');
                },
                error: (err) => {
                    console.error('Error saving settings', err);
                    this.notification.error('Error al guardar configuracion');
                }
            });
    }
}
