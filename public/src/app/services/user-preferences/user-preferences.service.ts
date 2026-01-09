import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserPreferences } from 'app/interfaces/userPreference';

@Injectable({
    providedIn: 'root'
})
export class UserPreferencesService {

    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('accessToken');
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    }

    public getPreferences(userId: number): Observable<UserPreferences> {
        const url = `${environment.apiGpsUrl}/user-preferences?userId=${userId}`;
        return this.http.get<any>(url, this.getHeaders()).pipe(
            map(res => (res.data && res.data.length > 0) ? res.data[0] : null)
        );
    }

    public savePreferences(prefs: UserPreferences): Observable<UserPreferences> {
        const url = `${environment.apiGpsUrl}/user-preferences`;
        return this.http.post<UserPreferences>(url, prefs, this.getHeaders());
    }

    public updatePreferences(id: number, prefs: Partial<UserPreferences>): Observable<UserPreferences> {
        const url = `${environment.apiGpsUrl}/user-preferences/${id}`;
        return this.http.patch<UserPreferences>(url, prefs, this.getHeaders());
    }
}
