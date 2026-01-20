/**
 * GpsProtocol Interface - Represents a supported GPS protocol
 */
export interface GpsProtocol {
  id?: number;
  protocolName: string;
  manufacturer?: string;
  tcpPort: number;
  isEnabled: boolean;
  decoderModule: string;

  // Features
  features: ProtocolFeatures;

  // Connection settings
  heartbeatTimeout: number; // in seconds

  // Access control
  imeiWhitelist: string[];
  imeiBlacklist: string[];

  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProtocolFeatures {
  supportsACC: boolean;
  supportsBattery: boolean;
  supportsIO: boolean;
  supportsRemoteCommands: boolean;
  supportsOBD?: boolean;
  supportsFuel?: boolean;
  supportsTemperature?: boolean;
}

export interface ProtocolFilters {
  isEnabled?: boolean;
  search?: string;
}
