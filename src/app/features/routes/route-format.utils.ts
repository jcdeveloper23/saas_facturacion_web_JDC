import { RouteStatus } from '../../core/interfaces';

/**
 * Shared utility functions for route formatting
 * Centralizes all format/translation logic used across route components
 */

/**
 * Format duration from MINUTES to human readable string
 * Backend sends duration in MINUTES (confirmed in process-location.js:226)
 */
export function formatDuration(minutes?: number | string): string {
  const value = typeof minutes === 'string' ? parseFloat(minutes) : minutes;
  if (value === null || value === undefined || isNaN(value)) return '--';

  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Format distance - Backend sends KILOMETERS directly
 * (confirmed: totalDistance DECIMAL(10,2) in kilometers)
 */
export function formatDistance(km?: number | string): string {
  const value = typeof km === 'string' ? parseFloat(km) : km;
  if (value === null || value === undefined || isNaN(value)) return '--';

  return `${value.toFixed(2)} km`;
}

/**
 * Format speed value in km/h
 */
export function formatSpeed(speed?: number | string): string {
  const value = typeof speed === 'string' ? parseFloat(speed) : speed;
  if (value === null || value === undefined || isNaN(value)) return '--';
  return `${value.toFixed(1)} km/h`;
}

/**
 * Format date to locale string
 */
export function formatDate(date?: string): string {
  if (!date) return '--';
  return new Date(date).toLocaleString();
}

/**
 * Format coordinate value (handles string or number)
 */
export function formatCoordinate(value?: number | string): string {
  if (value === null || value === undefined) return '--';
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  if (numericValue === null || numericValue === undefined || isNaN(numericValue)) return '--';
  return numericValue.toFixed(5);
}

/**
 * Translate route status to Spanish
 */
export function translateStatus(status: RouteStatus): string {
  const translations: Record<RouteStatus, string> = {
    completed: 'Completada',
    active: 'Activa',
    cancelled: 'Cancelada'
  };
  return translations[status] || status;
}

/**
 * Get badge color for route status
 */
export function getStatusColor(status: RouteStatus): string {
  const colors: Record<RouteStatus, string> = {
    completed: 'success',
    active: 'primary',
    cancelled: 'danger'
  };
  return colors[status] || 'secondary';
}

/**
 * Translate route type to Spanish
 */
export function translateRouteType(type: string): string {
  return type === 'automatic' ? 'Automática' : 'Manual';
}

/**
 * Get badge color for route type
 */
export function getRouteTypeColor(type: string): string {
  return type === 'automatic' ? 'success' : 'info';
}

/**
 * Date preset type for quick date range selection
 */
export type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

/**
 * Get date range for a preset
 */
export function getDateRangeForPreset(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today': {
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'yesterday': {
      const start = new Date(today);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'thisWeek': {
      const start = new Date(today);
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'lastWeek': {
      const start = new Date(today);
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start.setDate(start.getDate() - diff - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    default:
      return getDateRangeForPreset('today');
  }
}

/**
 * Format date for datetime-local input
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * Format date for backend API (MySQL format)
 */
export function formatDateForBackend(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Route event interface for type safety
 */
export interface RouteEvent {
  type: 'ignition_on' | 'ignition_off' | 'speeding' | 'harsh_brake' | 'harsh_acceleration';
  timestamp: string;
  location: {
    latitude: number;
    longitude: number;
  };
  label: string;
  value?: number;
}

/**
 * Identified stop interface
 */
export interface IdentifiedStop {
  id?: number;
  latitude: number;
  longitude: number;
  gpsTimestamp: string;
  duration: number; // in minutes
  address?: string;
}

/**
 * Chart data interface for telemetry charts
 */
export interface TelemetryChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor: string;
    pointBackgroundColor?: string;
    pointBorderColor?: string;
    fill?: boolean;
    tension?: number;
    pointRadius?: number;
  }[];
}

/**
 * Map legend item interface
 */
export interface MapLegendItem {
  color: string;
  label: string;
  icon: string;
}

/**
 * Default map legend items
 */
export const MAP_LEGEND_ITEMS: MapLegendItem[] = [
  { color: '#2eb85c', label: 'Inicio', icon: 'A' },
  { color: '#e55353', label: 'Fin', icon: 'B' },
  { color: '#f9b115', label: 'Parada', icon: 'P' },
  { color: '#3399ff', label: 'Encendido', icon: 'I' },
  { color: '#636f83', label: 'Apagado', icon: 'I' },
  { color: '#321fdb', label: 'Posición actual', icon: 'V' }
];
