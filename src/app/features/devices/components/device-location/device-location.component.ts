import { Component, Input, OnChanges, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeafletMapComponent, MapMarker } from '../../../../shared/components/leaflet-map/leaflet-map.component';
import { Device } from '../../../../core/interfaces/device.interface';

@Component({
    selector: 'app-device-location',
    standalone: true,
    imports: [CommonModule, LeafletMapComponent],
    template: `
    <app-leaflet-map
      [height]="'500px'"
      [markers]="markers"
      [center]="center"
      [zoom]="15"
    ></app-leaflet-map>
    <div *ngIf="!hasLocation" class="alert alert-warning mt-3">
      El dispositivo no tiene ubicación registrada.
    </div>
  `
})
export class DeviceLocationComponent implements OnChanges {
    @Input() device: Device | null = null;

    markers: MapMarker[] = [];
    center = { lat: 0, lng: 0 };
    hasLocation = false;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['device'] && this.device) {
            this.updateMap();
        }
    }

    private updateMap(): void {
        if (this.device && this.device.lastLatitude && this.device.lastLongitude) {
            this.hasLocation = true;
            this.center = {
                lat: this.device.lastLatitude,
                lng: this.device.lastLongitude
            };

            const marker: MapMarker = {
                id: this.device.deviceImei,
                position: this.center,
                title: this.device.deviceName || this.device.deviceImei,
                popup: `
          <strong>${this.device.deviceName}</strong><br>
          Velocidad: ${this.device.lastSpeed || 0} km/h<br>
          Última vez: ${this.device.lastSeenAt || 'N/A'}
        `
            };

            this.markers = [marker];
        } else {
            this.hasLocation = false;
        }
    }
}
