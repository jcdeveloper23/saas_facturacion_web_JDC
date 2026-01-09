/**
 * @author Cristian Guillen <cristiangp150193@gmail.com>
 * */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { map } from 'rxjs/operators';
import { City } from 'app/interfaces/city';

@Injectable({
  providedIn: 'root'
})
export class CityService {

  constructor(
    private http: HttpClient,
  ) {
  }

  private getHeaders() {
    const token = localStorage.getItem('accessToken');
    return {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
  }

  public getCities() {
    const url = `${environment.apiGpsUrl}/cities`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data || res)
    );
  }

  public getCity(cityName: string) {
    const url = `${environment.apiGpsUrl}/cities?cityName=${cityName}`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data || res)
    );
  }

  saveCity(city: City) {
    const url = `${environment.apiGpsUrl}/cities`;
    return this.http.post(url, city, this.getHeaders());
  }

  editCity(city: City) {
    const url = `${environment.apiGpsUrl}/cities/${city.id || city.cityId}`;
    return this.http.patch(url, city, this.getHeaders());
  }

  /**
  * *** Delete city ***
  * @param cityId
  * @returns 
  */
  public deleteCity(cityId: string) {
    const url = `${environment.apiGpsUrl}/cities/${cityId}`;
    return this.http.delete(url, this.getHeaders());
  }
}
