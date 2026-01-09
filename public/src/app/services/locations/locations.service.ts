import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Location } from 'app/interfaces/location';

@Injectable({
    providedIn: 'root'
})
export class LocationsService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getLatestLocationByImei(imei: string): Observable<Location> {
        const url = `${environment.apiGpsUrl}/locations?deviceImei=${imei}&$limit=1&$sort[gpsTimestamp]=-1`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => (res.data && res.data.length > 0) ? res.data[0] : null)
        );
    }

    public getLocationHistory(imei: string, start: string, end: string): Observable<Location[]> {
        const url = `${environment.apiGpsUrl}/locations?deviceImei=${imei}&gpsTimestamp[$gte]=${start}&gpsTimestamp[$lte]=${end}&$sort[gpsTimestamp]=1&$limit=1000`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }

    public getLocationsByRoute(routeId: number): Observable<Location[]> {
        const url = `${environment.apiGpsUrl}/locations?routeId=${routeId}&$sort[gpsTimestamp]=1`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }
}
