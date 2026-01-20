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
  template: `
    <c-row>
      <!-- Sidebar con lista de conductores -->
      <c-col [lg]="3" [md]="4" class="mb-3">
        <c-card>
          <c-card-header>
            <div class="d-flex justify-content-between align-items-center">
              <strong>Conductores</strong>
              <c-badge [color]="isLoading() ? 'warning' : 'success'">
                {{ drivers().length }}
              </c-badge>
            </div>
          </c-card-header>
          <c-card-body class="p-0">
            <!-- Buscador -->
            <div class="p-3 border-bottom">
              <input
                cFormControl
                type="text"
                placeholder="Buscar conductor..."
                [(ngModel)]="searchTerm"
                (ngModelChange)="onSearch($event)"
              />
            </div>

            <!-- Lista de conductores -->
            <div class="driver-list" style="max-height: 60vh; overflow-y: auto;">
              @if (isLoading()) {
                <div class="text-center p-4">
                  <c-spinner color="primary"></c-spinner>
                </div>
              } @else if (filteredDrivers().length === 0) {
                <div class="text-center p-4 text-muted">
                  No hay conductores activos
                </div>
              } @else {
                @for (driver of filteredDrivers(); track driver.id) {
                  <div
                    class="driver-item p-3 border-bottom cursor-pointer"
                    [class.active]="selectedDriver()?.id === driver.id"
                    (click)="selectDriver(driver)"
                  >
                    <div class="d-flex align-items-center">
                      <div
                        class="driver-avatar me-3"
                        [style.background-color]="getDriverColor(driver)"
                      >
                        {{ getDriverInitial(driver) }}
                      </div>
                      <div class="flex-grow-1">
                        <div class="fw-bold">
                          {{ driver.userFullName || 'Sin nombre' }}
                        </div>
                        <small class="text-muted">
                          @if (driver.relativeTime) {
                            <span class="text-success">
                              <svg cIcon name="cilLocationPin" size="sm"></svg>
                              {{ driver.relativeTime }}
                            </span>
                          } @else {
                            <span class="text-warning">Sin ubicación</span>
                          }
                        </small>
                      </div>
                      @if (isFollowing() && selectedDriver()?.id === driver.id) {
                        <c-badge color="info">Siguiendo</c-badge>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          </c-card-body>
          <c-card-footer class="d-flex gap-2">
            <button
              cButton
              color="primary"
              size="sm"
              class="flex-grow-1"
              (click)="refreshDrivers()"
              [disabled]="isLoading()"
            >
              <svg cIcon name="cilReload" size="sm"></svg>
              Actualizar
            </button>
            @if (selectedDriver()) {
              <button
                cButton
                [color]="isFollowing() ? 'warning' : 'success'"
                size="sm"
                (click)="toggleFollow()"
              >
                <svg cIcon [name]="isFollowing() ? 'cilX' : 'cilLocationPin'" size="sm"></svg>
                {{ isFollowing() ? 'Dejar de seguir' : 'Seguir' }}
              </button>
            }
          </c-card-footer>
        </c-card>
      </c-col>

      <!-- Mapa -->
      <c-col [lg]="9" [md]="8">
        <c-card>
          <c-card-header>
            <div class="d-flex justify-content-between align-items-center">
              <strong>Mapa en Tiempo Real</strong>
              <div class="d-flex gap-2 align-items-center">
                <small class="text-muted">
                  Actualización: cada {{ refreshInterval / 1000 }}s
                </small>
                <c-badge [color]="isAutoRefresh() ? 'success' : 'secondary'">
                  {{ isAutoRefresh() ? 'Auto' : 'Manual' }}
                </c-badge>
              </div>
            </div>
          </c-card-header>
          <c-card-body class="p-0">
            <app-leaflet-map
              #mapComponent
              [height]="'70vh'"
              [center]="mapCenter"
              [zoom]="mapZoom"
              [markers]="mapMarkers()"
              [followMarker]="isFollowing() ? selectedDriver()?.id?.toString() : undefined"
              (markerClick)="onMarkerClick($event)"
              (mapReady)="onMapReady($event)"
            ></app-leaflet-map>
          </c-card-body>
          <c-card-footer>
            <div class="d-flex justify-content-between align-items-center">
              <div>
                @if (selectedDriver()) {
                  <strong>{{ selectedDriver()?.userFullName }}</strong>
                  @if (selectedDriver()?.userLastLocationLatitude) {
                    <span class="ms-2 text-muted">
                      Lat: {{ selectedDriver()?.userLastLocationLatitude | number:'1.6-6' }},
                      Lng: {{ selectedDriver()?.userLastLocationLongitude | number:'1.6-6' }}
                    </span>
                  }
                } @else {
                  <span class="text-muted">Selecciona un conductor para ver detalles</span>
                }
              </div>
              <div>
                <button
                  cButton
                  [color]="isAutoRefresh() ? 'warning' : 'success'"
                  size="sm"
                  (click)="toggleAutoRefresh()"
                >
                  {{ isAutoRefresh() ? 'Pausar' : 'Iniciar' }} auto-actualización
                </button>
              </div>
            </div>
          </c-card-footer>
        </c-card>
      </c-col>
    </c-row>
  `,
  styles: [`
    .driver-item {
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .driver-item:hover {
      background-color: var(--cui-tertiary-bg);
    }
    .driver-item.active {
      background-color: var(--cui-primary-bg-subtle);
      border-left: 3px solid var(--cui-primary);
    }
    .driver-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 16px;
    }
  `]
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
