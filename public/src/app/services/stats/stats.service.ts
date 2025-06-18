import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class StatsService {

  constructor(private db: AngularFirestore) { }

  /**
   * Obtiene estadísticas anuales de un bar.
   * @param barId ID del proveedor/bar.
   * @returns Promesa con los datos del documento.
   */
  getYearlyStats(providerId: string, timeCollection: string, key: string) {
    const ref = this.db.doc(`stats/bar_${providerId}/${timeCollection}/${key}`);
    return ref.get().pipe(
      map(snapshot => {
        return snapshot.exists ? snapshot.data() : null;
      })
    );
  }

  /**
   * Obtiene estadísticas mensuales de un bar.
   * @param barId ID del proveedor/bar.
   * @returns Promesa con los datos del documento.
   */
  // async getMonthlyStats(barId: string): Promise<any> {
  //   const now = new Date();
  //   const monthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  //   const ref = this.db.doc(`stats/bar_${barId}/monthly/${monthKey}`);
  //   const docSnap = await firstValueFrom(ref.get());
  //   return docSnap.exists ? docSnap.data() : null;
  // }

  /**
   * Obtiene estadísticas diarias de un bar.
   * @param barId ID del proveedor/bar.
   * @returns Promesa con los datos del documento.
   */
  async getDailyStats(barId: string): Promise<any> {
    // const now = new Date();
    // const dayKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    // const ref = this.db.doc(`stats/bar_${barId}/daily/${dayKey}`);
    // const docSnap = await firstValueFrom(ref.get());
    // return docSnap.exists ? docSnap.data() : null;
  }
}

