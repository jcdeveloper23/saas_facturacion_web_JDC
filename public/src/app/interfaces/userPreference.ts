export interface UserPreferences {
    id?: number;
    userId: number;

    // Interface
    language: 'es' | 'en' | 'pt';
    timezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';

    // Units
    distanceUnit: 'km' | 'mi';
    speedUnit: 'km/h' | 'mph';
    temperatureUnit: 'C' | 'F';

    // Map
    mapProvider: 'google' | 'openstreetmap' | 'mapbox';
    defaultMapZoom: number;
    mapTrafficLayer: boolean;

    // Dashboard
    dashboardRefreshInterval: number;
    dashboardWidgets: any[];
}
