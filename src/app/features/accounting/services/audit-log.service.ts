import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, onSnapshot,
  query, where, orderBy, limit
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuditLogEntry } from '../models/audit-log.interface';

export interface AuditLogFilters {
  collection?: string;
  docId?:      string;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/audit_log`; }

  // Solo lectura — la colección es append-only, escrita exclusivamente por
  // Cloud Functions (ver audit-log-trigger.ts y firestore.rules).
  getEntries(filters: AuditLogFilters = {}, max = 200): Observable<AuditLogEntry[]> {
    return new Observable<AuditLogEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      const constraints: any[] = [orderBy('timestamp', 'desc'), limit(max)];

      if (filters.docId)      constraints.unshift(where('docId',      '==', filters.docId));
      if (filters.collection) constraints.unshift(where('collection', '==', filters.collection));

      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLogEntry))),
        error: err  => { console.error('[AuditLogService] getEntries error:', err); observer.error(err); }
      });
    });
  }
}
