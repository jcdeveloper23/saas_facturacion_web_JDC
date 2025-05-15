import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Provider } from 'app/interfaces/provider';

@Injectable({
  providedIn: 'root'
})
export class ProviderService {

  constructor(private db: AngularFirestore) { }

  /**
   * Metodo para consultar información de un bar en especifico.
   * @param provider_id 
   * 
   */
  public getProviderId(provider_id : string) {
   return this.db.collection('providers').doc(`${provider_id}`).valueChanges()
  }
  public getProviderByRuc(provider : Provider) {
    return this.db.collection('providers', ref => ref.where('provider_ruc', '==', provider.provider_ruc)).valueChanges()
  }
  

 /**
  * *** Actualiza la data de los proveedores ***
  * @param provider 
  * @returns 
  */

  public updateProvider(provider : Provider) {
    return this.db.collection('providers').doc(`${provider.provider_id}`).set(provider);
  }

  /**
   * *** Metodo para agregar un proveedor ***
   * @param provider 
   * @returns 
   */
  public addProvider(provider : Provider) {
    var line_id = new Date().getTime().toString();
    var line = {
      'category_id': line_id, 
      'category_name': 'Menú', 
      'category_state': true, 
      'category_provider_id': provider.provider_id,
      'category_is_menu': true,
    }
    this.db.collection('lines').doc(line_id).set(line);
    return this.db.collection('providers').doc(provider.provider_id).set(provider);
  }

  /**
   * *** Metodo para consultar todos los proveedores ***
   * *** No recibe ningun parametro                  ***
   * *** Por eso los parentesis estan vaios ***
   */
  public getProviders () {
    return this.db.collection<Provider>('providers').valueChanges();

  }

  public deleteProvider (provider: Provider) {
    return this.db.collection('providers').doc(provider.provider_id).delete();
  }

  public activateProvider (provider: Provider, state: boolean) {
    provider.provider_state = state;
    this.db.collection('users').doc(provider.provider_uid).update({user_state: state, user_id_school: provider.provider_id_school});
    return this.db.collection('providers').doc(provider.provider_id).update(provider);
  }

  public getProvidersByUE(ue_id : string) {
    return this.db.collection('providers', ref => ref.where('provider_id_school' , '==' , ue_id)).valueChanges()
  }

  public getProvidersByUEInStateTrue(ue_id : string) {
    return this.db.collection('providers', ref => ref.where('provider_id_school' , '==' , ue_id).where('provider_state' , '==' , true)).valueChanges()
  }

  public getProvidersByUEInStateTruePaymentezTrue(ue_id : string) {
    // return this.db.collection('providers', ref => ref.where('provider_id_school' , '==' , ue_id).where('provider_state' , '==' , true).where('provider_TPP3_EC_CLIENT' , '!=' , null)).valueChanges()
    return this.db.collection('providers', ref => ref.where('provider_id_school' , '==' , ue_id).where('provider_state' , '==' , true)).valueChanges()
  }

  public setNewRegisterProvider(provider: Provider) {
    return this.db.collection('registers_providers').doc(`${provider.provider_id}`).set(provider);
  }

  public saveConfigPaymentez (provider: Provider) {
    return this.db.collection('providers').doc(provider.provider_id).update(provider);
  }
}
