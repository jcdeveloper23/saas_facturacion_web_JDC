import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class CountriesService {

 constructor(
     private db: AngularFirestore
   ) { }
 
   public getCountries() {
     return this.db.collection<Country>('countrys').valueChanges();
   }

   public getCountry(country: string) {
    return this.db.collection<Country>('countrys', ref => ref.where('countryName', '==', country)).valueChanges();
  }
 
   saveCountry(country: Country) {
     return this.db.collection('countrys').doc(country.countryId).set(country);
   }
   editCountry(country: Country) {
     return this.db.collection('countrys').doc(country.countryId).update(country);
   }
 
    /**
    * *** Delete company ***
    * @param userId
    * @returns 
    */
     public deleteCountry(countryId: string) {
      return this.db.collection('countrys').doc(countryId).delete();
    }
}
