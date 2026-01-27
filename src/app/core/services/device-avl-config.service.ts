import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { DeviceAvlConfig, AvlConfigFilters } from '../interfaces/device-avl-config.interface';

/**
 * Device AVL Config Service - Manages AVL parameter configuration
 */
@Injectable({
    providedIn: 'root'
})
export class DeviceAvlConfigService extends ApiBaseService<DeviceAvlConfig> {
    protected endpoint = 'device-avl-config';

    /**
     * Get AVL config with optional filters
     */
    getConfigs(filters?: AvlConfigFilters): Observable<DeviceAvlConfig[]> {
        const query: Record<string, unknown> = { state: true };

        if (filters?.deviceImei) {
            query['deviceImei'] = filters.deviceImei;
        }
        if (filters?.userId) {
            query['userId'] = filters.userId;
        }
        if (filters?.configScope) {
            query['configScope'] = filters.configScope;
        }
        if (filters?.avlParameterId) {
            query['avlParameterId'] = filters.avlParameterId;
        }
        if (filters?.isEnabled !== undefined) {
            query['isEnabled'] = filters.isEnabled;
        }

        return this.find(query).pipe(map(response => response.data));
    }

    /**
     * Get specific config by device and AVL parameter ID
     */
    getByAvlParameterId(deviceImei: string, avlParameterId: number): Observable<DeviceAvlConfig | null> {
        return this.find({ deviceImei, avlParameterId, state: true }).pipe(
            map(response => response.data[0] || null)
        );
    }
}
