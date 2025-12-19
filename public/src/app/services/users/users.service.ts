import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { HttpClient } from '@angular/common/http';
import { Users } from 'app/interfaces/users';
import { Vehicle } from 'app/interfaces/vehicle';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
    return this.db.collection('vehicles', ref => ref.where('vehicleUserUid', '==', userUid)).snapshotChanges()
      .pipe(
        map(actions => actions.map(a => {
          const data = a.payload.doc.data() as Vehicle;
          const vehicleId = a.payload.doc.id;
          return { ...data, vehicleId };
        }))
      );
  }

  public getAllUsers() {
    return this.db.collection('users').valueChanges();
  }

  /**
   * Obtiene un usuario por su ID (una vez)
   * @param userId - UID del usuario
   * @returns Observable con los datos del usuario
   */
  public getUserById(userId: string): Observable<Users> {
    return this.db.collection('users').doc<Users>(userId).valueChanges()
      .pipe(
        map(user => {
          if (user) {
            return { ...user, userUid: userId };
          }
          return null;
        })
      );
  }

  /**
   * Obtiene un usuario por su ID en tiempo real (listener)
   * @param userId - UID del usuario
   * @returns Observable con los datos del usuario que se actualiza en tiempo real
   */
  public getUserByIdRealtime(userId: string): Observable<Users> {
    return this.db.collection('users').doc<Users>(userId).snapshotChanges()
      .pipe(
        map(doc => {
          if (doc.payload.exists) {
            const data = doc.payload.data() as Users;
            return { ...data, userUid: doc.payload.id };
          }
          return null;
        })
      );
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
    console.log(`[UsersService] updateVehicleState called.`);
    console.log(`[UsersService] Target Document ID: ${vehicle.vehicleId}`);
    console.log(`[UsersService] Payload:`, JSON.stringify(vehicle, null, 2));

    if (!vehicle.vehicleId) {
      console.error('[UsersService] CRITICAL ERROR: vehicleId is missing!');
      throw new Error('vehicleId is missing');
    }

    return this.db.collection('vehicles').doc(vehicle.vehicleId).update(vehicle)
      .then(() => console.log(`[UsersService] Update SUCCESS for ${vehicle.vehicleId}`))
      .catch(err => console.error(`[UsersService] Update FAILED for ${vehicle.vehicleId}`, err));
  }

  /**
   * Elimina un vehículo por ID
   */
  public deleteVehicle(vehicleId: string): Promise<void> {
    console.log(`[UsersService] Deleting vehicle: ${vehicleId}`);
    return this.db.collection('vehicles').doc(vehicleId).delete();
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
