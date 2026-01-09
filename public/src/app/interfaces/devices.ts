export interface Device {
    // Identity
    deviceImei: string;
    deviceName?: string;
    deviceModel: string;
    deviceProtocol: string;

    // Ownership
    userId: number;

    // Status
    deviceStatus: 'online' | 'offline' | 'inactive';
    lastSeenAt?: string;
    lastConnectionAt?: string;

    // Current State
    lastLatitude?: number;
    lastLongitude?: number;
    lastSpeed?: number;
    lastAltitude?: number;
    lastHeading?: number;
    lastAccStatus?: boolean;
    lastGpsSignal?: number;
    lastBatteryLevel?: number;

    // Configuration
    speedLimit?: number;
    timezone?: string;

    // Metadata
    simNumber?: string;
    installationDate?: string;
    expirationDate?: string;
    notes?: string;

    state: boolean;
}
