import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, catchError, of, interval, forkJoin } from 'rxjs';
import {
  CardModule,
  ButtonModule,
  GridModule,
  BadgeModule,
  SpinnerModule,
  ListGroupModule,
  FormModule,
  TooltipModule,
  DropdownModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import {
  LeafletMapComponent,
  MapMarker
} from '../../shared/components/leaflet-map/leaflet-map.component';
import {
  DevicesService,
  LocationsService,
  SocketService,
  LocationUpdateEvent,
  DeviceStatusEvent
} from '../../core/services';
import { Device, DeviceWithLocation, Location, LatLng, DeviceStatus } from '../../core/interfaces';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gps-monitor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    GridModule,
    BadgeModule,
    SpinnerModule,
    ListGroupModule,
    FormModule,
    TooltipModule,
    DropdownModule,
    IconModule,
    LeafletMapComponent
  ],
  templateUrl: './gps-monitor.component.html',
  styleUrl: './gps-monitor.component.scss'
})
export class GpsMonitorComponent implements OnInit, OnDestroy {
  @ViewChild('mapComponent') mapComponent!: LeafletMapComponent;

  private devicesService = inject(DevicesService);
  private locationsService = inject(LocationsService);
  private socketService = inject(SocketService);
  private destroy$ = new Subject<void>();

  // Signals for reactive state
  devices = signal<DeviceWithLocation[]>([]);
  selectedDevice = signal<DeviceWithLocation | null>(null);
  isLoading = signal(false);
  isFollowing = signal(false);
  searchTerm = signal('');
  statusFilter = signal<DeviceStatus | 'all'>('all');

  // Socket connection state
  socketStatus = this.socketService.connectionStatus;
  isSocketConnected = this.socketService.isConnected;

  // Statistics
  stats = computed(() => {
    const all = this.devices();
    return {
      total: all.length,
      online: all.filter(d => d.deviceStatus === 'online').length,
      offline: all.filter(d => d.deviceStatus === 'offline').length,
      inactive: all.filter(d => d.deviceStatus === 'inactive').length,
      moving: all.filter(d => d.isMoving).length
    };
  });

  // Map configuration
  mapCenter: LatLng = environment.mapDefaults.center;
  mapZoom = environment.mapDefaults.zoom;

  // Computed signals
  filteredDevices = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const status = this.statusFilter();
    let result = this.devices();

    // Filter by status
    if (status !== 'all') {
      result = result.filter(d => d.deviceStatus === status);
    }

    // Filter by search term
    if (term) {
      result = result.filter(d =>
        d.deviceImei?.toLowerCase().includes(term) ||
        d.deviceName?.toLowerCase().includes(term) ||
        d.deviceModel?.toLowerCase().includes(term)
      );
    }

