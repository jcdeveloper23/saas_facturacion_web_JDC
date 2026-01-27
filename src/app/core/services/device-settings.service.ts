import { Injectable } from '@angular/core';
import { Observable, map, switchMap, of, catchError } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { DeviceSettings } from '../interfaces/device-settings.interface';

/**
 * Device Settings Service - Manages advanced device configuration
 */
@Injectable({
    providedIn: 'root'
})
export class DeviceSettingsService extends ApiBaseService<DeviceSettings> {
    protected endpoint = 'device-settings';

    /**
     * Get settings by device IMEI
     * Returns null if no settings exist for this device
     */
    getByDevice(deviceImei: string): Observable<DeviceSettings | null> {
        return this.find({ deviceImei }).pipe(
            map(response => {
                if (response && response.data && response.data.length > 0) {
                    return response.data[0];
                }
                return null;
            }),
            catchError(err => {
                console.error('Error fetching device settings:', err);
                return of(null);
            })
        );
    }

    /**
     * Update or Create settings for a device (upsert)
     * @param deviceImei - Device IMEI
     * @param settings - Settings to save
     * @param userId - User ID (required for new settings)
     */
    saveSettings(deviceImei: string, settings: Partial<DeviceSettings>, userId?: number): Observable<DeviceSettings> {
        return this.getByDevice(deviceImei).pipe(
            switchMap(existingSettings => {
                if (existingSettings && existingSettings.id) {
                    // Update existing - no need to include userId
                    return this.patch(existingSettings.id, settings);
                } else {
                    // Create new - userId is required
                    return this.create({
                        ...settings,
                        deviceImei,
                        userId,
                        state: true,
                        isActive: true
                    } as Partial<DeviceSettings>);
                }
            })
        );
    }

    /**
     * Patch settings by ID
     */
    updateSettings(id: number, settings: Partial<DeviceSettings>): Observable<DeviceSettings> {
        return this.patch(id, settings);
    }
}
