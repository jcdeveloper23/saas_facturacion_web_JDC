import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, onSnapshot, query, orderBy, limit, where, QueryConstraint
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../core/services/tenant.service';
import { StockMovement, StockMovementType } from '../products/models/product.interface';

@Injectable({ providedIn: 'root' })
export class StockService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private movementsPath(): string {
    return `companies/${this.tenantService.companyId}/stock-movements`;
  }

  /**
   * Streams all stock movements for the company, newest first.
   * Optionally filtered by type and/or warehouseCode.
   */
  getAllMovements(
    maxResults = 300,
    type?: StockMovementType,
    warehouseCode?: string
  ): Observable<StockMovement[]> {
    return new Observable<StockMovement[]>(observer => {
      const ref = collection(this.firestore, this.movementsPath());
      const constraints: QueryConstraint[] = [];

      if (type)          constraints.push(where('type', '==', type));
      if (warehouseCode) constraints.push(where('warehouseCode', '==', warehouseCode));

      constraints.push(orderBy('createdAt', 'desc'), limit(maxResults));

      const q = query(ref, ...constraints);
      return onSnapshot(q, {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StockMovement)),
        error: err  => observer.error(err)
      });
    });
  }
}
