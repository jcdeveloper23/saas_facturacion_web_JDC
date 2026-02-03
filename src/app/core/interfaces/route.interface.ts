/**
 * Route Interface - Represents a trip/route made by a device
 *
 * IMPORTANT: Unit documentation based on backend implementation
 * - duration: MINUTES (NOT seconds) - see process-location.js:226
 * - totalDistance: KILOMETERS (NOT meters) - DECIMAL(10,2) in DB
 * - maxSpeed/avgSpeed: km/h
 */
export interface Route {
  id?: number;
  deviceImei: string;
  routeName?: string;
  routeType: RouteType;
  startTime: string;
  endTime?: string;
  /** Duration in MINUTES (backend sends minutes, not seconds) */
  duration?: number | string;
  /** Total distance in KILOMETERS (backend sends km, not meters) */
  totalDistance?: number | string;
  /** Maximum speed in km/h */
  maxSpeed?: number | string;
  /** Average speed in km/h */
  avgSpeed?: number | string;
  startLatitude?: number;
  startLongitude?: number;
  startAddress?: string;
  endLatitude?: number;
  endLongitude?: number;
  endAddress?: string;
  routeStatus: RouteStatus;
  /** Number of GPS points in this route */
  pointCount?: number;
  state: boolean | number;
  createdAt?: string;
  updatedAt?: string;
}

export type RouteType = 'automatic' | 'manual';
export type RouteStatus = 'active' | 'completed' | 'cancelled';

export interface RouteFilters {
  deviceImei?: string;
  status?: RouteStatus;
  startDate?: string;
  endDate?: string;
  /** Page number (1-based) for pagination */
  page?: number;
  /** Number of items per page */
  limit?: number;
}

export interface RouteSummary {
  totalRoutes: number;
  /** Total distance in KILOMETERS */
  totalDistance: number;
  /** Total duration in MINUTES */
  totalDuration: number;
  /** Average speed in km/h */
  avgSpeed: number;
}
