import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Location, LocationHistory } from '../interfaces';

/**
 * Locations Service - Manages GPS location data
 */
@Injectable({
  providedIn: 'root'
})
export class LocationsService extends ApiBaseService<Location> {
  protected endpoint = 'locations';

  /**
   * Get the latest location for a device
   */
  getLatestByDevice(deviceImei: string): Observable<Location | null> {
    return this.find({
      deviceImei,
      state: 1,
      $limit: 1,
      $sort: { gpsTimestamp: -1 }
    }).pipe(
      map(response => response.data[0] || null)
    );
  }

  /**
   * Get location history for a device in a date range
   */
  getHistory(
    deviceImei: string,
    startDate: string,
    endDate: string
  ): Observable<LocationHistory> {
    return this.find({
      deviceImei,
      state: 1,
      gpsTimestamp: {
        $gte: startDate,
        $lte: endDate
      },
      $sort: { gpsTimestamp: 1 },
      $limit: 10000 // Adjust based on your needs
    }).pipe(
      map(response => ({
        deviceImei,
        locations: response.data,
        startDate,
        endDate,
        totalPoints: response.total || response.data.length
      }))
    );
  }

  /**
   * Get locations by route ID
   */
  getByRoute(routeId: number): Observable<Location[]> {
    return this.find({
      routeId,
      state: 1,
      $sort: { gpsTimestamp: 1 },
      $limit: 10000
    }).pipe(map(response => response.data));
  }

  /**
   * Get locations for a route by device and time range
   * Use this when routeId is not set in locations
   */
  getByDeviceAndTimeRange(
    deviceImei: string,
    startTime: string,
    endTime: string
  ): Observable<Location[]> {
    return this.find({
      deviceImei,
      state: 1,
      gpsTimestamp: {
        $gte: startTime,
        $lte: endTime
      },
      $sort: { gpsTimestamp: 1 },
      $limit: 10000
    }).pipe(map(response => response.data));
  }

  /**
   * Get real-time locations for multiple devices
   */
  getLatestForDevices(deviceImeis: string[]): Observable<Location[]> {
    // This would typically be a custom endpoint or multiple calls
    // For now, we'll get the latest location for each device
    return this.find({
      deviceImei: { $in: deviceImeis },
      state: 1,
      $sort: { gpsTimestamp: -1 }
    }).pipe(
      map(response => {
        // Get only the latest location per device
        const latestByDevice = new Map<string, Location>();
        response.data.forEach(loc => {
          if (!latestByDevice.has(loc.deviceImei)) {
            latestByDevice.set(loc.deviceImei, loc);
          }
        });
        return Array.from(latestByDevice.values());
      })
    );
  }
}
