export interface Location {
    id?: number;
    deviceImei: string;
    latitude: number;
    longitude: number;
    altitude?: number;
    speed?: number;
    heading?: number;

    // Signal Quality
    satellites?: number;
    hdop?: number;

    // Device State
    accStatus?: boolean;
    batteryLevel?: number;

    // Timing
    gpsTimestamp: string;
    serverTimestamp?: string;

    // Route Association
    routeId?: number;

    // Extra Data
    alertData?: any;
    rawData?: string;

    state: boolean;
}
