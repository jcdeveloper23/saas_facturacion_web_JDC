import {Injectable} from '@angular/core';
import {AngularFirestore} from '@angular/fire/firestore';
import {Users} from 'app/interfaces/users';
import { Vehicle } from 'app/interfaces/vehicle';

@Injectable({
  providedIn: 'root'
})
export class UsersService {

  constructor(private db: AngularFirestore) {
  }

  public saveUser(user: Users) {
    return this.db.collection('users').doc(`${user.userUid}`).set(user);
  }

  /**
   * Actualiza el estado del usuario para bloquear el acceso
   * */
  public updateUserState(userUid: string, state: boolean) {
    return this.db.collection('users').doc(userUid).update({'userState' : state});
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
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteUser(userUid: string) {
    console.log('*** user.userUid *** ', userUid);
    
    return this.db.collection('users').doc(userUid).delete();
  }


  /**
   * Actualiza el estado del vehiculo
   * */
  public updateVehicleState(userUid: string, vehicle: Vehicle) {
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
