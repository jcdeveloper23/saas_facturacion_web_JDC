/**
 * Alert Interface - Represents a system alert/notification
 */
export interface Alert {
  id?: number;
  deviceImei: string;
  alertType: AlertType;
  severity: AlertSeverity;
  alertMessage: string;
  alertData?: Record<string, unknown>;

  // Related entities
  geofenceId?: number;
  locationId?: number;

  // Position at alert time
  latitude?: number;
  longitude?: number;

  // Timestamps
  alertTimestamp: string;

  // Notification status
  notificationSent: boolean;
  smsSent: boolean;
  emailSent: boolean;
  pushSent: boolean;

  // Acknowledgment
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: number;

  state: boolean;
  createdAt?: string;
}

export type AlertType =
  | 'speed_violation'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'geofence_dwell'
  | 'acc_on'
  | 'acc_off'
  | 'sos'
  | 'low_battery'
  | 'device_offline'
  | 'device_online'
  | 'harsh_acceleration'
  | 'harsh_braking'
  | 'idle_too_long'
  | 'custom';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertFilters {
  deviceImei?: string;
  type?: AlertType;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface AlertStats {
  total: number;
  unacknowledged: number;
  critical: number;
  warning: number;
  info: number;
}
