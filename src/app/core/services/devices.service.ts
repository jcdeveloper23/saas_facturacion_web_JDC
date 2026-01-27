import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Device, DeviceFilters, DeviceStats, ApiResponse } from '../interfaces';

/**
 * Devices Service - Manages GPS tracking devices
 */
@Injectable({
  providedIn: 'root'
})
export class DevicesService extends ApiBaseService<Device> {
  protected endpoint = 'devices';

  /**
   * Get all devices with optional filters
   */
  getDevices(filters?: DeviceFilters): Observable<Device[]> {
    const query: Record<string, unknown> = {};

    // Filtro de state: por defecto muestra todos, puede filtrar por activos/inactivos
    if (filters?.state !== undefined && filters.state !== 'all') {
      query['state'] = filters.state ? 1 : 0;
    }

    if (filters?.status) {
      query['deviceStatus'] = filters.status;
    }
    if (filters?.userId) {
      query['userId'] = filters.userId;
    }
    if (filters?.organizationId) {
      query['organization_id'] = filters.organizationId;
    }
    if (filters?.search) {
      query['$or'] = [
        { deviceImei: { $like: `%${filters.search}%` } },
        { deviceName: { $like: `%${filters.search}%` } }
      ];
    }

    return this.find(query).pipe(map(response => response.data || []));
  }

  /**
   * Get device by IMEI
   */
  getByImei(imei: string): Observable<Device> {
    return this.get(imei);
  }

  /**
   * Get devices by user ID
   */
  getByUserId(userId: number): Observable<Device[]> {
    return this.find({ userId, state: true }).pipe(map(response => response.data));
  }

  /**
   * Get devices by organization
   */
  getByOrganization(organizationId: number): Observable<Device[]> {
    return this.find({ organization_id: organizationId, state: true }).pipe(
      map(response => response.data)
    );
  }

  /**
   * Update device status
   */
  updateStatus(imei: string, status: Device['deviceStatus']): Observable<Device> {
    return this.patch(imei, { deviceStatus: status });
  }

  /**
   * Toggle device state (soft delete)
   */
  toggleState(imei: string, state: boolean): Observable<Device> {
    return this.patch(imei, { state });
  }

  /**
   * Get device statistics
   */
  getStats(): Observable<DeviceStats> {
    return this.getDevices().pipe(
      map(devices => ({
        total: devices.length,
        online: devices.filter(d => d.deviceStatus === 'online').length,
        offline: devices.filter(d => d.deviceStatus === 'offline').length,
        inactive: devices.filter(d => d.deviceStatus === 'inactive').length
      }))
    );
  }
}