    return result;
  });

  mapMarkers = computed((): MapMarker[] => {
    return this.filteredDevices()
      .filter(d => this.hasValidLocation(d))
      .map(d => {
        const lat = d.currentLocation?.latitude ?? d.lastLatitude!;
        const lng = d.currentLocation?.longitude ?? d.lastLongitude!;
        const heading = d.currentLocation?.heading ?? d.lastHeading ?? 0;
        const speed = d.currentLocation?.speed ?? d.lastSpeed ?? 0;

        return {
          id: d.deviceImei,
          position: { lat, lng },
          title: d.deviceName || d.deviceImei,
          icon: this.mapComponent?.createDirectionalIcon(
            heading,
            this.getDeviceColor(d)
          ),
          popup: this.createDevicePopup(d)
        };
      });
  });

  // Color palette for devices
  private statusColors: Record<DeviceStatus | 'moving', string> = {
    online: '#28a745',    // Green
    offline: '#dc3545',   // Red
    inactive: '#6c757d',  // Gray
    moving: '#007bff'     // Blue
  };

  ngOnInit(): void {
    this.loadDevices();
    this.connectSocket();
    this.startRelativeTimeUpdater();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.socketService.disconnect();
  }

  /**
   * Connect to WebSocket and subscribe to events
   */
  private connectSocket(): void {
    // Connect to socket
    this.socketService.connect();

    // Subscribe to location updates
    this.socketService.onLocationUpdate()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => this.handleLocationUpdate(event));

    // Subscribe to device status changes
    this.socketService.onDeviceStatusChange()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => this.handleStatusUpdate(event));

    // Subscribe to new devices
    this.socketService.onDeviceCreated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(device => this.handleDeviceCreated(device));

    // Subscribe to device removals
    this.socketService.onDeviceRemoved()
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => this.handleDeviceRemoved(event.deviceImei));

    // Subscribe to device updates
    this.socketService.onDeviceUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(device => this.handleDeviceUpdated(device));
  }

  /**
   * Handle real-time location update
   */
  private handleLocationUpdate(event: LocationUpdateEvent): void {
    const { deviceImei, location } = event;
    console.log('[Monitor] Location update:', deviceImei, location.latitude, location.longitude);

    this.devices.update(devices => {
      return devices.map(device => {
        if (device.deviceImei === deviceImei) {
          const speed = typeof location.speed === 'string' ? parseFloat(location.speed) : (location.speed ?? 0);
          return {
            ...device,
            deviceStatus: 'online' as DeviceStatus,
            lastSeenAt: new Date().toISOString(),
            lastLatitude: location.latitude,
            lastLongitude: location.longitude,
            lastSpeed: speed,
            lastHeading: location.heading,
            lastAltitude: location.altitude,
            lastAccStatus: typeof location.accStatus === 'number' ? location.accStatus === 1 : location.accStatus,
            lastBatteryLevel: location.batteryLevel,
            currentLocation: {
              latitude: location.latitude,
              longitude: location.longitude,
              speed: speed,
              heading: location.heading,
              altitude: location.altitude,
              gpsTimestamp: location.gpsTimestamp,
              accStatus: typeof location.accStatus === 'number' ? location.accStatus === 1 : location.accStatus,
              batteryLevel: location.batteryLevel
            },
            relativeTime: 'Ahora',
            isMoving: speed > 5
          };
        }
        return device;
      });
    });

    this.syncSelectedDevice(deviceImei);
  }

  /**
   * Handle device status change
   */
  private handleStatusUpdate(event: DeviceStatusEvent): void {
    console.log('[Monitor] Status update:', event.deviceImei, event.status);

    this.devices.update(devices => {
      return devices.map(device => {
        if (device.deviceImei === event.deviceImei) {
          return {
            ...device,
            deviceStatus: event.status,
            lastSeenAt: event.lastSeenAt,
            relativeTime: this.getRelativeTime(event.lastSeenAt)
          };
        }
        return device;
      });
    });
  }

  /**
   * Handle new device added
   */
  private handleDeviceCreated(device: Device): void {
    console.log('[Monitor] Device created:', device.deviceImei);
    const deviceWithLocation: DeviceWithLocation = {
      ...device,
      relativeTime: this.getRelativeTime(device.lastSeenAt),
      isMoving: false
    };
    this.devices.update(devices => [...devices, deviceWithLocation]);
  }

  /**
   * Handle device removed
   */
  private handleDeviceRemoved(deviceImei: string): void {
    console.log('[Monitor] Device removed:', deviceImei);
    this.devices.update(devices => devices.filter(d => d.deviceImei !== deviceImei));

    // Clear selection if removed device was selected
    if (this.selectedDevice()?.deviceImei === deviceImei) {
      this.selectedDevice.set(null);
    }
  }

  /**
   * Handle device updated (devices patched event)
   * Updates position from lastLatitude/lastLongitude if available
   */
  private handleDeviceUpdated(device: Device): void {
    console.log('[Monitor] Device updated:', device.deviceImei,
      'lat:', device.lastLatitude, 'lng:', device.lastLongitude,
      'speed:', device.lastSpeed, 'status:', device.deviceStatus);

    this.devices.update(devices => {
      return devices.map(d => {
        if (d.deviceImei === device.deviceImei) {
          const hasNewPosition = device.lastLatitude && device.lastLongitude;
          const speed = device.lastSpeed ?? d.lastSpeed ?? 0;

          const updatedDevice: DeviceWithLocation = {
            ...d,
            ...device,
            relativeTime: this.getRelativeTime(device.lastSeenAt),
            isMoving: speed > 5,
            // Update currentLocation from device data if position is available
            currentLocation: hasNewPosition ? {
              latitude: device.lastLatitude!,
              longitude: device.lastLongitude!,
              speed: device.lastSpeed,
              heading: device.lastHeading,
              altitude: device.lastAltitude,
              gpsTimestamp: device.lastSeenAt || new Date().toISOString(),
              accStatus: device.lastAccStatus,
              batteryLevel: device.lastBatteryLevel
            } : d.currentLocation
          };

          return updatedDevice;
        }
        return d;
      });
    });

    // Update selected device and follow if needed
    this.syncSelectedDevice(device.deviceImei);
  }

  /**
   * Sync selected device with latest data and follow if enabled
   */
  private syncSelectedDevice(deviceImei: string): void {
    const selected = this.selectedDevice();
    if (selected && selected.deviceImei === deviceImei) {
      const updated = this.devices().find(d => d.deviceImei === deviceImei);
      if (updated) {
        this.selectedDevice.set(updated);
        if (this.isFollowing()) {
          this.centerOnDevice(updated);
        }
      }
    }
  }

  /**
   * Center map on a device's position
   */
  private centerOnDevice(device: DeviceWithLocation): void {
    const lat = device.currentLocation?.latitude ?? device.lastLatitude;
    const lng = device.currentLocation?.longitude ?? device.lastLongitude;
    if (lat && lng) {
      this.mapComponent?.setCenter(lat, lng);
    }
  }

  /**
   * Load all devices and their latest locations
   */
  loadDevices(): void {
    this.isLoading.set(true);

    this.devicesService.getDevices({ state: true }).pipe(
      catchError(error => {
        console.error('[Monitor] Error loading devices:', error);
        return of([]);
      })
    ).subscribe(devices => {
      // Map devices with location data
      const devicesWithLocation: DeviceWithLocation[] = devices.map(device => ({
        ...device,
        relativeTime: this.getRelativeTime(device.lastSeenAt),
        isMoving: (device.lastSpeed ?? 0) > 5,
        currentLocation: device.lastLatitude && device.lastLongitude ? {
          latitude: device.lastLatitude,
          longitude: device.lastLongitude,
          speed: device.lastSpeed,
          heading: device.lastHeading,
          altitude: device.lastAltitude,
          gpsTimestamp: device.lastSeenAt || new Date().toISOString(),
          accStatus: device.lastAccStatus,
          batteryLevel: device.lastBatteryLevel
        } : undefined
      }));

      this.devices.set(devicesWithLocation);
      this.isLoading.set(false);

      // Subscribe to updates for these devices
      const imeis = devices.map(d => d.deviceImei);
      this.socketService.subscribeToDevices(imeis);

      // Center map on first device with location
      const firstWithLocation = devicesWithLocation.find(d => this.hasValidLocation(d));
      if (firstWithLocation) {
        const lat = firstWithLocation.currentLocation?.latitude ?? firstWithLocation.lastLatitude!;
        const lng = firstWithLocation.currentLocation?.longitude ?? firstWithLocation.lastLongitude!;
        this.mapCenter = { lat, lng };
      }
    });
  }

  /**
   * Manual refresh
   */
  refreshDevices(): void {
    this.loadDevices();
  }

  /**
   * Reconnect socket
   */
  reconnectSocket(): void {
    this.socketService.disconnect();
    setTimeout(() => {
      this.socketService.connect();
      // Re-subscribe to devices after reconnection
      const imeis = this.devices().map(d => d.deviceImei);
      if (imeis.length > 0) {
        setTimeout(() => this.socketService.subscribeToDevices(imeis), 1000);
      }
    }, 500);
  }

  /**
   * Update relative times periodically
   */
  private startRelativeTimeUpdater(): void {
    interval(30000).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.devices.update(devices =>
        devices.map(d => ({
          ...d,
          relativeTime: this.getRelativeTime(d.lastSeenAt)
        }))
      );
    });
  }

  /**
   * Select a device
   */
  selectDevice(device: DeviceWithLocation): void {
    this.selectedDevice.set(device);

    if (this.hasValidLocation(device)) {
      const lat = device.currentLocation?.latitude ?? device.lastLatitude!;
      const lng = device.currentLocation?.longitude ?? device.lastLongitude!;
      this.mapComponent?.setCenter(lat, lng, 16);
    }
  }

  /**
   * Toggle follow mode - centers immediately when activated
   */
  toggleFollow(): void {
    const newState = !this.isFollowing();
    this.isFollowing.set(newState);

    if (newState) {
      const device = this.selectedDevice();
      if (device) {
        this.centerOnDevice(device);
      }
    }
  }

  /**
   * Filter by status
   */
  setStatusFilter(status: DeviceStatus | 'all'): void {
    this.statusFilter.set(status);
  }

  /**
   * Handle search input
   */
  onSearch(term: string): void {
    this.searchTerm.set(term);
  }

  /**
   * Handle marker click on map
   */
  onMarkerClick(marker: MapMarker): void {
    const device = this.devices().find(d => d.deviceImei === marker.id);
    if (device) {
      this.selectDevice(device);
    }
  }

  /**
   * Handle map ready event
   */
  onMapReady(map: L.Map): void {
    setTimeout(() => {
      if (this.devices().length > 0) {
        this.mapComponent?.fitToMarkers();
      }
    }, 500);
  }

  /**
   * Center map on all devices
   */
  fitAllDevices(): void {
    this.mapComponent?.fitToMarkers();
  }

  /**
   * Check if device has valid location
   */
  hasValidLocation(device: DeviceWithLocation): boolean {
    return !!(
      (device.currentLocation?.latitude && device.currentLocation?.longitude) ||
      (device.lastLatitude && device.lastLongitude)
    );
  }

  /**
   * Get color based on device status
   */
  getDeviceColor(device: DeviceWithLocation): string {
    if (device.isMoving) {
      return this.statusColors.moving;
    }
    return this.statusColors[device.deviceStatus] || this.statusColors.offline;
  }

  /**
   * Get status badge color
   */
  getStatusBadgeColor(status: DeviceStatus): string {
    const colors: Record<DeviceStatus, string> = {
      online: 'success',
      offline: 'danger',
      inactive: 'secondary'
    };
    return colors[status] || 'secondary';
  }

  /**
   * Get device icon name
   */
  getDeviceIcon(device: DeviceWithLocation): string {
    if (device.isMoving) return 'cil-truck';
    if (device.deviceStatus === 'online') return 'cil-location-pin';
    if (device.deviceStatus === 'offline') return 'cil-signal-cellular-0';
    return 'cil-ban';
  }

  /**
   * Format speed
   */
  formatSpeed(speed?: number): string {
    if (speed === undefined || speed === null) return '-';
    return `${Math.round(speed)} km/h`;
  }

  /**
   * Get relative time string
   */
  private getRelativeTime(dateString?: string): string {
    if (!dateString) return 'Sin datos';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${diffDays}d`;
  }

  /**
   * Create popup HTML for device marker
   */
  private createDevicePopup(device: DeviceWithLocation): string {
    const speed = device.currentLocation?.speed ?? device.lastSpeed ?? 0;
    const statusClass = device.deviceStatus === 'online' ? 'text-success' : 'text-danger';
    const statusIcon = device.deviceStatus === 'online' ? 'En linea' : 'Desconectado';

    return `
      <div style="min-width: 220px; font-family: sans-serif;">
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px;">
          ${device.deviceName || device.deviceImei}
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
          IMEI: ${device.deviceImei}
        </div>
        <div style="font-size: 12px; margin-bottom: 4px;">
          <span class="${statusClass}">${statusIcon}</span>
          ${device.relativeTime ? ` - ${device.relativeTime}` : ''}
        </div>
        <hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
          <div><strong>Velocidad:</strong> ${this.formatSpeed(speed)}</div>
          <div><strong>Motor:</strong> ${device.lastAccStatus ? 'Encendido' : 'Apagado'}</div>
          ${device.lastBatteryLevel !== undefined ? `<div><strong>Bateria:</strong> ${device.lastBatteryLevel}%</div>` : ''}
          ${device.deviceModel ? `<div><strong>Modelo:</strong> ${device.deviceModel}</div>` : ''}
        </div>
      </div>
    `;
  }
}
