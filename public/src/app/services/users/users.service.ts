import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Users } from 'app/interfaces/users';
import { Vehicle } from 'app/interfaces/vehicle';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class UsersService {

  constructor(
    private http: HttpClient
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

  public saveUser(user: Users) {
    const url = `${environment.apiGpsUrl}/users`;
    return this.http.post(url, user, this.getHeaders()).toPromise();
  }

  /**
   * Actualiza el estado del usuario para bloquear el acceso
   * */
  public updateUserState(id: string | number, state: boolean) {
    const url = `${environment.apiGpsUrl}/users/${id}`;
    return this.http.patch(url, { state }, this.getHeaders()).toPromise();
  }

  public getUserByEmail(email: string) {
    const url = `${environment.apiGpsUrl}/users?userEmail=${email}`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data || res)
    );
  }

  public getVehiclesByUser(userUid: string) {
    // Maps to /devices?userId=...
    const url = `${environment.apiGpsUrl}/devices?userId=${userUid}`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data || res)
    );
  }

  public getAllUsers() {
    const url = `${environment.apiGpsUrl}/users`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data || res)
    );
  }

  /**
   * Obtiene todos los usuarios (una sola vez) con límite opcional
   */
  public getAllUsersOnce(limit: number = 0) {
    let url = `${environment.apiGpsUrl}/users`;
    if (limit > 0) url += `?$limit=${limit}`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      take(1),
      map(res => res.data || res)
    );
  }

  /**
   * Obtiene un usuario por su ID (una vez)
   * @param userId - UID del usuario
   * @returns Observable con los datos del usuario
   */
  public getUserById(userId: string): Observable<Users> {
    const url = `${environment.apiGpsUrl}/users/${userId}`;
    return this.http.get<Users>(url, this.getHeaders());
  }

  /**
   * Obtiene un usuario por su ID en tiempo real (listener)
   * @param userId - UID del usuario
   * @returns Observable con los datos del usuario que se actualiza en tiempo real
   */
  public getUserByIdRealtime(userId: string): Observable<Users> {
    // For now, since Feathers real-time (Socket.io) isn't fully set up on frontend, we fallback to one-time fetch or polling.
    // Ideally use feathers-client.
    return this.getUserById(userId);
  }

  /**
  * Actualiza el usuario
  * */
  public updateUser(users: Users) {
    const id = users.id || users.userUuid;
    const url = `${environment.apiGpsUrl}/users/${id}`;
    return this.http.patch(url, users, this.getHeaders()).toPromise();
  }

  /**
   * Elimina un usuario
   * @param id - ID del usuario a eliminar
   * @returns Observable con la respuesta de la función
   */
  public deleteUser(id: string | number): Observable<any> {
    const url = `${environment.apiGpsUrl}/users/${id}`;
    return this.http.delete(url, this.getHeaders());
  }


  /**
   * Actualiza el estado del vehiculo (ahora dispositivo)
   * */
  public updateVehicleState(vehicle: any) {
    const id = vehicle.id || vehicle.deviceImei;
    const url = `${environment.apiGpsUrl}/devices/${id}`;
    return this.http.patch(url, vehicle, this.getHeaders()).toPromise();
  }

  /**
   * Obtiene conductores activos
   * */
  public getActiveDrivers() {
    const url = `${environment.apiGpsUrl}/users?userCurrentRole=9`;
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data || res)
    );
  }

  public updateUserBatch(user: Users): Promise<any> {
    const id = user.id || user.userUuid;
    const url = `${environment.apiGpsUrl}/users/${id}`;
    return this.http.patch(url, user, this.getHeaders()).toPromise();
  }

  public searchUsersByProfile(
    searchTerm: string,
    userCurrentRole: number | null,
    pageSize: number = 25
  ): Observable<Users[]> {
    let url = `${environment.apiGpsUrl}/users?$limit=${pageSize}&userFullName[$like]=%${searchTerm}%`;
    if (userCurrentRole !== null) {
      url += `&userCurrentRole=${userCurrentRole}`;
    }
    return this.http.get<any>(url, this.getHeaders()).pipe(
      map(res => res.data)
    );
  }

}
