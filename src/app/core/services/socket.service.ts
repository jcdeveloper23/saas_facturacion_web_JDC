import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Location, Device } from '../interfaces';

// Socket.IO v2.x client
// @ts-ignore - Ignore type checking for CommonJS module
import io from 'socket.io-client';

/**
 * Events emitted by the GPS backend server
 */
export interface LocationUpdateEvent {
  deviceImei: string;
  location: Location;
  device?: Partial<Device>;
}

export interface DeviceStatusEvent {
  deviceImei: string;
  status: 'online' | 'offline' | 'inactive';
  lastSeenAt: string;
}

export interface AlertEvent {
  id: number;
  deviceImei: string;
  alertType: string;
  message: string;
  location?: Location;
  timestamp: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Socket Service - Manages WebSocket connection to FeathersJS backend (Socket.IO v2.x)
 * Provides real-time updates for GPS device monitoring
 */
@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private authService = inject(AuthService);
  private socket: any = null;
  private destroy$ = new Subject<void>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;

  // Connection state
  private _connectionStatus = signal<ConnectionStatus>('disconnected');
  readonly connectionStatus = this._connectionStatus.asReadonly();

  // Event subjects
  private locationUpdate$ = new Subject<LocationUpdateEvent>();
  private deviceStatus$ = new Subject<DeviceStatusEvent>();
  private alert$ = new Subject<AlertEvent>();
  private deviceCreated$ = new Subject<Device>();
  private deviceUpdated$ = new Subject<Device>();
  private deviceRemoved$ = new Subject<{ id: number; deviceImei: string }>();

  // Computed signals
  isConnected = computed(() => this._connectionStatus() === 'connected');
  isConnecting = computed(() => this._connectionStatus() === 'connecting');

  /**
   * Connect to the WebSocket server (Socket.IO v2.x compatible)
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log('[SocketService] Already connected');
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      console.warn('[SocketService] No auth token available, cannot connect');
      this._connectionStatus.set('error');
      return;
    }

    this._connectionStatus.set('connecting');
    console.log('[SocketService] Connecting to:', environment.apiGpsUrl);

    // Socket.IO v2.x connection options
    this.socket = io(environment.apiGpsUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      query: {
        token: token
      }
    });

    this.setupSocketListeners();
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[SocketService] Disconnecting...');
      this.socket.disconnect();
      this.socket = null;
      this._connectionStatus.set('disconnected');
    }
  }

  /**
   * Setup all socket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // --- AUDIT: Log ALL FeathersJS service events ---
    const auditServices = ['locations', 'devices', 'alerts', 'routes', 'users'];
    const auditMethods = ['created', 'updated', 'patched', 'removed'];
    for (const svc of auditServices) {
      for (const method of auditMethods) {
        const eventName = `${svc} ${method}`;
        this.socket.on(eventName, (data: any) => {
          console.group(`%c[AUDIT] ${eventName}`, 'color: #ff9800; font-weight: bold;');
          console.log('Timestamp:', new Date().toISOString());
          console.log('Data:', JSON.parse(JSON.stringify(data)));
          if (typeof data === 'object' && data !== null) {
            console.log('Keys:', Object.keys(data));
          }
          console.groupEnd();
        });
      }
    }
    // Audit custom events
    const customEvents = ['gps:location', 'gps:status', 'alert:new', 'authenticated', 'unauthorized'];
    for (const eventName of customEvents) {
      this.socket.on(eventName, (data: any) => {
        console.group(`%c[AUDIT] ${eventName}`, 'color: #e91e63; font-weight: bold;');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Data:', data);
        console.groupEnd();
      });
    }

    // Connection events
    this.socket.on('connect', () => {
      console.log('[SocketService] Connected successfully, socket id:', this.socket?.id);
      this._connectionStatus.set('connected');
      this.reconnectAttempts = 0;
      this.authenticateSocket();
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('[SocketService] Disconnected:', reason);
      this._connectionStatus.set('disconnected');
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('[SocketService] Connection error:', error.message);
      this._connectionStatus.set('error');
      this.reconnectAttempts++;
    });

    this.socket.on('connect_timeout', () => {
      console.error('[SocketService] Connection timeout');
      this._connectionStatus.set('error');
    });

    this.socket.on('reconnect', (attemptNumber: number) => {
      console.log('[SocketService] Reconnected after', attemptNumber, 'attempts');
      this._connectionStatus.set('connected');
      this.authenticateSocket();
    });

    this.socket.on('reconnecting', (attemptNumber: number) => {
      console.log('[SocketService] Reconnection attempt:', attemptNumber);
      this._connectionStatus.set('connecting');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[SocketService] Reconnection failed after max attempts');
      this._connectionStatus.set('error');
    });

    this.socket.on('error', (error: Error) => {
      console.error('[SocketService] Socket error:', error);
      this._connectionStatus.set('error');
    });

    // GPS Location events - FeathersJS real-time
    this.socket.on('locations created', (data: Location) => {
      console.log('[SocketService] Location created:', data.deviceImei);
      this.locationUpdate$.next({
        deviceImei: data.deviceImei,
        location: data
      });
    });

    this.socket.on('locations patched', (data: Location) => {
      this.locationUpdate$.next({
        deviceImei: data.deviceImei,
        location: data
      });
    });

    // Device status events
    this.socket.on('devices patched', (data: Device) => {
      console.log('[SocketService] Device patched:', data.deviceImei);
      this.deviceUpdated$.next(data);

      if (data.deviceStatus) {
        this.deviceStatus$.next({
          deviceImei: data.deviceImei,
          status: data.deviceStatus,
          lastSeenAt: data.lastSeenAt || new Date().toISOString()
        });
      }
    });

    this.socket.on('devices created', (data: Device) => {
      console.log('[SocketService] Device created:', data.deviceImei);
      this.deviceCreated$.next(data);
    });

    this.socket.on('devices removed', (data: { id: number; deviceImei: string }) => {
      console.log('[SocketService] Device removed:', data.deviceImei);
      this.deviceRemoved$.next(data);
    });

    // Custom events from backend
    this.socket.on('gps:location', (data: LocationUpdateEvent) => {
      console.log('[SocketService] GPS location event:', data.deviceImei);
      this.locationUpdate$.next(data);
    });

    this.socket.on('gps:status', (data: DeviceStatusEvent) => {
      console.log('[SocketService] GPS status event:', data.deviceImei, data.status);
      this.deviceStatus$.next(data);
    });

    this.socket.on('alert:new', (data: AlertEvent) => {
      console.log('[SocketService] New alert:', data.alertType, data.deviceImei);
      this.alert$.next(data);
    });

    // Authentication response
    this.socket.on('authenticated', () => {
      console.log('[SocketService] Socket authenticated successfully');
    });

    this.socket.on('unauthorized', (error: { message: string }) => {
      console.error('[SocketService] Socket authentication failed:', error.message);
      this._connectionStatus.set('error');
    });
  }

  /**
   * Authenticate the socket connection with JWT (FeathersJS v4.x style)
   */
  private authenticateSocket(): void {
    const token = this.authService.getToken();
    if (this.socket && token) {
      // FeathersJS authentication via socket
      this.socket.emit('create', 'authentication', {
        strategy: 'jwt',
        accessToken: token
      }, (error: unknown, result: unknown) => {
        if (error) {
          console.error('[SocketService] Authentication error:', error);
        } else {
          console.log('[SocketService] Authenticated via FeathersJS');
        }
      });
    }
  }

