import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Users } from 'app/interfaces/users';

@Injectable({
  providedIn: 'root'
})
export class RechargesService {

  constructor(
    private db: AngularFirestore
  ) { }

  public getRecharges() {
    return this.db.collection<Recharges>('recharges').valueChanges();
  }

  public getRechargesByID(id: string) {
    return this.db.collection<Recharges>('recharges', ref => ref.where('rechargesId', '==', id)).valueChanges()
  }


  public getRechargesByStatus(status: string) {
    return this.db.collection<Recharges>('recharges', ref => ref.where('rechargeStatus', '==', status)).valueChanges()
  }

  saveRecharges(recharges: Recharges) {
    return this.db.collection('recharges').doc(recharges.rechargeId).set(recharges);
  }

  editRecharges(recharges: Recharges) {
    return this.db.collection('recharges').doc(recharges.rechargeId).update(recharges);
  }

  editRechargesInUsers(recharges: Recharges) {
    return this.db.collection('users').doc(recharges.rechargeUserUid).collection('recharges').doc(recharges.rechargeId).update(recharges);
  }

  public getUserByUid(uid: string) {
    return this.db.collection<Users>('users').doc(`${uid}`).valueChanges();

    // const user = this.db.collection('users').doc(`${uid}`).valueChanges();
    // console.log('*** ***', JSON.stringify(user, null, 3));
    // return user
  }

  editCreditBalanceUsers(recharges: Recharges) {
    return this.db.collection('users').doc(recharges.rechargeUserUid).collection('recharges').doc(recharges.rechargeId).update(recharges);
  }

      /**
   * Actualiza el estado del usuario para bloquear el acceso
   * */
  public updateUser(users, userUid) {
    return this.db.collection('users').doc(userUid).update(users);
  }

  /**
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteRecharges(rechargesId: string) {
    return this.db.collection('recharges').doc(rechargesId).delete();
  }

  public saveProvinces(id, data) {
    return this.db.collection('statesOfVenezuela').doc(id.toString()).set(data);
  }

  public getProvinces() {
    return this.db.collection('statesOfVenezuela').valueChanges();
  }
}
