import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Coupon } from 'app/interfaces/coupon';

@Injectable({
  providedIn: 'root'
})
export class CouponsService {

  constructor(private db: AngularFirestore) { }

  /**
   * Metodo para registrar un nuevo grupo 
   * @param provider_id 
   * @param line_id 
   * @param coupon 
   * @returns 
   */
  public saveCoupon( coupon : Coupon) {
    return this.db.collection('coupons').doc(`${coupon.coupon_code}`).set(coupon)
  }

    /**
   * Metodo para actualizar un nuevo grupo 
   * @param provider_id 
   * @param line_id 
   * @param coupon 
   * @returns 
   */
     public updateCoupon( coupon : Coupon) {
      return this.db.collection('coupons').doc(`${coupon.coupon_code}`).update(coupon)
    }

  /**
   * Metodo para consultar de base de datos los grupos pertenecientes a una linea
   * @param provider_id 
   * @param line_id 
   * @returns 
   */
  public getCoupons(provider_id: String) {
    return this.db.collection('coupons', ref => ref.where('coupon_provider_id', '==', provider_id)).valueChanges()
  }

  /**
   * Metodo para eliminar un grupo especifico
   * @param provider_id 
   * @param line_id 
   */
  public deleteCoupon( coupon_id: string) {
     this.db.collection('coupons').doc(`${coupon_id}`).delete()

  }
}
