import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule, AlertModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';
import { LeafletMapComponent, MapMarker } from '../../../../shared/components/leaflet-map/leaflet-map.component';

@Component({
    selector: 'app-device-location-panel',
    standalone: true,
    imports: [CommonModule, CardModule, GridModule, AlertModule, IconModule, LeafletMapComponent],
    template: `
        <c-row>
            <c-col lg="8" class="mb-4">
                <c-card class="h-100">
                    <c-card-header>
                        <svg cIcon name="cilMap" class="me-2"></svg>
                        <strong>Mapa</strong>
                    </c-card-header>
                    <c-card-body class="p-0">
                        @if (hasLocation) {
                            <app-leaflet-map
                                [height]="'450px'"
                                [markers]="markers"
                                [center]="center"
                                [zoom]="15">
                            </app-leaflet-map>
                        } @else {
                            <div class="d-flex justify-content-center align-items-center" style="height: 450px;">
                                <div class="text-center text-muted">
                                    <svg cIcon name="cilLocationPin" size="3xl" class="mb-3 opacity-50"></svg>
                                    <p>Sin ubicacion registrada</p>
                                </div>
                            </div>
                        }
                    </c-card-body>
                </c-card>
            </c-col>

            <c-col lg="4" class="mb-4">
                <c-card class="h-100">
                    <c-card-header>
                        <svg cIcon name="cilLocationPin" class="me-2"></svg>
                        <strong>Coordenadas</strong>
                    </c-card-header>
                    <c-card-body>
                        @if (hasLocation) {
                            <dl class="row mb-0">
                                <dt class="col-5 text-muted">Latitud</dt>
                                <dd class="col-7 font-monospace">{{ device.lastLatitude }}</dd>

                                <dt class="col-5 text-muted">Longitud</dt>
                                <dd class="col-7 font-monospace">{{ device.lastLongitude }}</dd>

                                <dt class="col-5 text-muted">Altitud</dt>
                                <dd class="col-7">{{ device.lastAltitude || 0 }} m</dd>

                                <dt class="col-5 text-muted">Velocidad</dt>
                                <dd class="col-7">{{ device.lastSpeed || 0 }} km/h</dd>

                                <dt class="col-5 text-muted">Rumbo</dt>
                                <dd class="col-7">{{ device.lastHeading || 0 }}° ({{ getHeadingLabel() }})</dd>

                                <dt class="col-5 text-muted">Satelites</dt>
                                <dd class="col-7">{{ device.lastGpsSignal || 0 }}</dd>
                            </dl>
                            <hr>
                            <div class="small text-muted">
                                <svg cIcon name="cilClock" size="sm" class="me-1"></svg>
                                Ultima actualizacion: {{ formatDate(device.lastSeenAt) }}
                            </div>
                        } @else {
                            <c-alert color="warning" [dismissible]="false">
                                <small>El dispositivo aun no ha reportado su ubicacion.</small>
                            </c-alert>
                        }
                    </c-card-body>
                </c-card>
            </c-col>
        </c-row>
    `
})
export class DeviceLocationPanelComponent implements OnInit {
    @Input({ required: true }) device!: Device;

    markers: MapMarker[] = [];
    center = { lat: 0, lng: 0 };
    hasLocation = false;

    ngOnInit(): void {
        this.updateMap();
    }

    private updateMap(): void {
        if (this.device.lastLatitude && this.device.lastLongitude) {
            this.hasLocation = true;
            this.center = {
                lat: this.device.lastLatitude,
                lng: this.device.lastLongitude
            };

            this.markers = [{
                id: this.device.deviceImei,
                position: this.center,
                title: this.device.deviceName || this.device.deviceImei,
                popup: `
                    <strong>${this.device.deviceName || this.device.deviceImei}</strong><br>
                    Velocidad: ${this.device.lastSpeed || 0} km/h<br>
                    Ultimo reporte: ${this.formatDate(this.device.lastSeenAt)}
                `
            }];
        }
    }

    getHeadingLabel(): string {
        const heading = this.device.lastHeading || 0;
        if (heading >= 337.5 || heading < 22.5) return 'N';
        if (heading >= 22.5 && heading < 67.5) return 'NE';
        if (heading >= 67.5 && heading < 112.5) return 'E';
        if (heading >= 112.5 && heading < 157.5) return 'SE';
        if (heading >= 157.5 && heading < 202.5) return 'S';
        if (heading >= 202.5 && heading < 247.5) return 'SO';
        if (heading >= 247.5 && heading < 292.5) return 'O';
        return 'NO';
    }

    formatDate(date: string | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('es-CO');
    }
}
