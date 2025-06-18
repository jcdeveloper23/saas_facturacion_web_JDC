import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Levels } from 'app/interfaces/levels';
import { Parallels } from 'app/interfaces/parallels';
import { School } from 'app/interfaces/school';
@Injectable({
  providedIn: 'root'
})
export class SchoolService {

  constructor(
    private db: AngularFirestore
  ) { }

  /**
   * *** Retorna las unidades educativas ***
   * @returns 
   */
  public getSchools() {
    return this.db.collection('school').valueChanges()
  }

  /**
   * *** Retorna una unidade educativa por id ***
   * @returns
   */
  public getSchoolsById(schoolId) {
    return this.db.collection('school', ref => ref.where('school_id', '==', schoolId)).valueChanges()
  }

  /**
   * *** Retorna las unidades educativas activas ***
   * @returns
   */
  public getSchoolsByState() {
    return this.db.collection('school', ref => ref.where('school_state', '==', true)).valueChanges()
  }

  /**
   * *** Guarda la UE en la DB ***
   * @param school 
   * @returns 
   */
  public saveSchool(school: School) {
    return this.db.collection('school').doc(`${school.school_id}`).set(school)
  }

  /**
   * Metodo para actualizar en base de datos una unidad educativa, modificar o editar
   * @param school_id 
   * @param school
   * @returns 
   */
  public editSchool(school: School) {
    return this.db.collection('school').doc(`${school.school_id}`).update(school)
  }

  /**
   * *** Elimina una UE ***
   * @param school 
   * @returns 
   */
  public deleteSchool(school: School) {
    return this.db.collection('school').doc(school.school_id).delete();
  }


  public getSchoolsLevel (school: School) {
    return this.db.collection('levels', ref => ref.where('level_id_school', '==', school.school_id)).valueChanges()
    
  }

  public getSchoolParallels (level_id: String) {
    return this.db.collection('parallels', ref => ref.where('parallel_level_id', '==', level_id)).valueChanges()

  }

  public saveLevel (level: Levels) {
    return this.db.collection('levels').doc(`${level.level_id}`).set(level)
  }

  public deleteLevel (level: Levels) {
    return this.db.collection('levels').doc(`${level.level_id}`).delete();

  }

  public editLevel (level: Levels) {
    return this.db.collection('levels').doc(`${level.level_id}`).update(level)
  }

  public saveParallel (parallel: Parallels) {
    return this.db.collection('parallels').doc(`${parallel.parallel_id}`).set(parallel);

  }

  public deleteParallel (parallel: Parallels) {
    return this.db.collection('parallels').doc(`${parallel.parallel_id}`).delete();

  }
}


