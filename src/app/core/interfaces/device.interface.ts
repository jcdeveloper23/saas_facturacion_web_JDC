/**
 * Device Interface - Represents a GPS tracking device
 */
export interface Device {
  id?: number;
  deviceImei: string;
  deviceName?: string;
  deviceModel: DeviceModel;
  deviceProtocol: string;

  // Ownership
  userId: number;
  organizationId?: number;

  // Status
  deviceStatus: DeviceStatus;
  lastSeenAt?: string;
  lastConnectionAt?: string;

  // Current State (last known position)
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
  simNumber?: string;
  installationDate?: string;
  expirationDate?: string;

  // Metadata
  state: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type DeviceStatus = 'online' | 'offline' | 'inactive';

export type DeviceModel =
  | 'GT06'
  | 'H02'
  | 'TK103'
  | 'TK102'
  | 'Teltonika'
  | 'Coban'
  | 'Concox'
  | 'Sinotrack'
  | 'Other';

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  inactive: number;
}

export interface DeviceFilters {
  status?: DeviceStatus;
  userId?: number;
  organizationId?: number;
  search?: string;
}
