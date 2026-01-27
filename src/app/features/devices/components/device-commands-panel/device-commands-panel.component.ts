import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    CardModule,
    GridModule,
    FormModule,
    ButtonModule,
    SpinnerModule,
    TableModule,
    BadgeModule,
    AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { DeviceCommand, CommandType, CommandStatus } from '../../../../core/interfaces/device-command.interface';
import { DeviceCommandsService } from '../../../../core/services/device-commands.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';

interface QuickCommand {
    type: CommandType;
    label: string;
    icon: string;
    color: string;
    description: string;
    dangerous?: boolean;
}

@Component({
    selector: 'app-device-commands-panel',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CardModule,
        GridModule,
        FormModule,
        ButtonModule,
        SpinnerModule,
        TableModule,
        BadgeModule,
        AlertModule,
        IconModule
    ],
    template: `
        <c-row>
            <!-- Quick Commands -->
            <c-col lg="4" class="mb-4">
                <c-card>
                    <c-card-header>
                        <svg cIcon name="cilBolt" class="me-2"></svg>
                        <strong>Comandos Rapidos</strong>
                    </c-card-header>
                    <c-card-body>
                        <div class="d-grid gap-2">
                            @for (cmd of quickCommands; track cmd.type) {
                                <button cButton [color]="cmd.color"
                                    [variant]="cmd.dangerous ? 'outline' : 'ghost'"
                                    [disabled]="sending()"
                                    (click)="sendQuickCommand(cmd.type)"
                                    class="text-start">
                                    <div class="d-flex align-items-center">
                                        <svg cIcon [name]="cmd.icon" class="me-2"></svg>
                                        <div>
                                            <div>{{ cmd.label }}</div>
                                            <small class="opacity-75">{{ cmd.description }}</small>
                                        </div>
                                    </div>
                                </button>
                            }
                        </div>
                    </c-card-body>
                </c-card>

                <!-- Custom Command -->
                <c-card class="mt-4">
                    <c-card-header>
                        <svg cIcon name="cilCode" class="me-2"></svg>
                        <strong>Comando Personalizado</strong>
                    </c-card-header>
                    <c-card-body>
                        <form [formGroup]="customForm" (ngSubmit)="sendCustomCommand()">
                            <div class="mb-3">
                                <label cLabel>Comando RAW</label>
                                <input cFormControl formControlName="rawCommand"
                                    placeholder="Ej: RELAY,1#" />
                                <div class="form-text">Comando en formato del protocolo del dispositivo</div>
                            </div>
                            <button cButton color="dark" type="submit" class="w-100"
                                [disabled]="sending() || customForm.invalid">
                                @if (sending()) {
                                    <c-spinner size="sm" class="me-2"></c-spinner>
                                }
                                Enviar Comando
                            </button>
                        </form>
                    </c-card-body>
                </c-card>

                <!-- Set Interval -->
                <c-card class="mt-4">
                    <c-card-header>
                        <svg cIcon name="cilClock" class="me-2"></svg>
                        <strong>Intervalo de Reporte</strong>
                    </c-card-header>
                    <c-card-body>
                        <form [formGroup]="intervalForm" (ngSubmit)="sendIntervalCommand()">
                            <div class="mb-3">
                                <label cLabel>Segundos</label>
                                <input cFormControl type="number" formControlName="interval" min="10" />
                            </div>
                            <button cButton color="info" type="submit" class="w-100"
                                [disabled]="sending() || intervalForm.invalid">
                                Configurar Intervalo
                            </button>
                        </form>
                    </c-card-body>
                </c-card>
            </c-col>

            <!-- Command History -->
            <c-col lg="8" class="mb-4">
                <c-card class="h-100">
                    <c-card-header class="d-flex justify-content-between align-items-center">
                        <div>
                            <svg cIcon name="cilHistory" class="me-2"></svg>
                            <strong>Historial de Comandos</strong>
                        </div>
                        <button cButton color="light" size="sm" (click)="loadHistory()" [disabled]="loadingHistory()">
                            <svg cIcon name="cilReload"></svg>
                        </button>
                    </c-card-header>
                    <c-card-body>
                        @if (loadingHistory()) {
                            <div class="text-center py-4">
                                <c-spinner color="primary"></c-spinner>
                            </div>
                        } @else {
                            <div class="table-responsive">
                                <table cTable hover striped small>
                                    <thead class="table-light">
                                        <tr>
                                            <th>Tipo</th>
                                            <th>Estado</th>
                                            <th>Enviado</th>
                                            <th>Respuesta</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (cmd of commands(); track cmd.id) {
                                            <tr>
                                                <td>
                                                    <strong>{{ getCommandLabel(cmd.commandType) }}</strong>
                                                    @if (cmd.commandType === 'custom' && cmd.rawCommand) {
                                                        <div class="small text-muted font-monospace">{{ cmd.rawCommand }}</div>
                                                    }
                                                </td>
                                                <td>
                                                    <c-badge [color]="getStatusColor(cmd.commandStatus)" shape="rounded-pill">
                                                        {{ getStatusLabel(cmd.commandStatus) }}
                                                    </c-badge>
                                                </td>
                                                <td>
                                                    <div class="small">{{ formatDate(cmd.createdAt) }}</div>
                                                    @if (cmd.sentAt) {
                                                        <div class="small text-muted">Enviado: {{ formatDate(cmd.sentAt) }}</div>
                                                    }
                                                </td>
                                                <td>
                                                    @if (cmd.responseData) {
                                                        <code class="small">{{ cmd.responseData }}</code>
                                                    } @else {
                                                        <span class="text-muted">-</span>
                                                    }
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="4" class="text-center text-muted py-4">
                                                    Sin historial de comandos
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        }
                    </c-card-body>
                </c-card>
            </c-col>
        </c-row>
    `
})
export class DeviceCommandsPanelComponent implements OnInit {
    @Input({ required: true }) device!: Device;

