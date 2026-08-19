import { Injectable, inject } from '@angular/core';
import {
  Firestore, doc, onSnapshot, setDoc, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService }   from '../../../core/services/tenant.service';
import { AuthService }     from '../../../core/services/auth.service';
import {
  AccountingSettings, AccountMapping, DEFAULT_ACCOUNT_MAPPING
} from '../models/accounting-settings.interface';

@Injectable({ providedIn: 'root' })
export class AccountingSettingsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get docPath(): string   { return `companies/${this.companyId}/settings/accounting`; }

  getSettings(): Observable<AccountingSettings> {
    return new Observable<AccountingSettings>(observer => {
      const ref = doc(this.firestore, this.docPath);
      return onSnapshot(ref, {
        next: snap => {
          if (snap.exists()) {
            observer.next(snap.data() as AccountingSettings);
          } else {
            // Return defaults if not configured yet
            observer.next({ accountMapping: { ...DEFAULT_ACCOUNT_MAPPING } });
          }
        },
        error: err => observer.error(err)
      });
    });
  }

  async saveSettings(mapping: AccountMapping): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, this.docPath);
    await setDoc(ref, {
      accountMapping: mapping,
      updatedAt:      Timestamp.now(),
      updatedBy:      userId
    }, { merge: true });
  }
}
