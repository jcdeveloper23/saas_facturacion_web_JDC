import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Geofence, GeofenceFilters, LatLngPoint } from '../interfaces';

/**
 * Geofences Service - Manages geographic zones for alerts
 */
@Injectable({
  providedIn: 'root'
})
export class GeofencesService extends ApiBaseService<Geofence> {
  protected endpoint = 'geofences';

  /**
   * Get geofences with optional filters
   */
  getGeofences(filters?: GeofenceFilters): Observable<Geofence[]> {
    const query: Record<string, unknown> = { state: true };

    if (filters?.userId) {
      query['userId'] = filters.userId;
    }
    if (filters?.type) {
      query['geofenceType'] = filters.type;
    }
    if (filters?.search) {
      query['geofenceName'] = { $like: `%${filters.search}%` };
    }

    return this.find(query).pipe(map(response => response.data));
  }

  /**
   * Get geofences by user
   */
  getByUser(userId: number): Observable<Geofence[]> {
    return this.getGeofences({ userId });
  }

  /**
   * Create a circular geofence
   */
  createCircle(
    userId: number,
    name: string,
    center: LatLngPoint,
    radius: number,
    options?: Partial<Geofence>
  ): Observable<Geofence> {
    return this.create({
      userId,
      geofenceName: name,
      geofenceType: 'circle',
      centerLatitude: center.lat,
      centerLongitude: center.lng,
      radius,
      alertOnEnter: true,
      alertOnExit: true,
      alertOnDwell: false,
      notifySms: false,
      notifyEmail: false,
      notifyPush: true,
      scheduleEnabled: false,
      state: true,
      ...options
    });
  }

  /**
   * Create a polygon geofence
   */
  createPolygon(
    userId: number,
    name: string,
    coordinates: LatLngPoint[],
    options?: Partial<Geofence>
  ): Observable<Geofence> {
    return this.create({
      userId,
      geofenceName: name,
      geofenceType: 'polygon',
      coordinates,
      alertOnEnter: true,
      alertOnExit: true,
      alertOnDwell: false,
      notifySms: false,
      notifyEmail: false,
      notifyPush: true,
      scheduleEnabled: false,
      state: true,
      ...options
    });
  }

  /**
   * Check if a point is inside a geofence
   */
  isPointInGeofence(point: LatLngPoint, geofence: Geofence): boolean {
    if (geofence.geofenceType === 'circle') {
      return this.isPointInCircle(
        point,
        { lat: geofence.centerLatitude!, lng: geofence.centerLongitude! },
        geofence.radius!
      );
    } else {
      return this.isPointInPolygon(point, geofence.coordinates!);
    }
  }

  private isPointInCircle(point: LatLngPoint, center: LatLngPoint, radius: number): boolean {
    const distance = this.haversineDistance(point, center);
    return distance <= radius;
  }

  private isPointInPolygon(point: LatLngPoint, polygon: LatLngPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;

      if (((yi > point.lat) !== (yj > point.lat)) &&
          (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  private haversineDistance(point1: LatLngPoint, point2: LatLngPoint): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLon = this.toRad(point2.lng - point1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(point1.lat)) * Math.cos(this.toRad(point2.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
