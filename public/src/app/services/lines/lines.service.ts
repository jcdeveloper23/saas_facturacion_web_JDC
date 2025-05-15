import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Lines } from 'app/interfaces/lines';

@Injectable({
  providedIn: 'root'
})
export class LinesService {

  constructor(private db: AngularFirestore) { }

  /**
   * Metodo para registrar en base de datos una nueva linea.
   * @param provider_id 
   * @param line 
   * @returns 
   */
  public saveLine( line : Lines) {
    return this.db.collection('lines').doc(`${line.category_id}`).set(line)
  }

  /**
   * Metodo para actualizar en base de datos una  linea especifica.
   * @param provider_id 
   * @param line 
   * @returns 
   */
   public updateLine( line : Lines) {
    return this.db.collection('lines').doc(`${line.category_id}`).update(line)
  }

  /**
   * Metodo para consultar lista de lineas creadas.
   * @param provider_id 
   * @param line 
   * @returns 
   */
  public getLinesByProvider(provider_id: string) {
    return this.db.collection('lines', ref => ref.where('category_provider_id' , '==' , provider_id)).valueChanges()
  }

  public getLinesActive(provider_id: string) {
    return this.db.collection('lines', ref => ref.where('category_provider_id' , '==' , provider_id).where('category_state' , '==' , true)).valueChanges()
  }
  /**
   *  Metodo para eiminar linea seleccionada.
   * @param provider_id 
   * @returns 
   */
  public deleteLine( line : Lines) {
    return this.db.collection('lines').doc(`${line.category_id}`).delete()
  }

  public getLineById(line_id: string) {
    return this.db.collection('lines').doc(`${line_id}`).valueChanges();
  }

  public getCategoryMenuByProviderId(provider_id: string) {
    return this.db.collection('lines', ref => ref.where('category_provider_id', '==' , provider_id).where('category_state', '==', true).where('category_is_menu' , '==' , true)).valueChanges()
  }
}
