export interface GpsProtocol {
    id?: number;
    protocolName: string;
    manufacturer?: string;
    tcpPort: number;
    isEnabled: boolean;
    decoderModule: string;
    features: {
        supportsACC: boolean;
        supportsBattery: boolean;
        supportsIO: boolean;
        supportsRemoteCommands: boolean;
    };
    heartbeatTimeout: number;
    imeiWhitelist: string[];
    imeiBlacklist: string[];
    notes?: string;
}
