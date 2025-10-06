import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class AppVersionsService {

  constructor(
    private db: AngularFirestore
  ) { }

  public getAppVersions() {
    return this.db.collection<AppVersions>('appVersions').valueChanges();
  }

  public getAppVersionsByID(id: string) {
    return this.db.collection<AppVersions>('appVersions', ref => ref.where('appVersionsId', '==', id)).valueChanges()
  }

  saveAppVersions(appVersions: AppVersions) {
    return this.db.collection('appVersions').doc(appVersions.appVersionsId).set(appVersions);
  }

  editAppVersions(appVersions: AppVersions) {
    return this.db.collection('appVersions').doc(appVersions.appVersionsId).update(appVersions);
  }

  /**
  * *** Delete company ***
  * @param userId
  * @returns 
  */
  public deleteAppVersions(appVersionsId: string) {
    return this.db.collection('appVersions').doc(appVersionsId).delete();
  }

  public saveProvinces(id, data) {
    return this.db.collection('statesOfVenezuela').doc(id.toString()).set(data);
  }

  public getProvinces() {
    return this.db.collection('statesOfVenezuela').valueChanges();
  }
}
