import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Route, RouteFilters, RouteSummary } from '../interfaces';

/**
 * Routes Service - Manages trip/route data
 */
@Injectable({
  providedIn: 'root'
})
export class RoutesService extends ApiBaseService<Route> {
  protected endpoint = 'routes';

  /**
   * Get routes with optional filters
   */
  getRoutes(filters?: RouteFilters): Observable<Route[]> {
    const query: Record<string, unknown> = { state: true };

    if (filters?.deviceImei) {
      query['deviceImei'] = filters.deviceImei;
    }
    if (filters?.status) {
      query['routeStatus'] = filters.status;
    }
    if (filters?.startDate && filters?.endDate) {
      query['startTime'] = {
        $gte: filters.startDate,
        $lte: filters.endDate
      };
    }

    query['$sort'] = { startTime: -1 };

    return this.find(query).pipe(map(response => response.data));
  }

  /**
   * Get routes by device IMEI
   */
  getByDevice(deviceImei: string): Observable<Route[]> {
    return this.getRoutes({ deviceImei });
  }

  /**
   * Get active route for a device
   */
  getActiveRoute(deviceImei: string): Observable<Route | null> {
    return this.find({
      deviceImei,
      routeStatus: 'active',
      state: true
    }).pipe(
      map(response => response.data[0] || null)
    );
  }

  /**
   * Get route summary for a device
   */
  getSummary(deviceImei: string, startDate?: string, endDate?: string): Observable<RouteSummary> {
    const filters: RouteFilters = {
      deviceImei,
      status: 'completed'
    };
    if (startDate && endDate) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    }

    return this.getRoutes(filters).pipe(
      map(routes => ({
        totalRoutes: routes.length,
        totalDistance: routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0),
        totalDuration: routes.reduce((sum, r) => sum + (r.duration || 0), 0),
        avgSpeed: routes.length > 0
          ? routes.reduce((sum, r) => sum + (r.avgSpeed || 0), 0) / routes.length
          : 0
      }))
    );
  }

  /**
   * Complete an active route
   */
  completeRoute(id: number): Observable<Route> {
    return this.patch(id, {
      routeStatus: 'completed',
      endTime: new Date().toISOString()
    });
  }
}