  /**
   * Subscribe to a specific channel/room for real-time updates
   */
  subscribeToDevices(deviceImeis: string[]): void {
    if (this.socket?.connected) {
      console.log('[SocketService] Subscribing to devices:', deviceImeis);
      this.socket.emit('subscribe', { devices: deviceImeis });
    }
  }

  /**
   * Unsubscribe from device updates
   */
  unsubscribeFromDevices(deviceImeis: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe', { devices: deviceImeis });
    }
  }

  /**
   * Subscribe to organization channel for all devices
   */
  subscribeToOrganization(organizationId: number): void {
    if (this.socket?.connected) {
      console.log('[SocketService] Subscribing to organization:', organizationId);
      this.socket.emit('subscribe', { organization: organizationId });
    }
  }

  // Observable streams for components
  onLocationUpdate(): Observable<LocationUpdateEvent> {
    return this.locationUpdate$.asObservable();
  }

  onDeviceStatusChange(): Observable<DeviceStatusEvent> {
    return this.deviceStatus$.asObservable();
  }

  onAlert(): Observable<AlertEvent> {
    return this.alert$.asObservable();
  }

  onDeviceCreated(): Observable<Device> {
    return this.deviceCreated$.asObservable();
  }

  onDeviceUpdated(): Observable<Device> {
    return this.deviceUpdated$.asObservable();
  }

  onDeviceRemoved(): Observable<{ id: number; deviceImei: string }> {
    return this.deviceRemoved$.asObservable();
  }

  /**
   * Get the raw socket instance (use with caution)
   */
  getSocket(): any {
    return this.socket;
  }

  /**
   * Emit a custom event to the server
   */
  emit(event: string, data: unknown, callback?: (error: unknown, result: unknown) => void): void {
    if (this.socket?.connected) {
      if (callback) {
        this.socket.emit(event, data, callback);
      } else {
        this.socket.emit(event, data);
      }
    } else {
      console.warn('[SocketService] Cannot emit, socket not connected');
    }
  }

  /**
   * Request latest locations for all devices (fallback)
   */
  requestLatestLocations(): void {
    if (this.socket?.connected) {
      this.socket.emit('request:locations', {});
    }
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.disconnect();
  }
}
