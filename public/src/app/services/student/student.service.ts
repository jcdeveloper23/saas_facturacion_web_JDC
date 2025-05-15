import { Representative } from 'app/interfaces/representative';
import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Student } from 'app/interfaces/student';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
 

  constructor(private db: AngularFirestore) {}

  public saveStudent(student: Student) {
    return this.db.collection('students').doc(`${student.student_id}`).set(student);
  }

  public updateStudent(student: Student) {
    return this.db.collection('students').doc(`${student.student_id}`).update(student);
  }

  public updateRep(representative: Representative) {
    return this.db.collection('representatives').doc(`${representative.representative_id}`).update(representative);
  }


  public getStudentsByRepresentativeActives(representative_id: string) {
    return this.db.collection('students', ref => ref.where('student_id_representative' , '==' , representative_id).where('student_state' , '==' , true)).valueChanges()
  }

  public getStudentsByRepresentative(representative_id: string) {
    return this.db.collection('students', ref => ref.where('student_id_representative' , '==' , representative_id)).valueChanges()
    // return this.db.collection('students', ref => ref.where('student_state_register' , '==' , true).where('student_id_representative' , '==' , representative_id)).valueChanges()
  }

  public getStudentsBySchoolActives(school_id: string) {
    return this.db.collection('students', ref => ref.where('student_id_school' , '==' , school_id).where('student_state' , '==' , true)).valueChanges()
  }

  public getStudentsBySchool(school_id: string) {
    // return this.db.collection('students', ref => ref.orderBy('student_name')).valueChanges()

    return this.db.collection('students', ref => ref.where('student_state_register' , '==' , true).where('student_id_school' , '==' , school_id)).valueChanges()
  }

  public getAllStudents() {
    return this.db.collection('students', ref => ref.where('student_state_register' , '==' , true)).valueChanges()

  }

  public deleteStudent(student: Student) {
    return this.db.collection('students').doc(`${student.student_id}`).delete()
  }

  public getStudentById(student: Student) {
    return this.db.collection('students').doc(`${student.student_id}`).valueChanges();
  }

  public getStudentByIdScanner(student_id: Student) {
    return this.db.collection('students').doc(`${student_id}`).valueChanges();
  }

  public getStudentId(student_id : string) {
    return this.db.collection('students').doc(`${student_id}`).valueChanges();
  }

  public getOrdersPendingByStudent(student_id : string) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders', ref => ref.where('order_state', '==', false).orderBy("order_date", "desc")).valueChanges();
  }
 
  public getOrdersDeliveredByStudent(student_id : string) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders', ref => ref.where('order_state', '==', true).orderBy("order_date", "desc")).valueChanges();
  }
  public getProductDeliveredByStudent (student_id: string){
    return  this.db.collection('students').doc(`${student_id}`).collection('products', ref => ref.where('product_state_in_order', '==', true)).valueChanges();
  }
  
  public getStudentsRequest(school_id : string) {
    return this.db.collection('students' , ref => ref.where('student_state_register' , '==' , false).where('student_id_school', '==', school_id)).valueChanges();
  }

  
}
