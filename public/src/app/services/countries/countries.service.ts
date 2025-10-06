import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Users } from 'app/interfaces/users';

@Injectable({
  providedIn: 'root'
})
export class CountriesService {

  constructor(
    private db: AngularFirestore
  ) { }

  public getCountries() {
    return this.db.collection<Country>('countries').valueChanges();
  }

  public getRequest() {
    // return this.db.collection<RequestVehicle>('requestVehicle', ref => ref.limit(50)).valueChanges();
    return this.db.collection<RequestVehicle>('requestVehicle').valueChanges();
  }


  getUsers() {
    return this.db.collection('users').snapshotChanges();
  }

  getUsersByUid(userUid) {
    return this.db.collection('users').doc(userUid).valueChanges();

  }

  
  saveUser(requestDriverUid) {
    return this.db.collection('users').doc(requestDriverUid).set({
      'usuario': requestDriverUid
    });
  }

  public deleteUser(userUid: string, requestId) {
    var path = `users/${userUid}/requestVehicle/${requestId}`;
    console.log('*** pathDelete ***', path);
    

    return this.db.collection('users').doc(userUid).collection('requestVehicle').doc(requestId).delete();
  }

  // deleteAllUsers() {
  //   return this.db.collection('users').get().toPromise().then(snapshot => {
  //     const batch = this.db.firestore.batch();
  //     snapshot.forEach(doc => batch.delete(doc.ref));
  //     return batch.commit();
  //   });
  // }

  restoreUsers(users: Users[]) {
    return;
    const batch = this.db.firestore.batch();
    users.forEach(user => {
            console.log(`*** restaurando ${user.userUid} ***`);

      
      const { userUid, ...data } = user;
      const ref = this.db.collection('users').doc(userUid).ref;
      batch.set(ref, data);
    });
    return batch.commit();
  }


  saveRequestInUser(requestDriverUid, requestVehicle) {
    return this.db.collection('users').doc(requestDriverUid).collection('requestVehicle').doc(requestVehicle.requestId).set(requestVehicle);
  }

  public getCountry(country: string) {
    return this.db.collection<Country>('countries', ref => ref.where('countryName', '==', country)).valueChanges();
  }

  saveCountry(country: Country) {
    return this.db.collection('countries').doc(country.countryId).set(country);
  }
  editCountry(country: Country) {
    return this.db.collection('countries').doc(country.countryId).update(country);
  }

  /**
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteCountry(countryId: string) {
    return this.db.collection('countries').doc(countryId).delete();
  }
}
