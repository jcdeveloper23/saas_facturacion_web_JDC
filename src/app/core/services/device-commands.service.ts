import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { DeviceCommand, CommandType, CommandFilters } from '../interfaces';

/**
 * Device Commands Service - Sends commands to GPS devices
 */
@Injectable({
  providedIn: 'root'
})
export class DeviceCommandsService extends ApiBaseService<DeviceCommand> {
  protected endpoint = 'device-commands';

  /**
   * Get commands with optional filters
   */
  getCommands(filters?: CommandFilters): Observable<DeviceCommand[]> {
    const query: Record<string, unknown> = { state: true };

    if (filters?.deviceImei) {
      query['deviceImei'] = filters.deviceImei;
    }
    if (filters?.type) {
      query['commandType'] = filters.type;
    }
    if (filters?.status) {
      query['commandStatus'] = filters.status;
    }
    if (filters?.startDate && filters?.endDate) {
      query['createdAt'] = {
        $gte: filters.startDate,
        $lte: filters.endDate
      };
    }

    query['$sort'] = { createdAt: -1 };

    return this.find(query).pipe(map(response => response.data));
  }

  /**
   * Get commands by device
   */
  getByDevice(deviceImei: string): Observable<DeviceCommand[]> {
    return this.getCommands({ deviceImei });
  }

  /**
   * Send locate command
   */
  locate(deviceImei: string, userId: number): Observable<DeviceCommand> {
    return this.sendCommand(deviceImei, 'locate', userId);
  }

  /**
   * Send reboot command
   */
  reboot(deviceImei: string, userId: number): Observable<DeviceCommand> {
    return this.sendCommand(deviceImei, 'reboot', userId);
  }

  /**
   * Send cut engine command
   */
  cutEngine(deviceImei: string, userId: number): Observable<DeviceCommand> {
    return this.sendCommand(deviceImei, 'cut_engine', userId);
  }

  /**
   * Send restore engine command
   */
  restoreEngine(deviceImei: string, userId: number): Observable<DeviceCommand> {
    return this.sendCommand(deviceImei, 'restore_engine', userId);
  }

  /**
   * Set reporting interval
   */
  setInterval(deviceImei: string, seconds: number, userId: number): Observable<DeviceCommand> {
    return this.sendCommand(deviceImei, 'set_interval', userId, { interval: seconds });
  }

  /**
   * Send custom command
   */
  sendCustom(deviceImei: string, rawCommand: string, userId: number): Observable<DeviceCommand> {
    return this.create({
      deviceImei,
      commandType: 'custom',
      rawCommand,
      commandStatus: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      createdBy: userId,
      state: true
    });
  }

  /**
   * Generic send command
   */
  private sendCommand(
    deviceImei: string,
    commandType: CommandType,
    userId: number,
    payload?: Record<string, unknown>
  ): Observable<DeviceCommand> {
    return this.create({
      deviceImei,
      commandType,
      commandPayload: payload,
      commandStatus: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      createdBy: userId,
      state: true
    });
  }

  /**
   * Get pending commands for a device
   */
  getPending(deviceImei: string): Observable<DeviceCommand[]> {
    return this.getCommands({ deviceImei, status: 'pending' });
  }
}
