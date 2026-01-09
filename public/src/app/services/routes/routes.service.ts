import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Route } from 'app/interfaces/route';

@Injectable({
    providedIn: 'root'
})
export class RoutesService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getRoutes(query: any = {}): Observable<Route[]> {
        const url = `${environment.apiGpsUrl}/routes`;
        return this.http.get<any>(url, { ...this.getHeaders(), params: query }).pipe(
            map(res => res.data || res)
        );
    }

    public getRouteById(id: number): Observable<Route> {
        const url = `${environment.apiGpsUrl}/routes/${id}`;
        return this.http.get<Route>(url, this.getHeaders());
    }

    public getRoutesByDevice(imei: string): Observable<Route[]> {
        const url = `${environment.apiGpsUrl}/routes?deviceImei=${imei}&$sort[startTime]=-1`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => res.data || res)
        );
    }

    public updateRoute(id: number, route: Partial<Route>): Observable<Route> {
        const url = `${environment.apiGpsUrl}/routes/${id}`;
        return this.http.patch<Route>(url, route, this.getHeaders());
    }

    public deleteRoute(id: number): Observable<any> {
        const url = `${environment.apiGpsUrl}/routes/${id}`;
        return this.http.delete(url, this.getHeaders());
    }
}
