/**
 * Device Settings Interface - Advanced configuration for GPS devices
 * Matches backend model: device-settings.model.js
 */
export interface DeviceSettings {
    id?: number;
    deviceImei: string;
    userId?: number;

    // Reporting Configuration
    reportInterval: number;           // Seconds between reports (default: 30)
    reportOnlyWhenMoving: boolean;    // Only report if device is moving

    // Speed & Driving Behavior
    speedLimit: number;               // Speed limit in km/h (default: 120)
    idleTimeThreshold: number;        // Minutes inactive before alert (default: 30)
    harshAccelerationThreshold: number; // km/h/s for harsh acceleration (default: 10)
    harshBrakingThreshold: number;    // km/h/s for harsh braking (default: -10)

    // Battery & Alerts
    lowBatteryThreshold: number;      // Battery low threshold % (default: 20)

    // Geofence Settings
    geofenceCheckEnabled: boolean;    // Enable geofence checking (default: true)
    geofenceBufferMeters: number;     // Buffer zone in meters (default: 0)

    // Route Settings
    autoRouteCreation: boolean;       // Auto-create routes (default: true)
    minRouteDistance: number;         // Minimum route distance in km (default: 0.1)
    minRouteDuration: number;         // Minimum route duration in minutes (default: 1)

    // Remote Control
    allowRemoteCommands: boolean;     // Allow remote commands (default: true)
    allowEngineControl: boolean;      // Allow engine cut/restore (default: true)

    // Additional
    deviceNotes?: string;             // Free-text notes
    isActive: boolean;                // Active/inactive flag (default: true)

    // Metadata
    state: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Default values for new device settings
 */
export const DEFAULT_DEVICE_SETTINGS: Partial<DeviceSettings> = {
    reportInterval: 30,
    reportOnlyWhenMoving: false,
    speedLimit: 120,
    idleTimeThreshold: 30,
    harshAccelerationThreshold: 10,
    harshBrakingThreshold: -10,
    lowBatteryThreshold: 20,
    geofenceCheckEnabled: true,
    geofenceBufferMeters: 0,
    autoRouteCreation: true,
    minRouteDistance: 0.1,
    minRouteDuration: 1,
    allowRemoteCommands: true,
    allowEngineControl: true,
    isActive: true,
    state: true
};
