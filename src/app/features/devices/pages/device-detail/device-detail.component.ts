import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
    CardModule,
    GridModule,
    ButtonModule,
    BadgeModule,
    UtilitiesModule,
    SpinnerModule,
    AlertModule,
    ProgressModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { DevicesService } from '../../../../core/services/devices.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Device } from '../../../../core/interfaces/device.interface';

// Sub-components
import { DeviceInfoPanelComponent } from '../../components/device-info-panel/device-info-panel.component';
import { DeviceSettingsPanelComponent } from '../../components/device-settings-panel/device-settings-panel.component';
import { DeviceCommandsPanelComponent } from '../../components/device-commands-panel/device-commands-panel.component';
import { DeviceLocationPanelComponent } from '../../components/device-location-panel/device-location-panel.component';
import { DeviceAlertsPanelComponent } from '../../components/device-alerts-panel/device-alerts-panel.component';

export type DetailSection = 'info' | 'location' | 'settings' | 'commands' | 'alerts';

interface MenuItem {
    id: DetailSection;
    label: string;
    icon: string;
    description: string;
}

@Component({
    selector: 'app-device-detail',
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
        ProgressModule,
        IconModule,
        DeviceInfoPanelComponent,
        DeviceSettingsPanelComponent,
        DeviceCommandsPanelComponent,
        DeviceLocationPanelComponent,
        DeviceAlertsPanelComponent
    ],
    templateUrl: './device-detail.component.html'
})
export class DeviceDetailComponent implements OnInit {
    readonly route = inject(ActivatedRoute);
    private router = inject(Router);
    private deviceService = inject(DevicesService);
    private notification = inject(NotificationService);

    // State
    device = signal<Device | null>(null);
    loading = signal(true);
    error = signal<string | null>(null);
    activeSection = signal<DetailSection>('info');

    // Computed
    isOnline = computed(() => this.device()?.deviceStatus === 'online');
    hasLocation = computed(() => {
        const d = this.device();
        return d && d.lastLatitude && d.lastLongitude;
    });

    // Menu configuration
    menuItems: MenuItem[] = [
        { id: 'info', label: 'Informacion', icon: 'cilInfo', description: 'Datos del dispositivo' },
        { id: 'location', label: 'Ubicacion', icon: 'cilLocationPin', description: 'Mapa y coordenadas' },
        { id: 'settings', label: 'Configuracion', icon: 'cilSettings', description: 'Parametros operativos' },
        { id: 'commands', label: 'Comandos', icon: 'cilTerminal', description: 'Control remoto' },
        { id: 'alerts', label: 'Alertas', icon: 'cilBell', description: 'Historial de alertas' }
    ];

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            if (params['id']) {
                this.loadDevice(params['id']);
            }
        });
    }

    loadDevice(imei: string): void {
        this.loading.set(true);
        this.error.set(null);

        this.deviceService.getByImei(imei).subscribe({
            next: (device) => {
                this.device.set(device);
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading device:', err);
                this.error.set('No se pudo cargar el dispositivo.');
                this.loading.set(false);
                this.notification.error('Error al cargar el dispositivo');
            }
        });
    }

    setSection(section: DetailSection): void {
        this.activeSection.set(section);
    }

    isActiveSection(section: DetailSection): boolean {
        return this.activeSection() === section;
    }

    getStatusColor(): string {
        const status = this.device()?.deviceStatus;
        switch (status) {
            case 'online': return 'success';
            case 'offline': return 'danger';
            case 'inactive': return 'secondary';
            default: return 'secondary';
        }
    }

    getStatusLabel(): string {
        const status = this.device()?.deviceStatus;
        switch (status) {
            case 'online': return 'En linea';
            case 'offline': return 'Desconectado';
            case 'inactive': return 'Inactivo';
            default: return 'Desconocido';
        }
    }

    formatDate(date: string | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('es-CO');
    }

    editDevice(): void {
        const imei = this.device()?.deviceImei;
        if (imei) {
            this.router.navigate(['/devices', imei, 'edit']);
        }
    }

    refreshDevice(): void {
        const imei = this.device()?.deviceImei;
        if (imei) {
            this.loadDevice(imei);
            this.notification.info('Actualizando...');
        }
    }

    goBack(): void {
        this.router.navigate(['/devices']);
    }
}
