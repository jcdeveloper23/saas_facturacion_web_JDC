import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { SpinnerModule, BadgeModule, CardModule, ButtonModule, TableModule, FormModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PosSalesService } from '../services/pos-sales.service';
import { PosCashService }  from '../services/pos-cash.service';
import { PosSessionService } from '../services/pos-session.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PosSale, PosSession } from '../models/pos.interface';

@Component({
  selector: 'app-pos-history',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    SpinnerModule, BadgeModule, CardModule, ButtonModule, TableModule, FormModule,
    IconModule
  ],
  templateUrl: './pos-history.component.html',
  styleUrl: './pos-history.component.scss'
})
export class PosHistoryComponent implements OnInit, OnDestroy {
  private destroy$     = new Subject<void>();
  private salesService = inject(PosSalesService);
  private cashService  = inject(PosCashService);
  readonly posSession  = inject(PosSessionService);
  private router       = inject(Router);
  private notify       = inject(NotificationService);

  readonly sessions       = signal<PosSession[]>([]);
  readonly sales          = signal<PosSale[]>([]);
  readonly selected       = signal<PosSale | null>(null);
  readonly completedCount = computed(() => this.sales().filter(s => s.status === 'completed').length);
  readonly loading   = signal(true);
  readonly voiding   = signal(false);

  selectedSessionId = '';

  ngOnInit(): void {
    this.cashService.getSessions(undefined, 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => {
        this.sessions.set(s);
        // Auto-seleccionar sesión activa si existe
        const active = this.posSession.activeSession();
        if (active) {
          this.selectedSessionId = active.id;
          this.loadSalesForSession(active.id);
        } else if (s.length > 0) {
          this.selectedSessionId = s[0].id;
          this.loadSalesForSession(s[0].id);
        }
        this.loading.set(false);
      });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  onSessionChange(sessionId: string): void {
    this.selectedSessionId = sessionId;
    this.loadSalesForSession(sessionId);
  }

  private loadSalesForSession(sessionId: string): void {
    this.loading.set(true);
    this.salesService.getSales(sessionId, 200)
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => { this.sales.set(s); this.loading.set(false); });
  }

  selectSale(sale: PosSale): void {
    this.selected.set(this.selected()?.id === sale.id ? null : sale);
  }

  async voidSale(sale: PosSale): Promise<void> {
    if (!confirm(`¿Anular ticket #${sale.ticketNumber}?`)) return;
    this.voiding.set(true);
    try {
      await this.salesService.voidSale(sale.id);
      this.notify.success('Ticket anulado', `#${sale.ticketNumber}`);
      this.selected.set(null);
    } catch (err: any) {
      this.notify.error('Error anulando ticket', err.message);
    } finally {
      this.voiding.set(false);
    }
  }

  goBack(): void {
    if (this.posSession.hasActiveSession()) {
      this.router.navigate(['/pos/main']);
    } else {
      this.router.navigate(['/pos']);
    }
  }

  totalSales(sales: PosSale[]): number {
    return sales.filter(s => s.status === 'completed').reduce((a, s) => a + s.total, 0);
  }
}
