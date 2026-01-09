export interface Geofence {
    id?: number;
    userId: number;
    geofenceName: string;
    geofenceDescription?: string;
    geofenceType: 'circle' | 'polygon';

    // Geometry
    centerLatitude?: number;
    centerLongitude?: number;
    radius?: number;
    coordinates?: any; // Array of {lat, lng}

    // Alert Configuration
    alertOnEnter: boolean;
    alertOnExit: boolean;
    alertOnDwell: boolean;
    dwellTime?: number;

    // Notification Methods
    notifySms: boolean;
    notifyEmail: boolean;
    notifyPush: boolean;

    // Schedule
    scheduleEnabled: boolean;
    scheduleStart?: string;
    scheduleEnd?: string;
    scheduleDays?: number[];

    // Visual
    color?: string;
    icon?: string;

    state: boolean;
}
