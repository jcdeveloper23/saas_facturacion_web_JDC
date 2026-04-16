import {
  Component, Input, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PurchasesService } from '../purchases/services/purchases.service';
import {
  Purchase,
  PURCHASE_STATUS_LABELS, PURCHASE_STATUS_COLORS
} from '../purchases/models/purchase.interface';

@Component({
  selector: 'app-supplier-purchases-tab',
  standalone: true,
  templateUrl: './supplier-purchases-tab.component.html',
  imports: [
    CommonModule, RouterLink,
    CardModule, ButtonModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class SupplierPurchasesTabComponent implements OnInit, OnDestroy {
  @Input({ required: true }) personId!: string;
  @Input() supplierName = '';

  readonly router  = inject(Router);
  private svc      = inject(PurchasesService);
  private destroy$ = new Subject<void>();

  readonly STATUS_LABELS = PURCHASE_STATUS_LABELS;
  readonly STATUS_COLORS = PURCHASE_STATUS_COLORS;

  // ── State ──────────────────────────────────────────────────────────────────
  loading   = signal(true);
  purchases = signal<Purchase[]>([]);

  // ── Stats (calculadas en cliente sobre datos cargados) ────────────────────
  stats = computed(() => {
    const list = this.purchases();
    const received = list.filter(p => p.status === 'received');
    const totalBought = received.reduce((acc, p) => acc + p.total, 0);
    const lastPurchase = list.length > 0 ? list[0].date.toDate() : null;
    const noRetention  = received.filter(p => !p.retentionId).length;

    return {
      total:        list.length,
      received:     received.length,
      pending:      list.filter(p => p.status === 'draft' || p.status === 'sent').length,
      totalBought,
      lastPurchase,
      noRetention,
    };
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.svc.getBySupplier(this.personId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => { this.purchases.set(list); this.loading.set(false); },
        error: ()  => this.loading.set(false),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  newPurchase(): void {
    this.router.navigate(['/purchases', 'new'], {
      queryParams: {
        supplierId:   this.personId,
        supplierName: this.supplierName,
      }
    });
  }

  viewAllPurchases(): void {
    this.router.navigate(['/purchases'], {
      queryParams: {
        supplierId:   this.personId,
        supplierName: this.supplierName,
      }
    });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
