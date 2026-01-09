import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Device } from 'app/interfaces/devices';

@Injectable({
    providedIn: 'root'
})
export class DevicesService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getDevices(query: any = {}): Observable<Device[]> {
        const url = `${environment.apiGpsUrl}/devices`;
        return this.http.get<any>(url, { ...this.getHeaders(), params: query }).pipe(
            map(res => res.data || res)
        );
    }

    public getDeviceByImei(imei: string): Observable<Device> {
        const url = `${environment.apiGpsUrl}/devices/${imei}`;
        return this.http.get<Device>(url, this.getHeaders());
    }

    public saveDevice(device: Device): Observable<Device> {
        const url = `${environment.apiGpsUrl}/devices`;
        return this.http.post<Device>(url, device, this.getHeaders());
    }

    public updateDevice(imei: string, device: Partial<Device>): Observable<Device> {
        const url = `${environment.apiGpsUrl}/devices/${imei}`;
        return this.http.patch<Device>(url, device, this.getHeaders());
    }

    public deleteDevice(imei: string): Observable<any> {
        const url = `${environment.apiGpsUrl}/devices/${imei}`;
        return this.http.delete(url, this.getHeaders());
    }

    public getDevicesByUserId(userId: number): Observable<Device[]> {
        const url = `${environment.apiGpsUrl}/devices?userId=${userId}`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }
}
