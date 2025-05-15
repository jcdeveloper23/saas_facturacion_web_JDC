import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { Orders } from 'app/interfaces/orders';
import { Product } from 'app/interfaces/product';
import { ObjectType } from 'typescript';

@Injectable({
  providedIn: 'root'
})
export class OrdersService {

  constructor(private db: AngularFirestore) { }

  public saveOrderInProvider(order : Orders) {
    return this.db.collection('providers').doc(`${order.order_provider_id}`).collection('orders').doc(`${order.order_transaccion_id}`).set(order);
  }

  public saveProductInOrder(order_id : string,provider_id : string ,product : Product ) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).collection('products').doc(`${product.product_id_transaction}`).set(product)
  }

  public saveDetailsPaymentInProvider(order_id: string, provider_id: string, response: any, infoUser: any) {
    response.infoUser = infoUser;
    this.db.collection('email_pay_success').doc(`${order_id}`).set(response);
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).collection('details_payment').doc(`${response.transaction.id}`).set(response);
  }

  public setDataTest(dataTestResponse, order, infoUser) {
    dataTestResponse.infoUser = infoUser;
    this.db.collection('email_pay_success').doc(`${dataTestResponse['transaction']['id']}`).set(dataTestResponse);
  }
  

  public saveOrderInStudent(student_id : string, order : Orders) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').doc(`${order.order_transaccion_id}`).set(order)
  }

  public getOrdersByStudent(student_id : string) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').valueChanges()
  }
  public getOrdersByProviderInStatusFalse(provider_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_state' , '==' , false).where('order_state_payment_method' , '==' , true )).valueChanges()
  }

  public getOrdersProductsByProvider(provider_id : string , order_transaccion_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_transaccion_id}`).collection('products').valueChanges()
  }

  public getOrdersProductsByProviderByProductId(provider_id : string , order_transaccion_id : string, product_id: string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_transaccion_id}`).collection('products').doc(`${product_id}`).valueChanges()
  }

  public getOrdersByProviderAndDate(provider_id : string , date: string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_state' , '==' , false).where('order_date' , '==' , date)).valueChanges()
  }
  
  public getOrdersByProviderAndProductsDateStateFalse(provider_id : string, order_id: string , date: string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).collection('products', ref => ref.where('product_order_delivery_date','==',date).where('product_state_in_order', '==', false)).valueChanges()
  }

  public saveProductInOrderInStudent(student_id : string , order_id : string, product : Product) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').doc(`${order_id}`).collection('products').doc(`${product.product_id_transaction}`).set(product);
  }

  public getProductsOfOrderInStudent(student_id : string , order_id : string) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').doc(`${order_id}`).collection('products').valueChanges();
  }

  public updateStatusProductInOrderProvider(provider_id : string ,order_id : string, product_id : string , status_product : Object) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).collection('products').doc(`${product_id}`).update(status_product);
  }

  public updateProductsOfOrderInStudent(student_id : string , order_id : string, product_id : string, status_product : Object) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').doc(`${order_id}`).collection('products').doc(`${product_id}`).update(status_product);
  }

  public updateStateOrderStatusInProvider(provider_id : string ,order_id : string, status_order: Object) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).update(status_order);
  }

  public updateStateOrderStatusInStudent(student_id : string , order_id : string, status_product : Object) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').doc(`${order_id}`).update(status_product);
  }

  public getOrdersByProviderStateTrueWithRangeDate(provider_id : string, dateStart: string , dateEnd: string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_update_state_date','>=',dateStart).where('order_update_state_date' , '<=' , dateEnd).where('order_state', '==', true)).valueChanges()

  }

  public getAllOrdersByProviderStateTrue(provider_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_state', '==', true)).valueChanges()

  }

  public getTotalOrdersReportRange(provider_id : string, dateStart: string , dateEnd: string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_update_state_date','>=',dateStart).where('order_update_state_date' , '<=' , dateEnd)).valueChanges()

  }

  public getTotalOrdersReport(provider_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').valueChanges()

  }

  public getTotalOrdersPendientesByPayToSAProvider(provider_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_state_payment_method', '==', true).where('order_state_payment_to_super_admin', '==', false)).valueChanges()

  }

  public getOrderByIdProviderAndOrder(provider_id : string, order_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).valueChanges()

  }

  public getAllOrdersConfirmationPending(provider_id : string) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders', ref => ref.where('order_state_payment_method', '==' , false).orderBy('order_transaccion_id', 'desc')).valueChanges()

  }

  public updateStatePaymentMethodInProvider(provider_id : string, order_id : string, state: Object) {
    return this.db.collection('providers').doc(`${provider_id}`).collection('orders').doc(`${order_id}`).update(state);

  }

  public updateStatePaymentMethodInStudent(provider_id : string, student_id : string,order_transaccion_id : string ,state: Object) {
    return this.db.collection('students').doc(`${student_id}`).collection('orders').doc(`${order_transaccion_id}`).update(state);

  }
}
