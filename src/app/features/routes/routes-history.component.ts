import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import {
  CardModule,
  GridModule,
  ButtonModule,
  TableModule,
  BadgeModule,
  PaginationModule,
  FormModule,
  UtilitiesModule,
  SpinnerModule,
  TooltipModule,
  DropdownModule,
  CollapseModule,
  CollapseDirective,
  ButtonGroupModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { RoutesService, DevicesService, NotificationService } from '../../core/services';
import { Route, RouteStatus, Device } from '../../core/interfaces';
import {
  formatDuration,
  formatDistance,
  formatSpeed,
  translateStatus,
  getStatusColor,
  translateRouteType,
  getRouteTypeColor,
  DatePreset,
  getDateRangeForPreset,
  formatDateForInput,
  formatDateForBackend
} from './route-format.utils';

@Component({
  selector: 'app-routes-history',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CardModule,
    GridModule,
    ButtonModule,
    TableModule,
    BadgeModule,
    PaginationModule,
    FormModule,
    UtilitiesModule,
    SpinnerModule,
    TooltipModule,
    DropdownModule,
    CollapseModule,
    CollapseDirective,
    ButtonGroupModule,
    IconModule,
    HasPermissionDirective
  ],
  templateUrl: './routes-history.component.html',
  styleUrl: './routes-history.component.scss'
})
export class RoutesHistoryComponent implements OnInit {
  private router = inject(Router);
  private routesService = inject(RoutesService);
  private devicesService = inject(DevicesService);
  private notificationService = inject(NotificationService);

  // Filters
  selectedDeviceImei = signal<string>('');
  selectedStatus = signal<RouteStatus | ''>('');
  startDate = signal<string>('');
  endDate = signal<string>('');
  activePreset = signal<DatePreset | null>('today');
  filtersCollapsed = signal(false);

