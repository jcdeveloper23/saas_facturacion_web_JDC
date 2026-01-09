import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GpsProtocol } from 'app/interfaces/gpsProtocol';

@Injectable({
    providedIn: 'root'
})
export class GpsProtocolsService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getProtocols(query: any = {}): Observable<GpsProtocol[]> {
        const url = `${environment.apiGpsUrl}/gps-protocols`;
        return this.http.get<any>(url, { ...this.getHeaders(), params: query }).pipe(
            map(res => res.data || res)
        );
    }

    public getProtocolById(id: number): Observable<GpsProtocol> {
        const url = `${environment.apiGpsUrl}/gps-protocols/${id}`;
        return this.http.get<GpsProtocol>(url, this.getHeaders());
    }

    public saveProtocol(protocol: GpsProtocol): Observable<GpsProtocol> {
        const url = `${environment.apiGpsUrl}/gps-protocols`;
        return this.http.post<GpsProtocol>(url, protocol, this.getHeaders());
    }

    public updateProtocol(id: number, protocol: Partial<GpsProtocol>): Observable<GpsProtocol> {
        const url = `${environment.apiGpsUrl}/gps-protocols/${id}`;
        return this.http.patch<GpsProtocol>(url, protocol, this.getHeaders());
    }

    public deleteProtocol(id: number): Observable<any> {
        const url = `${environment.apiGpsUrl}/gps-protocols/${id}`;
        return this.http.delete(url, this.getHeaders());
    }
}
