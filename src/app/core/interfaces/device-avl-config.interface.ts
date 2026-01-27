/**
 * Device AVL Config Interface - AVL parameter configuration per device/user/global
 * Matches backend model: device-avl-config.model.js
 */
export interface DeviceAvlConfig {
    id?: number;

    // Scope Configuration
    configScope: AvlConfigScope;      // 'device', 'user', or 'global'
    deviceImei?: string;              // FK to devices (when scope = device)
    userId?: number;                  // FK to users (when scope = user)
    avlParameterId: number;           // FK to avl_parameters

    // Enable/Disable
    isEnabled: boolean;               // Enable/disable this parameter

    // Customization
    customLabel?: string;             // Custom display label
    customMultiplier?: number;        // Custom value multiplier
    customUnit?: string;              // Custom unit (e.g., 'km/h', 'mV')
    customAlertThreshold?: number;    // Custom alert threshold
    customPriority?: AvlPriority;     // Custom priority level

    // Metadata
    configMetadata?: Record<string, unknown>; // Additional JSON config

    // System
    state: boolean;
    createdAt?: string;
    updatedAt?: string;

    // Populated relations
    avlParameter?: AvlParameter;      // Populated AVL parameter info
}

/**
 * AVL Parameter - Reference data for telemetry parameters
 */
export interface AvlParameter {
    id: number;
    avlId: number;                    // AVL ID from device protocol
    parameterName: string;            // e.g., 'Ignition', 'Speed', 'Fuel Level'
    description?: string;
    dataType: 'boolean' | 'integer' | 'float' | 'string';
    defaultUnit?: string;
    defaultMultiplier?: number;
    minValue?: number;
    maxValue?: number;
    category?: string;                // e.g., 'Engine', 'GPS', 'IO'
}

/**
 * Config scope types
 */
export type AvlConfigScope = 'device' | 'user' | 'global';

/**
 * Priority levels for AVL parameters
 */
export type AvlPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Filters for AVL config queries
 */
export interface AvlConfigFilters {
    deviceImei?: string;
    userId?: number;
    configScope?: AvlConfigScope;
    isEnabled?: boolean;
    avlParameterId?: number;
}