  // Status options for filter
  statusOptions: { value: RouteStatus | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'completed', label: 'Completadas' },
    { value: 'active', label: 'Activas' },
    { value: 'cancelled', label: 'Canceladas' }
  ];

  // Date presets
  datePresets: { value: DatePreset; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'yesterday', label: 'Ayer' },
    { value: 'thisWeek', label: 'Esta semana' },
    { value: 'lastWeek', label: 'Semana pasada' },
    { value: 'thisMonth', label: 'Este mes' },
    { value: 'lastMonth', label: 'Mes pasado' }
  ];

  // Data State
  devices = signal<Device[]>([]);
  routes = signal<Route[]>([]);
  loading = signal(false);
  loadingDevices = signal(false);

  // Pagination State
  currentPage = signal(1);
  pageSize = signal(20);
  totalRoutes = signal(0);
  totalPages = computed(() => Math.ceil(this.totalRoutes() / this.pageSize()));

  // Page size options
  pageSizeOptions = [10, 20, 50, 100];

  // Expose utility functions to template
  protected formatDuration = formatDuration;
  protected formatDistance = formatDistance;
  protected formatSpeed = formatSpeed;
  protected translateStatus = translateStatus;
  protected getStatusColor = getStatusColor;
  protected translateRouteType = translateRouteType;
  protected getRouteTypeColor = getRouteTypeColor;

  constructor() {
    // Set default date range (Today)
    this.applyDatePreset('today');
  }

  ngOnInit(): void {
    this.loadDevices();
  }

  toggleFilters(): void {
    this.filtersCollapsed.set(!this.filtersCollapsed());
  }

  applyDatePreset(preset: DatePreset): void {
    this.activePreset.set(preset);
    const range = getDateRangeForPreset(preset);
    this.startDate.set(formatDateForInput(range.start));
    this.endDate.set(formatDateForInput(range.end));
  }

  onDateChange(): void {
    // Clear preset when user manually changes dates
    this.activePreset.set(null);
  }

  loadDevices(): void {
    this.loadingDevices.set(true);
    this.devicesService.getDevices({ state: true }).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any).data || [];
        this.devices.set(list);

        if (list.length > 0 && !this.selectedDeviceImei()) {
          this.selectedDeviceImei.set(list[0].deviceImei);
          this.loadRoutes();
        }
        this.loadingDevices.set(false);
      },
      error: () => {
        this.notificationService.error('Error cargando dispositivos');
        this.loadingDevices.set(false);
      }
    });
  }

  loadRoutes(resetPage = true): void {
    if (!this.selectedDeviceImei()) {
      this.notificationService.warning('Seleccione un dispositivo');
      return;
    }

    if (!this.startDate() || !this.endDate()) {
      this.notificationService.warning('Seleccione un rango de fechas válido');
      return;
    }

    if (resetPage) {
      this.currentPage.set(1);
    }

    const startFormatted = formatDateForBackend(this.startDate());
    const endFormatted = formatDateForBackend(this.endDate());

    this.loading.set(true);

    this.routesService.getRoutesPaginated({
      deviceImei: this.selectedDeviceImei(),
      status: this.selectedStatus() || undefined,
      startDate: startFormatted,
      endDate: endFormatted,
      page: this.currentPage(),
      limit: this.pageSize()
    }).subscribe({
      next: (response) => {
        this.routes.set(response.data || []);
        this.totalRoutes.set(response.total || 0);
        this.loading.set(false);
        if (!response.data || response.data.length === 0) {
          this.notificationService.info('No se encontraron rutas en este rango de fechas');
        }
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error cargando el historial de rutas';
        this.notificationService.error(msg);
        this.loading.set(false);
      }
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadRoutes(false);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadRoutes(false);
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const delta = 2;
    const pages: number[] = [];

    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      pages.push(i);
    }

    return pages;
  }

  getDisplayRange(): { start: number; end: number } {
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), this.totalRoutes());
    return { start, end };
  }

  viewRouteDetail(route: Route): void {
    if (route.id) {
      this.router.navigate(['/routes', route.id]);
    }
  }

  // ===================
  // Export Methods
  // ===================

  exportToCSV(): void {
    if (this.routes().length === 0) {
      this.notificationService.warning('No hay rutas para exportar');
      return;
    }

    const headers = [
      'ID',
      'Estado',
      'Tipo',
      'Inicio',
      'Fin',
      'Duración (min)',
      'Distancia (km)',
      'Vel. Max (km/h)',
      'Vel. Prom (km/h)',
      'Puntos GPS',
      'Dirección Inicio',
      'Dirección Fin'
    ];

    const rows = this.routes().map(route => [
      route.id || '',
      translateStatus(route.routeStatus),
      translateRouteType(route.routeType),
      route.startTime ? new Date(route.startTime).toLocaleString() : '',
      route.endTime ? new Date(route.endTime).toLocaleString() : '',
      route.duration || '',
      route.totalDistance || '',
      route.maxSpeed || '',
      route.avgSpeed || '',
      route.pointCount || '',
      route.startAddress || '',
      route.endAddress || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    this.downloadFile(csvContent, this.getExportFilename('csv'), 'text/csv;charset=utf-8;');
    this.notificationService.success('Archivo CSV exportado correctamente');
  }

  async exportToExcel(): Promise<void> {
    if (this.routes().length === 0) {
      this.notificationService.warning('No hay rutas para exportar');
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const data = this.routes().map(route => ({
        'ID': route.id || '',
        'Estado': translateStatus(route.routeStatus),
        'Tipo': translateRouteType(route.routeType),
        'Inicio': route.startTime ? new Date(route.startTime).toLocaleString() : '',
        'Fin': route.endTime ? new Date(route.endTime).toLocaleString() : '',
        'Duración (min)': route.duration || '',
        'Distancia (km)': route.totalDistance || '',
        'Vel. Max (km/h)': route.maxSpeed || '',
        'Vel. Prom (km/h)': route.avgSpeed || '',
        'Puntos GPS': route.pointCount || '',
        'Dirección Inicio': route.startAddress || '',
        'Dirección Fin': route.endAddress || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rutas');

      const maxWidth = 30;
      const colWidths = Object.keys(data[0]).map(key => ({
        wch: Math.min(maxWidth, Math.max(key.length, ...data.map(row => String((row as Record<string, unknown>)[key]).length)))
      }));
      worksheet['!cols'] = colWidths;

      XLSX.writeFile(workbook, this.getExportFilename('xlsx'));
      this.notificationService.success('Archivo Excel exportado correctamente');
    } catch {
      this.notificationService.error('Error al exportar a Excel. Intente con CSV.');
    }
  }

  private getExportFilename(extension: string): string {
    const date = new Date().toISOString().slice(0, 10);
    const device = this.selectedDeviceImei() || 'todos';
    return `rutas_${device}_${date}.${extension}`;
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
