import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

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
}
