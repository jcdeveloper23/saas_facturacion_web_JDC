import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
    CardModule,
    GridModule,
    ButtonModule,
    TableModule,
    BadgeModule,
    PaginationModule,
    FormModule,
    UtilitiesModule,
    ButtonGroupModule,
    SpinnerModule,
    AlertModule
} from '@coreui/angular';
import { IconModule, IconSetService } from '@coreui/icons-angular';
import { cilPlus, cilPencil, cilTrash, cilOptions, cilSearch, cilFilter, cilReload, cilDevices, cilSignalCellular4, cilCheckCircle, cilXCircle } from '@coreui/icons';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { DevicesService } from '../../core/services/devices.service';
import { NotificationService } from '../../core/services/notification.service';
import { Device, DeviceStatus, DeviceFilters } from '../../core/interfaces/device.interface';

interface DeviceStats {
    total: number;
    online: number;
    offline: number;
    inactive: number;
}

@Component({
    selector: 'app-devices',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        ReactiveFormsModule,
        CardModule,
        GridModule,
        ButtonModule,
        ButtonGroupModule,
        TableModule,
        BadgeModule,
        PaginationModule,
        FormModule,
        UtilitiesModule,
        SpinnerModule,
        AlertModule,
        IconModule,
        HasPermissionDirective
    ],
    templateUrl: './devices.component.html',
    styleUrl: './devices.component.scss'
})
export class DevicesComponent implements OnInit {
    private devicesService = inject(DevicesService);
    private iconSet = inject(IconSetService);
    private notification = inject(NotificationService);

    // State signals
    devices = signal<Device[]>([]);
    loading = signal(false);
    error = signal<string | null>(null);

    // Pagination
    totalItems = signal(0);
    currentPage = signal(1);
    itemsPerPage = 10;

    // Filters
    searchControl = new FormControl('');
    statusFilter = signal<DeviceStatus | undefined>(undefined);
    stateFilter = signal<boolean | 'all'>('all'); // 'all' = todos, true = activos, false = inactivos

    // Computed stats
    stats = computed<DeviceStats>(() => {
        const list = this.devices();
        return {
            total: list.length,
            online: list.filter(d => d.deviceStatus === 'online').length,
            offline: list.filter(d => d.deviceStatus === 'offline').length,
            inactive: list.filter(d => d.deviceStatus === 'inactive').length
        };
    });

    // Computed filtered devices (client-side for now)
    filteredDevices = computed(() => {
        let list = this.devices();
        const status = this.statusFilter();

        if (status) {
            list = list.filter(d => d.deviceStatus === status);
        }

        return list;
    });

    constructor() {
        this.iconSet.icons = { cilPlus, cilPencil, cilTrash, cilOptions, cilSearch, cilFilter, cilReload, cilDevices, cilSignalCellular4, cilCheckCircle, cilXCircle };

        // Effect to reload when status filter changes
        effect(() => {
            const status = this.statusFilter();
            // Trigger reload logic if needed
        });
    }

    ngOnInit(): void {
        this.setupFilters();
        this.loadDevices();
    }

    loadDevices(): void {
        this.loading.set(true);
        this.error.set(null);

        const filters: DeviceFilters = {
            state: this.stateFilter()
        };
        const search = this.searchControl.value;
        if (search) filters.search = search;

        this.devicesService.getDevices(filters).subscribe({
            next: (data) => {
                if (Array.isArray(data)) {
                    this.devices.set(data);
                    this.totalItems.set(data.length);
                } else if ((data as any).data && Array.isArray((data as any).data)) {
                    this.devices.set((data as any).data);
                    this.totalItems.set((data as any).total || (data as any).data.length);
                }
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading devices', err);
                this.error.set('No se pudieron cargar los dispositivos');
                this.loading.set(false);
                this.notification.error('Error al cargar dispositivos');
            }
        });
    }

    setupFilters(): void {
        this.searchControl.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged()
        ).subscribe(() => {
            this.currentPage.set(1);
            this.loadDevices();
        });
    }

    onStatusFilterChange(status: string): void {
        this.statusFilter.set(status ? status as DeviceStatus : undefined);
    }

    onStateFilterChange(value: string): void {
        if (value === 'all') {
            this.stateFilter.set('all');
        } else {
            this.stateFilter.set(value === 'true');
        }
        this.currentPage.set(1);
        this.loadDevices();
    }

    onPageChange(page: number): void {
        this.currentPage.set(page);
        this.loadDevices();
    }

    refresh(): void {
        this.loadDevices();
        this.notification.info('Actualizando lista de dispositivos...');
    }

    getStatusColor(status: DeviceStatus): string {
        switch (status) {
            case 'online': return 'success';
            case 'offline': return 'danger';
            case 'inactive': return 'secondary';
            default: return 'secondary';
        }
    }

    getStatusLabel(status: DeviceStatus): string {
        switch (status) {
            case 'online': return 'En linea';
            case 'offline': return 'Desconectado';
            case 'inactive': return 'Inactivo';
            default: return status;
        }
    }

    getProtocolBadge(protocol: string): string {
        return 'info';
    }

    getStateColor(state: boolean | number): string {
        return state ? 'success' : 'warning';
    }

    getStateLabel(state: boolean | number): string {
        return state ? 'Activo' : 'Inactivo';
    }

    toggleDeviceState(device: Device): void {
        const newState = !device.state;
        const action = newState ? 'activar' : 'desactivar';

        this.devicesService.toggleState(device.deviceImei, newState).subscribe({
            next: () => {
                this.notification.success(`Dispositivo ${action === 'activar' ? 'activado' : 'desactivado'} correctamente`);
                this.loadDevices();
            },
            error: () => {
                this.notification.error(`Error al ${action} el dispositivo`);
            }
        });
    }
}
