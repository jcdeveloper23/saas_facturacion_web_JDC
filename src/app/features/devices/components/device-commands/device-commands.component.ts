import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    ButtonModule,
    CardModule,
    FormModule,
    GridModule,
    SpinnerModule,
    TableModule,
    BadgeModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { DeviceCommand, CommandType } from '../../../../core/interfaces/device-command.interface';
import { DeviceCommandsService } from '../../../../core/services/device-commands.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
    selector: 'app-device-commands',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ButtonModule,
        CardModule,
        FormModule,
        GridModule,
        SpinnerModule,
        TableModule,
        BadgeModule,
        IconModule
    ],
    templateUrl: './device-commands.component.html'
})
export class DeviceCommandsComponent implements OnChanges {
    @Input() device: Device | null = null;

    private commandsService = inject(DeviceCommandsService);
    private authService = inject(AuthService);
    private fb = inject(FormBuilder);
    private notification = inject(NotificationService);

    commandForm: FormGroup;
    commands: DeviceCommand[] = [];
    loading = false;
    sending = false;

    commandTypes: { type: CommandType, label: string }[] = [
        { type: 'locate', label: 'Localizar' },
        { type: 'cut_engine', label: 'Apagar Motor' },
        { type: 'restore_engine', label: 'Restaurar Motor' },
        { type: 'reboot', label: 'Reiniciar Dispositivo' },
        { type: 'set_interval', label: 'Intervalo de Reporte' },
        { type: 'custom', label: 'Comando Personalizado' }
    ];

    selectedType: CommandType = 'locate';

    constructor() {
        this.commandForm = this.fb.group({
            commandType: ['locate', Validators.required],
            rawCommand: [''],
            interval: [60]
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['device'] && this.device) {
            this.loadHistory();
        }
    }

    get showCustomInput(): boolean {
        return this.commandForm.get('commandType')?.value === 'custom';
    }

    get showIntervalInput(): boolean {
        return this.commandForm.get('commandType')?.value === 'set_interval';
    }

    loadHistory(): void {
        if (!this.device) return;

        this.loading = true;
        this.commandsService.getByDevice(this.device.deviceImei).subscribe({
            next: (data) => {
                this.commands = data;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading commands', err);
                this.loading = false;
            }
        });
    }

    sendCommand(): void {
        if (this.commandForm.invalid || !this.device) return;

        const type = this.commandForm.get('commandType')?.value;
        const userId = this.authService.user()?.id;

        if (!userId) {
            this.notification.error('Usuario no autenticado');
            return;
        }

        this.sending = true;
        let request$;

        switch (type) {
            case 'locate':
                request$ = this.commandsService.locate(this.device.deviceImei, userId);
                break;
            case 'cut_engine':
                request$ = this.commandsService.cutEngine(this.device.deviceImei, userId);
                break;
            case 'restore_engine':
                request$ = this.commandsService.restoreEngine(this.device.deviceImei, userId);
                break;
            case 'reboot':
                request$ = this.commandsService.reboot(this.device.deviceImei, userId);
                break;
            case 'set_interval':
                const interval = this.commandForm.get('interval')?.value;
                request$ = this.commandsService.setInterval(this.device.deviceImei, interval, userId);
                break;
            case 'custom':
                const raw = this.commandForm.get('rawCommand')?.value;
                request$ = this.commandsService.sendCustom(this.device.deviceImei, raw, userId);
                break;
            default:
                this.sending = false;
                return;
        }

        request$.subscribe({
            next: (cmd) => {
                this.sending = false;
                this.commands.unshift(cmd);
                this.notification.success('Comando enviado correctamente');
                this.commandForm.reset({ commandType: 'locate', interval: 60 });
            },
            error: (err) => {
                this.sending = false;
                console.error(err);
                this.notification.error('Error al enviar comando');
            }
        });
    }

    getStatusColor(status: string): string {
        switch (status) {
            case 'pending': return 'warning';
            case 'sent': return 'info';
            case 'acknowledged': return 'success';
            case 'failed': return 'danger';
            default: return 'secondary';
        }
    }
}
