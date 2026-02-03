import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Route, RouteFilters, RouteSummary, ApiResponse } from '../interfaces';

/**
 * Routes Service - Manages trip/route data
 */
@Injectable({
  providedIn: 'root'
})
export class RoutesService extends ApiBaseService<Route> {
  protected endpoint = 'routes';

  /**
   * Get routes with optional filters (returns data array only)
   */
  getRoutes(filters?: RouteFilters): Observable<Route[]> {
    return this.getRoutesPaginated(filters).pipe(map(response => response.data));
  }

  /**
   * Get routes with pagination info (returns full ApiResponse)
   */
  getRoutesPaginated(filters?: RouteFilters): Observable<ApiResponse<Route[]>> {
    const query: Record<string, unknown> = { state: 1 };

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

    // Pagination support
    if (filters?.limit) {
      query['$limit'] = filters.limit;
    }
    if (filters?.page && filters?.limit) {
      query['$skip'] = (filters.page - 1) * filters.limit;
    }

    query['$sort'] = { startTime: -1 };

    return this.find(query);
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
        totalDistance: routes.reduce((sum, r) => sum + this.toNumber(r.totalDistance), 0),
        totalDuration: routes.reduce((sum, r) => sum + this.toNumber(r.duration), 0),
        avgSpeed: routes.length > 0
          ? routes.reduce((sum, r) => sum + this.toNumber(r.avgSpeed), 0) / routes.length
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

  /**
   * Helper to convert string | number | undefined to number
   */
  private toNumber(value?: string | number): number {
    if (value === undefined || value === null) return 0;
    return typeof value === 'string' ? parseFloat(value) || 0 : value;
  }
}