    private fb = inject(FormBuilder);
    private commandsService = inject(DeviceCommandsService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);

    commands = signal<DeviceCommand[]>([]);
    loadingHistory = signal(false);
    sending = signal(false);

    customForm!: FormGroup;
    intervalForm!: FormGroup;

    quickCommands: QuickCommand[] = [
        { type: 'locate', label: 'Localizar', icon: 'cilLocationPin', color: 'primary', description: 'Solicitar ubicacion actual' },
        { type: 'reboot', label: 'Reiniciar', icon: 'cilReload', color: 'warning', description: 'Reiniciar el dispositivo' },
        { type: 'cut_engine', label: 'Apagar Motor', icon: 'cilBan', color: 'danger', description: 'Cortar ignicion', dangerous: true },
        { type: 'restore_engine', label: 'Restaurar Motor', icon: 'cilCheckCircle', color: 'success', description: 'Restaurar ignicion' }
    ];

    ngOnInit(): void {
        this.customForm = this.fb.group({
            rawCommand: ['', Validators.required]
        });

        this.intervalForm = this.fb.group({
            interval: [60, [Validators.required, Validators.min(10)]]
        });

        this.loadHistory();
    }

    loadHistory(): void {
        this.loadingHistory.set(true);
        this.commandsService.getByDevice(this.device.deviceImei).subscribe({
            next: (data) => {
                this.commands.set(data);
                this.loadingHistory.set(false);
            },
            error: (err) => {
                console.error('Error loading commands:', err);
                this.loadingHistory.set(false);
            }
        });
    }

    sendQuickCommand(type: CommandType): void {
        const userId = this.authService.user()?.id;
        if (!userId) {
            this.notification.error('Usuario no autenticado');
            return;
        }

        this.sending.set(true);
        let request$;

        switch (type) {
            case 'locate':
                request$ = this.commandsService.locate(this.device.deviceImei, userId);
                break;
            case 'reboot':
                request$ = this.commandsService.reboot(this.device.deviceImei, userId);
                break;
            case 'cut_engine':
                request$ = this.commandsService.cutEngine(this.device.deviceImei, userId);
                break;
            case 'restore_engine':
                request$ = this.commandsService.restoreEngine(this.device.deviceImei, userId);
                break;
            default:
                this.sending.set(false);
                return;
        }

        request$.subscribe({
            next: (cmd) => {
                this.commands.update(list => [cmd, ...list]);
                this.notification.success('Comando enviado');
                this.sending.set(false);
            },
            error: (err) => {
                console.error('Error sending command:', err);
                this.notification.error('Error al enviar comando');
                this.sending.set(false);
            }
        });
    }

    sendCustomCommand(): void {
        if (this.customForm.invalid) return;

        const userId = this.authService.user()?.id;
        if (!userId) {
            this.notification.error('Usuario no autenticado');
            return;
        }

        this.sending.set(true);
        const rawCommand = this.customForm.get('rawCommand')?.value;

        this.commandsService.sendCustom(this.device.deviceImei, rawCommand, userId).subscribe({
            next: (cmd) => {
                this.commands.update(list => [cmd, ...list]);
                this.notification.success('Comando personalizado enviado');
                this.customForm.reset();
                this.sending.set(false);
            },
            error: (err) => {
                console.error('Error sending custom command:', err);
                this.notification.error('Error al enviar comando');
                this.sending.set(false);
            }
        });
    }

    sendIntervalCommand(): void {
        if (this.intervalForm.invalid) return;

        const userId = this.authService.user()?.id;
        if (!userId) {
            this.notification.error('Usuario no autenticado');
            return;
        }

        this.sending.set(true);
        const interval = this.intervalForm.get('interval')?.value;

        this.commandsService.setInterval(this.device.deviceImei, interval, userId).subscribe({
            next: (cmd) => {
                this.commands.update(list => [cmd, ...list]);
                this.notification.success('Intervalo configurado');
                this.sending.set(false);
            },
            error: (err) => {
                console.error('Error setting interval:', err);
                this.notification.error('Error al configurar intervalo');
                this.sending.set(false);
            }
        });
    }

    getCommandLabel(type: CommandType): string {
        const labels: Record<CommandType, string> = {
            locate: 'Localizar',
            reboot: 'Reiniciar',
            set_interval: 'Intervalo',
            cut_engine: 'Apagar Motor',
            restore_engine: 'Restaurar Motor',
            set_apn: 'Config APN',
            set_server: 'Config Server',
            set_timezone: 'Zona Horaria',
            custom: 'Personalizado'
        };
        return labels[type] || type;
    }

    getStatusColor(status: CommandStatus): string {
        const colors: Record<CommandStatus, string> = {
            pending: 'warning',
            sent: 'info',
            acknowledged: 'success',
            failed: 'danger',
            timeout: 'secondary'
        };
        return colors[status] || 'secondary';
    }

    getStatusLabel(status: CommandStatus): string {
        const labels: Record<CommandStatus, string> = {
            pending: 'Pendiente',
            sent: 'Enviado',
            acknowledged: 'Confirmado',
            failed: 'Fallido',
            timeout: 'Timeout'
        };
        return labels[status] || status;
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    }
}
