import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class FirestoreExportService {
  constructor(private db: AngularFirestore) {}

  async exportCollectionToJson() {


    
    
    try {
      const providersSnapshot = await this.db.collection('providers').get().toPromise();
      const exportData: any[] = [];

      for (const providerDoc of providersSnapshot?.docs || []) {
        const providerId = providerDoc.id;
        const providerData: any = {
          providerId,
          // ...providerDoc.data(),x
          orders: []
        };

        const ordersSnapshot = await providerDoc.ref.collection('orders').get();

        for (const orderDoc of ordersSnapshot.docs) {
          const orderId = orderDoc.id;
          const orderData: any = {
            orderId,
            ...orderDoc.data()
          };

          // Leer 'products'
          const productsSnapshot = await orderDoc.ref.collection('products').get();
          orderData.products = productsSnapshot.docs.map(productDoc => ({
            id: productDoc.id,
            ...productDoc.data()
          }));

          // Leer 'details_payment'
          const paymentSnapshot = await orderDoc.ref.collection('details_payment').get();
          orderData.details_payment = paymentSnapshot.docs.map(paymentDoc => ({
            id: paymentDoc.id,
            ...paymentDoc.data()
          }));

          providerData.orders.push(orderData);
        }

        exportData.push(providerData);
      }

      // Convertir a JSON y descargar
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `providers_orders_export.json`;
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting providers/orders/products and details_payment:', error);
    }
  }
}
