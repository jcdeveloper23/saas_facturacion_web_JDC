import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class PaymentMethodsService {

  constructor(
    private db: AngularFirestore
  ) { }

  /**
   * *** Get all PaymentMethods ***
   * @returns 
   */
  public getPaymentMethods() {
    return this.db.collection<PaymentMethod>('paymentMethod').valueChanges();
  }

  /**
   * *** Get PaymentMethods actives ***
   * @returns
   */
  public getPaymentMethodsByState() {
    return this.db.collection('paymentMethod', ref => ref.where('paymentMethodState', '==', true)).valueChanges()
  }

  /**
   * *** Save paymentMethod ***
   * @param paymentMethod 
   * @returns 
   */
  public savePaymentMethod(paymentMethod: PaymentMethod) {
    return this.db.collection('paymentMethod').doc(`${paymentMethod.paymentMethodId}`).set(paymentMethod)
  }

  /**
   * *** Edit paymentMethod ***
   * @param paymentMethod
   * @returns 
   */
  public editPaymentMethod(paymentMethod: PaymentMethod) {
    return this.db.collection('paymentMethod').doc(`${paymentMethod.paymentMethodId}`).update(paymentMethod)
  }
  public editPaymentMethodState(paymentMethod: PaymentMethod) {
    return this.db.collection('paymentMethod').doc(`${paymentMethod.paymentMethodId}`).update(paymentMethod)
  }

  /**
   * *** Delete paymentMethod ***
   * @param paymentMethod 
   * @returns 
   */
  public deletePaymentMethod(paymentMethodId: string) {
    return this.db.collection('paymentMethod').doc(paymentMethodId).delete();
  }
}
