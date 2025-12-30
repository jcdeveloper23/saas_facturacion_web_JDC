import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class RequestVehicleService {

  constructor(
    private db: AngularFirestore
  ) { }

  /**
   * Obtiene todas las solicitudes de vehículos
   */
  public getAllRequests() {
    return this.db.collection<any>('requestVehicle').valueChanges();
  }

  /**
   * Obtiene solicitudes filtradas por estado
   * @param status Estado de la solicitud (activa, en proceso, completada, cancelada)
   */
  public getRequestsByStatus(status: string) {
    return this.db.collection<any>('requestVehicle', ref =>
      ref.where('requestStatus', '==', status)
    ).valueChanges();
  }

  /**
   * Obtiene solicitudes activas y en proceso
   */
  public getActiveRequests() {
    return this.db.collection<any>('requestVehicle', ref =>
      ref.where('requestStatus', 'in', ['activa', 'active', 'en proceso', 'in_process'])
    ).valueChanges();
  }

  /**
   * Obtiene una solicitud específica por ID
   */
  public getRequestById(requestId: string) {
    return this.db.collection<any>('requestVehicle').doc(requestId).valueChanges();
  }

  /**
   * Actualiza el estado de una solicitud
   */
  public updateRequestStatus(requestId: string, status: string) {
    return this.db.collection('requestVehicle').doc(requestId).update({
      requestStatus: status,
      updatedAt: new Date()
    });
  }

  /**
   * Obtiene solicitudes de un usuario específico
   */
  public getRequestsByUser(userUid: string) {
    return this.db.collection<any>('requestVehicle', ref =>
      ref.where('requestUserUid', '==', userUid)
    ).valueChanges();
  }

  /**
   * Obtiene solicitudes de un conductor específico
   */
  public getRequestsByDriver(driverUid: string) {
    return this.db.collection<any>('requestVehicle', ref =>
      ref.where('requestDriverUid', '==', driverUid)
    ).valueChanges();
  }
  /**
   * Obtiene solicitudes filtradas por múltiples criterios a nivel de base de datos
   * @param statusList Lista de estados a filtrar
   * @param startDate Fecha inicial (opcional)
   * @param endDate Fecha final (opcional)
   * @param limit Cantidad máxima de resultados (opcional, por defecto 50)
   */
  public getFilteredRequests(statusList?: string[], startDate?: Date, endDate?: Date, limit: number = 50) {
    return this.db.collection<any>('requestVehicle', ref => {
      let query: any = ref;

      if (statusList && statusList.length > 0) {
        query = query.where('requestStatusTrip', 'in', statusList);
      }

      // El filtrado por fecha en Firestore requiere que el campo sea un Timestamp
      if (startDate) {
        query = query.where('requestFullDate', '>=', startDate);
      }
      if (endDate) {
        query = query.where('requestFullDate', '<=', endDate);
      }

      query = query.orderBy('requestFullDate', 'desc');

      if (limit) {
        query = query.limit(limit);
      }

      return query;
    }).valueChanges();
  }

  /**
   * Versión de carga única (no listener) de solicitudes filtradas
   */
  public getFilteredRequestsOnce(statusList?: string[], startDate?: Date, endDate?: Date, limit: number = 50) {
    return this.getFilteredRequests(statusList, startDate, endDate, limit).pipe(take(1));
  }
}
