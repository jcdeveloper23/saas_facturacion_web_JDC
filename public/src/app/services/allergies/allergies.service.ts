import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class AllergiesService {


  constructor(
    private db: AngularFirestore
  ) { }

  public getAllergies() {
    return this.db.collection<Allergies>('allergies').valueChanges();
  }


  public getAllergiesByStudent(studentId: string) {
    return this.db.collection<Allergies>('allergies', ref => ref.where('allergiesName', '==', studentId)).valueChanges();
  }

  public getAllergiesByName(allergies: string) {
    return this.db.collection<Allergies>('allergies', ref => ref.where('allergiesName', '==', allergies)).valueChanges();
  }

  saveAllergies(allergies: Allergies) {
    return this.db.collection('allergies').doc(allergies.allergiesId).set(allergies);
  }
  editAllergies(allergies: Allergies) {
    return this.db.collection('allergies').doc(allergies.allergiesId).update(allergies);
  }

  /**
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteAllergies(allergiesId: string) {
    return this.db.collection('allergies').doc(allergiesId).delete();
  }
}
