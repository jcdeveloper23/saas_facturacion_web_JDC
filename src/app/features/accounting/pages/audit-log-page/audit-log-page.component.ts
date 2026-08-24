import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
import {
  CardModule, ButtonModule, BadgeModule, SpinnerModule,
  TableModule, FormModule, ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { AuditLogService } from '../../services/audit-log.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  AuditLogEntry, AUDIT_ACTION_LABELS, AUDIT_ACTION_COLORS, AUDIT_COLLECTION_LABELS
} from '../../models/audit-log.interface';

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  templateUrl: './audit-log-page.component.html',
  styleUrl:    './audit-log-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, IconModule
  ]
})
export class AuditLogPageComponent implements OnInit, OnDestroy {
  private svc            = inject(AuditLogService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entries          = signal<AuditLogEntry[]>([]);
  loading          = signal(true);
  collectionFilter = signal('');
  detailEntry      = signal<AuditLogEntry | null>(null);

  readonly ACTION_LABELS     = AUDIT_ACTION_LABELS;
  readonly ACTION_COLORS     = AUDIT_ACTION_COLORS;
  readonly COLLECTION_LABELS = AUDIT_COLLECTION_LABELS;
  readonly collectionOptions = Object.keys(AUDIT_COLLECTION_LABELS);

  // ── Computed ──────────────────────────────────────────────────────────────
  filteredEntries = computed(() => {
    const f = this.collectionFilter();
    return f ? this.entries().filter(e => e.collection === f) : this.entries();
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading.set(true);
    this.svc.getEntries({}, 200).pipe(take(1)).subscribe({
      next: list => { this.entries.set(list); this.loading.set(false); },
      error: err => {
        this.notifications.error('Error cargando log de auditoría: ' + (err?.message ?? err));
        this.loading.set(false);
      }
    });
  }

  showDetail(entry: AuditLogEntry): void { this.detailEntry.set(entry); }
  closeDetail(): void { this.detailEntry.set(null); }

  collectionLabel(c: string): string { return this.COLLECTION_LABELS[c] ?? c; }

  formatValue(v: any): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object' && v?.seconds !== undefined) {
      // Firestore Timestamp serializado
      return new Date(v.seconds * 1000).toLocaleString('es-EC');
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  trackById(_: number, item: AuditLogEntry): string { return item.id; }
}
