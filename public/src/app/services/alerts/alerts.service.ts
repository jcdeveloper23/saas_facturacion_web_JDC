import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Alert } from 'app/interfaces/alert';

@Injectable({
    providedIn: 'root'
})
export class AlertsService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getAlerts(query: any = {}): Observable<Alert[]> {
        const url = `${environment.apiGpsUrl}/alerts`;
        return this.http.get<any>(url, { ...this.getHeaders(), params: query }).pipe(
            map(res => res.data || res)
        );
    }

    public getAlertsByDevice(imei: string): Observable<Alert[]> {
        const url = `${environment.apiGpsUrl}/alerts?deviceImei=${imei}&$sort[alertTimestamp]=-1`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }

    public acknowledgeAlert(alertId: number, userId: number): Observable<Alert> {
        const url = `${environment.apiGpsUrl}/alerts/${alertId}`;
        return this.http.patch<Alert>(url, {
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
            acknowledgedBy: userId
        }, this.getHeaders());
    }

    public deleteAlert(alertId: number): Observable<any> {
        const url = `${environment.apiGpsUrl}/alerts/${alertId}`;
        return this.http.delete(url, this.getHeaders());
    }
}
