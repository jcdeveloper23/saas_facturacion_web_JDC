/**
 * Geofence Interface - Represents a geographic zone for alerts
 */
export interface Geofence {
  id?: number;
  userId: number;
  geofenceName: string;
  geofenceDescription?: string;
  geofenceType: GeofenceType;

  // Circle properties
  centerLatitude?: number;
  centerLongitude?: number;
  radius?: number; // in meters

  // Polygon properties
  coordinates?: LatLngPoint[];

  // Alert configuration
  alertOnEnter: boolean;
  alertOnExit: boolean;
  alertOnDwell: boolean;
  dwellTime?: number; // in seconds

  // Notification channels
  notifySms: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;

  // Schedule
  scheduleEnabled: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleDays?: number[]; // 0-6 (Sunday-Saturday)

  // Appearance
  color?: string;
  icon?: string;

  state: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type GeofenceType = 'circle' | 'polygon';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface GeofenceFilters {
  userId?: number;
  type?: GeofenceType;
  search?: string;
}
