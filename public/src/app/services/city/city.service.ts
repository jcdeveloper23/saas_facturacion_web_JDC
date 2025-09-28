/**
 * @author Cristian Guillen <cristiangp150193@gmail.com>
 * */

import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFireAuth } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class CityService {

  constructor(
    public db: AngularFirestore,
  ) {
  }

  public getCities() {
    return this.db.collection<City>('cities').valueChanges();
  }

  public getCity(city: string) {
    return this.db.collection<City>('cities', ref => ref.where('cityName', '==', city)).valueChanges();
  }

  saveCity(city: City) {
    return this.db.collection('cities').doc(city.cityId).set(city);
  }
  editCity(city: City) {
    return this.db.collection('cities').doc(city.cityId).update(city);
  }

  /**
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteCity(cityId: string) {
    return this.db.collection('cities').doc(cityId).delete();
  }
}
