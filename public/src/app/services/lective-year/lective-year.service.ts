import {Injectable} from '@angular/core';
import {AngularFirestore} from '@angular/fire/firestore';
import {LectiveYear} from '../../interfaces/lective_year';

@Injectable({
  providedIn: 'root'
})
export class LectiveYearService {

  constructor(private db: AngularFirestore) {}

  /**
   * Obtiene todos los periodos lectivos
   * No realtime
   * @param schoolId
   * */
  public getAllLectiveYearFromSchool(schoolId: string) {
    return this.db.collection('school').doc(schoolId).collection('lective_year').get();
  }

  /**
   * *** Agrega año lectivo ***
   * @param lectiveYear
   * @returns
   */
  public saveLectiveYear(lectiveYear: LectiveYear, schoolId: string) {
    lectiveYear.lective_year_id = Date.now().toString();
    return this.db.collection('school').doc(schoolId).collection('lective_year').doc(lectiveYear.lective_year_id).set(lectiveYear);
  }

  /**
   * Metodo para actualizar en base de datos el año lectivo, modificar o editar
   * @param lectiveYear
   * @returns
   */
  public editLectiveYear(lectiveYear: LectiveYear, schoolId: string) {
    return this.db.collection('school').doc(schoolId).collection('lective_year').doc(lectiveYear.lective_year_id).update(lectiveYear);
  }

  /**
   * *** Elimina año lectivo ***
   * @param lectiveYear
   * @returns
   */
  public deleteLectiveYear(lectiveYear: LectiveYear, schoolId: string) {
    return this.db.collection('school').doc(schoolId).collection('lective_year').doc(lectiveYear.lective_year_id).delete();
  }
}
