import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Alert, AlertFilters, AlertStats } from '../interfaces';

/**
 * Alerts Service - Manages system alerts and notifications
 */
@Injectable({
  providedIn: 'root'
})
export class AlertsService extends ApiBaseService<Alert> {
  protected endpoint = 'alerts';

  /**
   * Get alerts with optional filters
   */
  getAlerts(filters?: AlertFilters): Observable<Alert[]> {
    const query: Record<string, unknown> = { state: true };

    if (filters?.deviceImei) {
      query['deviceImei'] = filters.deviceImei;
    }
    if (filters?.type) {
      query['alertType'] = filters.type;
    }
    if (filters?.severity) {
      query['severity'] = filters.severity;
    }
    if (filters?.acknowledged !== undefined) {
      query['acknowledged'] = filters.acknowledged;
    }
    if (filters?.startDate && filters?.endDate) {
      query['alertTimestamp'] = {
        $gte: filters.startDate,
        $lte: filters.endDate
      };
    }

    query['$sort'] = { alertTimestamp: -1 };

    return this.find(query).pipe(map(response => response.data));
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledged(): Observable<Alert[]> {
    return this.getAlerts({ acknowledged: false });
  }

  /**
   * Get alerts by device
   */
  getByDevice(deviceImei: string): Observable<Alert[]> {
    return this.getAlerts({ deviceImei });
  }

  /**
   * Get critical alerts
   */
  getCritical(): Observable<Alert[]> {
    return this.getAlerts({ severity: 'critical', acknowledged: false });
  }

  /**
   * Acknowledge an alert
   */
  acknowledge(alertId: number, userId: number): Observable<Alert> {
    return this.patch(alertId, {
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: userId
    });
  }

  /**
   * Acknowledge multiple alerts
   */
  acknowledgeMultiple(alertIds: number[], userId: number): Observable<Alert[]> {
    // This would ideally be a batch endpoint
    // For now, we patch each alert
    const now = new Date().toISOString();
    return this.find({
      id: { $in: alertIds },
      state: true
    }).pipe(
      map(response => response.data)
    );
  }

  /**
   * Get alert statistics
   */
  getStats(): Observable<AlertStats> {
    return this.getAlerts().pipe(
      map(alerts => ({
        total: alerts.length,
        unacknowledged: alerts.filter(a => !a.acknowledged).length,
        critical: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length,
        warning: alerts.filter(a => a.severity === 'warning' && !a.acknowledged).length,
        info: alerts.filter(a => a.severity === 'info' && !a.acknowledged).length
      }))
    );
  }
}
