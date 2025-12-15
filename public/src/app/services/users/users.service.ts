import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { HttpClient } from '@angular/common/http';
import { Users } from 'app/interfaces/users';
import { Vehicle } from 'app/interfaces/vehicle';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UsersService {

  constructor(
    private db: AngularFirestore,
    private http: HttpClient
  ) {
  }

  public saveUser(user: Users) {
    return this.db.collection('users').doc(`${user.userUid}`).set(user);
  }

  /**
   * Actualiza el estado del usuario para bloquear el acceso
   * */
  public updateUserState(userUid: string, state: boolean) {
    return this.db.collection('users').doc(userUid).update({ 'userState': state });
  }

  public getUserByEmail(email: string) {
    return this.db.collection('users', ref => ref.where('userEmail', '==', email)).valueChanges();
  }

  public getVehiclesByUser(userUid: string) {
    return this.db.collection('vehicles', ref => ref.where('vehicleUserUid', '==', userUid)).valueChanges();
  }

  public getAllUsers() {
    return this.db.collection('users').valueChanges();
  }

  /**
 * Actualiza el estado del usuario para bloquear el acceso
 * */
  public updateUser(users: Users) {
    return this.db.collection('users').doc(users.userUid).update(users);
  }

  /**
   * Elimina un usuario de forma segura usando Cloud Function
   * - Crea respaldo en colección deleted_users
   * - Elimina credenciales de Firebase Authentication
   * - Elimina documento de Firestore
   * @param userUid - UID del usuario a eliminar
   * @returns Observable con la respuesta de la función
   */
  public deleteUser(userUid: string): Observable<any> {
    console.log('*** Eliminando usuario vía Cloud Function *** ', userUid);

    const url = `${environment.cloudFunctionsUrl}/api/v1/deleteUser`;

    return this.http.post(url, { userUid });
  }


  /**
   * Actualiza el estado del vehiculo
   * */
  public updateVehicleState(userUid: string, vehicle: Vehicle) {
    console.log('*** vehicle *** ', JSON.stringify(vehicle, null, 2));

    return this.db.collection('vehicles').doc(vehicle.vehicleId).update(vehicle);
  }

  /**
   * Obtiene conductores activos con ubicación compartida
   * */
  public getActiveDrivers() {
    return this.db.collection<Users>('users', ref =>
      ref.where('userStateShareLocation', '==', true)
        .where('userRol', '==', 9) // 2 = conductor
    ).valueChanges();
  }

}
