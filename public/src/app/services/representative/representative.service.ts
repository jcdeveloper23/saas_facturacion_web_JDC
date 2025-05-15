import {Injectable} from '@angular/core';
import {AngularFirestore} from '@angular/fire/firestore';
import {Representative} from 'app/interfaces/representative';

@Injectable({
  providedIn: 'root'
})
export class RepresentativeService {

  constructor(private db: AngularFirestore) {
  }

  public getRepresentativeId(representative_id: string) {

    return this.db.collection('representatives').doc(`${representative_id}`).valueChanges()
  }

  public getRepresentativeIdentification(representative_identification: string) {
    return this.db.collection('representatives', ref => ref.where('representative_identification', '==', representative_identification)).valueChanges()
  }

  public getRepresentativesBySchoolsAtive(school_id: string) {
    return this.db.collection('representatives', ref => ref.where('representative_schools', 'array-contains', school_id).where('representative_state', '==', true)).valueChanges()
  }

  public getRepresentativeBySchoolAll(school_id: string) {
    return this.db.collection('representatives', ref => ref.where('representative_schools', 'array-contains', school_id)).valueChanges()
  }

  public saveRepresentative(representative: Representative) {
    return this.db.collection('representatives').doc(`${representative.representative_id}`).set(representative);
  }

  public saveRepresentativeImport(representative: Representative) {
    this.saveEmailRepresentative(representative);
    return this.db.collection('representatives').doc(`${representative.representative_id}`).set(representative);
  }

  public updateRepresentative(representative: Representative) {
    return this.db.collection('representatives').doc(`${representative.representative_id}`).update(representative);
  }

  public saveEmailRepresentative(representative: Representative) {
    return this.db.collection('emails_representatives').doc(`${representative.representative_id}`).set(representative);
  }

  public getRepresentativeIdSendEmail(representative_id: string) {
    return this.db.collection('emails_representatives').doc(`${representative_id}`).valueChanges()

  }

  public updateEmailRepresentative(representative: Representative) {
    return this.db.collection('emails_representatives').doc(`${representative.representative_id}`).update(representative);
  }

  public getAllRepresentatives() {
    return this.db.collection('representatives').valueChanges()
  }

  public getRepresentativeStateFalse(school_id: string) {
    // return this.db.collection('representatives' , ref => ref.where('representative_state_confirm_by_bar' , '==' , false).where('representative_request_access_state', '==', 2).where('representative_schools', 'array-contains', school_id)).valueChanges();
    return this.db.collection('representatives', ref => ref.where('representative_state_confirm_by_bar', '==', false).where('representative_schools', 'array-contains', school_id)).valueChanges();
  }
}
