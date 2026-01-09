import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Geofence } from 'app/interfaces/geofence';

@Injectable({
    providedIn: 'root'
})
export class GeofencesService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getGeofences(query: any = {}): Observable<Geofence[]> {
        const url = `${environment.apiGpsUrl}/geofences`;
        return this.http.get<any>(url, { ...this.getHeaders(), params: query }).pipe(
            map(res => res.data || res)
        );
    }

    public getGeofenceById(id: number): Observable<Geofence> {
        const url = `${environment.apiGpsUrl}/geofences/${id}`;
        return this.http.get<Geofence>(url, this.getHeaders());
    }

    public saveGeofence(geofence: Geofence): Observable<Geofence> {
        const url = `${environment.apiGpsUrl}/geofences`;
        return this.http.post<Geofence>(url, geofence, this.getHeaders());
    }

    public updateGeofence(id: number, geofence: Partial<Geofence>): Observable<Geofence> {
        const url = `${environment.apiGpsUrl}/geofences/${id}`;
        return this.http.patch<Geofence>(url, geofence, this.getHeaders());
    }

    public deleteGeofence(id: number): Observable<any> {
        const url = `${environment.apiGpsUrl}/geofences/${id}`;
        return this.http.delete(url, this.getHeaders());
    }

    public getGeofencesByUser(userId: number): Observable<Geofence[]> {
        const url = `${environment.apiGpsUrl}/geofences?userId=${userId}`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }
}
