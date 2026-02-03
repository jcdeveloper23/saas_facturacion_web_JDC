import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  signal,
  effect,
  inject,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { environment } from '../../../../environments/environment';
import { LatLng, Location } from '../../../core/interfaces';

export interface MapMarker {
  id: string;
  position: LatLng;
  title?: string;
  icon?: L.Icon | L.DivIcon;
  popup?: string;
  data?: unknown;
}

export interface MapPolyline {
  id: string;
  positions: LatLng[];
  color?: string;
  weight?: number;
  opacity?: number;
}

export interface MapCircle {
  id: string;
  center: LatLng;
  radius: number;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
}

export interface MapPolygon {
  id: string;
  positions: LatLng[];
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
}

@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #mapContainer class="leaflet-map-container" [style.height]="height"></div>
  `,
  styles: [`
    .leaflet-map-container {
      width: 100%;
      min-height: 400px;
    }
    :host ::ng-deep .leaflet-marker-icon.animated-marker {
      transition: transform 1s linear !important;
    }
  `]
})
export class LeafletMapComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  @Input() height = '500px';
  @Input() center: LatLng = environment.mapDefaults.center;
  @Input() zoom = environment.mapDefaults.zoom;
  @Input() markers: MapMarker[] = [];
  @Input() polylines: MapPolyline[] = [];
  @Input() circles: MapCircle[] = [];
  @Input() polygons: MapPolygon[] = [];
  @Input() enableDrawing = false;
  @Input() followMarker?: string;

  @Output() mapReady = new EventEmitter<L.Map>();
  @Output() markerClick = new EventEmitter<MapMarker>();
  @Output() mapClick = new EventEmitter<LatLng>();

  private map!: L.Map;
  private markerLayers = new Map<string, L.Marker>();
  private polylineLayers = new Map<string, L.Polyline>();
  private circleLayers = new Map<string, L.Circle>();
  private polygonLayers = new Map<string, L.Polygon>();

  // Default marker icon (fix for Leaflet default icon issue)
  private defaultIcon = L.icon({
    iconUrl: 'assets/img/marker-icon.png',
    iconRetinaUrl: 'assets/img/marker-icon-2x.png',
    shadowUrl: 'assets/img/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  ngOnInit(): void {
    // Fix Leaflet default icon path issue
    this.fixLeafletIcons();
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;

    // Re-render layers when inputs change
    if (changes['markers']) {
      this.renderMarkers();
      // Auto-center on followed marker after render
      if (this.followMarker) {
        const followed = this.markers.find(m => m.id === this.followMarker);
        if (followed) {
          this.map.panTo([followed.position.lat, followed.position.lng], { animate: true, duration: 0.5 });
        }
      }
    }
    if (changes['polylines']) {
      this.renderPolylines();
    }
    if (changes['circles']) {
      this.renderCircles();
    }
    if (changes['polygons']) {
      this.renderPolygons();
    }
    if (changes['center'] && !changes['center'].firstChange) {
      const newCenter = changes['center'].currentValue;
      if (newCenter) {
        this.map.setView([newCenter.lat, newCenter.lng], this.zoom);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private fixLeafletIcons(): void {
    // Fix for Leaflet marker icons not showing
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/img/marker-icon-2x.png',
      iconUrl: 'assets/img/marker-icon.png',
      shadowUrl: 'assets/img/marker-shadow.png',
    });
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [this.center.lat, this.center.lng],
      zoom: this.zoom,
      zoomControl: true
    });

    // Add OpenStreetMap tile layer
    L.tileLayer(environment.mapDefaults.tileLayer, {
      attribution: environment.mapDefaults.attribution,
      maxZoom: 19
    }).addTo(this.map);

    // Handle map click
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.mapClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Emit map ready event
    this.mapReady.emit(this.map);

    // Render initial layers
    this.renderMarkers();
    this.renderPolylines();
    this.renderCircles();
    this.renderPolygons();
  }

  // Public methods for external control
  setCenter(lat: number, lng: number, zoom?: number): void {
    if (this.map) {
      if (zoom !== undefined) {
        this.map.setView([lat, lng], zoom, { animate: true, duration: 0.5 });
      } else {
        this.map.panTo([lat, lng], { animate: true, duration: 0.5 });
      }
    }
  }

  fitBounds(bounds: L.LatLngBoundsExpression): void {
    if (this.map) {
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  fitToMarkers(): void {
    if (!this.map) return;

    // Collect all layers (markers and polylines)
    const layers: L.Layer[] = [
      ...Array.from(this.markerLayers.values()),
      ...Array.from(this.polylineLayers.values())
    ];

    if (layers.length === 0) return;

    try {
      const group = L.featureGroup(layers);
      const bounds = group.getBounds();

      // Check if bounds are valid before fitting
      if (bounds.isValid()) {
        this.map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (error) {
      console.warn('Could not fit to markers/polylines:', error);
    }
  }

  invalidateSize(): void {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 100);
    }
  }

  // Marker management
  updateMarkers(markers: MapMarker[]): void {
    this.markers = markers;
    this.renderMarkers();

    // Follow specific marker if set
    if (this.followMarker) {
      const marker = markers.find(m => m.id === this.followMarker);
      if (marker) {
        this.setCenter(marker.position.lat, marker.position.lng);
      }
    }
  }

  private renderMarkers(): void {
    if (!this.map) return;

    // Track which markers to keep
    const currentIds = new Set(this.markers.map(m => m.id));

    // Remove markers that no longer exist
    this.markerLayers.forEach((layer, id) => {
      if (!currentIds.has(id)) {
        this.map.removeLayer(layer);
        this.markerLayers.delete(id);
      }
    });

    // Add or update markers
    this.markers.forEach(marker => {
      const existing = this.markerLayers.get(marker.id);
      const latLng = L.latLng(marker.position.lat, marker.position.lng);

      if (existing) {
        // Update position smoothly (CSS transition handles animation)
        existing.setLatLng(latLng);

        // Update icon content directly via DOM to avoid flicker
        if (marker.icon && marker.icon instanceof L.DivIcon) {
          const el = existing.getElement();
          if (el) {
            const html = (marker.icon.options as L.DivIconOptions).html;
            if (html && el.innerHTML !== html) {
              el.innerHTML = html as string;
            }
          }
        }

        if (marker.popup) {
          existing.setPopupContent(marker.popup);
        }
      } else {
        // Create new marker with animated class
        const icon = marker.icon || this.defaultIcon;
        if (icon instanceof L.DivIcon && icon.options.className) {
          icon.options.className += ' animated-marker';
        }

        const leafletMarker = L.marker(latLng, {
          icon: icon,
          title: marker.title
        });

        if (marker.popup) {
          leafletMarker.bindPopup(marker.popup);
        }

        leafletMarker.on('click', () => {
          this.markerClick.emit(marker);
        });

        leafletMarker.addTo(this.map);
        this.markerLayers.set(marker.id, leafletMarker);
      }
    });
  }

  // Polyline management
  updatePolylines(polylines: MapPolyline[]): void {
    this.polylines = polylines;
    this.renderPolylines();
  }

  private renderPolylines(): void {
    if (!this.map) return;

    const currentIds = new Set(this.polylines.map(p => p.id));

    this.polylineLayers.forEach((layer, id) => {
      if (!currentIds.has(id)) {
        this.map.removeLayer(layer);
        this.polylineLayers.delete(id);
      }
    });

    this.polylines.forEach(polyline => {
      const existing = this.polylineLayers.get(polyline.id);
      const latLngs = polyline.positions.map(p => L.latLng(p.lat, p.lng));

      if (existing) {
        existing.setLatLngs(latLngs);
      } else {
        const leafletPolyline = L.polyline(latLngs, {
          color: polyline.color || '#3388ff',
          weight: polyline.weight || 3,
          opacity: polyline.opacity || 1
        });

        leafletPolyline.addTo(this.map);
        this.polylineLayers.set(polyline.id, leafletPolyline);
      }
    });
  }

  // Circle management (for geofences)
  updateCircles(circles: MapCircle[]): void {
    this.circles = circles;
    this.renderCircles();
  }

  private renderCircles(): void {
    if (!this.map) return;

    const currentIds = new Set(this.circles.map(c => c.id));

    this.circleLayers.forEach((layer, id) => {
      if (!currentIds.has(id)) {
        this.map.removeLayer(layer);
        this.circleLayers.delete(id);
      }
    });

    this.circles.forEach(circle => {
      const existing = this.circleLayers.get(circle.id);
      const center = L.latLng(circle.center.lat, circle.center.lng);

      if (existing) {
        existing.setLatLng(center);
        existing.setRadius(circle.radius);
      } else {
        const leafletCircle = L.circle(center, {
          radius: circle.radius,
          color: circle.color || '#3388ff',
          fillColor: circle.fillColor || '#3388ff',
          fillOpacity: circle.fillOpacity || 0.2
        });

        leafletCircle.addTo(this.map);
        this.circleLayers.set(circle.id, leafletCircle);
      }
    });
  }

  // Polygon management (for geofences)
  updatePolygons(polygons: MapPolygon[]): void {
    this.polygons = polygons;
    this.renderPolygons();
  }

  private renderPolygons(): void {
    if (!this.map) return;

    const currentIds = new Set(this.polygons.map(p => p.id));

    this.polygonLayers.forEach((layer, id) => {
      if (!currentIds.has(id)) {
        this.map.removeLayer(layer);
        this.polygonLayers.delete(id);
      }
    });

    this.polygons.forEach(polygon => {
      const existing = this.polygonLayers.get(polygon.id);
      const latLngs = polygon.positions.map(p => L.latLng(p.lat, p.lng));

      if (existing) {
        existing.setLatLngs(latLngs);
      } else {
        const leafletPolygon = L.polygon(latLngs, {
          color: polygon.color || '#3388ff',
          fillColor: polygon.fillColor || '#3388ff',
          fillOpacity: polygon.fillOpacity || 0.2
        });

        leafletPolygon.addTo(this.map);
        this.polygonLayers.set(polygon.id, leafletPolygon);
      }
    });
  }

  // Utility: Create a custom icon for vehicles/drivers
  createVehicleIcon(color: string = '#007bff', label?: string): L.DivIcon {
    return L.divIcon({
      className: 'vehicle-marker animated-marker',
      html: `
        <div style="
          background-color: ${color};
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        ">${label || '🚗'}</div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });
  }

  // Utility: Create icon with heading/direction
  createDirectionalIcon(heading: number, color: string = '#007bff'): L.DivIcon {
    return L.divIcon({
      className: 'directional-marker animated-marker',
      html: `
        <div style="
          transform: rotate(${heading}deg);
          width: 0;
          height: 0;
          border-left: 12px solid transparent;
          border-right: 12px solid transparent;
          border-bottom: 30px solid ${color};
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        "></div>
      `,
      iconSize: [24, 30],
      iconAnchor: [12, 15],
      popupAnchor: [0, -15]
    });
  }
}
