// Core Interfaces - GPS Tracking System
export * from './device.interface';
export * from './location.interface';
export * from './route.interface';
export * from './geofence.interface';
export * from './alert.interface';
export * from './user.interface';
export * from './organization.interface';
export * from './device-command.interface';
export * from './gps-protocol.interface';
export * from './permission.interface';
export * from './device-settings.interface';
export * from './device-avl-config.interface';

// Common types
export interface ApiResponse<T> {
  data: T;
  total?: number;
  limit?: number;
  skip?: number;
}

export interface PaginationParams {
  $limit?: number;
  $skip?: number;
  $sort?: Record<string, 1 | -1>;
}

export interface ApiError {
  name: string;
  message: string;
  code: number;
  className?: string;
  errors?: Record<string, string>;
}
