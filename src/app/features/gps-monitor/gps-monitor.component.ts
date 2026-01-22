import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { interval, Subject, takeUntil, switchMap, catchError, of } from 'rxjs';
import {
  CardModule,
  ButtonModule,
  GridModule,
  BadgeModule,
  SpinnerModule,
  ListGroupModule,
  FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import {
  LeafletMapComponent,
  MapMarker
} from '../../shared/components/leaflet-map/leaflet-map.component';
import { UsersService, DevicesService, LocationsService } from '../../core/services';
import { User, Device, Location, LatLng } from '../../core/interfaces';
import { environment } from '../../../environments/environment';

interface DriverWithLocation extends User {
  lastLocation?: Location;
  relativeTime?: string;
}

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
    IconModule,
    LeafletMapComponent
  ],
  templateUrl: './gps-monitor.component.html',
  styleUrl: './gps-monitor.component.scss'
})
export class GpsMonitorComponent implements OnInit, OnDestroy {
  @ViewChild('mapComponent') mapComponent!: LeafletMapComponent;

  private usersService = inject(UsersService);
  private destroy$ = new Subject<void>();

  // Signals for reactive state
  drivers = signal<DriverWithLocation[]>([]);
  selectedDriver = signal<DriverWithLocation | null>(null);
  isLoading = signal(false);
  isFollowing = signal(false);
  isAutoRefresh = signal(true);
  searchTerm = '';

  // Map configuration
  mapCenter: LatLng = environment.mapDefaults.center;
  mapZoom = environment.mapDefaults.zoom;
  refreshInterval = 10000; // 10 seconds

  // Computed signals
  filteredDrivers = computed(() => {
    const term = this.searchTerm.toLowerCase();
    if (!term) return this.drivers();
    return this.drivers().filter(d =>
      d.userFullName?.toLowerCase().includes(term) ||
      d.userEmail?.toLowerCase().includes(term)
    );
  });

  mapMarkers = computed((): MapMarker[] => {
    return this.drivers()
      .filter(d => d.userLastLocationLatitude && d.userLastLocationLongitude)
      .map(d => ({
        id: d.id!.toString(),
        position: {
          lat: d.userLastLocationLatitude!,
          lng: d.userLastLocationLongitude!
        },
        title: d.userFullName || 'Conductor',
        icon: this.mapComponent?.createVehicleIcon(
          this.getDriverColor(d),
          this.getDriverInitial(d)
        ),
        popup: this.createDriverPopup(d)
      }));
  });

  // Color palette for drivers
  private colorPalette = [
    '#007bff', '#28a745', '#dc3545', '#ffc107',
    '#17a2b8', '#6f42c1', '#e83e8c', '#fd7e14'
  ];

  ngOnInit(): void {
    this.loadDrivers();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDrivers(): void {
    this.isLoading.set(true);
    this.usersService.getActiveDrivers().pipe(
      catchError(error => {
        console.error('Error loading drivers:', error);
        return of([]);
      })
    ).subscribe(drivers => {
      const driversWithTime = drivers.map(d => ({
        ...d,
        relativeTime: this.getRelativeTime(d.userLastLocationDate)
      }));
      this.drivers.set(driversWithTime);
      this.isLoading.set(false);

      // Center map on first driver if available
      if (driversWithTime.length > 0 && driversWithTime[0].userLastLocationLatitude) {
        this.mapCenter = {
          lat: driversWithTime[0].userLastLocationLatitude,
          lng: driversWithTime[0].userLastLocationLongitude!
        };
      }
    });
  }

  refreshDrivers(): void {
    this.loadDrivers();
    this.updateRelativeTimes();
  }

  startAutoRefresh(): void {
    // Update positions every 10 seconds
    interval(this.refreshInterval).pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        if (this.isAutoRefresh()) {
          return this.usersService.getActiveDrivers();
        }
        return of([]);
      }),
      catchError(error => {
        console.error('Error refreshing drivers:', error);
        return of([]);
      })
    ).subscribe(drivers => {
      if (drivers.length > 0) {
        const driversWithTime = drivers.map(d => ({
          ...d,
          relativeTime: this.getRelativeTime(d.userLastLocationDate)
        }));
        this.drivers.set(driversWithTime);

        // Update selected driver if exists
        if (this.selectedDriver()) {
          const updated = driversWithTime.find(d => d.id === this.selectedDriver()?.id);
          if (updated) {
            this.selectedDriver.set(updated);
          }
        }
      }
    });

    // Update relative times more frequently (every 10 seconds)
    interval(10000).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.updateRelativeTimes();
    });
  }

  updateRelativeTimes(): void {
    const updated = this.drivers().map(d => ({
      ...d,
      relativeTime: this.getRelativeTime(d.userLastLocationDate)
    }));
    this.drivers.set(updated);
  }

  selectDriver(driver: DriverWithLocation): void {
    this.selectedDriver.set(driver);

    if (driver.userLastLocationLatitude && driver.userLastLocationLongitude) {
      this.mapComponent?.setCenter(
        driver.userLastLocationLatitude,
        driver.userLastLocationLongitude,
        16
      );
    }
  }

  toggleFollow(): void {
    this.isFollowing.update(v => !v);
  }

  toggleAutoRefresh(): void {
    this.isAutoRefresh.update(v => !v);
  }

  onSearch(term: string): void {
    this.searchTerm = term;
  }

  onMarkerClick(marker: MapMarker): void {
    const driver = this.drivers().find(d => d.id?.toString() === marker.id);
    if (driver) {
      this.selectDriver(driver);
    }
  }

  onMapReady(map: L.Map): void {
    // Map is ready, fit to markers if available
    setTimeout(() => {
      if (this.drivers().length > 0) {
        this.mapComponent?.fitToMarkers();
      }
    }, 500);
  }

  getDriverColor(driver: User): string {
    if (!driver.id) return this.colorPalette[0];
    return this.colorPalette[driver.id % this.colorPalette.length];
  }

  getDriverInitial(driver: User): string {
    if (driver.userFullName) {
      return driver.userFullName.charAt(0).toUpperCase();
    }
    if (driver.userEmail) {
      return driver.userEmail.charAt(0).toUpperCase();
    }
    return 'D';
  }

  private getRelativeTime(dateString?: string): string {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  }

  private createDriverPopup(driver: DriverWithLocation): string {
    return `
      <div style="min-width: 200px;">
        <strong>${driver.userFullName || 'Conductor'}</strong><br>
        <small>${driver.userEmail || ''}</small><br>
        ${driver.relativeTime ? `<small class="text-success">${driver.relativeTime}</small>` : ''}
      </div>
    `;
  }
}
