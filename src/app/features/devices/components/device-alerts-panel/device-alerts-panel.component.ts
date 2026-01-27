import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    CardModule,
    GridModule,
    ButtonModule,
    SpinnerModule,
    TableModule,
    BadgeModule,
    AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { Alert, AlertType, AlertSeverity } from '../../../../core/interfaces/alert.interface';
import { AlertsService } from '../../../../core/services/alerts.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
    selector: 'app-device-alerts-panel',
    standalone: true,
    imports: [
        CommonModule,
        CardModule,
        GridModule,
        ButtonModule,
        SpinnerModule,
        TableModule,
        BadgeModule,
        AlertModule,
        IconModule
    ],
    template: `
        <c-row>
            <!-- Stats -->
            <c-col sm="6" lg="3" class="mb-4">
                <c-card class="text-white bg-danger">
                    <c-card-body class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fs-4 fw-bold">{{ stats().critical }}</div>
                            <div>Criticas</div>
                        </div>
                        <svg cIcon name="cilWarning" size="xl"></svg>
                    </c-card-body>
                </c-card>
            </c-col>
            <c-col sm="6" lg="3" class="mb-4">
                <c-card class="text-white bg-warning">
                    <c-card-body class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fs-4 fw-bold">{{ stats().warning }}</div>
                            <div>Advertencias</div>
                        </div>
                        <svg cIcon name="cilBell" size="xl"></svg>
                    </c-card-body>
                </c-card>
            </c-col>
            <c-col sm="6" lg="3" class="mb-4">
                <c-card class="text-white bg-info">
                    <c-card-body class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fs-4 fw-bold">{{ stats().info }}</div>
                            <div>Informativas</div>
                        </div>
                        <svg cIcon name="cilInfo" size="xl"></svg>
                    </c-card-body>
                </c-card>
            </c-col>
            <c-col sm="6" lg="3" class="mb-4">
                <c-card class="text-white bg-secondary">
                    <c-card-body class="d-flex justify-content-between align-items-center">
                        <div>
                            <div class="fs-4 fw-bold">{{ stats().pending }}</div>
                            <div>Sin atender</div>
                        </div>
                        <svg cIcon name="cilClock" size="xl"></svg>
                    </c-card-body>
                </c-card>
            </c-col>

            <!-- Alerts Table -->
            <c-col xs="12">
                <c-card>
                    <c-card-header class="d-flex justify-content-between align-items-center">
                        <div>
                            <svg cIcon name="cilBell" class="me-2"></svg>
                            <strong>Historial de Alertas</strong>
                        </div>
                        <button cButton color="light" size="sm" (click)="loadAlerts()" [disabled]="loading()">
                            <svg cIcon name="cilReload"></svg>
                        </button>
                    </c-card-header>
                    <c-card-body>
                        @if (loading()) {
                            <div class="text-center py-4">
                                <c-spinner color="primary"></c-spinner>
                            </div>
                        } @else {
                            <div class="table-responsive">
                                <table cTable hover striped>
                                    <thead class="table-light">
                                        <tr>
                                            <th>Severidad</th>
                                            <th>Tipo</th>
                                            <th>Mensaje</th>
                                            <th>Fecha</th>
                                            <th>Estado</th>
                                            <th class="text-end">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (alert of alerts(); track alert.id) {
                                            <tr [class.table-warning]="!alert.acknowledged && alert.severity === 'warning'"
                                                [class.table-danger]="!alert.acknowledged && alert.severity === 'critical'">
                                                <td>
                                                    <c-badge [color]="getSeverityColor(alert.severity)" shape="rounded-pill">
                                                        <svg cIcon [name]="getSeverityIcon(alert.severity)" size="sm" class="me-1"></svg>
                                                        {{ getSeverityLabel(alert.severity) }}
                                                    </c-badge>
                                                </td>
                                                <td>{{ getTypeLabel(alert.alertType) }}</td>
                                                <td>
                                                    <div>{{ alert.alertMessage }}</div>
                                                    @if (alert.latitude && alert.longitude) {
                                                        <small class="text-muted font-monospace">
                                                            {{ alert.latitude }}, {{ alert.longitude }}
                                                        </small>
                                                    }
                                                </td>
                                                <td>
                                                    <div>{{ formatDate(alert.alertTimestamp) }}</div>
                                                </td>
                                                <td>
                                                    @if (alert.acknowledged) {
                                                        <c-badge color="success" shape="rounded-pill">
                                                            Atendida
                                                        </c-badge>
                                                        <div class="small text-muted">
                                                            {{ formatDate(alert.acknowledgedAt) }}
                                                        </div>
                                                    } @else {
                                                        <c-badge color="warning" shape="rounded-pill">
                                                            Pendiente
                                                        </c-badge>
                                                    }
                                                </td>
                                                <td class="text-end">
                                                    @if (!alert.acknowledged) {
                                                        <button cButton color="success" size="sm" variant="ghost"
                                                            (click)="acknowledgeAlert(alert)" title="Marcar atendida">
                                                            <svg cIcon name="cilCheckCircle"></svg>
                                                        </button>
                                                    }
                                                </td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="6" class="text-center text-muted py-5">
                                                    <svg cIcon name="cilBell" size="3xl" class="mb-3 opacity-25"></svg>
                                                    <p class="mb-0">No hay alertas registradas</p>
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
export class DeviceAlertsPanelComponent implements OnInit {
    @Input({ required: true }) device!: Device;

    private alertsService = inject(AlertsService);
    private authService = inject(AuthService);
    private notification = inject(NotificationService);

    alerts = signal<Alert[]>([]);
    loading = signal(false);

    stats = computed(() => {
        const list = this.alerts();
        return {
            critical: list.filter(a => a.severity === 'critical').length,
            warning: list.filter(a => a.severity === 'warning').length,
            info: list.filter(a => a.severity === 'info').length,
            pending: list.filter(a => !a.acknowledged).length
        };
    });

    ngOnInit(): void {
        this.loadAlerts();
    }

    loadAlerts(): void {
        this.loading.set(true);
        this.alertsService.getByDevice(this.device.deviceImei).subscribe({
            next: (data) => {
                this.alerts.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading alerts:', err);
                this.loading.set(false);
            }
        });
    }

    acknowledgeAlert(alert: Alert): void {
        if (!alert.id) return;

        const userId = this.authService.user()?.id;
        if (!userId) {
            this.notification.error('Usuario no autenticado');
            return;
        }

        this.alertsService.acknowledge(alert.id, userId).subscribe({
            next: () => {
                this.alerts.update(list =>
                    list.map(a => a.id === alert.id
                        ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() }
                        : a
                    )
                );
                this.notification.success('Alerta marcada como atendida');
            },
            error: (err) => {
                console.error('Error acknowledging alert:', err);
                this.notification.error('Error al atender alerta');
            }
        });
    }

    getSeverityColor(severity: AlertSeverity): string {
        const colors: Record<AlertSeverity, string> = {
            critical: 'danger',
            warning: 'warning',
            info: 'info'
        };
        return colors[severity] || 'secondary';
    }

    getSeverityIcon(severity: AlertSeverity): string {
        const icons: Record<AlertSeverity, string> = {
            critical: 'cilWarning',
            warning: 'cilBell',
            info: 'cilInfo'
        };
        return icons[severity] || 'cilInfo';
    }

    getSeverityLabel(severity: AlertSeverity): string {
        const labels: Record<AlertSeverity, string> = {
            critical: 'Critica',
            warning: 'Advertencia',
            info: 'Info'
        };
        return labels[severity] || severity;
    }

    getTypeLabel(type: AlertType): string {
        const labels: Record<AlertType, string> = {
            speed_violation: 'Exceso de velocidad',
            geofence_enter: 'Entrada a geocerca',
            geofence_exit: 'Salida de geocerca',
            geofence_dwell: 'Permanencia en geocerca',
            acc_on: 'Motor encendido',
            acc_off: 'Motor apagado',
            sos: 'SOS',
            low_battery: 'Bateria baja',
            device_offline: 'Dispositivo desconectado',
            device_online: 'Dispositivo conectado',
            harsh_acceleration: 'Aceleracion brusca',
            harsh_braking: 'Frenado brusco',
            idle_too_long: 'Inactividad prolongada',
            custom: 'Personalizada'
        };
        return labels[type] || type;
    }

    formatDate(date: string | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    }
}
