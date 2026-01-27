import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    ButtonModule,
    CardModule,
    TableModule,
    BadgeModule,
    SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { Alert } from '../../../../core/interfaces/alert.interface';
import { AlertsService } from '../../../../core/services/alerts.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-device-alerts',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        CardModule,
        TableModule,
        BadgeModule,
        SpinnerModule,
        IconModule
    ],
    templateUrl: './device-alerts.component.html'
})
export class DeviceAlertsComponent implements OnChanges {
    @Input() device: Device | null = null;

    private alertsService = inject(AlertsService);
    private authService = inject(AuthService);

    alerts: Alert[] = [];
    loading = false;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['device'] && this.device) {
            this.loadAlerts();
        }
    }

    loadAlerts(): void {
        if (!this.device) return;

        this.loading = true;
        this.alertsService.getByDevice(this.device.deviceImei).subscribe({
            next: (data) => {
                this.alerts = data;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading alerts', err);
                this.loading = false;
            }
        });
    }

    getSeverityColor(severity: string): string {
        switch (severity) {
            case 'critical': return 'danger';
            case 'warning': return 'warning';
            case 'info': return 'info';
            default: return 'secondary';
        }
    }

    acknowledge(alert: Alert): void {
        if (alert.acknowledged) return;

        const userId = this.authService.user()?.id;
        if (!userId) return;

        this.alertsService.acknowledge(alert.id!, userId).subscribe({
            next: () => {
                alert.acknowledged = true;
                // Optionally reload or just update local state
            }
        });
    }
}
