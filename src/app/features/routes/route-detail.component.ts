import { Component, OnInit, OnDestroy, inject, signal, ViewChild, AfterViewInit, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CardModule,
  GridModule,
  ButtonModule,
  BadgeModule,
  SpinnerModule,
  UtilitiesModule,
  TableModule,
  CalloutModule,
  ProgressModule,
  TooltipModule,
  ButtonGroupModule
} from '@coreui/angular';
import * as L from 'leaflet';
import { ChartData, ChartOptions } from 'chart.js';
import { IconModule } from '@coreui/icons-angular';

import { RoutesService, LocationsService, NotificationService } from '../../core/services';
import { Route, Location, LatLng } from '../../core/interfaces';
import { LeafletMapComponent, MapPolyline, MapMarker } from '../../shared/components/leaflet-map/leaflet-map.component';
import { ChartjsModule } from '@coreui/angular-chartjs';
import {
  formatDuration,
  formatDistance,
  formatSpeed,
  formatDate,
  formatCoordinate,
  translateStatus,
  getStatusColor,
  translateRouteType,
  getRouteTypeColor,
  RouteEvent,
  IdentifiedStop
} from './route-format.utils';

type DetailView = 'map' | 'telemetry' | 'points';

interface LegendItem {
  color: string;
  label: string;
  letter: string;
}

interface ViewOption {
  id: DetailView;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-route-detail',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    GridModule,
    ButtonModule,
    BadgeModule,
    SpinnerModule,
    UtilitiesModule,
    IconModule,
    LeafletMapComponent,
    ChartjsModule,
    TableModule,
    CalloutModule,
    ProgressModule,
    TooltipModule,
    ButtonGroupModule
  ],
  templateUrl: './route-detail.component.html',
  styleUrl: './route-detail.component.scss'
})
export class RouteDetailComponent implements OnInit, OnDestroy, AfterViewInit {
  private activatedRoute = inject(ActivatedRoute);
  private router = inject(Router);
  private routesService = inject(RoutesService);
  private locationsService = inject(LocationsService);
  private notificationService = inject(NotificationService);

  @ViewChild('mapComponent') mapComponent!: LeafletMapComponent;
  @ViewChild('mapContainer') mapContainerRef!: ElementRef<HTMLDivElement>;

  // Route data
  routeId = signal<number | null>(null);
  route = signal<Route | null>(null);
  locations = signal<Location[]>([]);

  // Loading states
  loadingRoute = signal(true);
  loadingLocations = signal(true);

  // View state (replacing tabs)
  activeView = signal<DetailView>('map');
  viewOptions: ViewOption[] = [
    { id: 'map', label: 'Mapa', icon: 'cilMap' },
    { id: 'telemetry', label: 'Telemetría', icon: 'cilChartLine' },
    { id: 'points', label: 'Puntos', icon: 'cilListRich' }
  ];

  // Fullscreen state
  isFullscreen = signal(false);

  // Map Data
  mapCenter: LatLng = { lat: 7.7677778, lng: -72.234686 };
  mapZoom = 13;
  mapPolylines = signal<MapPolyline[]>([]);
  mapMarkers = signal<MapMarker[]>([]);
  identifiedStops = signal<IdentifiedStop[]>([]);
  routeEvents = signal<RouteEvent[]>([]);
  private mapReady = false;
  private pendingMarkerUpdate = false;

  // Map legend - Using hex colors for both map markers and legend display
  mapLegend: LegendItem[] = [
    { color: '#2eb85c', label: 'Inicio', letter: 'A' },
    { color: '#e55353', label: 'Fin', letter: 'B' },
    { color: '#f9b115', label: 'Parada', letter: 'P' },
    { color: '#3399ff', label: 'Encendido', letter: 'I' },
    { color: '#636f83', label: 'Apagado', letter: 'O' },
    { color: '#321fdb', label: 'Vehículo', letter: 'V' }
  ];

  // Telemetry Charts - Improved
  speedChartData = signal<ChartData | undefined>(undefined);
  voltageChartData = signal<ChartData | undefined>(undefined);
  speedChartOptions: ChartOptions = {};
  voltageChartOptions: ChartOptions = {};

  // Playback State
  isReplaying = signal(false);
  replaySpeed = 1;
  replayIndex = signal(0);
  private replayInterval: ReturnType<typeof setInterval> | null = null;

