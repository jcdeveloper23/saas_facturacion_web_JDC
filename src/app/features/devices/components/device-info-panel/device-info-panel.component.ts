import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule, BadgeModule, ProgressModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Device } from '../../../../core/interfaces/device.interface';

@Component({
    selector: 'app-device-info-panel',
    standalone: true,
    imports: [CommonModule, CardModule, GridModule, BadgeModule, ProgressModule, IconModule],
    template: `
        <c-row>
            <!-- Device Identity -->
            <c-col md="6" class="mb-4">
                <c-card class="h-100">
                    <c-card-header>
                        <svg cIcon name="cilFingerprint" class="me-2"></svg>
                        <strong>Identificacion</strong>
                    </c-card-header>
                    <c-card-body>
                        <dl class="row mb-0">
                            <dt class="col-sm-4 text-muted">IMEI</dt>
                            <dd class="col-sm-8 font-monospace">{{ device.deviceImei }}</dd>

                            <dt class="col-sm-4 text-muted">Nombre</dt>
                            <dd class="col-sm-8">{{ device.deviceName || 'Sin asignar' }}</dd>

                            <dt class="col-sm-4 text-muted">Modelo</dt>
                            <dd class="col-sm-8">{{ device.deviceModel }}</dd>

                            <dt class="col-sm-4 text-muted">Protocolo</dt>
                            <dd class="col-sm-8">
                                <c-badge color="info">{{ device.deviceProtocol | uppercase }}</c-badge>
                            </dd>

                            <dt class="col-sm-4 text-muted">SIM</dt>
                            <dd class="col-sm-8">{{ device.simNumber || 'No registrada' }}</dd>
                        </dl>
                    </c-card-body>
                </c-card>
            </c-col>

            <!-- Connection Status -->
            <c-col md="6" class="mb-4">
                <c-card class="h-100">
                    <c-card-header>
                        <svg cIcon name="cilSignalCellular4" class="me-2"></svg>
                        <strong>Conexion</strong>
                    </c-card-header>
                    <c-card-body>
                        <dl class="row mb-0">
                            <dt class="col-sm-5 text-muted">Estado</dt>
                            <dd class="col-sm-7">
                                <c-badge [color]="getStatusColor()" shape="rounded-pill">
                                    {{ getStatusLabel() }}
                                </c-badge>
                            </dd>

                            <dt class="col-sm-5 text-muted">Ultima conexion</dt>
                            <dd class="col-sm-7">{{ formatDate(device.lastConnectionAt) }}</dd>

                            <dt class="col-sm-5 text-muted">Ultimo reporte</dt>
                            <dd class="col-sm-7">{{ formatDate(device.lastSeenAt) }}</dd>

                            <dt class="col-sm-5 text-muted">Satelites GPS</dt>
                            <dd class="col-sm-7">
                                <span class="me-2">{{ device.lastGpsSignal || 0 }}</span>
                                <c-progress [value]="(device.lastGpsSignal || 0) * 10" height="6" class="d-inline-block" style="width: 60px;"></c-progress>
                            </dd>
                        </dl>
                    </c-card-body>
                </c-card>
            </c-col>

            <!-- Vehicle State -->
            <c-col md="6" class="mb-4">
                <c-card class="h-100">
                    <c-card-header>
                        <svg cIcon name="cilSpeedometer" class="me-2"></svg>
                        <strong>Estado del Vehiculo</strong>
                    </c-card-header>
                    <c-card-body>
                        <c-row class="text-center">
                            <c-col xs="4">
                                <div class="border-end">
                                    <div class="text-muted small">VELOCIDAD</div>
                                    <div class="h4 mb-0">{{ device.lastSpeed || 0 }}</div>
                                    <small class="text-muted">km/h</small>
                                </div>
                            </c-col>
                            <c-col xs="4">
                                <div class="border-end">
                                    <div class="text-muted small">ALTITUD</div>
                                    <div class="h4 mb-0">{{ device.lastAltitude || 0 }}</div>
                                    <small class="text-muted">metros</small>
                                </div>
                            </c-col>
                            <c-col xs="4">
                                <div>
                                    <div class="text-muted small">RUMBO</div>
                                    <div class="h4 mb-0">{{ device.lastHeading || 0 }}°</div>
                                    <small class="text-muted">{{ getHeadingLabel() }}</small>
                                </div>
                            </c-col>
                        </c-row>
                        <hr>
                        <c-row>
                            <c-col xs="6">
                                <div class="d-flex justify-content-between">
                                    <span class="text-muted">Motor</span>
                                    <c-badge [color]="device.lastAccStatus ? 'success' : 'secondary'">
                                        {{ device.lastAccStatus ? 'Encendido' : 'Apagado' }}
                                    </c-badge>
                                </div>
                            </c-col>
                            <c-col xs="6">
                                <div class="d-flex justify-content-between">
                                    <span class="text-muted">Bateria</span>
                                    <span [class.text-danger]="(device.lastBatteryLevel || 0) < 20">
                                        {{ device.lastBatteryLevel !== undefined ? device.lastBatteryLevel + '%' : 'N/A' }}
                                    </span>
                                </div>
                            </c-col>
                        </c-row>
                    </c-card-body>
                </c-card>
            </c-col>

            <!-- Service Info -->
            <c-col md="6" class="mb-4">
                <c-card class="h-100">
                    <c-card-header>
                        <svg cIcon name="cilCalendar" class="me-2"></svg>
                        <strong>Servicio</strong>
                    </c-card-header>
                    <c-card-body>
                        <dl class="row mb-0">
                            <dt class="col-sm-5 text-muted">Instalacion</dt>
                            <dd class="col-sm-7">{{ formatDate(device.installationDate) }}</dd>

                            <dt class="col-sm-5 text-muted">Vencimiento</dt>
                            <dd class="col-sm-7">
                                @if (device.expirationDate) {
                                    <span [class.text-danger]="isExpired()">
                                        {{ formatDate(device.expirationDate) }}
                                    </span>
                                } @else {
                                    Sin fecha
                                }
                            </dd>

                            <dt class="col-sm-5 text-muted">Limite velocidad</dt>
                            <dd class="col-sm-7">{{ device.speedLimit || 120 }} km/h</dd>

                            <dt class="col-sm-5 text-muted">Zona horaria</dt>
                            <dd class="col-sm-7">{{ device.timezone || 'UTC' }}</dd>

                            <dt class="col-sm-5 text-muted">Estado</dt>
                            <dd class="col-sm-7">
                                <c-badge [color]="device.state ? 'success' : 'danger'">
                                    {{ device.state ? 'Activo' : 'Inactivo' }}
                                </c-badge>
                            </dd>
                        </dl>
                    </c-card-body>
                </c-card>
            </c-col>

            <!-- Notes -->
            @if (device.notes) {
            <c-col xs="12">
                <c-card>
                    <c-card-header>
                        <svg cIcon name="cilNotes" class="me-2"></svg>
                        <strong>Notas</strong>
                    </c-card-header>
                    <c-card-body>
                        <p class="mb-0">{{ device.notes }}</p>
                    </c-card-body>
                </c-card>
            </c-col>
            }
        </c-row>
    `
})
export class DeviceInfoPanelComponent {
    @Input({ required: true }) device!: Device;

    getStatusColor(): string {
        switch (this.device.deviceStatus) {
            case 'online': return 'success';
            case 'offline': return 'danger';
            case 'inactive': return 'secondary';
            default: return 'secondary';
        }
    }

    getStatusLabel(): string {
        switch (this.device.deviceStatus) {
            case 'online': return 'En linea';
            case 'offline': return 'Desconectado';
            case 'inactive': return 'Inactivo';
            default: return 'Desconocido';
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

    isExpired(): boolean {
        if (!this.device.expirationDate) return false;
        return new Date(this.device.expirationDate) < new Date();
    }
}
