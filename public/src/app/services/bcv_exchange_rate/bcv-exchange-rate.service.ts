import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class BcvExchangeRateService {

  constructor(
    private db: AngularFirestore
  ) { }

  public getBcvRate() {
    return this.db.collection<BcvRate>('bcvRate').valueChanges();
  }

  saveBcvRate(bcvRate: BcvRate) {
    const ref = this.db.collection('bcvRate').doc('001');
    return ref.set(bcvRate).then(() => {
      // Create history record
      return ref.collection('history').add({
        ...bcvRate,
        registeredAt: new Date().toISOString()
      });
    });
  }

  public getBcvRateHistory() {
    return this.db.collection('bcvRate').doc('001').collection('history', ref => ref.orderBy('registeredAt', 'desc')).valueChanges();
  }
}


