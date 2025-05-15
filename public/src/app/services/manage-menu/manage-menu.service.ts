import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Menu } from 'app/interfaces/menu';
import { Provider } from 'app/interfaces/provider';

@Injectable({
  providedIn: 'root'
})
export class ManageMenuService {

  constructor(private db: AngularFirestore) { }

  public saveMenu(menu : Menu) {
      return this.db.collection('menu').doc(`${menu.menu_provider_id}`).collection('menu_list').doc(`${menu.menu_id}`).set(menu);
  }

  public getMenuProviderId(provider_id : string) {
    return this.db.collection('menu').doc(`${provider_id}`).valueChanges()
  }

  public setProviderIdInMenu(provider_id : string) {
    let provider: Provider = {
      provider_id :provider_id
    };
    return this.db.collection('menu').doc(`${provider_id}`).set(provider)
  }

  public getEventsMenu(provider_id : string, dateStart : string , datend: string) {
    return this.db.collection('menu').doc(`${provider_id}`).collection('menu_list', ref => ref.where('menu_date', '>=',dateStart).where('menu_date', '<=',datend)).valueChanges();
  }

  public getEventsMenuStart(provider_id : string, dateStart : string ) {
    return this.db.collection('menu').doc(`${provider_id}`).collection('menu_list', ref => ref.where('menu_date', '>=',dateStart)).valueChanges();
  } 
  public deleteMenu(menu : Menu) {
    return this.db.collection('menu').doc(`${menu.menu_provider_id}`).collection('menu_list').doc(`${menu.menu_id}`).delete();
  }
}
