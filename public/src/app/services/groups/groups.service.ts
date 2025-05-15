import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Group } from 'app/interfaces/group';

@Injectable({
  providedIn: 'root'
})
export class GroupsService {

  constructor(private db: AngularFirestore) { }

  /**
   * Metodo para registrar un nuevo grupo 
   * @param provider_id 
   * @param line_id 
   * @param group 
   * @returns 
   */
  public saveGroup( group : Group) {
    return this.db.collection('groups').doc(`${group.group_code}`).set(group)
  }

    /**
   * Metodo para actualizar un nuevo grupo 
   * @param provider_id 
   * @param line_id 
   * @param group 
   * @returns 
   */
     public updateGroup( group : Group) {
      return this.db.collection('groups').doc(`${group.group_code}`).update(group)
    }

  /**
   * Metodo para consultar de base de datos los grupos pertenecientes a una linea
   * @param provider_id 
   * @param line_id 
   * @returns 
   */
  public getGroups(line_id: string) {
    return this.db.collection('groups', ref => ref.where('group_line ', '==' , line_id)).valueChanges()
  }

  /**
   * Metodo para eliminar un grupo especifico
   * @param provider_id 
   * @param line_id 
   */
  public deleteGroup( group_id: string) {
     this.db.collection('groups').doc(`${group_id}`).delete()

  }
}
