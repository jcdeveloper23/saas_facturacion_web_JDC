import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    ButtonModule,
    CardModule,
    TableModule,
    BadgeModule,
    SpinnerModule,
    FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { DeviceAvlConfig } from '../../../../core/interfaces/device-avl-config.interface';
import { DeviceAvlConfigService } from '../../../../core/services/device-avl-config.service';

@Component({
    selector: 'app-device-avl-config',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        CardModule,
        TableModule,
        BadgeModule,
        SpinnerModule,
        IconModule,
        FormModule
    ],
    templateUrl: './device-avl-config.component.html'
})
export class DeviceAvlConfigComponent implements OnChanges {
    @Input() device: Device | null = null;

    private avlService = inject(DeviceAvlConfigService);

    configs: DeviceAvlConfig[] = [];
    loading = false;

    // Headers for table
    columns = ['ID', 'Parámetro', 'Prioridad', 'Guardar en', 'Visible', 'Acciones'];

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['device'] && this.device) {
            this.loadConfigs();
        }
    }

    loadConfigs(): void {
        if (!this.device) return;

        this.loading = true;
        this.avlService.getConfigs({ deviceImei: this.device.deviceImei }).subscribe({
            next: (data) => {
                this.configs = data;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading AVL configs', err);
                this.loading = false;
            }
        });
    }

    getPriorityColor(priority: string): string {
        switch (priority) {
            case 'low': return 'success';
            case 'high': return 'warning';
            case 'panic': return 'danger';
            default: return 'secondary';
        }
    }

    getSaveOnLabel(saveOn: string): string {
        switch (saveOn) {
            case 'always': return 'Siempre';
            case 'on_change': return 'Al cambiar';
            case 'on_exit': return 'Al salir';
            default: return saveOn;
        }
    }
}
