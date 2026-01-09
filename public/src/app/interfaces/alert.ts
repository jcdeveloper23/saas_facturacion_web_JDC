export interface Alert {
    id?: number;
    deviceImei: string;
    alertType:
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
    severity: 'info' | 'warning' | 'critical';
    alertMessage: string;
    alertData?: any;

    // Related Entities
    geofenceId?: number;
    locationId?: number;

    // Location Snapshot
    latitude?: number;
    longitude?: number;

    // Timing
    alertTimestamp: string;

    // Notification Status
    notificationSent: boolean;
    smsSent: boolean;
    emailSent: boolean;
    pushSent: boolean;

    // User Interaction
    acknowledged: boolean;
    acknowledgedAt?: string;
    acknowledgedBy?: number;

    state: boolean;
}
