export interface DeviceCommand {
    id?: number;
    deviceImei: string;
    commandType:
    | 'locate'
    | 'reboot'
    | 'set_interval'
    | 'cut_engine'
    | 'restore_engine'
    | 'set_apn'
    | 'set_server'
    | 'set_timezone'
    | 'custom';
    commandPayload?: any;
    rawCommand?: string;
    commandStatus: 'pending' | 'sent' | 'acknowledged' | 'failed' | 'timeout';
    createdAt: string;
    sentAt?: string;
    acknowledgedAt?: string;
    responseData?: string;
    retryCount: number;
    maxRetries: number;
    createdBy?: number;
    state: boolean;
}
