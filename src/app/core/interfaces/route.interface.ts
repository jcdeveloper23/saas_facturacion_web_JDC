/**
 * Route Interface - Represents a trip/route made by a device
 */
export interface Route {
  id?: number;
  deviceImei: string;
  routeName?: string;
  routeType: RouteType;
  startTime: string;
  endTime?: string;
  duration?: number; // in seconds
  totalDistance?: number; // in meters
  maxSpeed?: number;
  avgSpeed?: number;
  startLatitude?: number;
  startLongitude?: number;
  startAddress?: string;
  endLatitude?: number;
  endLongitude?: number;
  endAddress?: string;
  routeStatus: RouteStatus;
  pointCount?: number;
  state: boolean;
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
}

export interface RouteSummary {
  totalRoutes: number;
  totalDistance: number;
  totalDuration: number;
  avgSpeed: number;
}
