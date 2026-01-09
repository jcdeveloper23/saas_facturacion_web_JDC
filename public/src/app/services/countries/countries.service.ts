import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Country } from '../../interfaces/country';
import { RequestVehicle } from '../../interfaces/requestVehicle';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CountriesService {
  private apiUrl = `${environment.apiGpsUrl}/countries`;

  constructor(private http: HttpClient) { }

  private getHeaders() {
    const token = localStorage.getItem('accessToken');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  public getCountries(): Observable<Country[]> {
    return this.http.get<Country[]>(this.apiUrl, { headers: this.getHeaders() });
  }

  public getRequest(): Observable<RequestVehicle[]> {
    // Legacy endpoint for requests, pointing to a placeholder for now
    return this.http.get<RequestVehicle[]>(`${environment.apiGpsUrl}/requests`, { headers: this.getHeaders() });
  }

  public getCountry(countryName: string): Observable<Country[]> {
    return this.http.get<Country[]>(`${this.apiUrl}?countryName=${countryName}`, { headers: this.getHeaders() });
  }

  saveCountry(country: Country): Observable<any> {
    return this.http.post(this.apiUrl, country, { headers: this.getHeaders() });
  }

  editCountry(country: Country): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${country.countryId}`, country, { headers: this.getHeaders() });
  }

  public deleteCountry(countryId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${countryId}`, { headers: this.getHeaders() });
  }
}
