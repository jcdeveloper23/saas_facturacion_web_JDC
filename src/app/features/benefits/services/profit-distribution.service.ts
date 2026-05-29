import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Firestore, collection, doc, addDoc, updateDoc,
  query, orderBy, limit, onSnapshot, runTransaction,
  Timestamp, serverTimestamp
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { TenantService } from '../../../core/services/tenant.service';
import {
  ProfitSnapshot,
  ProfitConfig,
  ProfitDistribution,
  PartnerPayment,
  PartnerPaymentMethod,
  calcDistributionStatus
} from '../models/benefit.interface';

@Injectable({ providedIn: 'root' })
export class ProfitDistributionService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private auth          = inject(Auth);

  private snapshotsPath(): string {
    return `companies/${this.tenantService.companyId}/profit-snapshots`;
  }

  private distributionsPath(): string {
    return `companies/${this.tenantService.companyId}/profit-distributions`;
  }

  // ─── Snapshots ─────────────────────────────────────────────────────────────

  async saveSnapshot(data: Omit<ProfitSnapshot, 'id'>): Promise<string> {
    const col = collection(this.firestore, this.snapshotsPath());
    const docRef = await addDoc(col, {
      ...data,
      calculatedAt: serverTimestamp()
    });
    return docRef.id;
  }

  getSnapshots(limitN = 20): Observable<ProfitSnapshot[]> {
    const ref = collection(this.firestore, this.snapshotsPath());
    const q   = query(ref, orderBy('calculatedAt', 'desc'), limit(limitN));
    return new Observable(observer =>
      onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ProfitSnapshot));
      }, err => observer.error(err))
    );
  }

  // ─── Distributions ─────────────────────────────────────────────────────────

  async createDistribution(
    snapshot: ProfitSnapshot,
    config: ProfitConfig,
    notes?: string
  ): Promise<string> {
    const uid     = this.auth.currentUser!.uid;
    const name    = this.auth.currentUser?.displayName ?? uid;
    const col     = collection(this.firestore, this.distributionsPath());

    const partnerPayments: PartnerPayment[] = config.partners.map(p => ({
      partnerId:        p.id,
      partnerName:      p.name,
      taxId:            p.taxId,
      percentage:       p.percentage,
      amount:           Math.round(snapshot.grossProfit * (p.percentage / 100) * 100) / 100,
      status:           'pending' as const,
      paidAt:           null,
      paidBy:           null,
      paymentMethod:    null,
      paymentReference: null,
      notes:            null
    }));

    const distribution: Omit<ProfitDistribution, 'id'> = {
      snapshotId:      snapshot.id,
      periodType:      snapshot.periodType,
      periodLabel:     snapshot.periodLabel,
      startDate:       snapshot.startDate,
      endDate:         snapshot.endDate,
      totalRevenue:    snapshot.totalRevenue,
      totalCogs:       snapshot.totalCogs,
      grossProfit:     snapshot.grossProfit,
      grossMarginPct:  snapshot.grossMarginPct,
      configId:        config.id,
      configName:      config.name,
      partnerPayments,
      status:          'pending',
      notes:           notes ?? '',
      createdBy:       uid,
      createdByName:   name,
      createdAt:       Timestamp.now(),
      updatedAt:       Timestamp.now()
    };

    const docRef = await addDoc(col, {
      ...distribution,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  }

  async markPartnerPaid(
    distributionId: string,
    partnerId: string,
    paymentData: Pick<PartnerPayment, 'paymentMethod' | 'paymentReference' | 'notes'>
  ): Promise<void> {
    const uid     = this.auth.currentUser!.uid;
    const distRef = doc(this.firestore, `${this.distributionsPath()}/${distributionId}`);

    await runTransaction(this.firestore, async (tx) => {
      const snap = await tx.get(distRef);
      if (!snap.exists()) throw new Error('Liquidacion no encontrada');

      const data = snap.data() as ProfitDistribution;
      const payments: PartnerPayment[] = data.partnerPayments.map(p => {
        if (p.partnerId !== partnerId) return p;
        return {
          ...p,
          status:           'paid' as const,
          paidAt:           Timestamp.now(),
          paidBy:           uid,
          paymentMethod:    paymentData.paymentMethod as PartnerPaymentMethod,
          paymentReference: paymentData.paymentReference ?? null,
          notes:            paymentData.notes ?? null
        };
      });

      const newStatus = calcDistributionStatus(payments);

      tx.update(distRef, {
        partnerPayments: payments,
        status:          newStatus,
        updatedAt:       serverTimestamp(),
        updatedBy:       uid
      });
    });
  }

  getDistributions(limitN = 50): Observable<ProfitDistribution[]> {
    const ref = collection(this.firestore, this.distributionsPath());
    const q   = query(ref, orderBy('createdAt', 'desc'), limit(limitN));
    return new Observable(observer =>
      onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ProfitDistribution));
      }, err => observer.error(err))
    );
  }
}
