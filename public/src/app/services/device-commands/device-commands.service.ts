import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DeviceCommand } from 'app/interfaces/deviceCommand';

@Injectable({
    providedIn: 'root'
})
export class DeviceCommandsService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getCommands(query: any = {}): Observable<DeviceCommand[]> {
        const url = `${environment.apiGpsUrl}/device-commands`;
        return this.http.get<any>(url, { ...this.getHeaders(), params: query }).pipe(
            map(res => res.data || res)
        );
    }

    public getCommandById(id: number): Observable<DeviceCommand> {
        const url = `${environment.apiGpsUrl}/device-commands/${id}`;
        return this.http.get<DeviceCommand>(url, this.getHeaders());
    }

    public sendCommand(command: Partial<DeviceCommand>): Observable<DeviceCommand> {
        const url = `${environment.apiGpsUrl}/device-commands`;
        return this.http.post<DeviceCommand>(url, command, this.getHeaders());
    }

    public getCommandsByDevice(imei: string): Observable<DeviceCommand[]> {
        const url = `${environment.apiGpsUrl}/device-commands?deviceImei=${imei}&$sort[createdAt]=-1`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }
}
