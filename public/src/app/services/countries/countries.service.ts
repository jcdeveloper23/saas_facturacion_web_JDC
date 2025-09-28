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
    return this.db.collection<Country>('countries').valueChanges();
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
