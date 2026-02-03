/**
 * Location Interface - Represents a GPS location point
 */
export interface Location {
  id?: number;
  deviceImei: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number | string;
  heading?: number;
  satellites?: number;
  hdop?: number;
  accStatus?: number | boolean;
  batteryLevel?: number;
  gpsTimestamp: string;
  serverTimestamp?: string;
  routeId?: number;
  alertData?: Record<string, unknown>;
  state: boolean;
  duration?: number;
}

export interface LocationHistory {
  deviceImei: string;
  locations: Location[];
  startDate: string;
  endDate: string;
  totalPoints: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}
