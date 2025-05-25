import { Representative } from 'app/interfaces/representative';
import { Injectable } from '@angular/core';
import { AngularFirestore, QueryFn, Query } from '@angular/fire/firestore';
import { Student } from 'app/interfaces/student';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Orders } from 'app/interfaces/orders';

@Injectable({
  providedIn: 'root'
})
export class StudentService {


  constructor(private db: AngularFirestore) { }

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
    return this.db.collection('students', ref => ref.where('student_id_representative', '==', representative_id).where('student_state', '==', true)).valueChanges()
  }

  public getStudentsByRepresentative(representative_id: string) {
    return this.db.collection('students', ref => ref.where('student_id_representative', '==', representative_id)).valueChanges()
    // return this.db.collection('students', ref => ref.where('student_state_register' , '==' , true).where('student_id_representative' , '==' , representative_id)).valueChanges()
  }

  public getStudentsBySchoolActives(school_id: string) {
    return this.db.collection('students', ref => ref.where('student_id_school', '==', school_id).where('student_state', '==', true)).valueChanges()
  }

  public getStudentsBySchool(school_id: string) {
    // return this.db.collection('students', ref => ref.orderBy('student_name')).valueChanges()

    return this.db.collection('students', ref => ref.where('student_state_register', '==', true).where('student_id_school', '==', school_id)).valueChanges()
  }

  public getAllStudents() {
    return this.db.collection('students', ref => ref.where('student_state_register', '==', true)).valueChanges()

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

  public getStudentId(student_id: string) {
    return this.db.collection('students').doc(`${student_id}`).valueChanges();
  }

  public getOrdersPendingByStudent(student_id: string) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders', ref => ref.where('order_state', '==', false).orderBy("order_date", "desc")).valueChanges();
  }

  public getOrdersDeliveredByStudent(student_id: string) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders', ref => ref.where('order_state', '==', true).orderBy("order_date", "desc")).valueChanges();
  }
  public getProductDeliveredByStudent(student_id: string) {
    return this.db.collection('students').doc(`${student_id}`).collection('products', ref => ref.where('product_state_in_order', '==', true)).valueChanges();
  }

  public getStudentsRequest(school_id: string) {
    return this.db.collection('students', ref => ref.where('student_state_register', '==', false).where('student_id_school', '==', school_id)).valueChanges();
  }

  getOrdersPendingByStudentPaginated(
    student_id: string,
    filters: {
      estadoPago?: string;
      estadoOrden?: string;
      fechaDesde?: Date;
      fechaHasta?: Date;
    },
    pageSize: number,
    startAfterDoc?: any // El documento desde donde continuar la paginación
  ): Observable<any[]> {
    let queryFn: QueryFn = ref => {
      let q: Query = ref;

      if (filters.estadoOrden !== undefined) {
        q = q.where('order_state', '==', filters.estadoOrden);
      }

      if (filters.estadoPago !== undefined) {
        q = q.where('order_state_payment_method_string', '==', filters.estadoPago);
      }

      if (filters.fechaDesde) {
        q = q.where('order_date', '>=', filters.fechaDesde);
      }

      if (filters.fechaHasta) {
        q = q.where('order_date', '<=', filters.fechaHasta);
      }

      q = q.orderBy('order_date', 'desc').limit(pageSize);

      if (startAfterDoc) {
        q = q.startAfter(startAfterDoc);
      }

      return q;
    };

    return this.db
      .collection(`students/${student_id}/orders`, queryFn)
      .snapshotChanges()
      .pipe(
        map(actions => {
          return actions.map(a => {
            const data = a.payload.doc.data();
            const id = a.payload.doc.id;
            return { id, ...(data as any) };
          });
        })
      );
  }

  getOrdersPendingByStudentPaginatedFilter(studentId: string, filters: any, lastDoc: any = null, pageSize: number = 10) {
    console.log(JSON.stringify({studentId, filters, lastDoc, pageSize}, null , 3));

    return this.db.collection(`students/${studentId}/orders`, ref => {
      let query: firebase.default.firestore.CollectionReference | firebase.default.firestore.Query = ref;

      // query = query.where('order_state', '==', false);

      if (filters.startDate && filters.endDate) {
        query = query
          .where('order_date_full', '>=', filters.startDate)
          .where('order_date_full', '<=', filters.endDate);
      }

      // if (filters.status && filters.status !== 'Todos') {
      //   query = query.where('order_delivery_state_string', '==', filters.status);
      // }

      // if (filters.paymentStatus && filters.paymentStatus !== 'Todos') {
      //   query = query.where('order_state_payment_method_string', '==', filters.paymentStatus);
      // }

      // if (filters.startDate && filters.endDate) {
      //   query = query.where('order_date', '>=', filters.startDate).where('order_date', '<=', filters.endDate);
      // }

      // query = query.orderBy('order_date', 'desc').limit(pageSize);

      // if (lastDoc) {
      //   query = query.startAfter(lastDoc);
      // }

      return query;
    }).get().pipe(
      map(snapshot => {
        const docs = snapshot.docs;
        const data = docs.map(doc => ({ id: doc.id, ...doc.data() as Orders }));
        return { data, lastDoc: docs.length > 0 ? docs[docs.length - 1] : null };
      })
    );
  }



}
