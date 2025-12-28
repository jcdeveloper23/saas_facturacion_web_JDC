// Resumen diario de búsquedas (documento principal por fecha)
declare interface DailySearchStats {
    date?: string;
    successCount?: number;
    noCoverageCount?: number;
    errorCount?: number;
    totalSearches?: number;
    lastUpdated?: string;
}

// Log individual de búsqueda (en subcolección logs)
declare interface CitySearchLog {
    logId?: string;
    timestamp?: string;
    userLat?: number;
    userLng?: number;
    userAddress?: string;
    googleLocality?: string;
    userId?: string;
    userEmail?: string;
    searchResult?: string; // 'success', 'no_coverage', 'error'
    cityFound?: string;
    cityFoundId?: string;
    distanceToNearestCity?: number;
    nearestCityCoverageRadius?: number;
    isWithinCoverage?: boolean;
    platform?: string;
    appVersion?: string;
    metadata?: any;
}
