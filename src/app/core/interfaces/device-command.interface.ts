/**
 * DeviceCommand Interface - Represents a command sent to a GPS device
 */
export interface DeviceCommand {
  id?: number;
  deviceImei: string;
  commandType: CommandType;
  commandPayload?: Record<string, unknown>;
  rawCommand?: string;
  commandStatus: CommandStatus;

  // Timestamps
  createdAt: string;
  sentAt?: string;
  acknowledgedAt?: string;

  // Response
  responseData?: string;

  // Retry logic
  retryCount: number;
  maxRetries: number;

  // Audit
  createdBy?: number;

  state: boolean;
}

export type CommandType =
  | 'locate'
  | 'reboot'
  | 'set_interval'
  | 'cut_engine'
  | 'restore_engine'
  | 'set_apn'
  | 'set_server'
  | 'set_timezone'
  | 'custom';

export type CommandStatus =
  | 'pending'
  | 'sent'
  | 'acknowledged'
  | 'failed'
  | 'timeout';

export interface CommandFilters {
  deviceImei?: string;
  type?: CommandType;
  status?: CommandStatus;
  startDate?: string;
  endDate?: string;
}