  // Expose utility functions to template
  protected formatDuration = formatDuration;
  protected formatDistance = formatDistance;
  protected formatSpeed = formatSpeed;
  protected formatDate = formatDate;
  protected formatCoordinate = formatCoordinate;
  protected translateStatus = translateStatus;
  protected getStatusColor = getStatusColor;
  protected translateRouteType = translateRouteType;
  protected getRouteTypeColor = getRouteTypeColor;
  protected Math = Math;

  constructor() {
    this.initChartOptions();
  }

  ngOnInit(): void {
    const idParam = this.activatedRoute.snapshot.paramMap.get('id');
    if (idParam) {
      const id = parseInt(idParam, 10);
      this.routeId.set(id);
      this.loadRouteData(id);
    } else {
      this.notificationService.error('ID de ruta no válido');
      this.goBack();
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.mapReady = true;
      if (this.pendingMarkerUpdate) {
        this.updateMapMarkers();
        this.pendingMarkerUpdate = false;
      }
    }, 500);
  }

  ngOnDestroy(): void {
    if (this.replayInterval) {
      clearInterval(this.replayInterval);
    }
    // Exit fullscreen if active
    if (this.isFullscreen()) {
      this.exitFullscreen();
    }
  }

  // Listen for fullscreen change events
  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  onFullscreenChange(): void {
    const isFullscreenNow = !!document.fullscreenElement;
    this.isFullscreen.set(isFullscreenNow);

    // Resize map after fullscreen toggle
    setTimeout(() => {
      if (this.mapComponent) {
        this.mapComponent.invalidateSize();
      }
    }, 100);
  }

  // Escape key to exit fullscreen
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isFullscreen()) {
      this.exitFullscreen();
    }
  }

  setActiveView(view: DetailView): void {
    this.activeView.set(view);
    if (view === 'map') {
      setTimeout(() => {
        if (this.mapComponent) {
          this.mapComponent.invalidateSize();
        }
      }, 100);
    }
  }

  // Fullscreen methods
  toggleFullscreen(): void {
    if (this.isFullscreen()) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  enterFullscreen(): void {
    const container = this.mapContainerRef?.nativeElement;
    if (!container) return;

    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if ((container as any).webkitRequestFullscreen) {
      (container as any).webkitRequestFullscreen();
    }
  }

  exitFullscreen(): void {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    }
  }

  loadRouteData(id: number): void {
    this.loadingRoute.set(true);
    this.loadingLocations.set(true);

    this.routesService.get(id).subscribe({
      next: (route) => {
        this.route.set(route);
        this.loadingRoute.set(false);
        if (route.startLatitude && route.startLongitude) {
          this.mapCenter = { lat: route.startLatitude, lng: route.startLongitude };
        }
      },
      error: () => {
        this.notificationService.error('Error cargando la ruta');
        this.loadingRoute.set(false);
        this.goBack();
      }
    });

    this.locationsService.getByRoute(id).subscribe({
      next: (locations) => {
        this.locations.set(locations);
        this.prepareMapData(locations);
        this.loadingLocations.set(false);

        setTimeout(() => {
          if (this.mapComponent) {
            this.mapComponent.invalidateSize();
            this.mapComponent.fitToMarkers();
          }
        }, 600);
      },
      error: () => {
        this.notificationService.error('Error cargando las ubicaciones');
        this.loadingLocations.set(false);
      }
    });
  }

  prepareMapData(locations: Location[]): void {
    if (!locations.length) return;

    const path = locations.map(l => ({ lat: l.latitude, lng: l.longitude }));
    this.mapPolylines.set([{
      id: `route-${this.routeId()}`,
      positions: path,
      color: '#321fdb',
      weight: 4
    }]);

    this.processIntelligentData(locations);
    this.prepareTelemetryCharts(locations);

    if (this.mapReady) {
      this.updateMapMarkers();
    } else {
      this.pendingMarkerUpdate = true;
    }

    const startPos = locations[0];
    this.mapCenter = { lat: startPos.latitude, lng: startPos.longitude };
  }

  processIntelligentData(locations: Location[]): void {
    const stops: IdentifiedStop[] = [];
    const events: RouteEvent[] = [];
    let lastIgnition = -1;
    const STOP_MIN_MINUTES = 5;
    const SPEED_THRESHOLD = 2;
    let stopStart: Location | null = null;

    locations.forEach((loc) => {
      const ignitionValue = (loc.accStatus === true || loc.accStatus === 1) ? 1 : 0;

      if (ignitionValue !== lastIgnition && lastIgnition !== -1) {
        events.push({
          type: ignitionValue === 1 ? 'ignition_on' : 'ignition_off',
          timestamp: loc.gpsTimestamp,
          location: { latitude: loc.latitude, longitude: loc.longitude },
          label: ignitionValue === 1 ? 'Encendido' : 'Apagado'
        });
      }
      lastIgnition = ignitionValue;

      let speed = 0;
      if (loc.speed !== undefined && loc.speed !== null) {
        speed = typeof loc.speed === 'string' ? parseFloat(loc.speed) : loc.speed;
      }

      if (speed < SPEED_THRESHOLD) {
        if (!stopStart) stopStart = loc;
      } else if (stopStart) {
        const startTime = new Date(stopStart.gpsTimestamp).getTime();
        const endTime = new Date(loc.gpsTimestamp).getTime();
        const durationMins = (endTime - startTime) / 60000;

        if (durationMins >= STOP_MIN_MINUTES) {
          stops.push({
            id: stopStart.id,
            latitude: stopStart.latitude,
            longitude: stopStart.longitude,
            gpsTimestamp: stopStart.gpsTimestamp,
            duration: durationMins
          });
        }
        stopStart = null;
      }
    });

    this.identifiedStops.set(stops);
    this.routeEvents.set(events);
  }

  updateMapMarkers(): void {
    const locations = this.locations();
    if (!locations.length || !this.mapComponent) return;

    const start = locations[0];
    const end = locations[locations.length - 1];
    const route = this.route();

    const markers: MapMarker[] = [
      {
        id: 'start',
        position: { lat: start.latitude, lng: start.longitude },
        title: 'Inicio',
        popup: `<strong>Inicio del Viaje</strong><br>${route?.startAddress || 'Sin dirección'}<br><small>${formatDate(route?.startTime)}</small>`,
        icon: this.mapComponent.createVehicleIcon('#2eb85c', 'A')
      },
      {
        id: 'end',
        position: { lat: end.latitude, lng: end.longitude },
        title: 'Fin',
        popup: `<strong>Fin del Viaje</strong><br>${route?.endAddress || 'Sin dirección'}<br><small>${formatDate(route?.endTime)}</small>`,
        icon: this.mapComponent.createVehicleIcon('#e55353', 'B')
      }
    ];

    this.identifiedStops().forEach((stop, i) => {
      markers.push({
        id: `stop-${i}`,
        position: { lat: stop.latitude, lng: stop.longitude },
        title: `Parada ${i + 1}`,
        popup: `<strong>Parada #${i + 1}</strong><br>Duración: ${Math.round(stop.duration)} min<br><small>${formatDate(stop.gpsTimestamp)}</small>`,
        icon: this.mapComponent.createVehicleIcon('#f9b115', 'P')
      });
    });

    this.routeEvents().forEach((event, i) => {
      const color = event.type === 'ignition_on' ? '#39f' : '#636f83';
      const letter = event.type === 'ignition_on' ? 'I' : 'O';
      markers.push({
        id: `event-${i}`,
        position: { lat: event.location.latitude, lng: event.location.longitude },
        title: event.label,
        popup: `<strong>${event.label}</strong><br><small>${formatDate(event.timestamp)}</small>`,
        icon: this.mapComponent.createVehicleIcon(color, letter)
      });
    });

    this.mapMarkers.set(markers);
  }

  prepareTelemetryCharts(locations: Location[]): void {
    const labels = locations.map(l =>
      new Date(l.gpsTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const speedData = locations.map(l =>
      typeof l.speed === 'string' ? parseFloat(l.speed) : (l.speed || 0)
    );

    const battVoltage = locations.map(l => {
      const alertData = (l as Location & { alertData?: Record<string, number> }).alertData;
      if (!alertData) return 0;
      return alertData['battery_voltage'] || (alertData[67] ? alertData[67] / 1000 : 0);
    });

    const extVoltage = locations.map(l => {
      const alertData = (l as Location & { alertData?: Record<string, number> }).alertData;
      if (!alertData) return 0;
      return alertData['external_voltage'] || (alertData[66] ? alertData[66] / 1000 : 0);
    });

    // Calculate max speed for the route
    const maxSpeed = Math.max(...speedData);
    const avgSpeed = speedData.reduce((a, b) => a + b, 0) / speedData.length;

    this.speedChartData.set({
      labels,
      datasets: [{
        label: 'Velocidad (km/h)',
        data: speedData,
        fill: true,
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 220);
          gradient.addColorStop(0, 'rgba(51, 153, 255, 0.35)');
          gradient.addColorStop(1, 'rgba(51, 153, 255, 0.05)');
          return gradient;
        },
        borderColor: '#3399ff',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#3399ff',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.4
      }]
    });

    this.voltageChartData.set({
      labels,
      datasets: [
        {
          label: 'Voltaje Externo (V)',
          data: extVoltage,
          fill: true,
          backgroundColor: 'rgba(229, 83, 83, 0.1)',
          borderColor: '#e55353',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.3
        },
        {
          label: 'Voltaje Batería (V)',
          data: battVoltage,
          fill: true,
          backgroundColor: 'rgba(46, 184, 92, 0.1)',
          borderColor: '#2eb85c',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.3
        }
      ]
    });
  }

  initChartOptions(): void {
    const commonOptions: Partial<ChartOptions> = {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 0,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          boxPadding: 4
        }
      }
    };

    this.speedChartOptions = {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: { display: false }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            maxTicksLimit: 8,
            color: 'rgba(255, 255, 255, 0.6)',
            font: { size: 11 }
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.08)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: { size: 11 },
            callback: (value: any) => `${value} km/h`
          }
        }
      }
    } as ChartOptions;

    this.voltageChartOptions = {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            padding: 16,
            font: { size: 12 },
            color: 'rgba(255, 255, 255, 0.7)'
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            maxTicksLimit: 8,
            color: 'rgba(255, 255, 255, 0.6)',
            font: { size: 11 }
          }
        },
        y: {
          display: true,
          min: 0,
          max: 16,
          grid: {
            color: 'rgba(255, 255, 255, 0.08)',
            drawBorder: false
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: { size: 11 },
            callback: (value: any) => `${value}V`
          }
        }
      }
    } as ChartOptions;
  }

  goBack(): void {
    this.router.navigate(['/routes']);
  }

  centerOnPoint(loc: Location): void {
    this.mapCenter = { lat: loc.latitude, lng: loc.longitude };
    this.mapZoom = 18;
    if (this.mapComponent) {
      this.mapComponent.setCenter(loc.latitude, loc.longitude, 18);
    }
    if (this.activeView() !== 'map') {
      this.setActiveView('map');
    }
  }

  // REPLAY
  startReplay(): void {
    if (this.locations().length === 0) return;
    this.isReplaying.set(true);
    if (this.replayIndex() >= this.locations().length - 1) {
      this.replayIndex.set(0);
    }

    this.replayInterval = setInterval(() => {
      const nextIndex = this.replayIndex() + 1;
      if (nextIndex < this.locations().length) {
        this.replayIndex.set(nextIndex);
        this.updateReplayMarker();
      } else {
        this.pauseReplay();
      }
    }, 500 / this.replaySpeed);
  }

  pauseReplay(): void {
    this.isReplaying.set(false);
    if (this.replayInterval) {
      clearInterval(this.replayInterval);
      this.replayInterval = null;
    }
  }

  stopReplay(): void {
    this.pauseReplay();
    this.replayIndex.set(0);
    this.updateReplayMarker();
  }

  updateReplayMarker(): void {
    const locations = this.locations();
    const index = this.replayIndex();
    if (index >= locations.length || !this.mapComponent) return;

    const loc = locations[index];
    const currentMarkers = this.mapMarkers();
    const otherMarkers = currentMarkers.filter(m => m.id !== 'replay-marker');

    const replayMarker: MapMarker = {
      id: 'replay-marker',
      position: { lat: loc.latitude, lng: loc.longitude },
      title: 'Posición actual',
      icon: this.mapComponent.createVehicleIcon('#321fdb', 'V')
    };

    this.mapMarkers.set([...otherMarkers, replayMarker]);

    if (index % 5 === 0) {
      this.mapComponent.setCenter(loc.latitude, loc.longitude, this.mapZoom);
    }
  }

  setReplaySpeed(speed: number): void {
    this.replaySpeed = speed;
    if (this.isReplaying()) {
      this.pauseReplay();
      this.startReplay();
    }
  }

  onSeek(event: Event): void {
    const target = event.target as HTMLInputElement;
    const index = parseInt(target.value, 10);
    this.replayIndex.set(index);
    this.updateReplayMarker();
  }

  onSpeedChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const speed = parseFloat(target.value);
    this.setReplaySpeed(speed);
  }

  getReplayProgress(): number {
    const total = this.locations().length;
    if (total === 0) return 0;
    return (this.replayIndex() / (total - 1)) * 100;
  }
}
