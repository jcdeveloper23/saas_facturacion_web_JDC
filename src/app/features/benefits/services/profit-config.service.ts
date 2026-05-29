import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Firestore, collection, doc, query, where, limit,
  onSnapshot, getDocs, updateDoc, writeBatch, serverTimestamp
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { TenantService } from '../../../core/services/tenant.service';
import { ProfitConfig } from '../models/benefit.interface';

@Injectable({ providedIn: 'root' })
export class ProfitConfigService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private auth          = inject(Auth);

  private colPath(): string {
    return `companies/${this.tenantService.companyId}/profit-config`;
  }

  getActiveConfig(): Observable<ProfitConfig | null> {
    const ref = collection(this.firestore, this.colPath());
    const q   = query(ref, where('isActive', '==', true), limit(1));
    return new Observable(observer =>
      onSnapshot(q, snap => {
        if (snap.empty) { observer.next(null); return; }
        observer.next({ id: snap.docs[0].id, ...snap.docs[0].data() } as ProfitConfig);
      }, err => observer.error(err))
    );
  }

  async saveConfig(config: Partial<ProfitConfig>): Promise<string> {
    const uid = this.auth.currentUser!.uid;
    const col = collection(this.firestore, this.colPath());
    const now = serverTimestamp();

    if (config.id) {
      // Actualizar existente
      await updateDoc(doc(col, config.id), {
        ...config,
        updatedAt: now,
        updatedBy: uid
      });
      return config.id;
    }

    // Nueva config: desactivar la anterior primero (batch)
    const batch = writeBatch(this.firestore);
    const prevSnap = await getDocs(query(col, where('isActive', '==', true)));
    prevSnap.docs.forEach(d =>
      batch.update(d.ref, { isActive: false, updatedAt: now, updatedBy: uid })
    );
    const newRef = doc(col);
    batch.set(newRef, {
      ...config,
      isActive: true,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      updatedBy: uid
    });
    await batch.commit();
    return newRef.id;
  }

  getConfigs(): Observable<ProfitConfig[]> {
    const ref = collection(this.firestore, this.colPath());
    return new Observable(observer =>
      onSnapshot(query(ref), snap => {
        const configs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as ProfitConfig)
          .sort((a, b) => {
            const aTime = (a.createdAt as any)?.seconds ?? 0;
            const bTime = (b.createdAt as any)?.seconds ?? 0;
            return bTime - aTime;
          });
        observer.next(configs);
      }, err => observer.error(err))
    );
  }
}
