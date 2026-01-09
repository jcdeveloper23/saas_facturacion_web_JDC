export interface Route {
    id?: number;
    deviceImei: string;
    routeName?: string;
    routeType: 'automatic' | 'manual';

    // Timing
    startTime: string;
    endTime?: string;
    duration?: number; // In seconds

    // Route Metrics
    totalDistance?: number; // In km
    maxSpeed?: number;
    avgSpeed?: number;

    // Start/End Locations
    startLatitude?: number;
    startLongitude?: number;
    startAddress?: string;
    endLatitude?: number;
    endLongitude?: number;
    endAddress?: string;

    // Route Status
    routeStatus: 'active' | 'completed' | 'cancelled';

    // Point Count
    pointCount?: number;

    // Metadata
    notes?: string;

    state: boolean;
}
